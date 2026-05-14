/**
 * localDb.ts — ローカル開発専用 JSON ファイルデータ層
 *
 * USE_LOCAL_DB=true のとき generated_posts / generation_jobs を
 * JSON ファイル (data/local_posts.json, data/local_jobs.json) に保存する。
 * node:sqlite は Turbopack と相性が悪いため fs/JSON 方式を採用。
 */

import { readFileSync, writeFileSync, existsSync } from "fs"
import { randomUUID } from "crypto"
import path from "path"

import type {
  GeneratedPost,
  GeneratedSlide,
  GenerationJob,
  PostType,
  HookType,
  StructureType,
  CompositionType,
  JobStatus,
  SlideRegenParams,
} from "@/types/v2"

// ─── ファイル操作 ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data")
const POSTS_FILE = path.join(DATA_DIR, "local_posts.json")
const JOBS_FILE  = path.join(DATA_DIR, "local_jobs.json")

function readFile<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try { return JSON.parse(readFileSync(filePath, "utf-8")) as T[] } catch { return [] }
}

function writeFile(filePath: string, data: unknown[]): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}

function now() { return new Date().toISOString() }

// ─── generated_posts ─────────────────────────────────────────────

type StoredPost = {
  id: string; created_at: string; persona_id: string; post_type: string
  product_id: string | null; overall_title: string; slides: GeneratedSlide[]
  caption: string | null; hook_type: string | null; structure_type: string | null
  composition_type: string | null; ref_benchmark: string | null; image_urls: string[]
  image_cost: { jpy: string; cny: string; usd: string } | null; deleted_at: string | null
}

function rowToPost(row: StoredPost, personaName?: string): GeneratedPost {
  return {
    id:              row.id,
    createdAt:       row.created_at,
    personaId:       row.persona_id,
    personaName:     personaName ?? "",
    postType:        (row.post_type === "daily" ? "tips" : row.post_type) as PostType,
    productId:       row.product_id,
    overallTitle:    row.overall_title,
    slides:          row.slides ?? [],
    caption:         row.caption,
    hookType:        row.hook_type as HookType | null,
    structureType:   row.structure_type as StructureType | null,
    compositionType: row.composition_type as CompositionType | null,
    refBenchmark:    row.ref_benchmark,
    imageUrls:       row.image_urls ?? [],
    imageCost:       row.image_cost ?? undefined,
  }
}

export async function localSaveGeneratedPost(post: {
  personaId: string; postType: PostType; productId?: string | null
  overallTitle: string; slides: GeneratedSlide[]; caption?: string | null
  hookType?: HookType | null; structureType?: StructureType | null
  compositionType?: CompositionType | null; refBenchmark?: string | null
  imageUrls: string[]; imageCost?: { jpy: string; cny: string; usd: string } | null
}): Promise<GeneratedPost> {
  const rows = readFile<StoredPost>(POSTS_FILE)
  const record: StoredPost = {
    id: randomUUID(), created_at: now(),
    persona_id: post.personaId, post_type: post.postType,
    product_id: post.productId ?? null, overall_title: post.overallTitle,
    slides: post.slides, caption: post.caption ?? null,
    hook_type: post.hookType ?? null, structure_type: post.structureType ?? null,
    composition_type: post.compositionType ?? null, ref_benchmark: post.refBenchmark ?? null,
    image_urls: post.imageUrls, image_cost: post.imageCost ?? null, deleted_at: null,
  }
  rows.unshift(record)
  writeFile(POSTS_FILE, rows)
  return rowToPost(record)
}

export async function localLoadGeneratedPosts(
  limit: number,
  fetchPersonaNames: (ids: string[]) => Promise<Map<string, string>>,
): Promise<GeneratedPost[]> {
  const rows = readFile<StoredPost>(POSTS_FILE)
    .filter(r => !r.deleted_at)
    .slice(0, limit)
  const ids = [...new Set(rows.map(r => r.persona_id).filter(Boolean))]
  const nameMap = ids.length > 0 ? await fetchPersonaNames(ids) : new Map<string, string>()
  return rows.map(r => rowToPost(r, nameMap.get(r.persona_id)))
}

export async function localLoadRecentPostsByPersona(personaId: string, limit: number): Promise<GeneratedPost[]> {
  const rows = readFile<StoredPost>(POSTS_FILE)
    .filter(r => r.persona_id === personaId && !r.deleted_at)
    .slice(0, limit)
  return rows.map(r => rowToPost(r))
}

