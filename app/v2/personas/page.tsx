"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Sparkles, X, Pencil, Check, Images, ChevronLeft, ChevronRight } from "lucide-react"
import type { Persona, BenchmarkPost } from "@/types/v2"

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

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
            <div
              className="h-full rounded-full"
              style={{ width: `${item.value}%`, background: item.color }}
            />
          </div>
          <span className="w-8 text-right font-bold" style={{ color: "var(--text)" }}>{item.value}%</span>
        </div>
      ))}
    </div>
  )
}

// ─── キャラクターテキスト編集コンポーネント ────────────────────

function CharacterTextEditor({
  persona,
  onSave,
}: {
  persona: Persona
  onSave: (id: string, text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText]       = useState(persona.characterText)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!editing) setText(persona.characterText)
  }, [persona.characterText, editing])

  async function handleSave() {
    setSaving(true)
    try {
      const r = await fetch(`/api/personas?id=${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterText: text }),
      })
      if (!r.ok) throw new Error("保存失敗")
      onSave(persona.id, text)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>キャラクター設定</p>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            <Pencil className="w-3 h-3" /> 編集
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditing(false); setText(persona.characterText) }}
              className="text-xs px-2 py-0.5 rounded-lg"
              style={{ color: "var(--muted)" }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
              保存
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-xl border text-xs leading-relaxed outline-none resize-none"
          style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }}
        />
      ) : (
        <div
          className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line"
          style={{ background: "var(--bg)", color: "var(--text)" }}
        >
          {persona.characterText}
        </div>
      )}
    </div>
  )
}

// ─── コンテンツタグ編集コンポーネント ──────────────────────────

function ContentTagEditor({
  persona,
  onSave,
}: {
  persona: Persona
  onSave: (id: string, tags: string[]) => void
}) {
  const initialTags = persona.contentThemeTags ?? persona.themeTags
  const [editing, setEditing]   = useState(false)
  const [tags, setTags]         = useState<string[]>(initialTags)
  const [input, setInput]       = useState("")
  const [saving, setSaving]     = useState(false)

  // persona が外から更新されたら同期
  useEffect(() => {
    if (!editing) setTags(persona.contentThemeTags ?? persona.themeTags)
  }, [persona, editing])

  function addTag() {
    const v = input.trim().replace(/^#/, "")
    if (!v || tags.includes(v)) return
    setTags(prev => [...prev, v])
    setInput("")
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const r = await fetch(`/api/personas?id=${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentThemeTags: tags }),
      })
      if (!r.ok) throw new Error("保存失敗")
      onSave(persona.id, tags)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const isFromBenchmark = !persona.contentThemeTags?.length

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          生成テーマ軸
          {isFromBenchmark && !editing && (
            <span className="ml-1.5 font-normal opacity-60">（ベンチマーク由来）</span>
          )}
        </p>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            <Pencil className="w-3 h-3" /> 編集
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditing(false); setTags(persona.contentThemeTags ?? persona.themeTags) }}
              className="text-xs px-2 py-0.5 rounded-lg"
              style={{ color: "var(--muted)" }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-bold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
              保存
            </button>
          </div>
        )}
      </div>

      {/* タグ一覧 */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span
            key={t}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
            style={{ background: editing ? "var(--accent-light)" : "#f0fdf4", color: editing ? "var(--accent)" : "#16a34a" }}
          >
            #{t}
            {editing && (
              <button onClick={() => removeTag(t)} className="hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* 入力欄（編集中のみ） */}
      {editing && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="タグを追加（Enterで確定）"
            className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
          />
          <button
            onClick={addTag}
            className="px-2.5 py-1.5 rounded-lg text-white text-xs"
            style={{ background: "var(--accent)" }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {editing && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          ヒント: スキンケア・保湿・美白・毛穴・垢抜けなど肌ケア系タグを追加すると生成内容が肌系に寄ります
        </p>
      )}
    </div>
  )
}

// ─── ベンチマーク投稿プレビューコンポーネント ──────────────────

function BenchmarkPreview({
  posts,
}: {
  posts: BenchmarkPost[]
}) {
  const [open, setOpen]             = useState(false)
  const [activePost, setActivePost] = useState(0)
  const [activeSlide, setActiveSlide] = useState(0)

  if (posts.length === 0) return null

  const post  = posts[activePost]
  const total = post.slideUrls.length

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-70"
        style={{ color: "var(--muted)" }}
      >
        <Images className="w-3.5 h-3.5" />
        参照ベンチマーク投稿（{posts.length}件）
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* 投稿セレクター */}
          <div className="flex gap-1.5 flex-wrap">
            {posts.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setActivePost(i); setActiveSlide(0) }}
                className="px-2 py-0.5 rounded-full text-xs border transition-colors"
                style={{
                  background: activePost === i ? "var(--accent)" : "var(--bg)",
                  color:      activePost === i ? "white" : "var(--muted)",
                  borderColor: activePost === i ? "var(--accent)" : "var(--border)",
                }}
              >
                {p.postType} {i + 1}
              </button>
            ))}
          </div>

          {/* スライドビューワー */}
          <div className="relative rounded-xl overflow-hidden" style={{ background: "var(--bg)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.slideUrls[activeSlide]}
              alt={`slide ${activeSlide + 1}`}
              className="w-full object-contain max-h-64"
            />
            {/* 前後ナビ */}
            {total > 1 && (
              <>
                <button
                  onClick={() => setActiveSlide(s => Math.max(0, s - 1))}
                  disabled={activeSlide === 0}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.45)", color: "white" }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveSlide(s => Math.min(total - 1, s + 1))}
                  disabled={activeSlide === total - 1}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.45)", color: "white" }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-1 right-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.5)", color: "white" }}>
                  {activeSlide + 1} / {total}
                </div>
              </>
            )}
          </div>

          {/* スライド構成サマリ */}
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

