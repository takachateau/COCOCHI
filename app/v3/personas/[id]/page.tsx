"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Pencil, Check, X, Plus, Briefcase, MapPin,
  Sparkles, Hash, RefreshCw, Trash2, Calendar, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, ImagePlay,
} from "lucide-react"
import type { Persona, RichPersonaProfile, PostType, GeneratedPost, ContentPlan } from "@/types/v2"
import type { Product } from "@/types"

// "アカウント名/post_006" → "アカウント名 #6"
function formatRefBenchmark(ref: string | null): string | null {
  if (!ref) return null
  const m = ref.match(/^(.+)\/post_(\d+)$/)
  if (!m) return ref
  return `${m[1]} #${parseInt(m[2], 10)}`
}

// ─── 定数 ───────────────────────────────────────────────────────────
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]
const AVATAR_COLORS = ["#c4956a", "#8b7f74", "#a0785a", "#6b8c7a", "#7c6f9a"]

const POST_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  tips:    { label: "Tips",   color: "var(--muted)",  bg: "#8b7f7420" },
  product: { label: "商品",   color: "var(--text)",   bg: "#2d292615" },
  mixed:   { label: "混合",   color: "#16a34a",       bg: "#16a34a18" },
}

function getCurrentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split("T")[0]
}

function buildTypeSchedule(ratios: Persona["typeRatios"]): PostType[] {
  const tips    = Math.round(7 * (ratios.tips    / 100))
  const product = Math.round(7 * (ratios.product / 100))
  const mixed   = Math.max(0, 7 - tips - product)
  const types: PostType[] = [
    ...Array(tips).fill("tips" as PostType),
    ...Array(product).fill("product" as PostType),
    ...Array(mixed).fill("mixed" as PostType),
  ]
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[types[i], types[j]] = [types[j], types[i]]
  }
  return types.slice(0, 7)
}

// ─── タブ ────────────────────────────────────────────────────────────
type Tab = "settings" | "results" | "plan"
const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "設定" },
  { id: "results",  label: "生成結果" },
  { id: "plan",     label: "投稿プラン" },
]

// ─── 共通 UI コンポーネント ─────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>
      {children}
    </h2>
  )
}

function EditableText({
  label, value, multiline = false, rows = 3, onSave,
}: {
  label: string; value: string; multiline?: boolean; rows?: number
  onSave: (v: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const [saving, setSaving]   = useState(false)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  async function handleSave() {
    setSaving(true); await onSave(draft); setEditing(false); setSaving(false)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg hover:opacity-70" style={{ color: "var(--accent)" }}>
            <Pencil className="w-3 h-3" /> 編集
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(false); setDraft(value) }} className="text-xs px-2 py-0.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
              保存
            </button>
          </div>
        )}
      </div>
      {editing ? (
        multiline
          ? <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={rows} className="w-full px-3 py-2 rounded-xl border text-sm leading-relaxed outline-none resize-none" style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }} />
          : <input value={draft} onChange={e => setDraft(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }} />
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text)" }}>
          {value || <span style={{ color: "var(--muted)", opacity: 0.5 }}>未設定</span>}
        </p>
      )}
    </div>
  )
}

function NameEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const [saving, setSaving]   = useState(false)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  async function handleSave() {
    if (!draft.trim()) return
    setSaving(true); await onSave(draft.trim()); setEditing(false); setSaving(false)
  }
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setEditing(false); setDraft(value) } }}
          className="text-2xl font-bold leading-tight bg-transparent border-b-2 outline-none flex-1 min-w-0"
          style={{ borderColor: "var(--accent)", color: "var(--text)" }} />
        <button onClick={() => { setEditing(false); setDraft(value) }} className="p-1 rounded-lg hover:opacity-70" style={{ color: "var(--muted)" }}><X className="w-4 h-4" /></button>
        <button onClick={handleSave} disabled={saving || !draft.trim()} className="p-1 rounded-lg disabled:opacity-50" style={{ color: "var(--accent)" }}>
          {saving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
      </div>
    )
  }
  return (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-2 text-left hover:opacity-80 transition-opacity">
      <span className="text-2xl font-bold leading-tight" style={{ color: "var(--text)" }}>{value}</span>
      <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0 mt-0.5" style={{ color: "var(--muted)" }} />
    </button>
  )
}

