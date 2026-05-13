/**
 * POST /api/v4/regenerate-bg-group
 * 同背景グループのスライドを一括再生成する
 *
 * 生成方式:
 *   - グループ内の最初のスライドを通常生成（ベンチマーク参照）
 *   - 2枚目以降は最初の生成結果を背景参照として渡す（背景統一）
 *
 * リクエスト:
 *   { slideIndices, slides, personaId, postType, productId?, types,
 *     benchmarkFolderPath, backgroundGroupIndex? }
 * レスポンス:
 *   { imageUrls: (string|null)[], policyFallbackSlides: number[] }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbLoadBenchmarkPosts, dbLoadCompetitorProducts } from "@/lib/supabase"
import { loadProducts } from "@/lib/products"
import { describeV3SlideStyle } from "@/lib/referenceV2"
import { generateV2Slide } from "@/lib/fal"
import { uploadSlideBuffers } from "@/lib/storage"
import type {
  GeneratedSlide,
  PostType,
  HookType,
  StructureType,
  CompositionType,
  CompetitorProduct,
} from "@/types/v2"
import type { Product } from "@/types"

export const maxDuration = 300

const COMPOSITION_HINTS: Record<CompositionType, string> = {
  C1: "Text-dominant layout: white or light background, large bold typography, generous whitespace, minimal imagery.",
  C2: "Photo-dominant layout: a single subject (lifestyle scene) as the visual main, restrained text overlay.",
  C3: "List or table layout: structured rows, color-coded items, high information density, clear visual hierarchy.",
  C4: "Before/after comparison layout: side-by-side or top-bottom split, contrast or arrow highlighting transformation.",
  C5: "Mood-focused aesthetic: pastel and refined color palette, unified atmosphere, abundant whitespace, polished elegance.",
}

const CTA_TAG_KEYWORDS = ["フォロー","保存","cta","コール","まとめ","プロフィール","参加","フォロバ","シェア","コメント","エンゲージ"]

function isCTASlide(slide: GeneratedSlide) {
  return CTA_TAG_KEYWORDS.some(kw => (slide.tag ?? "").toLowerCase().includes(kw))
}

function detectColorPalette(themeTags: string[]): string {
  const j = themeTags.join(" ")
  if (/ニキビ|敏感肌|スキンケア|保湿|肌/.test(j)) return "pink"
  if (/メイク|コスメ|リップ|アイ/.test(j))        return "purple"
  if (/UV|美白|日焼け|シミ/.test(j))             return "yellow"
  if (/ナチュラル|オーガニック|無添加/.test(j))    return "green"
  return "pink"
}

function pickProductImageUrl(
  slide: GeneratedSlide,
  product: Product | null,
  competitors: CompetitorProduct[],
  postType: PostType,
): string | undefined {
  if (postType !== "product" && postType !== "mixed") return undefined
  if (slide.slideNumber === 1 || isCTASlide(slide)) return undefined
  const text = `${slide.headline} ${(slide.bullets ?? []).join(" ")} ${slide.accent ?? ""} ${slide.tag ?? ""}`.toLowerCase()
  for (const c of competitors) {
    const first = (c.productName ?? "").toLowerCase().split(/[\s　]+/)[0] ?? ""
    if (first.length >= 3 && text.includes(first)) return c.imageUrl
  }
  for (const c of competitors) {
    if ((c.brandName ?? "").length >= 2 && text.includes((c.brandName ?? "").toLowerCase())) return c.imageUrl
  }
  if (product && (text.includes("アネトス") || text.includes("anetos"))) return product.imageUrl
  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      slideIndices?: number[]          // 対象の生成スライドの配列インデックス（0-based）
      slides?: GeneratedSlide[]        // 全スライドのテキスト
      personaId?: string
      postType?: PostType
      productId?: string
      types?: { hookType: string; structureType: StructureType; compositionType: CompositionType }
      benchmarkFolderPath?: string
    }
    const { slideIndices, slides, personaId, postType, productId, types, benchmarkFolderPath } = body

    if (!slideIndices?.length || !slides?.length || !personaId || !postType) {
      return NextResponse.json({ error: "slideIndices, slides, personaId, postType は必須" }, { status: 400 })
    }

    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === personaId)
    if (!persona || !persona.benchmarkAccount) {
      return NextResponse.json({ error: "persona not found" }, { status: 404 })
    }

    const allPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    let refPost = benchmarkFolderPath
      ? allPosts.find(b => b.folderPath === benchmarkFolderPath)
      : undefined
    if (!refPost) {
      const pool = allPosts.filter(b => b.postType === postType)
      refPost = (pool.length > 0 ? pool : allPosts)[Math.floor(Math.random() * (pool.length > 0 ? pool : allPosts).length)]
    }
    if (!refPost) return NextResponse.json({ error: "ベンチマーク投稿なし" }, { status: 400 })

    const benchmarkUrls = refPost.slideUrls
    const firstRefUrl = benchmarkUrls[0]

    let product: Product | null = null
    let competitors: CompetitorProduct[] = []
    if ((postType === "product" || postType === "mixed") && productId) {
      const products = await loadProducts()
      product = products.find(p => p.id === productId) ?? null
      competitors = await dbLoadCompetitorProducts(productId).catch(() => [])
    }

    const colorPalette = detectColorPalette(persona.themeTags)
    const compositionHint = types ? COMPOSITION_HINTS[types.compositionType] : ""
    const visualProfile = persona.visualProfile ?? undefined
    const personaHint = visualProfile ? undefined : persona.characterText.slice(0, 300)

    // グループ内スライドを順番に処理 — 最初の1枚を生成し、以降はそれを背景参照として渡す
    const results: Array<{ buffer: Buffer | null; policyFallback: boolean; falCalls: number }> = []
    let groupRefImageUrl: string | null = null  // グループ内1枚目の生成結果URL（2枚目以降に渡す）

    for (const idx of slideIndices) {
      const slide = slides[idx]
      if (!slide) { results.push({ buffer: null, policyFallback: false, falCalls: 0 }); continue }

      // スタイル説明: 最初の1枚はベンチマーク参照、2枚目以降は1枚目を参照
      const benchmarkRefUrl = benchmarkUrls[idx] ?? firstRefUrl
      const styleDesc = await describeV3SlideStyle(groupRefImageUrl ?? benchmarkRefUrl)
      const finalStyleDesc = [styleDesc, compositionHint].filter(Boolean).join("  ")

      const productImageUrl = pickProductImageUrl(slide, product, competitors, postType)

      const result = await generateV2Slide({
        headline:        slide.headline,
        tag:             slide.tag,
        bullets:         slide.bullets,
        accent:          slide.accent,
        colorPalette,
        // 2枚目以降: 最初の生成結果を背景参照として渡す（背景統一）
        refImageUrl:     groupRefImageUrl ?? benchmarkRefUrl,
        styleDescription: finalStyleDesc,
        slideNumber:     slide.slideNumber,
        visualProfile,
        personaHint,
        productImageUrl,
        bgInherit:       groupRefImageUrl !== null,  // 2枚目以降は同背景継承モード
      })
      results.push(result)

      // 最初の1枚が成功したらそのURLをグループ参照として保持
      if (groupRefImageUrl === null && result.buffer !== null) {
        const [uploaded] = await uploadSlideBuffers([result.buffer])
        groupRefImageUrl = uploaded
        // このスライドは既にアップロード済みなのでバッファを null に（二重アップロード防止）
        results[results.length - 1] = { ...result, buffer: null, _uploadedUrl: uploaded } as typeof result & { _uploadedUrl: string }
      }
    }

    // バッファが残っているものをアップロード
    const toUpload = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.buffer !== null) as Array<{ r: { buffer: Buffer; policyFallback: boolean; falCalls: number }; i: number }>
    const uploaded = toUpload.length > 0 ? await uploadSlideBuffers(toUpload.map(({ r }) => r.buffer)) : []

    const uploadedByResultIdx = new Map<number, string>()
    toUpload.forEach(({ i }, ui) => uploadedByResultIdx.set(i, uploaded[ui]))

    // slideIndices の順で URL を返す
    const imageUrls = slideIndices.map((_, ri) => {
      const r = results[ri] as typeof results[0] & { _uploadedUrl?: string }
      if (r._uploadedUrl) return r._uploadedUrl           // 最初の1枚（既アップロード）
      return uploadedByResultIdx.get(ri) ?? null
    })

    const policyFallbackSlides = slideIndices
      .filter((_, ri) => results[ri]?.policyFallback && !!(results[ri].buffer ?? (results[ri] as { _uploadedUrl?: string })._uploadedUrl))
      .map((_, ri) => slides[slideIndices[ri]]?.slideNumber ?? -1)
      .filter(n => n >= 0)

    return NextResponse.json({ imageUrls, policyFallbackSlides })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[regenerate-bg-group]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
