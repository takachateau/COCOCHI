/**
 * POST /api/content-plans  — 週次プランの骨格を生成してDBに保存
 *   リクエスト: { personaId, productId?, weekStart }
 *   レスポンス: { plan }
 *
 * GET  /api/content-plans?personaId=xxx  — ペルソナのプラン一覧
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbSaveContentPlan } from "@/lib/supabase"
import { buildWeeklyPlan } from "@/lib/contentPlan"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      personaId?: string
      productId?: string | null
      weekStart?: string
    }
    const { personaId, productId = null, weekStart } = body

    if (!personaId || !weekStart) {
      return NextResponse.json({ error: "personaId と weekStart は必須です" }, { status: 400 })
    }

    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === personaId)
    if (!persona) {
      return NextResponse.json({ error: "ペルソナが見つかりません" }, { status: 404 })
    }

    const planData = await buildWeeklyPlan(persona, productId, weekStart)
    const plan = await dbSaveContentPlan(planData)

    return NextResponse.json({ plan })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId")
    if (!personaId) {
      return NextResponse.json({ error: "personaId は必須です" }, { status: 400 })
    }

    // personaIdで絞ったプラン一覧
    const { supabase } = await import("@/lib/supabase")
    const { data, error } = await supabase
      .from("content_plans")
      .select("*")
      .eq("persona_id", personaId)
      .order("week_start", { ascending: false })

    if (error) throw new Error(error.message)

    return NextResponse.json({ plans: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
