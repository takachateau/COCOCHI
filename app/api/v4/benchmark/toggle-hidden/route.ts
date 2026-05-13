/**
 * POST /api/v4/benchmark/toggle-hidden
 * ベンチマーク投稿の非表示フラグを切り替える
 */
import { NextRequest, NextResponse } from "next/server"
import { dbToggleBenchmarkHidden } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const { id, isHidden } = await req.json() as { id?: string; isHidden?: boolean }
    if (!id || isHidden === undefined) {
      return NextResponse.json({ error: "id, isHidden は必須" }, { status: 400 })
    }
    await dbToggleBenchmarkHidden(id, isHidden)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
