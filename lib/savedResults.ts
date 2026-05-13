/**
 * 生成結果をブラウザのローカルストレージに保存・読み込みするユーティリティ
 *
 * localStorage キー: "cocochi_v3_results"
 * 最大保存件数: 30件（古いものから自動削除）
 */
import type { GeneratedPostText, PostType, HookType, StructureType, CompositionType } from "@/types/v2"

export interface SavedResultTypes {
  hookType: HookType
  structureType: StructureType
  compositionType: CompositionType
}

export interface SavedResult {
  id: string
  savedAt: string        // ISO文字列
  personaId: string
  personaName: string
  postType: PostType
  productId?: string
  types: SavedResultTypes
  generated: GeneratedPostText
  imageUrls: string[]
  refBenchmark: string
}

export const RESULTS_STORAGE_KEY = "cocochi_v3_results"
export const MAX_SAVED_RESULTS   = 30

/** 生成結果を localStorage に保存（最大 MAX_SAVED_RESULTS 件、古いものは削除） */
export function saveResult(result: SavedResult): void {
  try {
    const existing = loadResults()
    const updated  = [result, ...existing].slice(0, MAX_SAVED_RESULTS)
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage への書き込み失敗はサイレントに無視（非クリティカル）
  }
}

/** 保存済み生成結果を localStorage から読み込む */
export function loadResults(): SavedResult[] {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_STORAGE_KEY) ?? "[]") as SavedResult[]
  } catch {
    return []
  }
}

/** 指定 id の結果を削除 */
export function deleteResult(id: string): void {
  try {
    const updated = loadResults().filter(r => r.id !== id)
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // silent
  }
}