export async function localDeleteGeneratedPost(id: string): Promise<void> {
  const rows = readFile<StoredPost>(POSTS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) { rows[idx].deleted_at = now(); writeFile(POSTS_FILE, rows) }
}

export async function localRestoreGeneratedPost(id: string): Promise<void> {
  const rows = readFile<StoredPost>(POSTS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) { rows[idx].deleted_at = null; writeFile(POSTS_FILE, rows) }
}

export async function localPurgeGeneratedPost(id: string): Promise<void> {
  const rows = readFile<StoredPost>(POSTS_FILE).filter(r => r.id !== id)
  writeFile(POSTS_FILE, rows)
}

export async function localUpdateGeneratedPostImages(id: string, imageUrls: string[]): Promise<void> {
  const rows = readFile<StoredPost>(POSTS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) { rows[idx].image_urls = imageUrls; writeFile(POSTS_FILE, rows) }
}

export async function localLoadTrashedPosts(
  limit: number,
  fetchPersonaNames: (ids: string[]) => Promise<Map<string, string>>,
): Promise<GeneratedPost[]> {
  const rows = readFile<StoredPost>(POSTS_FILE)
    .filter(r => !!r.deleted_at)
    .slice(0, limit)
  const ids = [...new Set(rows.map(r => r.persona_id).filter(Boolean))]
  const nameMap = ids.length > 0 ? await fetchPersonaNames(ids) : new Map<string, string>()
  return rows.map(r => rowToPost(r, nameMap.get(r.persona_id)))
}

// ─── generation_jobs ─────────────────────────────────────────────

type StoredJob = {
  id: string; created_at: string; updated_at: string
  persona_id: string; post_type: string; product_id: string | null
  benchmark_folder_path: string | null; status: string; job_type: string
  slide_regen_params: GenerationJob["slideRegenParams"] | null
  text_result: GenerationJob["textResult"] | null
  image_urls: (string | null)[] | null; ref_benchmark: string | null
  policy_fallback_slides: number[] | null; failed_slides: number[] | null
  error_message: string | null; image_cost: GenerationJob["imageCost"] | null
  deleted_at: string | null
}

function rowToJob(row: StoredJob, personaName?: string): GenerationJob {
  const rawText = row.text_result as (Record<string, unknown> & { __slideRegen?: boolean }) | null
  const isSlideRegen = rawText?.__slideRegen === true || row.job_type === "slide_regen"
  return {
    id: row.id, personaId: row.persona_id, postType: row.post_type as PostType,
    productId: row.product_id ?? undefined, benchmarkFolderPath: row.benchmark_folder_path ?? undefined,
    status: row.status as JobStatus, jobType: isSlideRegen ? "slide_regen" : "post_gen",
    slideRegenParams: isSlideRegen
      ? ((rawText?.slideRegenParams ?? row.slide_regen_params) as GenerationJob["slideRegenParams"]) ?? undefined
      : undefined,
    textResult: !isSlideRegen ? (rawText as GenerationJob["textResult"]) ?? undefined : undefined,
    imageUrls: row.image_urls ?? undefined, refBenchmark: row.ref_benchmark ?? undefined,
    policyFallbackSlides: row.policy_fallback_slides ?? undefined,
    failedSlides: row.failed_slides ?? undefined, errorMessage: row.error_message ?? undefined,
    imageCost: row.image_cost ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    personaName: personaName ?? undefined,
  }
}

export async function localCreateJob(params: {
  personaId: string; postType: PostType; productId?: string; benchmarkFolderPath?: string
}): Promise<GenerationJob> {
  const rows = readFile<StoredJob>(JOBS_FILE)
  const now_ = now()
  const record: StoredJob = {
    id: randomUUID(), created_at: now_, updated_at: now_,
    persona_id: params.personaId, post_type: params.postType,
    product_id: params.productId ?? null, benchmark_folder_path: params.benchmarkFolderPath ?? null,
    status: "pending", job_type: "post_gen",
    slide_regen_params: null, text_result: null, image_urls: null,
    ref_benchmark: null, policy_fallback_slides: null, failed_slides: null,
    error_message: null, image_cost: null, deleted_at: null,
  }
  rows.unshift(record)
  writeFile(JOBS_FILE, rows)
  return rowToJob(record)
}

