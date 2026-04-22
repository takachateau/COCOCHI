/**
 * 再生成 API
 * POST /api/regenerate → jobId + body を返す
 * クライアントが /api/regenerate/run を fire-and-forget で呼び、ポーリングで完了検知
 */
import { NextRequest, NextResponse } from "next/server"
import { loadGroups } from "@/lib/storage"
import { createJob, updateJob, pruneOldJobs } from "@/lib/jobs"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    groupId: string
    postId?: string
    slideIndex?: number
    instruction?: string
  }
  const { groupId, postId, slideIndex } = body

  const groups = await loadGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group) return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 })
  if (!group.productImageUrl) return NextResponse.json({ error: "商品画像URLがありません" }, { status: 400 })

  pruneOldJobs()

  const postsToRegen = postId ? group.posts.filter(p => p.id === postId) : group.posts
  const slidesCount = slideIndex !== undefined ? postsToRegen.length : postsToRegen.length * 5
  const job = await createJob()
  await updateJob(job.id, { totalSlides: slidesCount, completedSlides: 0, startTime: Date.now() })

  return NextResponse.json({ jobId: job.id, body })
}
