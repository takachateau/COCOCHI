/**
 * POST /api/v4/jobs/enqueue-slide-regen
 * 1スライド再生成をキューに追加する。
 * - Supabase に job_type=slide_regen のジョブを作成（status: pending）
 * - /api/v4/jobs/[id]/process を fire-and-forget で起動
 * - クライアントには即座に { jobId } を返す
 */
import { NextRequest, NextResponse } from "next/server"
import { dbCreateSlideRegenJob } from "@/lib/supabase"
import type { PostType, SlideRegenParams } from "@/types/v2"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      personaId?:        string
      postType?:         PostType
      productId?:        string
      slideRegenParams?: SlideRegenParams
    }
    const { personaId, postType, productId, slideRegenParams } = body

    if (!personaId || !postType || !slideRegenParams) {
      return NextResponse.json(
        { error: "personaId, postType, slideRegenParams は必須" },
        { status: 400 },
      )
    }

    const job = await dbCreateSlideRegenJob({ personaId, postType, productId, slideRegenParams })

    // process エンドポイントを fire-and-forget で起動
    const origin = req.nextUrl.origin
    fetch(`${origin}/api/v4/jobs/${job.id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(err => console.error("[enqueue-slide-regen] process 起動エラー:", err))

    console.log(`[enqueue-slide-regen] jobId=${job.id} slideIndex=${slideRegenParams.slideIndex}`)
    return NextResponse.json({ jobId: job.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[enqueue-slide-regen]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