export async function localCreateSlideRegenJob(params: {
  personaId: string; postType: PostType; productId?: string; slideRegenParams: SlideRegenParams
}): Promise<GenerationJob> {
  const rows = readFile<StoredJob>(JOBS_FILE)
  const now_ = now()
  const record: StoredJob = {
    id: randomUUID(), created_at: now_, updated_at: now_,
    persona_id: params.personaId, post_type: params.postType,
    product_id: params.productId ?? null, benchmark_folder_path: null,
    status: "pending", job_type: "slide_regen",
    slide_regen_params: params.slideRegenParams,
    text_result: { __slideRegen: true, slideRegenParams: params.slideRegenParams } as unknown as GenerationJob["textResult"],
    image_urls: null, ref_benchmark: null, policy_fallback_slides: null, failed_slides: null,
    error_message: null, image_cost: null, deleted_at: null,
  }
  rows.unshift(record)
  writeFile(JOBS_FILE, rows)
  return rowToJob(record)
}

export async function localUpdateJob(id: string, update: {
  status?: JobStatus; textResult?: GenerationJob["textResult"]; imageUrls?: (string | null)[]
  refBenchmark?: string; policyFallbackSlides?: number[]; failedSlides?: number[]
  errorMessage?: string; imageCost?: GenerationJob["imageCost"]
}): Promise<void> {
  const rows = readFile<StoredJob>(JOBS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx === -1) return
  const row = rows[idx]
  row.updated_at = now()
  if (update.status               !== undefined) row.status                 = update.status
  if (update.textResult           !== undefined) row.text_result            = update.textResult
  if (update.imageUrls            !== undefined) row.image_urls             = update.imageUrls
  if (update.refBenchmark         !== undefined) row.ref_benchmark          = update.refBenchmark
  if (update.policyFallbackSlides !== undefined) row.policy_fallback_slides = update.policyFallbackSlides
  if (update.failedSlides         !== undefined) row.failed_slides          = update.failedSlides
  if (update.errorMessage         !== undefined) row.error_message          = update.errorMessage
  if (update.imageCost            !== undefined) row.image_cost             = update.imageCost
  writeFile(JOBS_FILE, rows)
}

export async function localLoadJob(
  id: string,
  fetchPersonaName: (personaId: string) => Promise<string | undefined>,
): Promise<GenerationJob | null> {
  const row = readFile<StoredJob>(JOBS_FILE).find(r => r.id === id)
  if (!row) return null
  const name = await fetchPersonaName(row.persona_id)
  return rowToJob(row, name)
}

export async function localLoadJobs(
  limit: number,
  fetchPersonaNames: (ids: string[]) => Promise<Map<string, string>>,
): Promise<GenerationJob[]> {
  const rows = readFile<StoredJob>(JOBS_FILE).slice(0, limit)
  const ids = [...new Set(rows.map(r => r.persona_id).filter(Boolean))]
  const nameMap = ids.length > 0 ? await fetchPersonaNames(ids) : new Map<string, string>()
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id)))
}

export async function localLoadDoneJobs(
  limit: number,
  fetchPersonaNames: (ids: string[]) => Promise<Map<string, string>>,
): Promise<GenerationJob[]> {
  const rows = readFile<StoredJob>(JOBS_FILE)
    .filter(r => r.status === "done" && !r.deleted_at)
    .slice(0, limit)
  const ids = [...new Set(rows.map(r => r.persona_id).filter(Boolean))]
  const nameMap = ids.length > 0 ? await fetchPersonaNames(ids) : new Map<string, string>()
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id)))
}

export async function localDeleteJob(id: string): Promise<void> {
  const rows = readFile<StoredJob>(JOBS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) { rows[idx].deleted_at = now(); writeFile(JOBS_FILE, rows) }
}

export async function localRestoreJob(id: string): Promise<void> {
  const rows = readFile<StoredJob>(JOBS_FILE)
  const idx = rows.findIndex(r => r.id === id)
  if (idx !== -1) { rows[idx].deleted_at = null; writeFile(JOBS_FILE, rows) }
}

export async function localPurgeJob(id: string): Promise<void> {
  const rows = readFile<StoredJob>(JOBS_FILE).filter(r => r.id !== id)
  writeFile(JOBS_FILE, rows)
}

export async function localLoadTrashedJobs(
  limit: number,
  fetchPersonaNames: (ids: string[]) => Promise<Map<string, string>>,
): Promise<GenerationJob[]> {
  const rows = readFile<StoredJob>(JOBS_FILE)
    .filter(r => r.status === "done" && !!r.deleted_at)
    .slice(0, limit)
  const ids = [...new Set(rows.map(r => r.persona_id).filter(Boolean))]
  const nameMap = ids.length > 0 ? await fetchPersonaNames(ids) : new Map<string, string>()
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id)))
}
