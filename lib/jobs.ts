/**
 * インメモリ ジョブストア + Vercel Blob 永続化
 *
 * Vercel のサーバーレス関数はインスタンスが分離されているため、
 * generateとstatusが別インスタンスで動くと globalThis が共有されない。
 * → updateJob のたびに Vercel Blob へ書き込み、status 側は Blob から読む。
 */
import type { PostGroup } from "@/types"
import { put, list, del } from "@vercel/blob"

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

/** ジョブ状態を Blob に書き込む（fire and forget） */
function persistToBlobAsync(job: Job) {
  put(`${JOB_PREFIX}${job.id}.json`, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  }).catch(() => { /* Blob 書き込み失敗は無視 */ })
}

/** Blob からジョブを取得 */
export async function getJobFromBlob(id: string): Promise<Job | null> {
  try {
    const { blobs } = await list({ prefix: `${JOB_PREFIX}${id}.json` })
    if (!blobs[0]) return null
    const res = await fetch(blobs[0].url)
    if (!res.ok) return null
    return await res.json() as Job
  } catch {
    return null
  }
}

/** 完了後に Blob を削除 */
function cleanupBlobAsync(id: string) {
  list({ prefix: `${JOB_PREFIX}${id}.json` })
    .then(({ blobs }) => blobs[0] && del(blobs[0].url))
    .catch(() => {})
}

// ─── 公開 API ─────────────────────────────────────────────────────

export function createJob(): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: "生成準備中...",
    completedSlides: 0,
    totalSlides: 20,
    createdAt: Date.now(),
  }
  jobs.set(job.id, job)
  persistToBlobAsync(job)
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
  persistToBlobAsync(updated)

  // 完了・エラー時は1分後に Blob クリーンアップ
  if (patch.status === "done" || patch.status === "error") {
    setTimeout(() => cleanupBlobAsync(id), 60_000)
  }
}

export function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}
