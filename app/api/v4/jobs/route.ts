/**
 * GET /api/v4/jobs
 * 生成キューのジョブ一覧を返す（新しい順・最大50件）
 */
import { NextResponse } from "next/server"
import { dbLoadJobs } from "@/lib/supabase"

export const maxDuration = 30

export async function GET() {
  try {
    const jobs = await dbLoadJobs(50)
    return NextResponse.json({ jobs })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
