/**
 * インメモリ ジョブストア + Vercel Blob 永続化
 *
 * Vercel サーバーレスはインスタンスが分離されるため、
 * generate(POST) と status(GET) が別インスタンスになると globalThis が共有されない。
 * → createJob で Blob に書き込んでから返し、status 側は Blob から直接読む。
 */
import type { PostGroup } from "@/types"
import { put, del } from "@vercel/blob"

export type JobStatus = "pending" | "generating" | "done" | "error"

export interface Job {
  id: string
  status: JobStatus
  progress: string
  completedSlides: number
  totalSlides: number
  group?: PostGroup
  error?: string
  createdAt: number
}

// ─── インメモリストア（同一インスタンス内の高速アクセス用） ───────────

const g = globalThis as typeof globalThis & { __cocochi_jobs?: Map<string, Job> }
if (!g.__cocochi_jobs) g.__cocochi_jobs = new Map<string, Job>()
const jobs = g.__cocochi_jobs

// ─── Blob 永続化 ─────────────────────────────────────────────────

const JOB_PREFIX = "cocochi/jobs/"

/**
 * BLOB_READ_WRITE_TOKEN から Blob の base URL を導出する。
 * トークン形式: vercel_blob_rw_{storeId}_{secret}
 * 例: vercel_blob_rw_nhRmha2Spl8DgL9d_xxx → https://nhRmha2Spl8DgL9d.public.blob.vercel-storage.com
 */
function getBlobBaseUrl(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? ""
  const match = token.match(/^vercel_blob_rw_([^_]+)/)
  if (!match?.[1]) return ""
  return `https://${match[1]}.public.blob.vercel-storage.com`
}

function getJobBlobUrl(id: string): string {
  const base = getBlobBaseUrl()
  if (!base) return ""
  return `${base}/${JOB_PREFIX}${id}.json`
}

/** Blob にジョブを書き込む（失敗しても throw しない） */
async function writeJob(job: Job): Promise<void> {
  try {
    await put(
      `${JOB_PREFIX}${job.id}.json`,
      JSON.stringify(job),
      { access: "public", contentType: "application/json", addRandomSuffix: false },
    )
  } catch (e) {
    console.error("[jobs] Blob write error:", e)
  }
}

/** Blob からジョブを直接 fetch（URL 導出済みなのでリスト不要） */
export async function getJobFromBlob(id: string): Promise<Job | null> {
  try {
    const url = getJobBlobUrl(id)
    if (!url) return null
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    return JSON.parse(text) as Job
  } catch {
    return null
  }
}

// ─── 公開 API ─────────────────────────────────────────────────────

/** ジョブ作成。Blob に書き込んでから返すことで最初のポーリングで確実に取得できる。 */
export async function createJob(): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: "生成準備中...",
    completedSlides: 0,
    totalSlides: 20,
    createdAt: Date.now(),
  }
  jobs.set(job.id, job)
  await writeJob(job)   // ← ここは await（最初のポーリングまでに必ず書く）
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id)
  if (!job) return
  const updated = { ...job, ...patch }
  jobs.set(id, updated)

  if (patch.status === "done" || patch.status === "error") {
    // 完了・エラーは確実に書く
    writeJob(updated).then(() => {
      if (patch.status === "done") {
        // 5分後にクリーンアップ
        setTimeout(() => {
          del(getJobBlobUrl(id)).catch(() => {})
        }, 5 * 60 * 1000)
      }
    })
  } else {
    // 進捗更新は fire-and-forget（毎スライドなので await しない）
    writeJob(updated)
  }
}

export function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}