// ─── メインページ ───────────────────────────────────────────────

export default function PersonasPage() {
  const [personas, setPersonas]             = useState<Persona[]>([])
  const [benchmarkPosts, setBenchmarkPosts] = useState<BenchmarkPost[]>([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [accountName, setAccountName]       = useState("")
  const [personaName, setPersonaName]       = useState("")
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
    if (!personaName.trim()) { setError("ペルソナ名を入力してください"); return }
    setError("")
    setGenerating(true)
    try {
      const r = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, personaName: personaName.trim() }),
      })
      const d = await r.json() as { persona?: Persona; error?: string }
      if (d.error) throw new Error(d.error)
      setPersonas(prev => [d.persona!, ...prev])
      setPersonaName("")
      setAccountName("")
      setShowForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました")
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このペルソナを削除しますか？")) return
    await fetch(`/api/personas?id=${id}`, { method: "DELETE" })
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  function handleTagSave(id: string, tags: string[]) {
    setPersonas(prev => prev.map(p =>
      p.id === id ? { ...p, contentThemeTags: tags } : p
    ))
  }

  function handleCharacterSave(id: string, text: string) {
    setPersonas(prev => prev.map(p =>
      p.id === id ? { ...p, characterText: text } : p
    ))
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
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: "var(--accent)" }}
        >
          {showForm ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {showForm ? "キャンセル" : "ペルソナを生成"}
        </button>
      </div>

      {/* 生成フォーム */}
      {showForm && (
        <form
          onSubmit={handleGenerate}
          className="rounded-2xl p-6 space-y-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>ベンチマークからペルソナを生成</h2>

          {accounts.length === 0 ? (
            <div
              className="rounded-xl p-4 text-sm text-center"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              ベンチマーク投稿が登録されていません。
              先に「ベンチマーク」ページから投稿を登録してください。
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                    参照アカウント <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <select
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  >
                    <option value="">アカウントを選択...</option>
                    {accounts.map(a => (
                      <option key={a} value={a}>
                        {a}（{benchmarkPosts.filter(p => p.accountName === a).length}投稿）
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                    ペルソナ名（管理用） <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={personaName}
                    onChange={e => setPersonaName(e.target.value)}
                    placeholder="例: 肌ケアOL / 美容オタク主婦"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}

              <button
                type="submit"
                disabled={generating}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
                style={{ background: "var(--accent)" }}
              >
                {generating ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 生成中（30秒ほど）...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> ペルソナを生成する</>
                )}
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
            <div
              key={p.id}
              className="rounded-2xl p-5 space-y-4"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* ヘッダー */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                      style={{ background: "var(--accent)" }}
                    >
                      {p.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{p.name}</p>
                    {p.benchmarkAccount && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        参照: {p.benchmarkAccount}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
                  style={{ color: "var(--muted)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* キャラクター設定（編集可能） */}
              <CharacterTextEditor persona={p} onSave={handleCharacterSave} />

              {/* 参照ベンチマーク投稿プレビュー */}
              {p.benchmarkAccount && (
                <BenchmarkPreview
                  posts={benchmarkPosts.filter(b => b.accountName === p.benchmarkAccount)}
                />
              )}

              {/* ベンチマーク由来タグ */}
              <div>
                <p className="text-xs mb-1.5 font-bold" style={{ color: "var(--muted)" }}>
                  ベンチマークタグ（参照用）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {p.themeTags.map(t => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded-full text-xs"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* 生成テーマ軸（編集可能） */}
              <ContentTagEditor persona={p} onSave={handleTagSave} />

              {/* 投稿割合 */}
              <TypeRatioBar ratios={p.typeRatios} />

              {/* 週次スケジュールのプレビュー */}
              <div
                className="rounded-xl p-3"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <p className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
                  週次投稿イメージ
                </p>
                <div className="flex gap-1">
                  {DAY_LABELS.map((day, i) => {
                    const postTypes = buildTypeSchedule(p.typeRatios)
                    const type = postTypes[i]
                    return (
                      <div key={day} className="flex-1 text-center">
                        <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>{day}</p>
                        <div
                          className="rounded text-[10px] py-0.5 font-bold"
                          style={{
                            background: type === "tips" ? "#8b7f7422" : "#2d292622",
                            color: type === "tips" ? "var(--muted)" : "var(--text)",
                          }}
                        >
                          {type === "tips" ? "T" : "商"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function buildTypeSchedule(ratios: Persona["typeRatios"]): ("tips" | "product")[] {
  const types: ("tips" | "product")[] = []
  const tipsCount    = Math.round(7 * ratios.tips    / 100)
  const productCount = 7 - tipsCount

  for (let i = 0; i < tipsCount;    i++) types.push("tips")
  for (let i = 0; i < productCount; i++) types.push("product")

  while (types.length < 7) types.push("tips")
  return types.slice(0, 7)
}
