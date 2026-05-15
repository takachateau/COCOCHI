/**
 * POST /api/v4/generate-image
 * v4 単発画像生成: v3テキスト生成結果 + ペルソナ + 型 → 各スライド画像
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
import { generateV2Slide, generateBaseSlide } from "@/lib/fal"
import { uploadSlideBuffers } from "@/lib/storage"
import { calcFalCost, formatCost } from "@/lib/aiCost"
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

// スライドの headline/bullets/tag を見て、どの商品を画面に出すか決める
// 「テキストに言及があるスライドだけに表示」が基本ルール。
// product 投稿も mixed 投稿も同じテキストマッチ判定を使う。
// （以前の「product 型は全スライドに表示」ルールを廃止）
function pickProductForSlide(
  slide: GeneratedSlide,
  product: Product | null,
  competitors: CompetitorProduct[],
  postType: PostType = "tips",
): {
  imageUrl: string
  displayName: string
  brand?: string
  itemName?: string
  price?: string
  isOwn: boolean
} | null {
  if (!slide.headline) return null

  // フック（1枚目 or タグに「フック」）と CTA 系は商品画像なし
  if (isHookSlide(slide)) {
    console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → フック系のため商品画像スキップ`)
    return null
  }
  if (isCTASlide(slide)) {
    console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → CTA系のため商品画像スキップ`)
    return null
  }

  // テキスト + タグを結合して照合
  const text    = `${slide.headline} ${(slide.bullets ?? []).join(" ")} ${slide.accent ?? ""}`.toLowerCase()
  const tagLower = (slide.tag ?? "").toLowerCase()
  const combined = `${text} ${tagLower}`

  // ① 競合商品マッチングを最優先（product/mixed の両方）
  //   2段階で照合し、より具体的なマッチを優先する：
  //   Pass 1: 商品名の先頭トークン（ブランド線: ビオレ／スキンアクア／メラノCC 等）
  //           → 親会社が複数商品を持つケース（ロート製薬=スキンアクア+メラノCC）でも正しい商品を選べる
  //   Pass 2: 親会社ブランド名（花王／ロート製薬 等）のフォールバック
  if (postType === "product" || postType === "mixed") {
    // Pass 1: 商品名先頭トークン（最も具体的）
    for (const c of competitors) {
      const firstToken = ((c.productName ?? "").toLowerCase().split(/[\s　]+/)[0] ?? "")
      if (firstToken.length >= 3 && combined.includes(firstToken)) {
        console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 競合商品表示(line): ${c.brandName} ${c.productName}`)
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
    // Pass 2: 親会社ブランド名（フォールバック）
    for (const c of competitors) {
      const brandLower = (c.brandName ?? "").toLowerCase().trim()
      if (brandLower.length >= 2 && combined.includes(brandLower)) {
        console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 競合商品表示(brand): ${c.brandName} ${c.productName}`)
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
  }

  // ② 自社商品マッチング：ブランド名「アネトス/anetos」が明示的に書かれているスライドのみ
  //    商品名トークン（ウォータリー/エマルジョン等）は競合と被るため照合に使わない
  if (product) {
    const brandHit = combined.includes("アネトス") || combined.includes("anetos")
    if (brandHit) {
      console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 自社商品表示 (brand=アネトス)`)
      return {
        imageUrl:    product.imageUrl,
        displayName: product.name,
        brand:       "anetos",
        itemName:    product.name,
        price:       product.price,
        isOwn:       true,
      }
    }
    console.log(`[pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 商品言及なしのためスキップ`)
  }

  return null
}

function isHookSlide(slide: GeneratedSlide): boolean {
  return slide.slideNumber === 1 || (slide.tag ?? "").includes("フック")
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

    // ベンチマーク投稿を1つ選ぶ（非表示は除外）
    // generate-post で選定済みの folderPath があればそれを最優先（テキスト枚数と一致させるため）
    const allBenchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    const benchmarkPosts = allBenchmarkPosts.filter(b => !b.isHidden)
    if (benchmarkPosts.length === 0) {
      return NextResponse.json({ error: `ベンチマーク ${persona.benchmarkAccount} の投稿がありません（全件非表示の場合はベンチマーク設定を確認してください）` }, { status: 400 })
    }
    let refBenchmark = benchmarkFolderPath
      ? allBenchmarkPosts.find(b => b.folderPath === benchmarkFolderPath)  // 手動指定は非表示でも使う
      : undefined
    if (!refBenchmark) {
      // フォールバック: postType 一致優先でランダム選定（非表示除外済みプールから）
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
      console.log(`[v4/generate-image] benchmark HEAD: status=${headRes.status} content-type=${ct} url=${benchmarkUrls[0].slice(0, 60)}`)
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
      console.warn("[v4/generate-image] benchmark HEAD 失敗（続行）:", headErr)
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
        console.log(`[v4/generate-image] styleDesc HIT (cached) for ${url.slice(-30)}`)
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
        console.log(`[v4/generate-image] styleDesc MISS (analyzed) for ${url.slice(-30)}: ${desc.slice(0, 80)}...`)
      }))
      // バックグラウンドでDB保存（生成をブロックしない）
      dbUpdateBenchmarkSlideStyleDescs(refBenchmark.id, newDescs).catch(err =>
        console.warn("[v4/generate-image] slideStyleDescs保存エラー（続行）:", err),
      )
    }

    const compositionHint = types ? COMPOSITION_HINTS[types.compositionType] : ""
    const colorPalette = detectColorPalette(persona.themeTags)

    type SlideResult = { buffer: Buffer | null; policyFallback: boolean; falCalls: number; slideNumber: number; index: number }

    // ─ 背景グループ対応生成 ────────────────────────────────────────
    // backgroundGroups があれば: bgInherit 方式を使う
    //   1. グループごとに「素背景ベーススライド」を1枚生成（generateBaseSlide）
    //   2. グループ内全スライドはそのベースを参照して bgInherit=true で生成
    //      → AI はベース画像に テキストだけ を追加 → 背景・人物が全スライドで完全一致
    //   3. ベース生成が失敗した場合は同一参照URL フォールバック（bgInherit=false）
    // backgroundGroups なし + 競合比較投稿: 全スライドを自動で1グループ化
    // backgroundGroups なし + 通常投稿: 各スライドが対応するベンチマーク画像を参照
    const rawBackgroundGroups = refBenchmark.backgroundGroups  // number[][] | null
    const backgroundGroups = rawBackgroundGroups ??
      (competitors.length > 0 ? [slides.map((_, i) => i)] : null)
    let usedBgGroupMode = false

    // スライドごとの参照URL・bgInherit設定
    type SlideRefConfig = { refImageUrl: string; bgInherit: boolean }
    const slideRefMap = new Map<number, SlideRefConfig>()

    if (backgroundGroups && backgroundGroups.length > 0) {
      usedBgGroupMode = true

      // グループごとにベース画像を並列生成
      await Promise.allSettled(backgroundGroups.map(async (group) => {
        const validIndices = group.filter(bi => bi < slides.length)
        if (validIndices.length === 0) return

        const groupRefUrl   = slideRefUrls[validIndices[0]]
        const groupStyleDesc = styleDescMap.get(groupRefUrl) ?? ""
        const finalGroupStyle = [groupStyleDesc, compositionHint].filter(Boolean).join("  ")

        console.log(`[v4/generate-image] bg-group [${validIndices.join(",")}] generating base slide...`)
        const baseResult = await generateBaseSlide({
          refImageUrl:      groupRefUrl,
          styleDescription: finalGroupStyle,
          colorPalette,
          visualProfile,
          personaHint,
        })

        if (baseResult.buffer) {
          const [baseUrl] = await uploadSlideBuffers([baseResult.buffer])
          console.log(`[v4/generate-image] base ready → ${baseUrl.slice(-30)}`)
          validIndices.forEach(bi => slideRefMap.set(bi, { refImageUrl: baseUrl, bgInherit: true }))
        } else {
          console.warn(`[v4/generate-image] base failed for group [${validIndices.join(",")}] — same-ref fallback`)
          validIndices.forEach(bi => slideRefMap.set(bi, { refImageUrl: groupRefUrl, bgInherit: false }))
        }
      }))
    }

    // 背景グループに属さないスライドは通常モード
    slides.forEach((_, i) => {
      if (!slideRefMap.has(i)) {
        slideRefMap.set(i, { refImageUrl: slideRefUrls[i], bgInherit: false })
      }
    })

    async function generateOneSlide(i: number): Promise<SlideResult> {
      const slide = slides[i]
      const { refImageUrl, bgInherit } = slideRefMap.get(i)!
      const slideProduct = (postType === "product" || postType === "mixed")
        ? pickProductForSlide(slide, product, competitors, postType)
        : null
      // bgInherit モードでは styleDesc はベース生成済みのため不要
      const slideStyleDesc = bgInherit ? "" : (styleDescMap.get(refImageUrl) ?? "")
      const finalStyleDesc  = bgInherit ? "" : [slideStyleDesc, compositionHint].filter(Boolean).join("  ")
      console.log(`[v4/generate-image] slide ${i + 1} → FAL${bgInherit ? " (bgInherit)" : usedBgGroupMode ? " (bg-group-fallback)" : ""}`)
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
        bgInherit,
      })
      return { ...result, slideNumber: slide.slideNumber, index: i }
    }

    const slideResults: SlideResult[] = new Array(slides.length)

    // ベース生成完了後、全スライド並列生成
    {
      const settled = await Promise.allSettled(slides.map((_, i) => generateOneSlide(i)))
      settled.forEach((s, i) => {
        slideResults[i] = s.status === "fulfilled"
          ? s.value
          : { buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[i].slideNumber, index: i }
      })
    }

    // null でないバッファだけアップロード（生成失敗スライドは除く）
    const toUpload = slideResults.filter((r): r is SlideResult & { buffer: Buffer } => r?.buffer !== null && r?.buffer !== undefined)
    const uploadedUrls = toUpload.length > 0 ? await uploadSlideBuffers(toUpload.map(r => r.buffer)) : []

    // スライド順に URL を復元（生成失敗スライドは null）
    const urlByIndex = new Map<number, string>()
    toUpload.forEach((r, ui) => urlByIndex.set(r.index, uploadedUrls[ui]))
    const imageUrls = slides.map((_, i) => urlByIndex.get(i) ?? null)

    const policyFallbackSlides = slideResults.filter(r => r.policyFallback && r.buffer !== null).map(r => r.slideNumber)
    const failedSlides         = slideResults.filter(r => r.buffer === null).map(r => r.slideNumber)

    if (failedSlides.length > 0) {
      console.warn(`[v4/generate-image] ${failedSlides.length}枚が生成失敗（ポリシー違反・全スライド分離）: slides ${failedSlides.join(",")}`)
    }

    // 画像生成コスト: スライドごとの FAL 呼び出し回数を集計
    const totalFalCalls    = slideResults.reduce((s, r) => s + (r.falCalls ?? 1), 0)
    const hasImageSlides   = slideResults.some((_, i) => {
      const slide = slides[i]
      return (postType === "product" || postType === "mixed") &&
        pickProductForSlide(slide, product, competitors, postType) !== null
    })
    const imageCostRaw  = calcFalCost(totalFalCalls, hasImageSlides)
    const imageCost     = formatCost(imageCostRaw)

    return NextResponse.json({
      imageUrls,          // null = そのスライドは生成失敗
      refBenchmark: refBenchmark.folderPath,
      policyFallbackSlides,
      failedSlides,       // 生成完全失敗したスライド番号一覧
      imageCost,          // { jpy, cny, usd }
      usedBgGroupMode,    // true = 同背景グループ生成を使用（一括再生成ボタンを表示するため）
      backgroundGroups: refBenchmark.backgroundGroups ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/generate-image]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
