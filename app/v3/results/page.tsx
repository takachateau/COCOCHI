"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, MoveRight } from "lucide-react"
import type { PostType, GeneratedPost, GeneratedSlide, HookType, StructureType, CompositionType } from "@/types/v2"

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

const POST_TYPE_LABELS: Record<PostType, string> = {
  tips:    "Tips",
  product: "商品紹介",
  mixed:   "混合",
}

const POST_TYPE_COLORS: Record<PostType, { bg: string; text: string }> = {
  tips:    { bg: "#2563eb22", text: "#2563eb" },
  product: { bg: "#dc262622", text: "#dc2626" },
  mixed:   { bg: "#10b98122", text: "#10b981" },
}

const HOOK_COLORS   = { bg: "#7c3aed22", text: "#7c3aed" }
const STRUCT_COLORS = { bg: "#0891b222", text: "#0891b2" }
const COMP_COLORS   = { bg: "#ca8a0422", text: "#ca8a04" }

export default function ResultsPage() {
  const [results, setResults]         = useState<GeneratedPost[]>([])
  const [loading, setLoading]         = useState(true)
  const [localCount, setLocalCount]   = useState(0)
  const [migrating, setMigrating]     = useState(false)
  const [migrateMsg, setMigrateMsg]   = useState("")
  const [filterType, setFilterType]   = useState<PostType | "all">("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [modal, setModal]             = useState<{ result: GeneratedPost; idx: number } | null>(null)

  async function loadResults() {
    setLoading(true)
    try {
      const r = await fetch("/api/v3/generated-posts")
      const d = await r.json() as { posts?: GeneratedPost[]; error?: string }
      setResults(d.posts ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResults()
    // localStorage に旧データがあれば件数を表示
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]") as OldSavedResult[]
      setLocalCount(old.length)
    } catch { /* ignore */ }
  }, [])

  async function migrateFromLocalStorage() {
    setMigrating(true)
    setMigrateMsg("")
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]") as OldSavedResult[]
      let ok = 0
      let fail = 0
      for (const item of old) {
        try {
          const r = await fetch("/api/v3/generated-posts", {
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

  async function handleDelete(id: string) {
    const r = await fetch(`/api/v3/generated-posts?id=${id}`, { method: "DELETE" })
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

      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>生成結果</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          過去の生成結果（最大100件・DB保存）
        </p>
      </div>

      {/* 旧データ移行バナー */}
      {localCount > 0 && (
        <div
          className="rounded-2xl p-4 flex items-center gap-4 flex-wrap"
          style={{ background: "#f59e0b22", border: "1px solid #f59e0b" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#92400e" }}>
              ブラウザに{localCount}件の旧データがあります
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#78350f" }}>
              以前の生成結果をDBに移行します（移行後は削除されます）
            </p>
          </div>
          <button
            onClick={migrateFromLocalStorage}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "#f59e0b" }}
          >
            {migrating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <MoveRight className="w-4 h-4" />
            )}
            {migrating ? "移行中…" : "DBに移行する"}
          </button>
        </div>
      )}
      {migrateMsg && (
        <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>{migrateMsg}</p>
      )}

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "tips", "product"] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={
              filterType === t
                ? { background: "var(--accent)", color: "white" }
                : { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }
            }
          >
            {t === "all" ? `すべて（${results.length}件）` : POST_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ローディング */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      )}

      {/* 空状態 */}
      {!loading && filtered.length === 0 && (
        <div
          className="rounded-2xl p-16 flex flex-col items-center justify-center gap-3"
          style={{ background: "var(--card)", border: "1px dashed var(--border)" }}
        >
          <ImageIcon className="w-10 h-10" style={{ color: "var(--muted)" }} />
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
            {results.length === 0
              ? "まだ生成結果がありません。生成テストから生成してください。"
              : "このカテゴリの結果はありません"}
          </p>
        </div>
      )}

      {/* 結果一覧 */}
      <div className="space-y-4">
        {filtered.map(result => {
          const ptColor    = POST_TYPE_COLORS[result.postType]
          const isExpanded = expandedIds.has(result.id)
          return (
            <div
              key={result.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* ─── カードヘッダー ─── */}
              <div className="p-4 space-y-3">

                {/* タイトル行 */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0"
                    style={{ background: ptColor.bg, color: ptColor.text }}
                  >
                    {POST_TYPE_LABELS[result.postType]}
                  </span>
                  <span className="font-bold text-sm flex-1 min-w-0 break-words" style={{ color: "var(--text)" }}>
                    {result.overallTitle}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(result.createdAt).toLocaleString("ja-JP", {
                      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  <button
                    onClick={() => handleDelete(result.id)}
                    title="削除"
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                    style={{ background: "#ef444422", color: "#ef4444" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* バッジ行（型・ペルソナ・ベンチマーク） */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{result.personaName}</span>
                  {result.hookType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: HOOK_COLORS.bg,   color: HOOK_COLORS.text   }}>{result.hookType}</span>
                  )}
                  {result.structureType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: STRUCT_COLORS.bg, color: STRUCT_COLORS.text }}>{result.structureType}</span>
                  )}
                  {result.compositionType && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: COMP_COLORS.bg,   color: COMP_COLORS.text   }}>{result.compositionType}</span>
                  )}
                  {result.refBenchmark && (
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-mono"
                      style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}
                      title="参照ベンチマーク"
                    >
                      📌 {result.refBenchmark}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{result.imageUrls.length}枚</span>
                </div>

                {/* スライドサムネイル */}
                {result.imageUrls.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                    {result.imageUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setModal({ result, idx: i })}
                        className="flex-shrink-0 relative group"
                        title={`スライド ${i + 1} を拡大`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`slide ${i + 1}`}
                          className="rounded-lg transition-opacity group-hover:opacity-85 cursor-zoom-in"
                          style={{ width: 80, aspectRatio: "3/4", objectFit: "cover", border: "1px solid var(--border)" }}
                        />
                        <span
                          className="absolute bottom-1 left-1 text-white font-bold px-1 rounded"
                          style={{ background: "rgba(0,0,0,0.55)", fontSize: 10 }}
                        >
                          {i + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {result.imageUrls.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>（画像なし — テキストのみ生成）</p>
                )}

                {/* テキスト展開ボタン */}
                <button
                  onClick={() => toggleExpand(result.id)}
                  className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "var(--accent)" }}
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {isExpanded ? "テキストを閉じる" : "生成テキストを見る"}
                </button>
              </div>

              {/* ─── 展開: 生成テキスト ─── */}
              {isExpanded && (
                <div
                  className="border-t px-4 py-3 space-y-3"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                >
                  {result.slides.map(slide => (
                    <div key={slide.slideNumber} className="flex gap-3 items-start">
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5"
                        style={{ background: "var(--accent)", fontSize: 10 }}
                      >
                        {slide.slideNumber}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>{slide.tag}</p>
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{slide.headline}</p>
                        {slide.bullets && slide.bullets.length > 0 && (
                          <ul className="text-xs space-y-0.5 list-disc list-inside" style={{ color: "var(--muted)" }}>
                            {slide.bullets.map((b, j) => <li key={j}>{b}</li>)}
                          </ul>
                        )}
                        {slide.accent && (
                          <p className="text-xs italic" style={{ color: "var(--accent)" }}>※ {slide.accent}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {result.caption && (
                    <div
                      className="rounded-xl p-3 mt-2"
                      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>📝 キャプション</p>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
                        {result.caption}
                      </p>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={closeModal}
        >
          <div
            className="relative flex items-center"
            style={{ maxHeight: "95vh", maxWidth: "95vw" }}
            onClick={e => e.stopPropagation()}
          >
            {modal.idx > 0 && (
              <button
                onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx - 1 } : null)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ left: "-3rem", background: "rgba(255,255,255,0.15)" }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={modal.result.imageUrls[modal.idx]}
              alt={`slide ${modal.idx + 1}`}
              className="rounded-xl shadow-2xl"
              style={{ maxHeight: "90vh", maxWidth: "min(420px, 90vw)", objectFit: "contain" }}
            />
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              {modal.idx + 1} / {modal.result.imageUrls.length}
            </div>
            {modal.idx < modal.result.imageUrls.length - 1 && (
              <button
                onClick={() => setModal(prev => prev ? { ...prev, idx: prev.idx + 1 } : null)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ right: "-3rem", background: "rgba(255,255,255,0.15)" }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={closeModal}
              className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full text-white transition-opacity hover:opacity-100 opacity-80"
              style={{ background: "rgba(0,0,0,0.6)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
