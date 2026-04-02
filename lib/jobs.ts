/**
 * インメモリ ジョブストア
 * 生成リクエストをバックグラウンドで処理し、フロントがポーリングで進捗確認する
 */
import type { PostGroup } from "@/types"

export type JobStatus = "pending" | "generating" | "done" | "error"

export interface Job {
  id: string
  status: JobStatus
  progress: string      // 表示用メッセージ
  completedSlides: number
  totalSlides: number
  group?: PostGroup
  error?: string
  createdAt: number
}

// globalThis に保持することでホットリロード時もインスタンスを共有
const g = globalThis as typeof globalThis & { __cocochi_jobs?: Map<string, Job> }
if (!g.__cocochi_jobs) g.__cocochi_jobs = new Map<string, Job>()
const jobs = g.__cocochi_jobs

export function createJob(): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: "生成準備中...",
    completedSlides: 0,
    totalSlides: 15,   // 3パターン × 5枚
    createdAt: Date.now(),
  }
  jobs.set(job.id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id)
  if (!job) return
  jobs.set(id, { ...job, ...patch })
}

// 古いジョブを定期的にクリーンアップ（1時間以上前のものを削除）
export function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}
