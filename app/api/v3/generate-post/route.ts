/**
 * POST /api/v3/generate-post
 * v3 単発投稿生成: ペルソナ × 型（自動選択）× 商品 で1投稿のテキストを生成する
 *
 * リクエスト: { personaId, postType, productId? }
 * レスポンス: { types, generated }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbLoadBenchmarkPosts, dbLoadCompetitorProducts, dbLoadRecentPostsByPersona } from "@/lib/supabase"
import { loadProducts } from "@/lib/products"
import { selectTypeCombination, generateV3Post, isDuplicatePost } from "@/lib/v3Generate"
import type { PostType } from "@/types/v2"

export const maxDuration = 120

const VALID_POST_TYPES: PostType[] = ["tips", "product", "mixed"]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { personaId?: string; postType?: PostType; productId?: string; benchmarkFolderPath?: string }
    const { personaId, postType, productId, benchmarkFolderPath } = body

    if (!personaId || !postType) {
      return NextResponse.json({ error: "personaId, postType は必須" }, { status: 400 })
    }
    if (!VALID_POST_TYPES.includes(postType)) {
      return NextResponse.json({ error: `postType は ${VALID_POST_TYPES.join("/")} のいずれか` }, { status: 400 })
    }
    if ((postType === "product" || postType === "mixed") && !productId) {
      return NextResponse.json({ error: "postType=product/mixed のとき productId は必須" }, { status: 400 })
    }

    // ペルソナ取得
    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === personaId)
    if (!persona) {
      return NextResponse.json({ error: "persona not found" }, { status: 404 })
    }
    if (!persona.benchmarkAccount) {
      return NextResponse.json({ error: "ペルソナに benchmarkAccount がありません" }, { status: 400 })
    }

    // ベンチマーク取得（ペルソナ固有）
    const benchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    if (benchmarkPosts.length === 0) {
      return NextResponse.json({ error: `ベンチマーク ${persona.benchmarkAccount} の投稿がありません` }, { status: 400 })
    }

    // 商品取得（product/mixedの場合）
    let product = null
    if ((postType === "product" || postType === "mixed") && productId) {
      const products = await loadProducts()
      product = products.find(p => p.id === productId) ?? null
      if (!product) {
        return NextResponse.json({ error: "product not found" }, { status: 404 })
      }
    }

    // 型選択
    const types = selectTypeCombination(persona, benchmarkPosts, postType)

    // ─ 画像生成で使うベンチマークを事前に選定（枚数を text 生成に渡すため） ─
    // 手動指定 > structureType 一致を最優先 → postType 一致 → 全件 の順でフォールバック
    const hasSlidUrls = (b: (typeof benchmarkPosts)[0]) => (b.slideUrls ?? []).length > 0
    let selectedBenchmark = benchmarkFolderPath
      ? benchmarkPosts.find(b => b.folderPath === benchmarkFolderPath && hasSlidUrls(b))
      : undefined
    if (!selectedBenchmark) {
      const typeMatched = benchmarkPosts.filter(b =>
        b.postType === postType && b.structureType === types.structureType && hasSlidUrls(b),
      )
      const postMatched = benchmarkPosts.filter(b => b.postType === postType && hasSlidUrls(b))
      const anyMatched  = benchmarkPosts.filter(hasSlidUrls)
      const benchmarkPool = typeMatched.length > 0 ? typeMatched
        : postMatched.length > 0 ? postMatched
        : anyMatched
      selectedBenchmark = benchmarkPool[Math.floor(Math.random() * benchmarkPool.length)]
    }
    const targetSlideCount  = selectedBenchmark ? (selectedBenchmark.slideUrls ?? []).length : undefined

    // ベンチマークサンプル: 同じ postType の投稿を最大3件（構造を学ぶため）
    // mixed のとき該当投稿がなければ tips でフォールバック（Tips構造に商品を乗せる運用のため）
    const samplesExact = benchmarkPosts.filter(b => b.postType === postType)
    const benchmarkSamples = samplesExact.length > 0
      ? samplesExact.slice(0, 3)
      : benchmarkPosts.filter(b => b.postType === "tips").slice(0, 3)

    // 競合商品: product/mixed のときのみ取得（ベンチマークが比較型なら使う）
    const competitors = (postType === "product" || postType === "mixed") && productId
      ? await dbLoadCompetitorProducts(productId).catch(() => [])
      : []

    // 過去30件の生成済み投稿タイトルを取得（被り防止用）
    const recentPosts = await dbLoadRecentPostsByPersona(personaId, 30).catch(() => [])
    const history = recentPosts.map(p => p.overallTitle)

    // 生成（被り判定付きリトライ・最大3回）
    const generateParams = { persona, postType, product, types, benchmarkSamples, competitors, targetSlideCount, history }
    let generated = await generateV3Post(generateParams)

    for (let attempt = 0; attempt < 2; attempt++) {
      const duplicate = await isDuplicatePost(generated.overallTitle, history)
      if (!duplicate) break
      console.log(`[v3/generate-post] 被り検出 (attempt ${attempt + 1}): "${generated.overallTitle}" → 再生成`)
      generated = await generateV3Post(generateParams)
    }

    return NextResponse.json({
      types,
      generated,
      refBenchmark: selectedBenchmark?.folderPath,  // generate-image に渡して同じベンチマークを使う
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v3/generate-post]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