function TagEditor({ label, tags, onSave }: { label: string; tags: string[]; onSave: (tags: string[]) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState<string[]>(tags)
  const [input, setInput]     = useState("")
  const [saving, setSaving]   = useState(false)
  useEffect(() => { if (!editing) setDraft(tags) }, [tags, editing])
  function addTag() {
    const v = input.trim().replace(/^#/, "")
    if (!v || draft.includes(v)) return
    setDraft(prev => [...prev, v]); setInput("")
  }
  async function handleSave() { setSaving(true); await onSave(draft); setEditing(false); setSaving(false) }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg hover:opacity-70" style={{ color: "var(--accent)" }}>
            <Pencil className="w-3 h-3" /> 編集
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(false); setDraft(tags) }} className="text-xs px-2 py-0.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
              保存
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {draft.map(t => (
          <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            #{t}
            {editing && <button onClick={() => setDraft(p => p.filter(x => x !== t))} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>}
          </span>
        ))}
      </div>
      {editing && (
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="タグを追加（Enterで確定）"
            className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }} />
          <button onClick={addTag} className="px-2.5 py-1.5 rounded-lg text-white text-xs" style={{ background: "var(--accent)" }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function ProfileEditor({ profile, onSave, onCancel }: { profile: RichPersonaProfile; onSave: (p: RichPersonaProfile) => Promise<void>; onCancel: () => void }) {
  const [form, setForm]   = useState<RichPersonaProfile>({ ...profile })
  const [saving, setSaving] = useState(false)
  function update<K extends keyof RichPersonaProfile>(key: K, value: RichPersonaProfile[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }
  function updateArr(key: "personality" | "hobbies" | "skinConcerns", raw: string) {
    update(key, raw.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean))
  }
  async function handleSave() { setSaving(true); await onSave(form); setSaving(false) }
  const cls = "w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
  const sty = { borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }
  const lbl = "text-[10px] font-bold mb-0.5 block"
  const lsty = { color: "var(--muted)" }
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg)", border: "1px solid var(--accent)" }}>
      <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>プロフィール編集</p>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl} style={lsty}>表示名</label><input className={cls} style={sty} value={form.displayName} onChange={e => update("displayName", e.target.value)} /></div>
        <div><label className={lbl} style={lsty}>ハンドル</label><input className={cls} style={sty} value={form.handle} onChange={e => update("handle", e.target.value)} placeholder="@xxx" /></div>
        <div><label className={lbl} style={lsty}>年齢</label><input type="number" className={cls} style={sty} value={form.age} onChange={e => update("age", Number(e.target.value))} /></div>
        <div><label className={lbl} style={lsty}>居住地</label><input className={cls} style={sty} value={form.location} onChange={e => update("location", e.target.value)} /></div>
      </div>
      <div><label className={lbl} style={lsty}>職業</label><input className={cls} style={sty} value={form.occupation} onChange={e => update("occupation", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>性格（カンマ区切り）</label><input className={cls} style={sty} value={form.personality.join("、")} onChange={e => updateArr("personality", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>趣味（カンマ区切り）</label><input className={cls} style={sty} value={form.hobbies.join("、")} onChange={e => updateArr("hobbies", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>肌タイプ</label><input className={cls} style={sty} value={form.skinType} onChange={e => update("skinType", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>肌悩み（カンマ区切り）</label><input className={cls} style={sty} value={form.skinConcerns.join("、")} onChange={e => updateArr("skinConcerns", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>美容哲学</label><textarea rows={2} className={cls} style={sty} value={form.beautyPhilosophy} onChange={e => update("beautyPhilosophy", e.target.value)} /></div>
      <div><label className={lbl} style={lsty}>美容ストーリー</label><textarea rows={3} className={cls} style={sty} value={form.beautyJourney} onChange={e => update("beautyJourney", e.target.value)} /></div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          保存
        </button>
      </div>
    </div>
  )
}

// ─── 生成結果タブ ───────────────────────────────────────────────────

function ResultsTab({ personaId }: { personaId: string }) {
  const [posts, setPosts]       = useState<GeneratedPost[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<{ post: GeneratedPost; imgIdx: number } | null>(null)
  const [regenId, setRegenId]         = useState<string | null>(null)
  const [regenSlideIdx, setRegenSlideIdx] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/v3/generated-posts?personaId=${personaId}`)
      .then(r => r.json() as Promise<{ posts?: GeneratedPost[] }>)
      .then(d => { setPosts(d.posts ?? []); setLoading(false) })
  }, [personaId])

  async function handleDelete(id: string) {
    if (!confirm("この生成結果を削除しますか？")) return
    await fetch(`/api/v3/generated-posts?id=${id}`, { method: "DELETE" })
    setPosts(prev => prev.filter(p => p.id !== id))
    if (modal?.post.id === id) setModal(null)
  }

  async function handleRegenerate(post: GeneratedPost) {
    setRegenId(post.id)
    try {
      const genRes = await fetch("/api/v3/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generated: { overallTitle: post.overallTitle, slides: post.slides, caption: post.caption ?? "" },
          personaId,
          postType: post.postType,
          productId: post.productId ?? undefined,
          types: (post.hookType && post.structureType && post.compositionType)
            ? { hookType: post.hookType, structureType: post.structureType, compositionType: post.compositionType }
            : undefined,
          benchmarkFolderPath: post.refBenchmark ?? undefined,
        }),
      })
      const genData = await genRes.json() as { imageUrls?: string[]; error?: string }
      if (!genData.imageUrls) throw new Error(genData.error ?? "画像生成失敗")

      await fetch(`/api/v3/generated-posts?id=${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: genData.imageUrls }),
      })

      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrls: genData.imageUrls! } : p))
      setModal(m => m?.post.id === post.id ? { ...m, post: { ...m.post, imageUrls: genData.imageUrls! }, imgIdx: 0 } : m)
    } catch (e) {
      alert(`再生成失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRegenId(null)
    }
  }

  async function handleRegenerateSlide(post: GeneratedPost, slideIndex: number) {
    setRegenSlideIdx(slideIndex)
    try {
      const res = await fetch("/api/v3/regenerate-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slide: post.slides[slideIndex],
          personaId,
          postType: post.postType,
          productId: post.productId ?? undefined,
          types: (post.hookType && post.structureType && post.compositionType)
            ? { hookType: post.hookType, structureType: post.structureType, compositionType: post.compositionType }
            : undefined,
          slideIndex,
          benchmarkFolderPath: post.refBenchmark ?? undefined,
        }),
      })
      const data = await res.json() as { imageUrl?: string; error?: string }
      if (!data.imageUrl) throw new Error(data.error ?? "スライド再生成失敗")

      const newUrls = [...post.imageUrls]
      newUrls[slideIndex] = data.imageUrl

      await fetch(`/api/v3/generated-posts?id=${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: newUrls }),
      })

      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrls: newUrls } : p))
      setModal(m => m?.post.id === post.id ? { ...m, post: { ...m.post, imageUrls: newUrls } } : m)
    } catch (e) {
      alert(`スライド再生成失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRegenSlideIdx(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: "var(--muted)" }}>
        <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">生成結果がありません</p>
        <p className="text-xs mt-1">「生成テスト」ページからコンテンツを生成してみましょう</p>
      </div>
    )
  }

  return (
    <>
      {/* ── モーダル ────────────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.90)" }}
          onClick={() => setModal(null)}
        >
          <div
            className="relative w-full flex flex-col md:flex-row rounded-2xl overflow-hidden"
            style={{ maxWidth: 900, maxHeight: "92vh", background: "#18181b" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 閉じる */}
            <button
              onClick={() => setModal(null)}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
            >
              <X className="w-4 h-4" />
            </button>

            {/* 左: 画像パネル */}
            <div
              className="relative flex-shrink-0 flex items-center justify-center"
              style={{ width: "min(100%, 400px)", background: "#0f0f10" }}
            >
              {modal.post.imageUrls?.length > 0 ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={modal.post.imageUrls[modal.imgIdx]}
                    alt={`slide ${modal.imgIdx + 1}`}
                    className="w-full object-contain"
                    style={{ maxHeight: "92vh" }}
                  />
                  {modal.post.imageUrls.length > 1 && (
                    <>
                      <button
                        onClick={() => setModal(m => m ? { ...m, imgIdx: Math.max(0, m.imgIdx - 1) } : null)}
                        disabled={modal.imgIdx === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20 hover:opacity-80"
                        style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setModal(m => m ? { ...m, imgIdx: Math.min(m.post.imageUrls.length - 1, m.imgIdx + 1) } : null)}
                        disabled={modal.imgIdx === modal.post.imageUrls.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20 hover:opacity-80"
                        style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {/* 下部バー: スライド再生成 + カウンター */}
                  <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-3">
                    <button
                      onClick={() => handleRegenerateSlide(modal.post, modal.imgIdx)}
                      disabled={regenSlideIdx !== null || regenId !== null}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold disabled:opacity-40 hover:opacity-80 transition-opacity"
                      style={{ background: "rgba(0,0,0,0.65)", color: "white" }}
                    >
                      {regenSlideIdx === modal.imgIdx
                        ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <ImagePlay className="w-3 h-3" />}
                      {regenSlideIdx === modal.imgIdx ? "再生成中..." : "この画像を再生成"}
                    </button>
                    {modal.post.imageUrls.length > 1 && (
                      <div className="px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{ background: "rgba(0,0,0,0.65)", color: "white" }}>
                        {modal.imgIdx + 1} / {modal.post.imageUrls.length}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 画像なし: スライド番号の代わりにテキストプレビュー */
                <div className="w-full h-full min-h-64 flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-xs font-bold mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {modal.imgIdx + 1} / {modal.post.slides.length}枚目
                  </p>
                  {modal.post.slides[modal.imgIdx] && (
                    <div className="space-y-2">
                      {modal.post.slides[modal.imgIdx].tag && (
                        <p className="text-sm font-bold" style={{ color: "#c4956a" }}>{modal.post.slides[modal.imgIdx].tag}</p>
                      )}
                      <p className="text-lg font-bold leading-snug" style={{ color: "white" }}>
                        {modal.post.slides[modal.imgIdx].headline}
                      </p>
                    </div>
                  )}
                  {modal.post.slides.length > 1 && (
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => setModal(m => m ? { ...m, imgIdx: Math.max(0, m.imgIdx - 1) } : null)}
                        disabled={modal.imgIdx === 0}
                        className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20"
                        style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setModal(m => m ? { ...m, imgIdx: Math.min(m.post.slides.length - 1, m.imgIdx + 1) } : null)}
                        disabled={modal.imgIdx === modal.post.slides.length - 1}
                        className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20"
                        style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 右: コンテンツパネル */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ color: "white" }}>
              {/* タイトル + 日付 */}
              <div>
                <p className="text-xs font-mono mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {new Date(modal.post.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-base font-bold leading-snug" style={{ color: "white" }}>{modal.post.overallTitle}</p>
                {modal.post.refBenchmark && (
                  <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    参照ベンチマーク: {formatRefBenchmark(modal.post.refBenchmark)}
                  </p>
                )}
              </div>

              {/* 投稿種別バッジ */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>投稿種別</p>
                <span className="inline-block px-3 py-1.5 rounded-lg text-sm font-bold"
                  style={{
                    background: POST_TYPE_CONFIG[modal.post.postType]?.bg ?? "rgba(196,149,106,0.25)",
                    color:      POST_TYPE_CONFIG[modal.post.postType]?.color ?? "#c4956a",
                  }}>
                  {POST_TYPE_CONFIG[modal.post.postType]?.label ?? modal.post.postType}
                </span>
              </div>

              {/* 画像サムネイル行（画像ありの場合） */}
              {modal.post.imageUrls?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {modal.post.imageUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt=""
                      onClick={() => setModal(m => m ? { ...m, imgIdx: i } : null)}
                      className="w-11 h-11 object-cover rounded-lg cursor-pointer"
                      style={{
                        border: i === modal.imgIdx ? "2px solid #c4956a" : "2px solid rgba(255,255,255,0.1)",
                        opacity: i === modal.imgIdx ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* スライドテキスト一覧 */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>スライドテキスト</p>
                {modal.post.slides.map((s, i) => (
                  <div
                    key={s.slideNumber}
                    className="rounded-xl p-3 space-y-1 cursor-pointer transition-colors"
                    style={{
                      background: modal.imgIdx === i ? "rgba(196,149,106,0.15)" : "rgba(255,255,255,0.05)",
                      border: modal.imgIdx === i ? "1px solid rgba(196,149,106,0.4)" : "1px solid transparent",
                    }}
                    onClick={() => setModal(m => m ? { ...m, imgIdx: i } : null)}
                  >
                    <p className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>{s.slideNumber}枚目</p>
                    {s.tag && <p className="text-[11px] font-bold" style={{ color: "#c4956a" }}>{s.tag}</p>}
                    <p className="text-sm font-bold leading-snug" style={{ color: "white" }}>{s.headline}</p>
                    {s.bullets && (
                      <ul className="space-y-0.5 pt-0.5">
                        {s.bullets.map((b, j) => (
                          <li key={j} className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{b}</li>
                        ))}
                      </ul>
                    )}
                    {s.accent && <p className="text-xs italic" style={{ color: "rgba(196,149,106,0.8)" }}>{s.accent}</p>}
                  </div>
                ))}
              </div>

              {/* キャプション */}
              {modal.post.caption && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>キャプション</p>
                  <div className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)" }}>
                    {modal.post.caption}
                  </div>
                </div>
              )}

              {/* アクションボタン */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => handleRegenerate(modal.post)}
                  disabled={regenId === modal.post.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-85"
                  style={{ background: "var(--accent)" }}>
                  {regenId === modal.post.id
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <ImagePlay className="w-3.5 h-3.5" />}
                  {regenId === modal.post.id ? "再生成中..." : "全画像を再生成"}
                </button>
                <button
                  onClick={() => handleDelete(modal.post.id)}
                  disabled={regenId === modal.post.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-red-900/30 disabled:opacity-30"
                  style={{ color: "#f87171" }}>
                  <Trash2 className="w-3.5 h-3.5" /> 削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 投稿グリッド ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs" style={{ color: "var(--muted)" }}>{posts.length}件の生成結果</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {posts.map(post => {
            const cfg   = POST_TYPE_CONFIG[post.postType] ?? POST_TYPE_CONFIG.tips
            const thumb = post.imageUrls?.[0]
            return (
              <div
                key={post.id}
                className="relative group rounded-xl overflow-hidden cursor-pointer transition-opacity hover:opacity-85"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                onClick={() => setModal({ post, imgIdx: 0 })}
              >
                {/* ホバー時ボタン群 */}
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); handleRegenerate(post) }}
                    disabled={regenId === post.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg shadow-md"
                    style={{ background: "rgba(255,255,255,0.92)", color: "var(--accent)" }}
                    title="画像を再生成"
                  >
                    {regenId === post.id
                      ? <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                      : <ImagePlay className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(post.id) }}
                    disabled={regenId === post.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg shadow-md disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.92)", color: "#ef4444" }}
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* サムネイル */}
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="w-full aspect-[3/4] object-cover" />
                ) : (
                  <div className="w-full aspect-[3/4] flex flex-col items-center justify-center gap-2 px-3 text-center"
                    style={{ background: "var(--bg)" }}>
                    <Sparkles className="w-5 h-5 opacity-20" style={{ color: "var(--muted)" }} />
                    <p className="text-[10px] leading-snug line-clamp-3 font-bold" style={{ color: "var(--muted)" }}>
                      {post.slides[0]?.headline ?? post.overallTitle}
                    </p>
                  </div>
                )}

                {/* メタ情報 */}
                <div className="p-2 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {post.slides.length}枚
                      {post.imageUrls?.length > 0 && ` · 画像${post.imageUrls.length}`}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text)" }}>
                    {post.overallTitle}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {new Date(post.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                    </p>
                    {post.refBenchmark && (
                      <p className="text-[9px] truncate max-w-[60%] text-right" style={{ color: "var(--muted)", opacity: 0.6 }}>
                        {formatRefBenchmark(post.refBenchmark)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── 投稿プランタブ ─────────────────────────────────────────────────

function PlanTab({ personaId }: { personaId: string }) {
  const [plans, setPlans]         = useState<ContentPlan[]>([])
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart())
  const [productId, setProductId] = useState<string>("")
  const [creating, setCreating]   = useState(false)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch(`/api/content-plans?personaId=${personaId}`).then(r => r.json() as Promise<{ plans?: ContentPlan[] }>),
      fetch("/api/products").then(r => r.json() as Promise<{ products?: Product[] }>),
    ]).then(([pData, prData]) => {
      setPlans(pData.plans ?? [])
      setProducts(prData.products ?? [])
      setLoading(false)
    })
  }, [personaId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const r = await fetch("/api/content-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, productId: productId || null, weekStart }),
      })
      const d = await r.json() as { plan?: ContentPlan; error?: string }
      if (d.error) throw new Error(d.error)
      if (d.plan) {
        setPlans(prev => [d.plan!, ...prev])
        setExpanded(prev => new Set([...prev, d.plan!.id]))
      }
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー + 新規作成ボタン */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted)" }}>{plans.length}件のプラン</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: showForm ? "var(--muted)" : "var(--accent)" }}>
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "キャンセル" : "新規プランを作成"}
        </button>
      </div>

      {/* 新規作成フォーム */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl p-5 space-y-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>週次プランを新規作成</p>

          {/* 週開始日 */}
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{ color: "var(--muted)" }}>週の開始日（月曜日）</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>

          {/* 商品選択 */}
          <div>
            <label className="text-xs font-bold mb-2 block" style={{ color: "var(--muted)" }}>商品（任意）</label>
            <div className="grid grid-cols-3 gap-2">
              {/* 商品なし */}
              <button
                type="button"
                onClick={() => setProductId("")}
                className="rounded-xl p-3 text-center text-xs transition-all"
                style={{
                  border: `2px solid ${productId === "" ? "var(--accent)" : "var(--border)"}`,
                  background: productId === "" ? "var(--accent-light)" : "var(--bg)",
                  color: productId === "" ? "var(--accent)" : "var(--muted)",
                }}>
                <div className="font-bold mb-0.5">—</div>
                <div className="text-[10px]">Tips系のみ</div>
              </button>
              {/* 商品カード */}
              {products.map(pr => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => setProductId(pr.id)}
                  className="rounded-xl overflow-hidden text-left transition-all"
                  style={{
                    border: `2px solid ${productId === pr.id ? "var(--accent)" : "var(--border)"}`,
                    background: productId === pr.id ? "var(--accent-light)" : "var(--bg)",
                  }}>
                  {pr.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pr.imageUrl} alt={pr.name} className="w-full h-16 object-cover" />
                  )}
                  <div className="p-2">
                    <p className="text-[10px] font-bold truncate" style={{ color: productId === pr.id ? "var(--accent)" : "var(--text)" }}>{pr.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {creating ? "作成中..." : "プランを作成"}
          </button>
        </form>
      )}

      {/* プラン一覧 */}
      {plans.length === 0 && !showForm ? (
        <div className="text-center py-16" style={{ color: "var(--muted)" }}>
          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">プランがまだありません</p>
          <p className="text-xs mt-1">「新規プランを作成」から週次スケジュールを組みましょう</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const isOpen = expanded.has(plan.id)
            const d = new Date(plan.weekStart + "T00:00:00")
            const weekLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日〜`
            const usedProduct = products.find(p => p.id === plan.productId)
            const textDone  = plan.posts.filter(p => p.status === "text_done" || p.status === "image_done").length
            const imageDone = plan.posts.filter(p => p.status === "image_done").length
            return (
              <div key={plan.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                {/* プランヘッダー */}
                <button
                  type="button"
                  onClick={() => toggleExpand(plan.id)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left hover:opacity-80 transition-opacity">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--accent)" }} />
                      <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{weekLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--muted)" }}>
                      {usedProduct ? (
                        <span>商品: {usedProduct.name}</span>
                      ) : (
                        <span>Tips系のみ</span>
                      )}
                      <span>テキスト {textDone}/7</span>
                      <span>画像 {imageDone}/7</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--muted)" }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--muted)" }} />}
                </button>

                {/* 7日分の投稿リスト */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: "var(--border)" }}>
                    {/* 曜日サマリーバー */}
                    <div className="flex gap-1 p-3 pb-0">
                      {plan.posts.map((post, i) => {
                        const cfg = POST_TYPE_CONFIG[post.postType] ?? POST_TYPE_CONFIG.tips
                        return (
                          <div key={i} className="flex-1 text-center">
                            <p className="text-[9px] mb-1" style={{ color: "var(--muted)" }}>{DAY_LABELS[i]}</p>
                            <div className="rounded text-[9px] py-1 font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                              {post.postType === "tips" ? "T" : post.postType === "mixed" ? "混" : "商"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* 投稿詳細 */}
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {plan.posts.map((post, i) => {
                        const cfg = POST_TYPE_CONFIG[post.postType] ?? POST_TYPE_CONFIG.tips
                        return (
                          <div key={i} className="flex items-start gap-3 px-4 py-3">
                            <div className="flex-shrink-0 w-12 text-center">
                              <p className="text-[10px] font-bold" style={{ color: "var(--muted)" }}>{DAY_LABELS[i]}曜日</p>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: cfg.bg, color: cfg.color }}>
                                {cfg.label}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {post.generatedText ? (
                                <>
                                  <p className="text-xs font-bold leading-snug" style={{ color: "var(--text)" }}>
                                    {post.generatedText.overallTitle}
                                  </p>
                                  <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                                    {post.generatedText.slides.length}枚構成
                                    {post.generatedImages && post.generatedImages.length > 0 && ` · 画像${post.generatedImages.length}枚`}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs" style={{ color: "var(--muted)", opacity: 0.6 }}>テキスト未生成</p>
                              )}
                            </div>
                            {/* ステータスドット */}
                            <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: post.status === "planned" ? "var(--border)" : "var(--accent)" }} title={post.status === "planned" ? "未生成" : "生成済"} />
                              {post.generatedImages && post.generatedImages.length > 0 && (
                                <div className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} title="画像あり" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 設定タブ ────────────────────────────────────────────────────────

function SettingsTab({
  persona, patch, onUpdate,
}: {
  persona: Persona
  patch: (body: Record<string, unknown>) => Promise<void>
  onUpdate: (updates: Partial<Persona>) => void
}) {
  const [editingProfile, setEditingProfile] = useState(false)
  const [syncingRatios, setSyncingRatios]   = useState(false)
  const schedule = buildTypeSchedule(persona.typeRatios)
  const p = persona.profile

  async function saveProfile(updated: RichPersonaProfile) {
    await patch({ profile: updated })
    onUpdate({ profile: updated })
    setEditingProfile(false)
  }
  async function saveNarrativeField(field: "narrativeHook" | "narrativeIdentity", value: string) {
    if (!persona.profile) return
    const updated = { ...persona.profile, [field]: value }
    await patch({ profile: updated })
    onUpdate({ profile: updated })
  }
  async function saveCharacterText(text: string) {
    await patch({ characterText: text })
    onUpdate({ characterText: text })
  }
  async function saveContentTags(tags: string[]) {
    await patch({ contentThemeTags: tags })
    onUpdate({ contentThemeTags: tags })
  }
  async function syncTypeRatios() {
    if (!persona.benchmarkAccount) return
    setSyncingRatios(true)
    try {
      const r = await fetch("/api/benchmark/posts")
      const d = await r.json() as { posts: { accountName: string; postType: string }[] }
      const posts = (d.posts ?? []).filter(p => p.accountName === persona.benchmarkAccount)
      if (!posts.length) return
      const counts: Record<string, number> = {}
      for (const p of posts) counts[p.postType] = (counts[p.postType] ?? 0) + 1
      const total = posts.length
      const newRatios = {
        tips:    Math.round(((counts.tips    ?? 0) / total) * 100),
        product: Math.round(((counts.product ?? 0) / total) * 100),
        mixed:   Math.round(((counts.mixed   ?? 0) / total) * 100),
      }
      await patch({ typeRatios: newRatios })
      onUpdate({ typeRatios: newRatios })
    } finally { setSyncingRatios(false) }
  }

  return (
    <div className="space-y-8 pb-16">
      {/* ナラティブ */}
      {p && (
        <div className="rounded-2xl p-6 space-y-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <SectionLabel>ナラティブ</SectionLabel>
          <div className="rounded-xl p-4" style={{ background: "var(--bg)" }}>
            <EditableText label="フォローする決め手" value={p.narrativeHook ?? ""} onSave={v => saveNarrativeField("narrativeHook", v)} />
          </div>
          <EditableText label="この人物の立ち位置" value={p.narrativeIdentity ?? ""} multiline rows={4} onSave={v => saveNarrativeField("narrativeIdentity", v)} />
        </div>
      )}

      {/* プロフィール */}
      {p && (
        <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <SectionLabel>プロフィール</SectionLabel>
            {!editingProfile && (
              <button onClick={() => setEditingProfile(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border hover:opacity-70 transition-opacity mb-4"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
                <Pencil className="w-3 h-3" /> 編集
              </button>
            )}
          </div>
          {editingProfile ? (
            <ProfileEditor profile={p} onSave={saveProfile} onCancel={() => setEditingProfile(false)} />
          ) : (
            <div className="space-y-4">
              {p.personality.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.personality.map(t => <span key={t} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{t}</span>)}
                </div>
              )}
              {p.hobbies.length > 0 && (
                <div className="text-sm" style={{ color: "var(--muted)" }}>
                  <span className="font-bold mr-2">趣味</span>{p.hobbies.join(" · ")}
                </div>
              )}
              <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg)" }}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-bold flex-shrink-0 text-xs" style={{ color: "var(--muted)" }}>肌タイプ</span>
                  <span style={{ color: "var(--text)" }}>{p.skinType}</span>
                </div>
                {p.skinConcerns.length > 0 && (
                  <div className="flex items-start gap-3 text-sm">
                    <span className="font-bold flex-shrink-0 text-xs mt-0.5" style={{ color: "var(--muted)" }}>肌悩み</span>
                    <div className="flex flex-wrap gap-1">
                      {p.skinConcerns.map(c => <span key={c} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "#fff0f0", color: "#e05252" }}>{c}</span>)}
                    </div>
                  </div>
                )}
              </div>
              {p.beautyPhilosophy && (
                <div>
                  <p className="text-[11px] font-bold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>美容哲学</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{p.beautyPhilosophy}</p>
                </div>
              )}
              {p.beautyJourney && (
                <div>
                  <p className="text-[11px] font-bold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>美容ストーリー</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{p.beautyJourney}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI生成テキスト */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <SectionLabel>AI生成テキスト（5次元）</SectionLabel>
        <EditableText label="キャラクター・ミッション・価値・フック・口調" value={persona.characterText} multiline rows={14} onSave={saveCharacterText} />
      </div>

      {/* アカウント設定 */}
      <div className="rounded-2xl p-6 space-y-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <SectionLabel>アカウント設定</SectionLabel>
        <div>
          <p className="text-[11px] font-bold mb-2 uppercase tracking-wide" style={{ color: "var(--muted)" }}>ベンチマークタグ</p>
          <div className="flex flex-wrap gap-1.5">
            {persona.themeTags.map(t => (
              <span key={t} className="px-2.5 py-1 rounded-full text-xs" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                <Hash className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />{t}
              </span>
            ))}
          </div>
        </div>
        <TagEditor label="生成テーマ軸" tags={persona.contentThemeTags ?? persona.themeTags} onSave={saveContentTags} />
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>投稿タイプ割合</p>
            <button type="button" onClick={syncTypeRatios} disabled={syncingRatios || !persona.benchmarkAccount}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
              style={{ background: "var(--border)", color: "var(--muted)", opacity: syncingRatios ? 0.5 : 1 }}>
              <RefreshCw className={`w-2.5 h-2.5 ${syncingRatios ? "animate-spin" : ""}`} />
              ベンチマークから再計算
            </button>
          </div>
          <div className="space-y-2">
            {[
              { label: "Tips", value: persona.typeRatios.tips, color: "#8b7f74" },
              { label: "商品", value: persona.typeRatios.product, color: "#2d2926" },
              { label: "混合", value: persona.typeRatios.mixed ?? 0, color: "#10b981" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-right flex-shrink-0" style={{ color: "var(--muted)" }}>{item.label}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
                </div>
                <span className="w-8 text-right font-bold" style={{ color: "var(--text)" }}>{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold mb-3 uppercase tracking-wide" style={{ color: "var(--muted)" }}>週次投稿イメージ</p>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((day, i) => {
              const type = schedule[i]
              const cfg = POST_TYPE_CONFIG[type] ?? POST_TYPE_CONFIG.tips
              return (
                <div key={day} className="flex-1 text-center">
                  <p className="text-[10px] mb-1.5" style={{ color: "var(--muted)" }}>{day}</p>
                  <div className="rounded-lg text-[10px] py-1.5 font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                    {type === "tips" ? "T" : type === "mixed" ? "混" : "商"}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ビジュアルプロフィール */}
      {persona.visualProfile && (
        <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <SectionLabel>ビジュアルプロフィール</SectionLabel>
          <div className="grid grid-cols-1 gap-3">
            {[
              { key: "hair", label: "Hair" },
              { key: "fashion", label: "Fashion" },
              { key: "setting", label: "Setting" },
              { key: "photoStyle", label: "Photo Style" },
            ].map(({ key, label }) => {
              const val = persona.visualProfile![key as keyof typeof persona.visualProfile]
              return (
                <div key={key} className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                  <p className="text-[10px] font-bold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</p>
                  <p className="text-sm" style={{ color: "var(--text)" }}>{val}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 削除 */}
      <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={async () => {
            if (!confirm("このペルソナを削除しますか？")) return
            await fetch(`/api/personas?id=${persona.id}`, { method: "DELETE" })
            window.location.href = "/v3/personas"
          }}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
          style={{ color: "#e05252" }}>
          <Trash2 className="w-3.5 h-3.5" />
          このペルソナを削除
        </button>
      </div>
    </div>
  )
}

// ─── メインページ ────────────────────────────────────────────────────

export default function PersonaDetailPage() {
  const params = useParams<{ id: string }>()
  const id     = params.id
  const router = useRouter()

  const [persona, setPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("settings")

  useEffect(() => {
    fetch(`/api/personas?id=${id}`)
      .then(r => r.json() as Promise<{ persona: Persona | null }>)
      .then(d => { setPersona(d.persona); setLoading(false) })
  }, [id])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    await fetch(`/api/personas?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }, [id])

  function handleUpdate(updates: Partial<Persona>) {
    setPersona(prev => prev ? { ...prev, ...updates } : prev)
  }

  // ── ローディング・エラー ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-7 h-7 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (!persona) {
    return (
      <div className="text-center py-32" style={{ color: "var(--muted)" }}>
        <p className="text-sm">ペルソナが見つかりませんでした</p>
        <button onClick={() => router.push("/v3/personas")} className="mt-4 text-xs underline" style={{ color: "var(--accent)" }}>
          一覧に戻る
        </button>
      </div>
    )
  }

  const p = persona.profile
  const colorIndex = persona.name.charCodeAt(0) % AVATAR_COLORS.length
  const avatarBg   = AVATAR_COLORS[colorIndex]
  const avatarLetter = p?.displayName?.charAt(0) ?? persona.name.charAt(0)

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* 戻るボタン */}
      <button onClick={() => router.push("/v3/personas")}
        className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
        style={{ color: "var(--muted)" }}>
        <ArrowLeft className="w-4 h-4" /> ペルソナ一覧
      </button>

      {/* ── アイデンティティヘッダー（常時表示）──────────────────── */}
      <div className="flex items-start gap-5">
        {persona.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={persona.avatarUrl} alt={persona.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
            style={{ background: avatarBg }}>
            {avatarLetter}
          </div>
        )}
        <div className="flex-1 min-w-0 pt-1">
          <NameEditor
            value={persona.name}
            onSave={async (v) => {
              const updatedProfile = persona.profile ? { ...persona.profile, displayName: v } : undefined
              await patch({ name: v, ...(updatedProfile ? { profile: updatedProfile } : {}) })
              setPersona(prev => prev ? { ...prev, name: v, profile: updatedProfile ?? prev.profile } : prev)
            }}
          />
          {p?.handle && <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{p.handle}</p>}
          {p && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs" style={{ color: "var(--muted)" }}>
              <span className="font-medium">{p.age}歳</span>
              {p.occupation && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{p.occupation}</span>}
              {p.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.location}</span>}
            </div>
          )}
          {persona.benchmarkAccount && (
            <p className="text-[10px] mt-2 opacity-50" style={{ color: "var(--muted)" }}>
              参照: {persona.benchmarkAccount}
            </p>
          )}
        </div>
      </div>

      {/* ── タブバー ──────────────────────────────────────────────── */}
      <div className="flex rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-3 text-sm font-bold transition-colors"
            style={
              activeTab === tab.id
                ? { background: "var(--accent)", color: "white" }
                : { color: "var(--muted)" }
            }>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── タブコンテンツ ────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <SettingsTab persona={persona} patch={patch} onUpdate={handleUpdate} />
      )}
      {activeTab === "results" && (
        <ResultsTab personaId={persona.id} />
      )}
      {activeTab === "plan" && (
        <PlanTab personaId={persona.id} />
      )}

    </div>
  )
}
