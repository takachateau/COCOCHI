/**
 * GET    /api/v4/generated-posts            — 生成済み投稿一覧（DB + 完了済みキュージョブをマージ）
 * GET    /api/v4/generated-posts?trash=1    — ゴミ箱の中身
 * POST   /api/v4/generated-posts            — 生成済み投稿を保存
 * PATCH  /api/v4/generated-posts?id=xxx     — 画像URL更新
 * PATCH  /api/v4/generated-posts?id=xxx&restore=1 — ゴミ箱から復元
 * DELETE /api/v4/generated-posts?id=xxx     — ゴミ箱に入れる（ソフトデリート）
 * DELETE /api/v4/generated-posts?id=xxx&purge=1 — 完全削除（復元不可）
 */
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic" // Vercel Edge キャッシュを無効化（スライド再生成後に即反映させるため）
import {
  dbSaveGeneratedPost, dbLoadGeneratedPosts, dbLoadRecentPostsByPersona,
  dbDeleteGeneratedPost, dbUpdateGeneratedPostImages, dbLoadDoneJobs, dbDeleteJob,
  dbLoadTrashedPosts, dbLoadTrashedJobs,
  dbRestoreGeneratedPost, dbRestoreJob,
  dbPurgeGeneratedPost, dbPurgeJob,
} from "@/lib/supabase"
import type { GeneratedPost, GenerationJob } from "@/types/v2"

/**
 * generation_jobs(done) → GeneratedPost 形式に変換。
 * textResult が欠損している場合は null を返す（=スキップ）。
 */
function jobToPost(job: GenerationJob): GeneratedPost | null {
  if (!job.textResult) return null
  const { types, generated } = job.textResult
  return {
    id:              `job_${job.id}`,
    createdAt:       job.createdAt,
    personaId:       job.personaId,
    personaName:     job.personaName ?? "",
    postType:        job.postType,
    productId:       job.productId ?? null,
    overallTitle:    generated.overallTitle,
    slides:          generated.slides,
    caption:         generated.caption ?? null,
    hookType:        types.hookType,
    structureType:   types.structureType,
    compositionType: types.compositionType,
    refBenchmark:    job.refBenchmark ?? null,
    imageUrls:       (job.imageUrls ?? []).filter((u): u is string => u !== null),
  }
}

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId")
    const trash     = req.nextUrl.searchParams.get("trash") === "1"

    if (personaId) {
      // ペルソナ指定の場合: generated_posts のみ（重複除去が複雑になるため）
      const posts = await dbLoadRecentPostsByPersona(personaId, 50)
      return NextResponse.json({ posts })
    }

    // 全件: generated_posts と完了済みジョブを並列取得してマージ
    // trash=1 のときはゴミ箱に入っているものだけを返す
    const [dbResult, jobsResult] = await Promise.allSettled([
      trash ? dbLoadTrashedPosts() : dbLoadGeneratedPosts(),
      trash ? dbLoadTrashedJobs()  : dbLoadDoneJobs(),
    ])
    const dbPosts  = dbResult.status  === "fulfilled" ? dbResult.value  : []
    const doneJobs = jobsResult.status === "fulfilled" ? jobsResult.value : []

    const dbError   = dbResult.status  === "rejected" ? String(dbResult.reason)  : null
    const jobsError = jobsResult.status === "rejected" ? String(jobsResult.reason) : null
    if (dbError)   console.error("[generated-posts] dbLoad error:", dbError)
    if (jobsError) console.error("[generated-posts] jobs load error:", jobsError)

    // 重複除去: generated_posts に既に保存されているタイトル+ペルソナを除外
    const savedKeys = new Set(dbPosts.map(p => `${p.personaId}::${p.overallTitle}`))
    const jobOnlyPosts = doneJobs
      .filter(j => j.jobType !== "slide_regen")  // slide_regen ジョブは独立投稿に変換しない
      .map(jobToPost)
      .filter((p): p is GeneratedPost => p !== null)
      .filter(p => !savedKeys.has(`${p.personaId}::${p.overallTitle}`))

    // マージして日付降順ソート
    const merged = [...dbPosts, ...jobOnlyPosts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      posts: merged,
      _debug: {
        trash,
        dbPostsCount:   dbPosts.length,
        doneJobsCount:  doneJobs.length,
        mergedCount:    merged.length,
        dbError,
        jobsError,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Parameters<typeof dbSaveGeneratedPost>[0]
    const post = await dbSaveGeneratedPost(body)
    return NextResponse.json({ post })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id      = searchParams.get("id")
    const restore = searchParams.get("restore") === "1"
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

    // 復元処理（ゴミ箱から元に戻す）
    if (restore) {
      if (id.startsWith("job_")) {
        await dbRestoreJob(id.replace("job_", ""))
      } else {
        await dbRestoreGeneratedPost(id)
      }
      return NextResponse.json({ ok: true })
    }

    // job_ プレフィックスの ID は generated_posts に存在しないためスキップ
    if (id.startsWith("job_")) return NextResponse.json({ ok: true, skipped: true })
    const body = await req.json() as { imageUrls?: string[] }
    if (!Array.isArray(body.imageUrls)) return NextResponse.json({ error: "imageUrls は必須です" }, { status: 400 })
    await dbUpdateGeneratedPostImages(id, body.imageUrls)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id    = searchParams.get("id")
    const purge = searchParams.get("purge") === "1"
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

    // purge=1 のときは完全削除（復元不可）、それ以外はゴミ箱へ
    if (id.startsWith("job_")) {
      const jobId = id.replace("job_", "")
      if (purge) await dbPurgeJob(jobId)
      else       await dbDeleteJob(jobId)
    } else {
      if (purge) await dbPurgeGeneratedPost(id)
      else       await dbDeleteGeneratedPost(id)
    }
    return NextResponse.json({ ok: true, purge })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
