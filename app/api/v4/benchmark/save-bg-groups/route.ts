import { NextRequest, NextResponse } from "next/server"
import { dbUpdateBackgroundGroups } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { benchmarkPostId?: string; groups?: number[][] }
    const { benchmarkPostId, groups } = body

    if (!benchmarkPostId || !groups || !Array.isArray(groups)) {
      return NextResponse.json({ error: "benchmarkPostId と groups は必須" }, { status: 400 })
    }

    await dbUpdateBackgroundGroups(benchmarkPostId, groups)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/benchmark/save-bg-groups]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
