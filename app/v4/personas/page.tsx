"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Trash2, Sparkles, X, Pencil, Check,
  Images, ChevronLeft, ChevronRight, MapPin, Briefcase,
  ChevronDown, ChevronUp,
} from "lucide-react"
import type { Persona, BenchmarkPost, RichPersonaProfile, PostType } from "@/types/v2"

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

// ─── ユーティリティ ──────────────────────────────────────────────

function TypeRatioBar({ ratios }: { ratios: Persona["typeRatios"] }) {
  const items = [
    { label: "Tips", value: ratios.tips,    color: "#8b7f74" },
    { label: "商品", value: ratios.product, color: "#2d2926" },
  ]
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-6 flex-shrink-0 text-right" style={{ color: "var(--muted)" }}>{item.label}</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
          </div>
          <span className="w-8 text-right font-bold" style={{ color: "var(--text)" }}>{item.value}%</span>
        </div>
      ))}
    </div>
  )
}

// ─── キャラクターテキスト編集 ────────────────────────────────────

function CharacterTextEditor({ persona, onSave }: { persona: Persona; onSave: (id: string, text: string) => void }) {
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText]       = useState(persona.characterText)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { if (!editing) setText(persona.characterText) }, [persona.characterText, editing])

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/personas?id=${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterText: text }),
      })
      onSave(persona.id, text)
      setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-xs font-bold mb-1"
        style={{ color: "var(--muted)" }}
      >
        <span>AI生成テキスト（5次元）</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span />
            {!editing ? (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg hover:opacity-70" style={{ color: "var(--accent)" }}>
                <Pencil className="w-3 h-3" /> 編集
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditing(false); setText(persona.characterText) }} className="text-xs px-2 py-0.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                  保存
                </button>
              </div>
            )}
          </div>
          {editing ? (
            <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
              className="w-full px-3 py-2 rounded-xl border text-xs leading-relaxed outline-none resize-none"
              style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }} />
          ) : (
            <div className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line" style={{ background: "var(--bg)", color: "var(--text)" }}>
              {persona.characterText}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── コンテンツタグ編集 ─────────────────────────────────────────

function ContentTagEditor({ persona, onSave }: { persona: Persona; onSave: (id: string, tags: string[]) => void }) {
  const initial = persona.contentThemeTags ?? persona.themeTags
  const [editing, setEditing] = useState(false)
  const [tags, setTags]       = useState<string[]>(initial)
  const [input, setInput]     = useState("")
  const [saving, setSaving]   = useState(false)

  useEffect(() => { if (!editing) setTags(persona.contentThemeTags ?? persona.themeTags) }, [persona, editing])

  function addTag() {
    const v = input.trim().replace(/^#/, "")
    if (!v || tags.includes(v)) return
    setTags(prev => [...prev, v]); setInput("")
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/personas?id=${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentThemeTags: tags }),
      })
      onSave(persona.id, tags); setEditing(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          生成テーマ軸
          {!persona.contentThemeTags?.length && !editing && <span className="ml-1 font-normal opacity-60">（ベンチマーク由来）</span>}
        </p>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg hover:opacity-70" style={{ color: "var(--accent)" }}>
            <Pencil className="w-3 h-3" /> 編集
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(false); setTags(initial) }} className="text-xs px-2 py-0.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
              保存
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
            style={{ background: editing ? "var(--accent-light)" : "#f0fdf4", color: editing ? "var(--accent)" : "#16a34a" }}>
            #{t}
            {editing && <button onClick={() => setTags(p => p.filter(x => x !== t))} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>}
          </span>
        ))}
      </div>
      {editing && (
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="タグを追加（Enterで確定）"
            className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }} />
          <button onClick={addTag} className="px-2.5 py-1.5 rounded-lg text-white text-xs" style={{ background: "var(--accent)" }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── ベンチマーク投稿プレビュー ─────────────────────────────────

function BenchmarkPreview({ posts }: { posts: BenchmarkPost[] }) {
  const [open, setOpen]             = useState(false)
  const [activePost, setActivePost] = useState(0)
  const [activeSlide, setActiveSlide] = useState(0)
  if (posts.length === 0) return null
  const post  = posts[activePost]
  const total = post.slideUrls.length
  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-xs font-bold hover:opacity-70" style={{ color: "var(--muted)" }}>
        <Images className="w-3.5 h-3.5" />
        参照ベンチマーク投稿（{posts.length}件）
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {posts.map((p, i) => (
              <button key={p.id} onClick={() => { setActivePost(i); setActiveSlide(0) }}
                className="px-2 py-0.5 rounded-full text-xs border transition-colors"
                style={{ background: activePost === i ? "var(--accent)" : "var(--bg)", color: activePost === i ? "white" : "var(--muted)", borderColor: activePost === i ? "var(--accent)" : "var(--border)" }}>
                {p.postType} {i + 1}
              </button>
            ))}
          </div>
          <div className="relative rounded-xl overflow-hidden" style={{ background: "var(--bg)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.slideUrls[activeSlide]} alt={`slide ${activeSlide + 1}`} className="w-full object-contain max-h-64" />
            {total > 1 && (
              <>
                <button onClick={() => setActiveSlide(s => Math.max(0, s - 1))} disabled={activeSlide === 0}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.45)", color: "white" }}><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setActiveSlide(s => Math.min(total - 1, s + 1))} disabled={activeSlide === total - 1}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.45)", color: "white" }}><ChevronRight className="w-4 h-4" /></button>
                <div className="absolute bottom-1 right-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.5)", color: "white" }}>
                  {activeSlide + 1} / {total}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {post.slideStructure.map(s => (
              <span key={s.slide} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                {s.slide}. {s.role}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── プロフィール編集フォーム ────────────────────────────────────

function ProfileEditor({
  profile,
  personaId,
  onSave,
  onCancel,
}: {
  profile: RichPersonaProfile
  personaId: string
  onSave: (updated: RichPersonaProfile) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<RichPersonaProfile>({ ...profile })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof RichPersonaProfile>(key: K, value: RichPersonaProfile[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateStringArray(key: "personality" | "hobbies" | "skinConcerns", raw: string) {
    update(key, raw.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/personas?id=${personaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: form }),
      })
      onSave(form)
    } finally { setSaving(false) }
  }

  const inputClass = "w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
  const inputStyle = { borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }
  const labelClass = "text-[10px] font-bold mb-0.5 block"
  const labelStyle = { color: "var(--muted)" }

  return (
    <div className="space-y-3 rounded-xl p-4" style={{ background: "var(--bg)", border: "1px solid var(--accent)" }}>
      <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>プロフィール編集</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} style={labelStyle}>表示名</label>
          <input className={inputClass} style={inputStyle} value={form.displayName}
            onChange={e => update("displayName", e.target.value)} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>ハンドル</label>
          <input className={inputClass} style={inputStyle} value={form.handle}
            onChange={e => update("handle", e.target.value)} placeholder="@xxx" />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>年齢</label>
          <input type="number" className={inputClass} style={inputStyle} value={form.age}
            onChange={e => update("age", Number(e.target.value))} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>居住地</label>
          <input className={inputClass} style={inputStyle} value={form.location}
            onChange={e => update("location", e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>職業</label>
        <input className={inputClass} style={inputStyle} value={form.occupation}
          onChange={e => update("occupation", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>性格（カンマ区切り）</label>
        <input className={inputClass} style={inputStyle} value={form.personality.join("、")}
          onChange={e => updateStringArray("personality", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>趣味（カンマ区切り）</label>
        <input className={inputClass} style={inputStyle} value={form.hobbies.join("、")}
          onChange={e => updateStringArray("hobbies", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>肌タイプ</label>
        <input className={inputClass} style={inputStyle} value={form.skinType}
          onChange={e => update("skinType", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>肌悩み（カンマ区切り）</label>
        <input className={inputClass} style={inputStyle} value={form.skinConcerns.join("、")}
          onChange={e => updateStringArray("skinConcerns", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>美容哲学</label>
        <textarea rows={2} className={inputClass} style={inputStyle} value={form.beautyPhilosophy}
          onChange={e => update("beautyPhilosophy", e.target.value)} />
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>美容ストーリー</label>
        <textarea rows={3} className={inputClass} style={inputStyle} value={form.beautyJourney}
          onChange={e => update("beautyJourney", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}>
          {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          保存
        </button>
      </div>
    </div>
  )
}

// ─── ペルソナカード（シンプル・クリックで詳細へ）────────────────

const AVATAR_COLORS = ["#c4956a", "#8b7f74", "#a0785a", "#6b8c7a", "#7c6f9a"]

function PersonaCard({
  persona,
  onDelete,
}: {
  persona: Persona
  onDelete: (id: string) => void
}) {
  const router = useRouter()
  const p = persona.profile
  const colorIndex = persona.name.charCodeAt(0) % AVATAR_COLORS.length
  const avatarBg = AVATAR_COLORS[colorIndex]
  const avatarLetter = p?.displayName?.charAt(0) ?? persona.name.charAt(0)

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer transition-opacity hover:opacity-90 active:opacity-75"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      onClick={() => router.push(`/v4/personas/${persona.id}`)}
    >
      <div className="p-5 flex items-start gap-4">
        {/* アバター */}
        {persona.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={persona.avatarUrl} alt={persona.name}
            className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: avatarBg }}>
            {avatarLetter}
          </div>
        )}

        {/* テキスト情報 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight truncate" style={{ color: "var(--text)" }}>
                {p?.displayName ?? persona.name}
              </p>
              {p?.handle && (
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>{p.handle}</p>
              )}
              {p && (
                <div className="flex flex-wrap items-center gap-x-2 mt-1 text-xs" style={{ color: "var(--muted)", opacity: 0.7 }}>
                  {p.age && <span>{p.age}歳</span>}
                  {p.location && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{p.location}</span>}
                </div>
              )}
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(persona.id) }}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
              style={{ color: "var(--muted)" }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* narrativeHook — フォローする決め手 */}
          {p?.narrativeHook && (
            <p className="mt-2 text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text)" }}>
              {p.narrativeHook}
            </p>
          )}

          {/* 参照ベンチマーク */}
          {persona.benchmarkAccount && (
            <p className="text-[10px] mt-1.5 opacity-40" style={{ color: "var(--muted)" }}>
              参照: {persona.benchmarkAccount}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── メインページ ───────────────────────────────────────────────

export default function PersonasPage() {
  const [personas, setPersonas]             = useState<Persona[]>([])
  const [benchmarkPosts, setBenchmarkPosts] = useState<BenchmarkPost[]>([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [accountName, setAccountName]       = useState("")
  const [generating, setGenerating]         = useState(false)
  const [error, setError]                   = useState("")

  const accounts = [...new Set(benchmarkPosts.map(p => p.accountName))]

  useEffect(() => {
    Promise.all([
      fetch("/api/personas").then(r => r.json() as Promise<{ personas: Persona[] }>),
      fetch("/api/benchmark/posts").then(r => r.json() as Promise<{ posts: BenchmarkPost[] }>),
    ]).then(([p, b]) => {
      setPersonas(p.personas ?? [])
      setBenchmarkPosts(b.posts ?? [])
      setLoading(false)
    })
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!accountName) { setError("アカウントを選択してください"); return }
    setError(""); setGenerating(true)
    try {
      const r = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName }),
      })
      const d = await r.json() as { persona?: Persona; error?: string }
      if (d.error) throw new Error(d.error)
      setPersonas(prev => [d.persona!, ...prev])
      setAccountName(""); setShowForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました")
    } finally { setGenerating(false) }
  }

  function handleDelete(id: string) {
    if (!confirm("このペルソナを削除しますか？")) return
    fetch(`/api/personas?id=${id}`, { method: "DELETE" })
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  function handleUpdate(id: string, updates: Partial<Persona>) {
    setPersonas(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>ペルソナ 管理</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            ベンチマーク分析から架空のアカウント人格を生成して保存します
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: "var(--accent)" }}>
          {showForm ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {showForm ? "キャンセル" : "ペルソナを生成"}
        </button>
      </div>

      {/* 生成フォーム */}
      {showForm && (
        <form onSubmit={handleGenerate} className="rounded-2xl p-6 space-y-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>ベンチマークからペルソナを生成</h2>
          {accounts.length === 0 ? (
            <div className="rounded-xl p-4 text-sm text-center" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              ベンチマーク投稿が登録されていません。先に「ベンチマーク」ページから投稿を登録してください。
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
                  参照アカウントを選択 <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {accounts.map(a => {
                    const acctPosts = benchmarkPosts.filter(p => p.accountName === a)
                    const thumbs = acctPosts.slice(0, 4).map(p => p.slideUrls[0]).filter(Boolean)
                    const tagCounts = acctPosts.flatMap(p => p.themeTags).reduce((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc }, {} as Record<string, number>)
                    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
                    const selected = accountName === a
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAccountName(a)}
                        className="text-left rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                        style={{
                          border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                          background: "var(--bg)",
                          boxShadow: selected ? "0 0 0 3px var(--accent-light)" : "none",
                        }}
                      >
                        {/* サムネイルグリッド */}
                        <div className="grid grid-cols-4 gap-0" style={{ background: "var(--border)" }}>
                          {Array.from({ length: 4 }).map((_, i) =>
                            thumbs[i] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={thumbs[i]} alt="" className="aspect-[3/4] w-full object-cover" />
                            ) : (
                              <div key={i} className="aspect-[3/4] w-full" style={{ background: "var(--bg)" }} />
                            )
                          )}
                        </div>
                        {/* 情報 */}
                        <div className="p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>{a}</p>
                            {selected && (
                              <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: "var(--accent)" }}>
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          <p className="text-[10px]" style={{ color: "var(--muted)" }}>{acctPosts.length}投稿</p>
                          <div className="flex flex-wrap gap-1">
                            {topTags.map(t => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: "var(--card)", color: "var(--muted)" }}>#{t}</span>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  ペルソナ名はClaudeが自動で生成します
                </p>
              </div>
              {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}
              <button type="submit" disabled={generating || !accountName}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
                style={{ background: "var(--accent)" }}>
                {generating
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 生成中（30秒ほど）...</>
                  : <><Sparkles className="w-4 h-4" /> {accountName ? `「${accountName}」からペルソナを生成` : "アカウントを選択してください"}</>}
              </button>
            </>
          )}
        </form>
      )}

      {/* ペルソナ一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
        </div>
      ) : personas.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--muted)" }}>
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">まだペルソナがありません</p>
          <p className="text-xs mt-1">「ペルソナを生成」からベンチマーク分析をもとに作成できます</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {personas.map(p => (
            <PersonaCard
              key={p.id}
              persona={p}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function buildTypeSchedule(ratios: Persona["typeRatios"]): PostType[] {
  const types: PostType[] = []
  const tipsCount    = Math.round(7 * ratios.tips    / 100)
  const productCount = 7 - tipsCount
  for (let i = 0; i < tipsCount;    i++) types.push("tips")
  for (let i = 0; i < productCount; i++) types.push("product")
  while (types.length < 7) types.push("tips")
  return types.slice(0, 7)
}
