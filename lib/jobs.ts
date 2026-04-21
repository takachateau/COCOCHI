/**
 * ジョブ管理
 * - メモリキャッシュ（同一インスタンス内の高速アクセス用）
 * - Vercel Blob（インスタンス間の共有・永続化）
 *
 * Vercelはリクエストごとに別インスタンスで動くため、
 * ジョブ状態をBlobに保存してどのインスタンスからも読めるようにする。
 */

import { put, list } from "@vercel/blob"
import type { PostGroup } from "@/types"

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
  startTime?: number
}

// ─── メモリキャッシュ（同一インスタンス内） ──────────────────────

const g = globalThis as typeof globalThis & { __cocochi_jobs?: Map<string, Job> }
if (!g.__cocochi_jobs) g.__cocochi_jobs = new Map<string, Job>()
const jobs = g.__cocochi_jobs

// ─── Blob 永続化 ─────────────────────────────────────────────────

function jobBlobPath(id: string) {
  return `cocochi/jobs/${id}.json`
}

function persistJob(job: Job): void {
  // fire-and-forget（エラーは無視）
  put(jobBlobPath(job.id), JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  }).catch(e => console.warn("[jobs] Blob保存失敗:", e))
}

// ─── 公開API ─────────────────────────────────────────────────────

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
  persistJob(job)
  return job
}

export async function getJob(id: string): Promise<Job | undefined> {
  // まずメモリキャッシュを確認
  const cached = jobs.get(id)
  if (cached) return cached

  // なければBlobから取得
  try {
    const { blobs } = await list({ prefix: jobBlobPath(id) })
    const blob = blobs.find(b => b.pathname === jobBlobPath(id))
    if (!blob) return undefined
    const res = await fetch(blob.url, { cache: "no-store" })
    if (!res.ok) return undefined
    const job = await res.json() as Job
    jobs.set(id, job)
    return job
  } catch {
    return undefined
  }
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id)
  if (!job) return
  const updated = { ...job, ...patch }
  jobs.set(id, updated)
  persistJob(updated)
}

export function pruneOldJobs(): void {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}
