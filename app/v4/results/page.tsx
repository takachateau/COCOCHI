"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, MoveRight, RefreshCw, ArchiveRestore, ArrowLeft } from "lucide-react"
import type { PostType, GeneratedPost, GeneratedSlide, HookType, StructureType, CompositionType } from "@/types/v2"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

// ─── 旧 localStorage 形式（移行用）────────────────────────────────
const OLD_STORAGE_KEY = "cocochi_v3_results"
interface OldSavedResult {
  personaId: string
  postType: PostType
  productId?: string
  types: { hookType: HookType; structureType: StructureType; compositionType: CompositionType }
  generated: { overallTitle: string; slides: GeneratedSlide[]; caption: string }
  imageUrls: string[]
  refBenchmark: string
}

const POST_TYPE_COLORS: Record<PostType, { bg: string; text: string }> = {
  tips:    { bg: "#2563eb22", text: "#2563eb" },
  product: { bg: "#dc262622", text: "#dc2626" },
  mixed:   { bg: "#10b98122", text: "#10b981" },
}

const HOOK_COLORS   = { bg: "#7c3aed22", text: "#7c3aed" }
const STRUCT_COLORS = { bg: "#0891b222", text: "#0891b2" }
const COMP_COLORS   = { bg: "#ca8a0422", text: "#ca8a04" }

type EditMap = Record<string, { headline?: string; tag?: string; bullets?: string; accent?: string }>

