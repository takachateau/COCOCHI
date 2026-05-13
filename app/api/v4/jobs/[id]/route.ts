/**
 * GET /api/v4/jobs/[id]
 * 単一ジョブの状態を返す（スライド再生成のポーリング用）
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadJob } from "@/lib/supabase"

export const maxDuration = 30

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const job = await dbLoadJob(id)
    if (!job) {
      return NextResponse.json({ error: "job not found" }, { status: 404 })
    }
    return NextResponse.json({ job })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
