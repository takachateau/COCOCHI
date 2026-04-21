/**
 * ジョブ管理（Vercel Blob永続化）
 *
 * - メモリキャッシュは廃止（インスタンス間で状態が共有されないため）
 * - 常にBlobから読み書き
 * - CDNキャッシュ対策: 読み取り時にURLへタイムスタンプを付与
 */

import { put, list } from "@vercel/blob"

export type JobStatus = "pending" | "generating" | "done" | "error"

export interface Job {
  id: string
  status: JobStatus
  progress: string
  completedSlides: number
  totalSlides: number
  groupId?: string   // done時: 生成済みPostGroupのID（フル画像データはgroupsに保存済み）
  error?: string
  createdAt: number
  startTime?: number
}

function jobBlobPath(id: string) {
  return `cocochi/jobs/${id}.json`
}

// ─── Blob 書き込み ─────────────────────────────────────────────────

export async function writeJob(job: Job): Promise<void> {
  await put(jobBlobPath(job.id), JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  })
}

// fire-and-forget 書き込み（進捗更新など頻繁な更新に使用）
export function writeJobAsync(job: Job): void {
  writeJob(job).catch(e => console.warn("[jobs] Blob書き込み失敗:", e))
}

// ─── Blob 読み込み ─────────────────────────────────────────────────

export async function getJob(id: string): Promise<Job | undefined> {
  try {
    const { blobs } = await list({ prefix: jobBlobPath(id) })
    const blob = blobs.find(b => b.pathname === jobBlobPath(id))
    if (!blob) return undefined
    // ?t= でVercel BlobのCDNキャッシュをバイパス
    const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return undefined
    return await res.json() as Job
  } catch {
    return undefined
  }
}

// ─── 公開API ─────────────────────────────────────────────────────────

export async function createJob(): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: "生成準備中...",
    completedSlides: 0,
    totalSlides: 20,
    createdAt: Date.now(),
  }
  await writeJob(job)
  return job
}

// updateJob: 既存データを読んでマージして書き込む（regenerateなど低頻度用）
export async function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  const existing = await getJob(id)
  if (!existing) {
    console.warn(`[jobs] updateJob: job ${id} が見つかりません`)
    return
  }
  await writeJob({ ...existing, ...patch })
}

export function pruneOldJobs(): void {
  // Blobベースのため不要（no-op）
}
