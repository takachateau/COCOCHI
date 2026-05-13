"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, X, MoveRight, RefreshCw, ArchiveRestore, ArrowLeft, PenLine, Send } from "lucide-react"
import type { PostType, GeneratedPost, GeneratedSlide, HookType, StructureType, CompositionType } from "@/types/v2"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

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

  const [results, setResults]       = useState<GeneratedPost[]>([])
  const [loading, setLoading]       = useState(true)
  const [localCount, setLocalCount] = useState(0)
  const [migrating, setMigrating]   = useState(false)
  const [migrateMsg, setMigrateMsg] = useState("")
  const [filterType, setFilterType] = useState<PostType | "all">("all")
  const [modal, setModal]           = useState<{ result: GeneratedPost; idx: number } | null>(null)
  const [viewMode, setViewMode]     = useState<"active" | "trash">("active")
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({})
  const [regenError, setRegenError]     = useState<string | null>(null)
  const [slideInstructions, setSlideInstructions] = useState<Record<string, string>>({})
  const [editedSlides, setEditedSlides]           = useState<EditMap>({})
  const [captionOpen, setCaptionOpen]             = useState(false)

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
      accent: edit.accent !== undefined ? edit.accent : base.accent,
    }
  }

  async function loadResults(mode: "active" | "trash" = viewMode) {
    setLoading(true)
    try {
      const url = mode === "trash" ? "/api/v4/generated-posts?trash=1" : "/api/v4/generated-posts"
      const r = await fetch(url)
      const d = await r.json() as { posts?: GeneratedPost[]; error?: string; _debug?: unknown }
      if (d._debug) console.log("[results] _debug:", d._debug)
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
              personaId: item.personaId, postType: item.postType, productId: item.productId ?? null,
              overallTitle: item.generated.overallTitle, slides: item.generated.slides,
              caption: item.generated.caption, hookType: item.types.hookType,
              structureType: item.types.structureType, compositionType: item.types.compositionType,
              refBenchmark: item.refBenchmark ?? null, imageUrls: item.imageUrls,
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

  const closeModal = useCallback(() => {
    setModal(null)
    setCaptionOpen(false)
  }, [])

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
          slide: effectiveSlide, personaId: result.personaId, postType: result.postType,
          productId: result.productId ?? undefined,
          types: result.hookType && result.structureType && result.compositionType
            ? { hookType: result.hookType, structureType: result.structureType, compositionType: result.compositionType }
            : undefined,
          slideIndex, benchmarkFolderPath: result.refBenchmark ?? undefined, instruction,
        }),
      })
      const d = await r.json() as { imageUrl?: string; error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? "再生成失敗")
      if (!d.imageUrl) throw new Error("再生成後の画像URLが取得できませんでした")
      setResults(prev => prev.map(p => {
        if (p.id !== result.id) return p
        const newUrls = [...p.imageUrls]; newUrls[slideIndex] = d.imageUrl!
        return { ...p, imageUrls: newUrls }
      }))
      setModal(prev => {
        if (!prev || prev.result.id !== result.id) return prev
        const newUrls = [...prev.result.imageUrls]; newUrls[slideIndex] = d.imageUrl!
        return { ...prev, result: { ...prev.result, imageUrls: newUrls } }
      })
      // clear instruction after successful regen
      setSlideInstructions(prev => { const next = { ...prev }; delete next[key]; return next })
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "再生成失敗")
    } finally {
      setRegenLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(r_.confirmTrash)) return
    const r = await fetch(`/api/v4/generated-posts?id=${id}`, { method: "DELETE" })
    if (r.ok) { setResults(prev => prev.filter(p => p.id !== id)); if (modal?.result.id === id) closeModal() }
  }
  async function handleRestore(id: string) {
    const r = await fetch(`/api/v4/generated-posts?id=${id}&restore=1`, { method: "PATCH" })
    if (r.ok) setResults(prev => prev.filter(p => p.id !== id))
  }
  async function handlePurge(id: string) {
    if (!confirm(r_.confirmPermanentDelete)) return
    const r = await fetch(`/api/v4/generated-posts?id=${id}&purge=1`, { method: "DELETE" })
    if (r.ok) { setResults(prev => prev.filter(p => p.id !== id)); if (modal?.result.id === id) closeModal() }
  }

  const filtered = filterType === "all" ? results : results.filter(r => r.postType === filterType)

  // ─── MODAL helpers ───────────────────────────────────────────────
  const modalSlide   = modal ? (modal.result.slides[modal.idx] ?? null) : null
  const modalKey     = modal ? `${modal.result.id}_${modal.idx}` : ""
  const modalEdit    = modal ? (editedSlides[modalKey] ?? {}) : {}
  const modalInstr   = modal ? (slideInstructions[modalKey] ?? "") : ""
  const modalIsRegen = modal ? !!regenLoading[modalKey] : false
  const modalHasEdit = modal ? !!(modalEdit.tag || modalEdit.headline || modalEdit.bullets !== undefined || modalEdit.accent !== undefined) : false

  function setModalField(field: keyof EditMap[string], value: string) {
    if (!modal) return
    setEditedSlides(prev => ({ ...prev, [modalKey]: { ...prev[modalKey], [field]: value } }))
  }
  function setModalInstr(v: string) {
    if (!modal) return
    setSlideInstructions(prev => ({ ...prev, [modalKey]: v }))
  }

  return (
    <div className="space-y-6">

      {/* ─── ページヘッダー ─── */}
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
          <button onClick={() => switchMode("trash")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
            <Trash2 className="w-4 h-4" />{r_.trashTitle}
          </button>
        ) : (
          <button onClick={() => switchMode("active")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
            <ArrowLeft className="w-4 h-4" />{r_.backToList}
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
          <button onClick={migrateFromLocalStorage} disabled={migrating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "#f59e0b" }}>
            {migrating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <MoveRight className="w-4 h-4" />}
            {migrating ? r_.migrating : r_.migrateBtn}
          </button>
        </div>
      )}
      {migrateMsg && <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>{migrateMsg}</p>}

      {/* 再生成エラー */}
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
          <button key={type} onClick={() => setFilterType(type)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={filterType === type
              ? { background: "var(--accent)", color: "white" }
              : { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}>
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

      {/* ─── 結果カード一覧 ─── */}
      <div className="space-y-4">
        {filtered.map(result => {
          const ptColor = POST_TYPE_COLORS[result.postType]
          return (
            <div key={result.id} className="rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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

                {/* スライドサムネイル */}
                {result.imageUrls.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                    {result.imageUrls.map((url, i) => {
                      if (!url) return null
                      const hasEdit = !!editedSlides[`${result.id}_${i}`]
                      const isRegen = !!regenLoading[`${result.id}_${i}`]
                      return (
                        <button key={i} onClick={() => setModal({ result, idx: i })}
                          className="flex-shrink-0 relative group rounded-xl overflow-hidden transition-transform hover:scale-105"
                          style={{ width: 72 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`slide ${i + 1}`}
                            className="w-full"
                            style={{ aspectRatio: "3/4", objectFit: "cover", display: "block" }}
                          />
                          <div className="absolute inset-0 rounded-xl transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center"
                            style={{ background: "rgba(0,0,0,0.4)" }}>
                            <PenLine className="w-4 h-4 text-white" />
                          </div>
                          <span className="absolute bottom-1 left-1 text-white font-bold px-1 rounded pointer-events-none"
                            style={{ background: "rgba(0,0,0,0.55)", fontSize: 9 }}>{i + 1}</span>
                          {hasEdit && (
                            <span className="absolute top-1 left-1 px-1 rounded font-bold pointer-events-none"
                              style={{ background: "#f59e0b", color: "white", fontSize: 8, lineHeight: "13px" }}>✏</span>
                          )}
                          {isRegen && (
                            <div className="absolute inset-0 rounded-xl flex items-center justify-center"
                              style={{ background: "rgba(0,0,0,0.6)" }}>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                    {/* 編集ボタン */}
                    <button onClick={() => setModal({ result, idx: 0 })}
                      className="flex-shrink-0 rounded-xl flex flex-col items-center justify-center gap-1 transition-opacity hover:opacity-80"
                      style={{ width: 72, aspectRatio: "3/4", background: "var(--bg)", border: "1px dashed var(--border)", color: "var(--accent)" }}>
                      <PenLine className="w-4 h-4" />
                      <span style={{ fontSize: 9, fontWeight: 700 }}>編集する</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{r_.noImage}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── 編集モーダル ─── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={closeModal}>
          <div
            className="relative flex rounded-2xl overflow-hidden w-full"
            style={{ maxWidth: 960, maxHeight: "95vh", background: "var(--bg)" }}
            onClick={e => e.stopPropagation()}>

            {/* ── LEFT: 画像プレビュー ── */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-w-0"
              style={{ background: "#0a0a0a", minHeight: 0 }}>

              {/* 画像 */}
              <div className="relative flex items-center justify-center w-full h-full p-4">
                {modal.result.imageUrls[modal.idx] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modal.result.imageUrls[modal.idx]}
                    alt={`slide ${modal.idx + 1}`}
                    className="rounded-xl shadow-2xl"
                    style={{ maxHeight: "calc(95vh - 2rem)", maxWidth: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-xl"
                    style={{ width: 280, aspectRatio: "3/4", background: "#1a1a1a", color: "#555" }}>
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
                {/* 再生成中オーバーレイ */}
                {modalIsRegen && (
                  <div className="absolute inset-4 rounded-xl flex flex-col items-center justify-center gap-3"
                    style={{ background: "rgba(0,0,0,0.75)" }}>
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white font-bold text-sm">生成中...</span>
                  </div>
                )}
              </div>

              {/* 前へ */}
              {modal.idx > 0 && (
                <button
                  onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx - 1 } : null)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity opacity-60 hover:opacity-100"
                  style={{ background: "rgba(255,255,255,0.15)" }}>
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* 次へ */}
              {modal.idx < modal.result.imageUrls.length - 1 && (
                <button
                  onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx + 1 } : null)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity opacity-60 hover:opacity-100"
                  style={{ background: "rgba(255,255,255,0.15)" }}>
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              {/* スライドカウンター */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white pointer-events-none"
                style={{ background: "rgba(0,0,0,0.6)" }}>
                {modal.idx + 1} / {modal.result.imageUrls.filter(Boolean).length}
              </div>
            </div>

            {/* ── RIGHT: 編集パネル ── */}
            <div className="flex flex-col" style={{ width: 380, minWidth: 320, maxWidth: 400, borderLeft: "1px solid var(--border)", background: "var(--card)" }}>

              {/* ヘッダー */}
              <div className="flex items-start gap-2 p-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex-1 min-w-0">
                  {modal.result.refBenchmark && (
                    <p className="text-xs font-mono truncate mb-0.5" style={{ color: "var(--muted)" }}>
                      📌 {modal.result.refBenchmark}
                    </p>
                  )}
                  <p className="font-bold text-sm leading-snug" style={{ color: "var(--text)" }}>
                    {modal.result.overallTitle}
                  </p>
                </div>
                <button onClick={closeModal}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                  style={{ background: "var(--bg)", color: "var(--text)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* サムネイルストリップ */}
              <div className="flex gap-1.5 p-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}>
                {modal.result.imageUrls.map((url, i) => {
                  if (!url) return null
                  const isActive = i === modal.idx
                  const hasEdit  = !!editedSlides[`${modal.result.id}_${i}`]
                  return (
                    <button key={i} onClick={() => setModal(prev => prev ? { ...prev, idx: i } : null)}
                      className="flex-shrink-0 relative rounded-lg overflow-hidden transition-all"
                      style={{
                        width: 44,
                        outline: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                        outlineOffset: 2,
                        opacity: isActive ? 1 : 0.5,
                      }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full" style={{ aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                      {hasEdit && (
                        <span className="absolute top-0.5 left-0.5 rounded pointer-events-none"
                          style={{ background: "#f59e0b", width: 6, height: 6, borderRadius: "50%", display: "block" }} />
                      )}
                      {regenLoading[`${modal.result.id}_${i}`] && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 編集エリア (スクロール可能) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: "thin" }}>

                {/* スライド番号 + 編集済バッジ */}
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                    style={{ background: "var(--accent)" }}>
                    {modal.idx + 1}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>スライド {modal.idx + 1}</span>
                  {modalHasEdit && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{ background: "#f59e0b22", color: "#f59e0b" }}>✏ 編集済</span>
                  )}
                </div>

                {modalSlide && (
                  <>
                    {/* タグ */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>タグ</label>
                      <input
                        type="text"
                        value={modalEdit.tag ?? modalSlide.tag}
                        onChange={e => setModalField("tag", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none transition-colors"
                        style={{ background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--border)" }}
                      />
                    </div>

                    {/* ヘッドライン */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>ヘッドライン</label>
                      <input
                        type="text"
                        value={modalEdit.headline ?? modalSlide.headline}
                        onChange={e => setModalField("headline", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-base font-bold outline-none transition-colors"
                        style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                      />
                    </div>

                    {/* 箇条書き */}
                    {((modalSlide.bullets && modalSlide.bullets.length > 0) || modalEdit.bullets !== undefined) && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>箇条書き（1行1項目）</label>
                        <textarea
                          value={modalEdit.bullets ?? (modalSlide.bullets ?? []).join("\n")}
                          onChange={e => setModalField("bullets", e.target.value)}
                          rows={Math.max(3, (modalSlide.bullets?.length ?? 3))}
                          className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                          style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", lineHeight: 1.7 }}
                        />
                      </div>
                    )}

                    {/* アクセント */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>アクセント</label>
                      <input
                        type="text"
                        value={modalEdit.accent ?? (modalSlide.accent ?? "")}
                        onChange={e => setModalField("accent", e.target.value)}
                        placeholder="（任意）"
                        className="w-full px-3 py-2 rounded-xl text-sm italic outline-none transition-colors"
                        style={{ background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--border)" }}
                      />
                    </div>
                  </>
                )}

                {/* 修正指示 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>AI修正指示（任意）</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={modalInstr}
                      onChange={e => setModalInstr(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing && modal)
                          handleRegenSlide(modal.result, modal.idx)
                      }}
                      placeholder="例: 背景をカフェに、もっと明るく"
                      disabled={modalIsRegen}
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm outline-none disabled:opacity-50"
                      style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                    />
                    <button
                      onClick={() => { if (modal) setModal(prev => prev ? { ...prev } : null) }}
                      disabled={!modalInstr.trim() || modalIsRegen}
                      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-80"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)" }}
                      title="テキストのみ反映（再生成なし）">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 再生成ボタン */}
                <button
                  onClick={() => { if (modal) handleRegenSlide(modal.result, modal.idx) }}
                  disabled={modalIsRegen}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-85 disabled:opacity-50"
                  style={{ background: "var(--accent)" }}>
                  <RefreshCw className={`w-4 h-4 ${modalIsRegen ? "animate-spin" : ""}`} />
                  {modalIsRegen ? "生成中..." : "このスライドを再生成"}
                </button>
              </div>

              {/* フッター: 投稿メタ情報 */}
              <div className="flex-shrink-0 p-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold"
                    style={{ background: POST_TYPE_COLORS[modal.result.postType].bg, color: POST_TYPE_COLORS[modal.result.postType].text }}>
                    {POST_TYPE_LABELS[modal.result.postType]}
                  </span>
                  {modal.result.hookType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: HOOK_COLORS.bg, color: HOOK_COLORS.text }}>{modal.result.hookType}</span>
                  )}
                  {modal.result.structureType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: STRUCT_COLORS.bg, color: STRUCT_COLORS.text }}>{modal.result.structureType}</span>
                  )}
                  {modal.result.compositionType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: COMP_COLORS.bg, color: COMP_COLORS.text }}>{modal.result.compositionType}</span>
                  )}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{modal.result.personaName}</span>
                </div>

                {modal.result.caption && (
                  <div>
                    <button onClick={() => setCaptionOpen(p => !p)}
                      className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-70"
                      style={{ color: "var(--muted)" }}>
                      {captionOpen ? "▲" : "▼"} キャプション
                    </button>
                    {captionOpen && (
                      <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap px-2"
                        style={{ color: "var(--text)", borderLeft: "2px solid var(--border)" }}>
                        {modal.result.caption}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
