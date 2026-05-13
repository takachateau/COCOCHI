/**
 * POST /api/content-plans/generate-text
 * プランに含まれる全投稿のテキストを一括生成してDBに保存する
 *
 * リクエスト: { planId, productId? }
 * レスポンス: { plan }（テキスト生成済みの状態）
 */
import { NextRequest, NextResponse } from "next/server"
import {
  dbLoadPersonas,
  dbLoadBenchmarkPosts,
  dbUpdateContentPlanPosts,
  supabase,
} from "@/lib/supabase"
import { loadProducts } from "@/lib/products"
import { generateAllText } from "@/lib/contentPlan"
import type { ContentPlan } from "@/types/v2"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { planId?: string; productId?: string }
    const { planId, productId } = body

    if (!planId) {
      return NextResponse.json({ error: "planId は必須です" }, { status: 400 })
    }

    // プランを取得
    const { data: planRow, error: planErr } = await supabase
      .from("content_plans")
      .select("*")
      .eq("id", planId)
      .single()

    if (planErr || !planRow) {
      return NextResponse.json({ error: "プランが見つかりません" }, { status: 404 })
    }

    const plan: ContentPlan = {
      id: planRow.id,
      createdAt: planRow.created_at,
      personaId: planRow.persona_id,
      productId: planRow.product_id ?? null,
      weekStart: planRow.week_start,
      posts: planRow.posts,
    }

    // ペルソナ・商品・ベンチマークを並列取得
    const [personas, products, benchmarkPosts] = await Promise.all([
      dbLoadPersonas(),
      loadProducts(),
      dbLoadBenchmarkPosts(),
    ])

    const persona = personas.find(p => p.id === plan.personaId)
    if (!persona) {
      return NextResponse.json({ error: "ペルソナが見つかりません" }, { status: 404 })
    }

    const resolvedProductId = productId ?? plan.productId
    const product = resolvedProductId
      ? products.find(p => p.id === resolvedProductId) ?? null
      : null

    // ベンチマークをMapで引けるようにする（ID → BenchmarkPost全体）
    const benchmarkMap = new Map(benchmarkPosts.map(b => [b.id, b]))

    // 全投稿のテキストを生成（B系統 + AI被り判定QC）
    const updatedPosts = await generateAllText(plan, persona, product, benchmarkMap)

    // DBに保存
    await dbUpdateContentPlanPosts(planId, updatedPosts)

    return NextResponse.json({
      plan: { ...plan, posts: updatedPosts },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
