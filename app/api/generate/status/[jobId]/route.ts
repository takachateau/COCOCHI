import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/jobs"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const job = getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 })
  }

  return NextResponse.json({
    status:          job.status,
    progress:        job.progress,
    completedSlides: job.completedSlides,
    totalSlides:     job.totalSlides,
    group:           job.group,
    error:           job.error,
  })
}