export default function ResultsPage() {
  const { lang } = useLanguage()
  const t = useT(lang)
  const r_ = t.results
  const POST_TYPE_LABELS: Record<PostType, string> = {
    tips:    r_.postTypes.tips,
    product: r_.postTypes.product,
    mixed:   r_.postTypes.mixed,
  }
  const [results, setResults]         = useState<GeneratedPost[]>([])
  const [loading, setLoading]         = useState(true)
  const [localCount, setLocalCount]   = useState(0)
  const [migrating, setMigrating]     = useState(false)
  const [migrateMsg, setMigrateMsg]   = useState("")
  const [filterType, setFilterType]   = useState<PostType | "all">("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [modal, setModal]             = useState<{ result: GeneratedPost; idx: number } | null>(null)
  const [viewMode, setViewMode]       = useState<"active" | "trash">("active")
  // key = "${postId}_${slideIndex}"
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({})
  const [regenError, setRegenError]     = useState<string | null>(null)
  // per-slide instruction inputs
  const [slideInstructions, setSlideInstructions] = useState<Record<string, string>>({})
  // per-slide text edits
  const [editedSlides, setEditedSlides] = useState<EditMap>({})

  function getEffectiveSlide(result: GeneratedPost, si: number): GeneratedSlide {
    const key  = `${result.id}_${si}`
    const base = result.slides[si]
    const edit = editedSlides[key]
    if (!edit) return base
    return {
      ...base,
      headline: edit.headline ?? base.headline,
      tag:      edit.tag      ?? base.tag,
      bullets:  edit.bullets !== undefined
        ? edit.bullets.split("\n").map(s => s.trim()).filter(Boolean)
        : base.bullets,
      accent:   edit.accent !== undefined ? edit.accent : base.accent,
    }
  }

  async function loadResults(mode: "active" | "trash" = viewMode) {
    setLoading(true)
    try {
      const url = mode === "trash" ? "/api/v4/generated-posts?trash=1" : "/api/v4/generated-posts"
      const r = await fetch(url)
      const d = await r.json() as {
        posts?: GeneratedPost[]
        error?: string
        _debug?: { trash?: boolean; dbPostsCount: number; doneJobsCount: number; mergedCount: number; dbError: string | null; jobsError: string | null }
      }
      if (d._debug) {
        console.log("[results] _debug:", d._debug)
        if (d._debug.dbError)   console.error("[results] DBエラー:", d._debug.dbError)
        if (d._debug.jobsError) console.error("[results] Jobsエラー:", d._debug.jobsError)
      }
      setResults(d.posts ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResults("active")
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]") as OldSavedResult[]
      setLocalCount(old.length)
    } catch { /* ignore */ }
  }, [])

  function switchMode(mode: "active" | "trash") {
    setViewMode(mode)
    setExpandedIds(new Set())
    loadResults(mode)
  }

  async function migrateFromLocalStorage() {
    setMigrating(true)
    setMigrateMsg("")
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]") as OldSavedResult[]
      let ok = 0, fail = 0
      for (const item of old) {
        try {
          const r = await fetch("/api/v4/generated-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              personaId:       item.personaId,
              postType:        item.postType,
              productId:       item.productId ?? null,
              overallTitle:    item.generated.overallTitle,
              slides:          item.generated.slides,
              caption:         item.generated.caption,
              hookType:        item.types.hookType,
              structureType:   item.types.structureType,
              compositionType: item.types.compositionType,
              refBenchmark:    item.refBenchmark ?? null,
              imageUrls:       item.imageUrls,
            }),
          })
          if (r.ok) { ok++ } else { fail++ }
        } catch { fail++ }
      }
      localStorage.removeItem(OLD_STORAGE_KEY)
      setLocalCount(0)
      setMigrateMsg(`${ok}件を移行しました${fail > 0 ? `（${fail}件は失敗）` : ""}`)
      await loadResults()
    } catch (e) {
      setMigrateMsg(e instanceof Error ? e.message : "移行に失敗しました")
    } finally {
      setMigrating(false)
    }
  }

  const closeModal = useCallback(() => setModal(null), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!modal) return
      if (e.key === "Escape") closeModal()
      if (e.key === "ArrowLeft")
        setModal(prev => prev && prev.idx > 0 ? { ...prev, idx: prev.idx - 1 } : prev)
      if (e.key === "ArrowRight")
        setModal(prev => prev && prev.idx < prev.result.imageUrls.length - 1 ? { ...prev, idx: prev.idx + 1 } : prev)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modal, closeModal])

  // 同期再生成（直接 regenerate-slide API を呼ぶ）
  async function handleRegenSlide(result: GeneratedPost, slideIndex: number) {
    const key = `${result.id}_${slideIndex}`
    setRegenLoading(prev => ({ ...prev, [key]: true }))
    setRegenError(null)
    try {
      const effectiveSlide = getEffectiveSlide(result, slideIndex)
      const instruction    = slideInstructions[key]?.trim() || undefined
      const r = await fetch("/api/v4/regenerate-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slide:               effectiveSlide,
          personaId:           result.personaId,
          postType:            result.postType,
          productId:           result.productId ?? undefined,
          types:               result.hookType && result.structureType && result.compositionType
            ? { hookType: result.hookType, structureType: result.structureType, compositionType: result.compositionType }
            : undefined,
          slideIndex,
          benchmarkFolderPath: result.refBenchmark ?? undefined,
          instruction,
        }),
      })
      const d = await r.json() as { imageUrl?: string; error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? "再生成失敗")
      if (!d.imageUrl) throw new Error("再生成後の画像URLが取得できませんでした")

      setResults(prev => prev.map(p => {
        if (p.id !== result.id) return p
        const newUrls = [...p.imageUrls]
        newUrls[slideIndex] = d.imageUrl!
        return { ...p, imageUrls: newUrls }
      }))
      setModal(prev => {
        if (!prev || prev.result.id !== result.id) return prev
        const newUrls = [...prev.result.imageUrls]
        newUrls[slideIndex] = d.imageUrl!
        return { ...prev, result: { ...prev.result, imageUrls: newUrls } }
      })
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "再生成失敗")
    } finally {
      setRegenLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(r_.confirmTrash)) return
    const r = await fetch(`/api/v4/generated-posts?id=${id}`, { method: "DELETE" })
    if (r.ok) setResults(prev => prev.filter(p => p.id !== id))
  }

  async function handleRestore(id: string) {
    const r = await fetch(`/api/v4/generated-posts?id=${id}&restore=1`, { method: "PATCH" })
    if (r.ok) setResults(prev => prev.filter(p => p.id !== id))
  }

  async function handlePurge(id: string) {
    if (!confirm(r_.confirmPermanentDelete)) return
    const r = await fetch(`/api/v4/generated-posts?id=${id}&purge=1`, { method: "DELETE" })
    if (r.ok) setResults(prev => prev.filter(p => p.id !== id))
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = filterType === "all" ? results : results.filter(r => r.postType === filterType)

  return (
    <div className="space-y-6">

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            {viewMode === "trash" ? r_.trashTitle : r_.pageTitle}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {viewMode === "trash" ? r_.trashDesc : r_.listDesc}
          </p>
        </div>
        {viewMode === "active" ? (
          <button
            onClick={() => switchMode("trash")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            <Trash2 className="w-4 h-4" />
            {r_.trashTitle}
          </button>
        ) : (
          <button
            onClick={() => switchMode("active")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            {r_.backToList}
          </button>
        )}
      </div>

      {/* 旧データ移行バナー */}
      {localCount > 0 && (
        <div className="rounded-2xl p-4 flex items-center gap-4 flex-wrap"
          style={{ background: "#f59e0b22", border: "1px solid #f59e0b" }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#92400e" }}>ブラウザに{localCount}件の旧データがあります</p>
            <p className="text-xs mt-0.5" style={{ color: "#78350f" }}>以前の生成結果をDBに移行します（移行後は削除されます）</p>
          </div>
          <button
            onClick={migrateFromLocalStorage}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "#f59e0b" }}
          >
            {migrating
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <MoveRight className="w-4 h-4" />}
            {migrating ? r_.migrating : r_.migrateBtn}
          </button>
        </div>
      )}
      {migrateMsg && <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>{migrateMsg}</p>}

      {/* 再生成エラー通知 */}
      {regenError && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "#ef444422", border: "1px solid #ef4444" }}>
          <span className="text-sm font-medium flex-1" style={{ color: "#ef4444" }}>{regenError}</span>
          <button onClick={() => setRegenError(null)} className="text-xs opacity-70 hover:opacity-100" style={{ color: "#ef4444" }}>✕</button>
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap" suppressHydrationWarning>
        {(["all", "tips", "product", "mixed"] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={
              filterType === type
                ? { background: "var(--accent)", color: "white" }
                : { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }
            }
          >
            {type === "all" ? `すべて（${results.length}件）` : POST_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl p-16 flex flex-col items-center justify-center gap-3"
          style={{ background: "var(--card)", border: "1px dashed var(--border)" }}>
          <ImageIcon className="w-10 h-10" style={{ color: "var(--muted)" }} />
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
            {results.length === 0 ? (viewMode === "trash" ? r_.trashEmpty : r_.noResults) : r_.noCategoryResults}
          </p>
        </div>
      )}

      {/* 結果一覧 */}
      <div className="space-y-4">
        {filtered.map(result => {
          const ptColor    = POST_TYPE_COLORS[result.postType]
          const isExpanded = expandedIds.has(result.id)
          return (
            <div key={result.id} className="rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}>

              {/* ─── カードヘッダー ─── */}
              <div className="p-4 space-y-3">

                {/* タイトル行 */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0"
                    style={{ background: ptColor.bg, color: ptColor.text }}>
                    {POST_TYPE_LABELS[result.postType]}
                  </span>
                  <span className="font-bold text-sm flex-1 min-w-0 break-words" style={{ color: "var(--text)" }}>
                    {result.overallTitle}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(result.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {viewMode === "active" ? (
                    <button onClick={() => handleDelete(result.id)} title={r_.moveToTrash}
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                      style={{ background: "#ef444422", color: "#ef4444" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <>
                      <button onClick={() => handleRestore(result.id)} title={r_.restoreFromTrash}
                        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                        style={{ background: "#10b98122", color: "#10b981" }}>
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handlePurge(result.id)} title={r_.permanentDelete}
                        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                        style={{ background: "#ef444422", color: "#ef4444" }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* バッジ行 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{result.personaName}</span>
                  {result.hookType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: HOOK_COLORS.bg, color: HOOK_COLORS.text }}>{result.hookType}</span>
                  )}
                  {result.structureType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: STRUCT_COLORS.bg, color: STRUCT_COLORS.text }}>{result.structureType}</span>
                  )}
                  {result.compositionType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: COMP_COLORS.bg, color: COMP_COLORS.text }}>{result.compositionType}</span>
                  )}
                  {result.refBenchmark && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-mono"
                      style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                      📌 {result.refBenchmark}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{result.imageUrls.filter(Boolean).length}{r_.imageCount}</span>
                </div>

                {/* スライドサムネイル（修正指示付き） */}
                {result.imageUrls.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                    {result.imageUrls.map((url, i) => {
                      if (!url) return null
                      const slideKey = `${result.id}_${i}`
                      const isRegen  = regenLoading[slideKey]
                      const instr    = slideInstructions[slideKey] ?? ""
                      const hasEdit  = !!editedSlides[slideKey]
                      return (
                        <div key={i} className="flex-shrink-0 flex flex-col gap-1" style={{ width: 88 }}>
                          {/* 画像 */}
                          <div className="relative group">
                            <button onClick={() => setModal({ result, idx: i })} className="block w-full" title={`スライド ${i + 1} を拡大`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`slide ${i + 1}`}
                                className="rounded-lg w-full transition-opacity group-hover:opacity-75 cursor-zoom-in"
                                style={{ aspectRatio: "3/4", objectFit: "cover", border: "1px solid var(--border)" }}
                              />
                            </button>
                            {/* スライド番号バッジ */}
                            <span className="absolute bottom-1 left-1 text-white font-bold px-1 rounded pointer-events-none"
                              style={{ background: "rgba(0,0,0,0.55)", fontSize: 10 }}>
                              {i + 1}
                            </span>
                            {/* 編集済みバッジ */}
                            {hasEdit && (
                              <span className="absolute top-1 left-1 px-1 rounded font-bold pointer-events-none"
                                style={{ background: "#f59e0b", color: "white", fontSize: 9, lineHeight: "14px" }}>✏</span>
                            )}
                            {/* 再生成ボタン */}
                            <button
                              onClick={e => { e.stopPropagation(); handleRegenSlide(result, i) }}
                              disabled={isRegen}
                              title={`スライド ${i + 1} を再生成`}
                              className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                              style={{ background: "rgba(0,0,0,0.7)" }}
                            >
                              {isRegen
                                ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                : <RefreshCw className="w-3 h-3 text-white" />}
                            </button>
                            {/* 再生成中オーバーレイ */}
                            {isRegen && (
                              <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center"
                                style={{ background: "rgba(0,0,0,0.6)" }}>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
                                <span className="text-white font-bold" style={{ fontSize: 9 }}>生成中</span>
                              </div>
                            )}
                          </div>
                          {/* 修正指示入力 */}
                          <div className="flex gap-0.5">
                            <input
                              type="text"
                              value={instr}
                              onChange={e => setSlideInstructions(prev => ({ ...prev, [slideKey]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleRegenSlide(result, i)
                              }}
                              placeholder="修正指示..."
                              disabled={isRegen}
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded outline-none disabled:opacity-50"
                              style={{ fontSize: 9, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                            />
                            <button
                              onClick={() => handleRegenSlide(result, i)}
                              disabled={isRegen}
                              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded disabled:opacity-30"
                              style={{ background: "var(--accent)", color: "white" }}
                            >
                              <RefreshCw className={`w-2.5 h-2.5 ${isRegen ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {result.imageUrls.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r_.noImage}</p>
                )}

                {/* テキスト展開ボタン */}
                <button
                  onClick={() => toggleExpand(result.id)}
                  className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "var(--accent)" }}
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {isExpanded ? r_.hideText : r_.showText}
                </button>
              </div>

              {/* ─── 展開: 生成テキスト（編集可能） ─── */}
              {isExpanded && (
                <div className="border-t px-4 py-3 space-y-3"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <p className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>
                    テキストを編集 → 各スライドの↺ボタンで再生成
                  </p>
                  {result.slides.map((slide, si) => {
                    const slideKey = `${result.id}_${si}`
                    const edit = editedSlides[slideKey] ?? {}
                    const isRegen = regenLoading[slideKey]
                    return (
                      <div key={slide.slideNumber} className="rounded-xl p-3 space-y-1.5"
                        style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                        {/* 番号 + タグ + 再生成ボタン */}
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ background: "var(--accent)", fontSize: 10 }}>
                            {slide.slideNumber}
                          </span>
                          <input
                            type="text"
                            value={edit.tag ?? slide.tag}
                            onChange={e => setEditedSlides(prev => ({ ...prev, [slideKey]: { ...prev[slideKey], tag: e.target.value } }))}
                            className="flex-1 min-w-0 text-xs font-bold px-1.5 py-0.5 rounded outline-none"
                            style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--border)" }}
                          />
                          {(edit.tag || edit.headline || edit.bullets !== undefined || edit.accent !== undefined) && (
                            <span className="text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0"
                              style={{ background: "#f59e0b22", color: "#f59e0b" }}>編集済</span>
                          )}
                          <button
                            onClick={() => handleRegenSlide(result, si)}
                            disabled={isRegen}
                            title={`スライド ${si + 1} を再生成`}
                            className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-white disabled:opacity-30 transition-opacity hover:opacity-80"
                            style={{ background: "var(--accent)" }}
                          >
                            <RefreshCw className={`w-3 h-3 ${isRegen ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                        {/* ヘッドライン */}
                        <input
                          type="text"
                          value={edit.headline ?? slide.headline}
                          onChange={e => setEditedSlides(prev => ({ ...prev, [slideKey]: { ...prev[slideKey], headline: e.target.value } }))}
                          className="w-full font-bold text-sm px-2 py-1 rounded outline-none"
                          style={{ color: "var(--text)", background: "transparent", border: "1px solid var(--border)" }}
                        />
                        {/* 箇条書き */}
                        {(slide.bullets && slide.bullets.length > 0) || edit.bullets !== undefined ? (
                          <textarea
                            value={edit.bullets ?? (slide.bullets ?? []).join("\n")}
                            onChange={e => setEditedSlides(prev => ({ ...prev, [slideKey]: { ...prev[slideKey], bullets: e.target.value } }))}
                            rows={Math.max(2, (slide.bullets?.length ?? 2))}
                            className="w-full text-xs px-2 py-1 rounded outline-none resize-none"
                            style={{ color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", lineHeight: 1.6 }}
                            placeholder="箇条書き（1行1項目）"
                          />
                        ) : null}
                        {/* アクセント */}
                        <input
                          type="text"
                          value={edit.accent ?? (slide.accent ?? "")}
                          onChange={e => setEditedSlides(prev => ({ ...prev, [slideKey]: { ...prev[slideKey], accent: e.target.value } }))}
                          className="w-full text-xs italic px-2 py-0.5 rounded outline-none"
                          style={{ color: "var(--accent)", background: "transparent", border: "1px solid transparent" }}
                          placeholder="アクセント（任意）"
                          onFocus={e => (e.currentTarget.style.borderColor = "var(--border)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "transparent")}
                        />
                        {/* 修正指示（展開内でも使える） */}
                        <div className="flex gap-1.5 pt-0.5">
                          <input
                            type="text"
                            value={slideInstructions[slideKey] ?? ""}
                            onChange={e => setSlideInstructions(prev => ({ ...prev, [slideKey]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleRegenSlide(result, si)
                            }}
                            placeholder="修正指示（例: 背景をカフェに）"
                            disabled={isRegen}
                            className="flex-1 px-2 py-1 rounded text-[10px] outline-none disabled:opacity-50"
                            style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                          />
                          <button
                            onClick={() => handleRegenSlide(result, si)}
                            disabled={isRegen}
                            className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-bold text-white disabled:opacity-30"
                            style={{ background: "var(--accent)" }}
                          >
                            <RefreshCw className={`w-3 h-3 ${isRegen ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {result.caption && (
                    <div className="rounded-xl p-3 mt-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{r_.caption}</p>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{result.caption}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* フルサイズモーダル */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={closeModal}>
          <div className="relative flex items-center"
            style={{ maxHeight: "95vh", maxWidth: "95vw" }}
            onClick={e => e.stopPropagation()}>
            {modal.idx > 0 && (
              <button onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx - 1 } : null)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ left: "-3rem", background: "rgba(255,255,255,0.15)" }}>
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {modal.result.imageUrls[modal.idx] && (
              <img src={modal.result.imageUrls[modal.idx]} alt={`slide ${modal.idx + 1}`}
                className="rounded-xl shadow-2xl"
                style={{ maxHeight: "90vh", maxWidth: "min(420px, 90vw)", objectFit: "contain" }}
              />
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: "rgba(0,0,0,0.55)" }}>
              {modal.idx + 1} / {modal.result.imageUrls.filter(Boolean).length}
            </div>
            {modal.idx < modal.result.imageUrls.length - 1 && (
              <button onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx + 1 } : null)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ right: "-3rem", background: "rgba(255,255,255,0.15)" }}>
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
            <button onClick={closeModal}
              className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full text-white transition-opacity hover:opacity-100 opacity-80"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
