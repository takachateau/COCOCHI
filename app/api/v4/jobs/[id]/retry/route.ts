/**
 * POST /api/v4/jobs/[id]/retry
 * スタックしたジョブを再起動する。
 * textResult が保存済みの場合はテキスト生成をスキップして画像生成から再開できるよう
 * status を "pending" に戻すだけにする（textResult は消さない）。
 */
import { NextRequest, NextResponse } from "next/server"
import { supabase, dbLoadJob } from "@/lib/supabase"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  try {
    const job = await dbLoadJob(id)
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

    // キャンセル済み・完了済みはリトライ不可
    if (job.status === "done" || job.status === "cancelled") {
      return NextResponse.json({ error: `status=${job.status} はリトライできません` }, { status: 400 })
    }

    // status を pending に戻す（textResult・refBenchmark はそのまま保持）
    // error_message を null クリアするため直接 patch する
    const { error: patchErr } = await supabase
      .from("generation_jobs")
      .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (patchErr) throw new Error(patchErr.message)

    // fire-and-forget で process を再起動
    const baseUrl = _req.nextUrl.origin
    fetch(`${baseUrl}/api/v4/jobs/${id}/process`, { method: "POST" }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
