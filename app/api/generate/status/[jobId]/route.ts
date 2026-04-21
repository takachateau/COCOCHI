import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/jobs"
import { loadGroups } from "@/lib/storage"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const job = await getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 })
  }

  // done時: groupIdを使ってgroupsからフルデータを取得
  // jobにbase64画像を持たせない（数十MBになりBlobの信頼性が下がるため）
  let group = undefined
  if (job.status === "done" && job.groupId) {
    try {
      const groups = await loadGroups()
      group = groups.find(g => g.id === job.groupId)
    } catch {
      // グループ読み込み失敗は無視（ステータスだけ返す）
    }
  }

  return NextResponse.json({
    status:          job.status,
    progress:        job.progress,
    completedSlides: job.completedSlides,
    totalSlides:     job.totalSlides,
    startTime:       job.startTime,
    group,
    error:           job.error,
  })
}
