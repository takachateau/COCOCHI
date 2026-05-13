import { NextRequest, NextResponse } from "next/server"
import { dbUpdateBackgroundGroups } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { benchmarkPostId?: string; groups?: number[][] }
    const { benchmarkPostId, groups } = body

    if (!benchmarkPostId) {
      return NextResponse.json({ error: "benchmarkPostId は必須" }, { status: 400 })
    }
    // groups: null = 解除、配列 = 設定
    if (groups !== null && !Array.isArray(groups)) {
      return NextResponse.json({ error: "groups は配列または null である必要があります" }, { status: 400 })
    }

    await dbUpdateBackgroundGroups(benchmarkPostId, groups)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/benchmark/save-bg-groups]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
