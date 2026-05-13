/**
 * POST /api/v4/jobs/enqueue
 * 生成キューにジョブを追加する。
 * - Supabase にジョブレコードを作成（status: pending）
 * - /api/v4/jobs/[id]/process を fire-and-forget で起動
 * - クライアントには即座に { jobId } を返す（ブロッキングしない）
 */
import { NextRequest, NextResponse } from "next/server"
import { dbCreateJob } from "@/lib/supabase"
import type { PostType } from "@/types/v2"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      personaId?: string
      postType?: PostType
      productId?: string
      benchmarkFolderPath?: string
    }
    const { personaId, postType, productId, benchmarkFolderPath } = body

    if (!personaId || !postType) {
      return NextResponse.json({ error: "personaId, postType は必須" }, { status: 400 })
    }

    // ジョブをDBに作成
    const job = await dbCreateJob({ personaId, postType, productId, benchmarkFolderPath })

    // process エンドポイントを fire-and-forget で起動
    // ※ await しない → enqueue は即座に返る。process は独立した Vercel Function として動き続ける。
    const origin = req.nextUrl.origin
    fetch(`${origin}/api/v4/jobs/${job.id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(err => console.error("[v4/jobs/enqueue] process 起動エラー:", err))

    console.log(`[v4/jobs/enqueue] jobId=${job.id} postType=${postType} personaId=${personaId}`)
    return NextResponse.json({ jobId: job.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/jobs/enqueue]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
