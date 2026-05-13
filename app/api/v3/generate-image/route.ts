/**
 * POST /api/v3/generate-image
 * v3 単発画像生成: v3テキスト生成結果 + ペルソナ + 型 → 各スライド画像
 *
 * リクエスト: { generated, personaId, postType, productId?, types }
 * レスポンス: { imageUrls: string[], refBenchmark: string }
 *
 * 生成方式（全スライド統一）:
 *   - 全スライド: FAL gpt-image-2（ベンチマーク参照 + スタイル分析 → 一括生成）
 *   - 商品スライドも FAL。productImageUrl を第2参照画像として渡す。
 *   - Sharp は一切使用しない。
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbLoadBenchmarkPosts, dbLoadCompetitorProducts, dbUpdateBenchmarkSlideStyleDescs } from "@/lib/supabase"
import { loadProducts } from "@/lib/products"
import { describeV3SlideStyle } from "@/lib/referenceV2"
import { generateV2Slide } from "@/lib/fal"
import { uploadSlideBuffers } from "@/lib/storage"
import type {
  GeneratedPostText,
  GeneratedSlide,
  PostType,
  HookType,
  StructureType,
  CompositionType,
  CompetitorProduct,
} from "@/types/v2"
import type { Product } from "@/types"

export const maxDuration = 300

// 構図型 C1〜C5 のビジュアル指示（FAL プロンプトに付与する英語ヒント）
const COMPOSITION_HINTS: Record<CompositionType, string> = {
  C1: "Text-dominant layout: white or light background, large bold typography, generous whitespace, minimal imagery.",
  C2: "Photo-dominant layout: a single subject (lifestyle scene) as the visual main, restrained text overlay.",
  C3: "List or table layout: structured rows, color-coded items, high information density, clear visual hierarchy.",
  C4: "Before/after comparison layout: side-by-side or top-bottom split, contrast or arrow highlighting transformation.",
  C5: "Mood-focused aesthetic: pastel and refined color palette, unified atmosphere, abundant whitespace, polished elegance.",
}

function detectColorPalette(themeTags: string[]): string {
  const joined = themeTags.join(" ")
  if (/ニキビ|敏感肌|スキンケア|保湿|肌/.test(joined)) return "pink"
  if (/メイク|コスメ|リップ|アイ/.test(joined))        return "purple"
  if (/UV|美白|日焼け|シミ/.test(joined))             return "yellow"
  if (/ナチュラル|オーガニック|無添加/.test(joined))    return "green"
  return "pink"
}

// CTA・エンゲージメント・プロフィール系スライドのタグキーワード
// → これらのタグを持つスライドには商品画像を一切出さない
// 理由: CTA/フォロー訴求スライドに商品が出ると「広告感」が強くなりすぎる
const CTA_TAG_KEYWORDS = [
  "フォロー", "保存", "cta", "コール", "まとめ", "プロフィール",
  "参加", "フォロバ", "シェア", "コメント", "エンゲージ",
  // 注: "推し" は除外 — 「最推し商品」「推し成分」など商品訴求タグと誤判定するため
]

function isCTASlide(slide: GeneratedSlide): boolean {
  const tagLower = (slide.tag ?? "").toLowerCase()
  return CTA_TAG_KEYWORDS.some(kw => tagLower.includes(kw.toLowerCase()))
}

// スライドの headline/bullets を見て、どの商品を画面に出すか決める
// 商品の詳細情報（ブランド・商品名・価格）も返す
function pickProductForSlide(
  slide: GeneratedSlide,
  product: Product | null,
  competitors: CompetitorProduct[],
): {
  imageUrl: string
  displayName: string
  brand?: string
  itemName?: string
  price?: string
  isOwn: boolean
} | null {
  if (!slide.headline) return null

  // CTA・フォロー訴求・まとめ系には商品画像を出さない
  if (isCTASlide(slide)) {
    console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → CTA系のため商品画像スキップ`)
    return null
  }

  const text = `${slide.headline} ${(slide.bullets ?? []).join(" ")} ${slide.accent ?? ""}`.toLowerCase()

  // 自社（anetos）の判定
  if (product) {
    const pname = product.name.toLowerCase()
    if (text.includes("アネトス") || text.includes("anetos") || text.includes(pname.slice(0, 6))) {
      return {
        imageUrl:    product.imageUrl,
        displayName: product.name,
        brand:       "anetos",
        itemName:    product.name,
        price:       product.price,
        isOwn:       true,
      }
    }
  }

  // 競合の判定: ブランド名 or 商品名で照合
  for (const c of competitors) {
    const brandLower = (c.brandName ?? "").toLowerCase()
    const nameLower  = (c.productName ?? "").toLowerCase()
    if (brandLower.length > 1 && text.includes(brandLower)) {
      return {
        imageUrl:    c.imageUrl,
        displayName: `${c.brandName} ${c.productName}`,
        brand:       c.brandName,
        itemName:    c.productName,
        price:       c.price ?? undefined,
        isOwn:       false,
      }
    }
    if (nameLower.length > 3 && text.includes(nameLower.slice(0, 5))) {
      return {
        imageUrl:    c.imageUrl,
        displayName: `${c.brandName} ${c.productName}`,
        brand:       c.brandName,
        itemName:    c.productName,
        price:       c.price ?? undefined,
        isOwn:       false,
      }
    }
  }

  return null
}

function isHookSlide(slide: GeneratedSlide): boolean {
  return slide.slideNumber === 1 || slide.tag.includes("フック")
}

/** characterText の【キャラクター】セクションを抽出してFALへの人物像ヒントにする */
function extractPersonaVisual(characterText: string): string {
  const m = characterText.match(/【キャラクター】\s*([\s\S]*?)(?=【|$)/)
  const char = m?.[1]?.trim().slice(0, 300) ?? ""
  // fallback: 冒頭300文字
  return char || characterText.slice(0, 300)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      generated?: GeneratedPostText
      personaId?: string
      postType?: PostType
      productId?: string
      types?: { hookType: HookType; structureType: StructureType; compositionType: CompositionType }
      benchmarkFolderPath?: string   // generate-post で選定済みのベンチマーク（枚数整合のため優先使用）
    }
    const { generated, personaId, postType, productId, types, benchmarkFolderPath } = body

    if (!generated || !personaId || !postType) {
      return NextResponse.json({ error: "generated, personaId, postType は必須" }, { status: 400 })
    }

    // ペルソナ取得
    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === personaId)
    if (!persona) {
      return NextResponse.json({ error: "persona not found" }, { status: 404 })
    }
    if (!persona.benchmarkAccount) {
      return NextResponse.json({ error: "ペルソナにbenchmark_accountがありません" }, { status: 400 })
    }

    // ベンチマーク投稿を1つ選ぶ
    // generate-post で選定済みの folderPath があればそれを最優先（テキスト枚数と一致させるため）
    const benchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    if (benchmarkPosts.length === 0) {
      return NextResponse.json({ error: `ベンチマーク ${persona.benchmarkAccount} の投稿がありません` }, { status: 400 })
    }
    let refBenchmark = benchmarkFolderPath
      ? benchmarkPosts.find(b => b.folderPath === benchmarkFolderPath)
      : undefined
    if (!refBenchmark) {
      // フォールバック: postType 一致優先でランダム選定
      const matched = benchmarkPosts.filter(b => b.postType === postType)
      const pool = matched.length > 0 ? matched : benchmarkPosts
      refBenchmark = pool[Math.floor(Math.random() * pool.length)]
    }
    const benchmarkUrls = refBenchmark.slideUrls
    if (benchmarkUrls.length === 0) {
      return NextResponse.json({ error: "ベンチマーク投稿にスライドURLがありません" }, { status: 400 })
    }

    // ─ ベンチマーク画像の疎通確認 ─
    // FAL が参照画像を取得できない場合に 422 になるため、事前に先頭URLをHEADリクエストで確認
    try {
      const headRes = await fetch(benchmarkUrls[0], { method: "HEAD" })
      const ct = headRes.headers.get("content-type") ?? ""
      console.log(`[v3/generate-image] benchmark HEAD: status=${headRes.status} content-type=${ct} url=${benchmarkUrls[0].slice(0, 60)}`)
      if (!headRes.ok) {
        return NextResponse.json(
          { error: `ベンチマーク画像にアクセスできません (HTTP ${headRes.status}): ${benchmarkUrls[0].slice(0, 80)}` },
          { status: 400 },
        )
      }
      // WebP / HEIC は FAL が非対応 → 明示エラー
      if (ct.includes("webp") || ct.includes("heic") || ct.includes("heif")) {
        return NextResponse.json(
          { error: `ベンチマーク画像のフォーマット (${ct}) は非対応です。JPEG/PNG 形式で再アップロードしてください。` },
          { status: 400 },
        )
      }
    } catch (headErr) {
      console.warn("[v3/generate-image] benchmark HEAD 失敗（続行）:", headErr)
    }

    // 商品取得
    let product: Product | null = null
    let competitors: CompetitorProduct[] = []
    if ((postType === "product" || postType === "mixed") && productId) {
      const products = await loadProducts()
      product = products.find(p => p.id === productId) ?? null
      competitors = await dbLoadCompetitorProducts(productId).catch(() => [])
    }

    // ─ スライド数の扱い ─
    // テキスト生成は structureType の枚数目安に従って出力する。
    // ベンチマーク参照画像は slideUrls が不足する場合 firstRefUrl でフォールバックするため、スライスしない。
    const slides = generated.slides

    // ペルソナのビジュアルプロフィール（visualProfileがあれば優先、なければ旧ペルソナ用フォールバック）
    const visualProfile = persona.visualProfile ?? undefined
    const personaHint   = visualProfile ? undefined : extractPersonaVisual(persona.characterText)

    // 各スライドの参照画像URLを決定（ベンチマークの該当スライド優先・なければ1枚目）
    const firstRefUrl = benchmarkUrls[0]
    const slideRefUrls = slides.map((_, i) => benchmarkUrls[i] ?? firstRefUrl)

    // ─ スタイル分析（キャッシュ優先）─
    // DB に保存済みの slide_style_descs があればそれを使い、未キャッシュ分だけ Claude Vision で分析する。
    const uniqueUrls = [...new Set(slideRefUrls.filter(Boolean))]
    const styleDescMap = new Map<string, string>()
    const cachedDescs = refBenchmark.slideStyleDescs ?? {}

    const uncachedUrls = uniqueUrls.filter(url => {
      if (cachedDescs[url]) {
        styleDescMap.set(url, cachedDescs[url])
        console.log(`[v3/generate-image] styleDesc HIT (cached) for ${url.slice(-30)}`)
        return false
      }
      return true
    })

    if (uncachedUrls.length > 0) {
      const newDescs: Record<string, string> = {}
      await Promise.all(uncachedUrls.map(async url => {
        const desc = await describeV3SlideStyle(url)
        styleDescMap.set(url, desc)
        newDescs[url] = desc
        console.log(`[v3/generate-image] styleDesc MISS (analyzed) for ${url.slice(-30)}: ${desc.slice(0, 80)}...`)
      }))
      // バックグラウンドでDB保存（生成をブロックしない）
      dbUpdateBenchmarkSlideStyleDescs(refBenchmark.id, newDescs).catch(err =>
        console.warn("[v3/generate-image] slideStyleDescs保存エラー（続行）:", err),
      )
    }

    const compositionHint = types ? COMPOSITION_HINTS[types.compositionType] : ""
    const colorPalette = detectColorPalette(persona.themeTags)

    // 各スライドを並列生成（Promise.allSettled: 1枚失敗しても他を道連れにしない）
    const settled = await Promise.allSettled(slides.map(async (slide, i) => {
      const refImageUrl = slideRefUrls[i]

      const slideProduct = (postType === "product" || postType === "mixed")
        ? pickProductForSlide(slide, product, competitors)
        : null

      if (slideProduct) {
        console.log(`[v3/generate-image] slide ${i + 1} → FAL (product: ${slideProduct.displayName})`)
      }

      const slideStyleDesc = refImageUrl ? (styleDescMap.get(refImageUrl) ?? "") : ""
      const finalStyleDesc  = [slideStyleDesc, compositionHint].filter(Boolean).join("  ")
      console.log(`[v3/generate-image] slide ${i + 1} → FAL`)
      const result = await generateV2Slide({
        headline:         slide.headline,
        tag:              slide.tag,
        bullets:          slide.bullets,
        accent:           slide.accent,
        colorPalette,
        refImageUrl,
        styleDescription: finalStyleDesc,
        slideNumber:      slide.slideNumber,
        visualProfile,
        personaHint,
        productImageUrl:  slideProduct?.imageUrl,
      })
      return { ...result, slideNumber: slide.slideNumber, index: i }
    }))

    // settled 結果を整理: 失敗 or buffer=null のスライドは null URL にする
    type SlideResult = { buffer: Buffer | null; policyFallback: boolean; slideNumber: number; index: number }
    const slideResults: SlideResult[] = settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : { buffer: null, policyFallback: false, slideNumber: slides[i].slideNumber, index: i },
    )

    // null でないバッファだけアップロード
    const toUpload = slideResults.filter((r): r is SlideResult & { buffer: Buffer } => r.buffer !== null)
    const uploadedUrls = toUpload.length > 0 ? await uploadSlideBuffers(toUpload.map(r => r.buffer)) : []

    // スライド順に URL を復元（生成失敗スライドは null）
    const urlByIndex = new Map<number, string>()
    toUpload.forEach((r, ui) => urlByIndex.set(r.index, uploadedUrls[ui]))
    const imageUrls = slides.map((_, i) => urlByIndex.get(i) ?? null)

    const policyFallbackSlides = slideResults.filter(r => r.policyFallback && r.buffer !== null).map(r => r.slideNumber)
    const failedSlides         = slideResults.filter(r => r.buffer === null).map(r => r.slideNumber)

    if (failedSlides.length > 0) {
      console.warn(`[v3/generate-image] ${failedSlides.length}枚が生成失敗（ポリシー違反・全スライド分離）: slides ${failedSlides.join(",")}`)
    }

    return NextResponse.json({
      imageUrls,          // null = そのスライドは生成失敗
      refBenchmark: refBenchmark.folderPath,
      policyFallbackSlides,
      failedSlides,       // 生成完全失敗したスライド番号一覧
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v3/generate-image]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
