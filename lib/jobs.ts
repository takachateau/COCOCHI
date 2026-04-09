/**
 * インメモリ ジョブストア + Vercel Blob 永続化
 *
 * Vercel のサーバーレス関数はインスタンスが分離されているため、
 * generate と status が別インスタンスで動くと globalThis が共有されない。
 * → Vercel Blob に書き込み、status 側は直接 URL fetch で読む。
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
  blobUrl?: string   // Blob に書き込んだ URL（status 側が直接 fetch するために使用）
}

// ─── インメモリストア ──────────────────────────────────────────────

const g = globalThis as typeof globalThis & { __cocochi_jobs?: Map<string, Job> }
if (!g.__cocochi_jobs) g.__cocochi_jobs = new Map<string, Job>()
const jobs = g.__cocochi_jobs

// ─── Blob 永続化 ─────────────────────────────────────────────────

const JOB_PREFIX = "cocochi/jobs/"

/** ジョブ状態を Blob に書き込む（URL を返す） */
async function writeToBlob(job: Job): Promise<string> {
  const { url } = await put(
    `${JOB_PREFIX}${job.id}.json`,
    JSON.stringify(job),
    { access: "public", contentType: "application/json", addRandomSuffix: false },
  )
  return url
}

/** Blob URL から直接ジョブを取得 */
export async function getJobFromBlob(id: string): Promise<Job | null> {
  try {
    // まずメモリにある job から blobUrl を取得（同一インスタンスの場合）
    const memJob = jobs.get(id)
    const blobUrl = memJob?.blobUrl ?? deriveBlobUrl(id)
    if (!blobUrl) return null

    const res = await fetch(blobUrl, { cache: "no-store" })
    if (!res.ok) return null
    return await res.json() as Job
  } catch {
    return null
  }
}

/**
 * BLOB_READ_WRITE_TOKEN からストアの base URL を導出する。
 * トークン形式: vercel_blob_rw_{storeId}_{secret}
 * URL 形式:     https://{storeId}.public.blob.vercel-storage.com
 */
function deriveBlobUrl(id: string): string | null {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN ?? ""
    // vercel_blob_rw_XXXXX_YYY... → XXXXX
    const parts = token.split("_")
    // parts = ["vercel", "blob", "rw", "STOREID", "SECRET..."]
    const storeId = parts[3]
    if (!storeId) return null
    return `https://${storeId}.public.blob.vercel-storage.com/${JOB_PREFIX}${id}.json`
  } catch {
    return null
  }
}

/** 完了後に Blob を削除 */
async function cleanupBlob(job: Job) {
  try {
    if (job.blobUrl) await del(job.blobUrl)
  } catch { /* 無視 */ }
}

// ─── 公開 API ─────────────────────────────────────────────────────

/** ジョブ作成（Blob 書き込みを await して確実に永続化） */
export async function createJob(): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: "生成準備中...",
    completedSlides: 0,
    totalSlides: 20,
    createdAt: Date.now(),
  }
  // Blob 書き込みを待ってから返す（status 側が最初のポーリングで確実に取得できるように）
  const blobUrl = await writeToBlob(job)
  job.blobUrl = blobUrl
  jobs.set(job.id, job)
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
    // 完了・エラーは await して確実に書き込む
    writeToBlob(updated)
      .then(() => {
        if (patch.status === "done") {
          setTimeout(() => cleanupBlob(updated), 5 * 60 * 1000)
        }
      })
      .catch(() => {})
  } else {
    // 進捗更新は fire-and-forget（頻繁なので await しない）
    writeToBlob(updated).catch(() => {})
  }
}

export function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}
