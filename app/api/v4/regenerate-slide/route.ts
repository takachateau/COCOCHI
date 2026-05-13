/**
 * POST /api/v4/regenerate-slide
 * v4 単発スライド再生成: 1スライドだけ作り直す
 *
 * リクエスト: {
 *   slide,            // 再生成する1スライド分
 *   personaId,
 *   postType,
 *   productId?,
 *   types,
 *   slideIndex,       // 0-based。ベンチマークの該当スライドを使うため
 *   benchmarkFolderPath?  // 同じベンチマークを使い続けたい場合に指定
 * }
 *
 * レスポンス: { imageUrl, refBenchmark }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbLoadBenchmarkPosts } from "@/lib/supabase"
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
} from "@/types/v2"

export const maxDuration = 180

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      slide?: GeneratedSlide
      personaId?: string
      postType?: PostType
      productId?: string
      types?: { hookType: HookType; structureType: StructureType; compositionType: CompositionType }
      slideIndex?: number
      benchmarkFolderPath?: string
    }
    const { slide, personaId, postType, productId, types, slideIndex, benchmarkFolderPath } = body

    if (!slide || !personaId || !postType || slideIndex === undefined) {
      return NextResponse.json({ error: "slide, personaId, postType, slideIndex は必須" }, { status: 400 })
    }

    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === personaId)
    if (!persona || !persona.benchmarkAccount) {
      return NextResponse.json({ error: "persona not found or no benchmark" }, { status: 404 })
    }

    const benchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    if (benchmarkPosts.length === 0) {
      return NextResponse.json({ error: "ベンチマーク投稿なし" }, { status: 400 })
    }

    // 同じベンチマークを指定された場合はそれを使う・なければ postType 一致からランダム
    let refBenchmark = benchmarkFolderPath
      ? benchmarkPosts.find(b => b.folderPath === benchmarkFolderPath)
      : undefined
    if (!refBenchmark) {
      const matched = benchmarkPosts.filter(b => b.postType === postType)
      const pool = matched.length > 0 ? matched : benchmarkPosts
      refBenchmark = pool[Math.floor(Math.random() * pool.length)]
    }
    const benchmarkUrls = refBenchmark.slideUrls

    // 商品取得
    let product = null
    if (postType === "product" && productId) {
      const products = await loadProducts()
      product = products.find(p => p.id === productId) ?? null
    }

    // 該当スライドのベンチマーク参照URL
    const refImageUrl = benchmarkUrls[slideIndex] ?? benchmarkUrls[0] ?? ""
    if (!refImageUrl) {
      return NextResponse.json({ error: "ベンチマークにスライドURLがありません" }, { status: 400 })
    }

    // スタイル分析
    const baseStyleDesc = await describeV3SlideStyle(refImageUrl)
    const compositionHint = types ? COMPOSITION_HINTS[types.compositionType] : ""
    const styleDescription = [baseStyleDesc, compositionHint].filter(Boolean).join(" ")

    const colorPalette = detectColorPalette(persona.themeTags)

    // 1スライドだけ生成
    const result = await generateV2Slide({
      headline:    slide.headline,
      tag:         slide.tag,
      bullets:     slide.bullets,
      accent:      slide.accent,
      productName: postType === "product" ? product?.name : undefined,
      colorPalette,
      refImageUrl,
      styleDescription,
    })

    if (!result.buffer) {
      return NextResponse.json({ error: "ポリシー違反のため生成できませんでした" }, { status: 422 })
    }
    const [imageUrl] = await uploadSlideBuffers([result.buffer])

    return NextResponse.json({
      imageUrl,
      refBenchmark:   refBenchmark.folderPath,
      policyFallback: result.policyFallback,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/regenerate-slide]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
