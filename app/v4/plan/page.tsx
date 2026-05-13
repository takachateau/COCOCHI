"use client"

import { useState, useEffect } from "react"
import { Sparkles, Download, ChevronRight, ChevronLeft, CheckCircle, Clock, ImageIcon, Copy, Check, BookOpen, X } from "lucide-react"
import type { Persona, ContentPlan, PlanPost, BenchmarkPost } from "@/types/v2"
import type { Product } from "@/types"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

const POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  tips:    { bg: "#f0ede8",   text: "var(--muted)" },
  product: { bg: "#2d292611", text: "var(--text)" },
  mixed:   { bg: "#16a34a11", text: "#16a34a" },
}

function getCurrentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split("T")[0]
}

export default function PlanPage() {
  const { lang } = useLanguage()
  const t = useT(lang)
  const pl = t.plan

  const [personas, setPersonas]         = useState<Persona[]>([])
  const [products, setProducts]         = useState<Product[]>([])
  const [benchmarkPosts, setBenchmarkPosts] = useState<BenchmarkPost[]>([])
  const [loading, setLoading]           = useState(true)

  const [personaId, setPersonaId]     = useState("")
  const [productId, setProductId]     = useState("")
  const [weekStart, setWeekStart]     = useState(getCurrentWeekStart())

  const [plan, setPlan]               = useState<ContentPlan | null>(null)
  const [creatingPlan, setCreatingPlan]   = useState(false)
  const [generatingText, setGeneratingText] = useState(false)
  const [imageGenDay, setImageGenDay]     = useState<number | null>(null)

  const [error, setError]             = useState("")
  const [copiedDay, setCopiedDay]     = useState<number | null>(null)
  const [benchmarkPreview, setBenchmarkPreview] = useState<{ post: BenchmarkPost; slideIndex: number } | null>(null)
  const [imagePreview, setImagePreview] = useState<{ post: PlanPost; slideIndex: number } | null>(null)
  const [singleSlideGen, setSingleSlideGen] = useState<{ day: number; slideNumber: number } | null>(null)
  const [singleSlideResults, setSingleSlideResults] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch("/api/personas").then(r => r.json() as Promise<{ personas: Persona[] }>),
      fetch("/api/products").then(r => r.json() as Promise<Product[]>),
      fetch("/api/benchmark/posts").then(r => r.json() as Promise<{ posts: BenchmarkPost[] }>),
    ]).then(([p, prods, b]) => {
      setPersonas(p.personas ?? [])
      setProducts(Array.isArray(prods) ? prods : [])
      setBenchmarkPosts(b.posts ?? [])
      setLoading(false)
    })
  }, [])

  const planReady = !!plan
  const textReady = planReady && plan.posts.every(p => p.status !== "planned")
  const allDone   = planReady && plan.posts.every(p => p.status === "image_done")

  async function handleCreatePlan() {
    if (!personaId) { setError(t.personas.selectAccountPlaceholder); return }
    if (!weekStart) { setError(t.personas.selectAccountPlaceholder); return }
    setError("")
    setCreatingPlan(true)
    setPlan(null)
    try {
      const r = await fetch("/api/content-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, productId: productId || null, weekStart }),
      })
      const d = await r.json() as { plan?: ContentPlan; error?: string }
      if (d.error) throw new Error(d.error)
      setPlan(d.plan!)
    } catch (e) {
      setError(e instanceof Error ? e.message : pl.errorCreatePlan)
    } finally {
      setCreatingPlan(false)
    }
  }

  async function handleGenerateText() {
    if (!plan) return
    setGeneratingText(true)
    setError("")
    try {
      const r = await fetch("/api/content-plans/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, productId: productId || undefined }),
      })
      const d = await r.json() as { plan?: ContentPlan; error?: string }
      if (d.error) throw new Error(d.error)
      setPlan(d.plan!)
    } catch (e) {
      setError(e instanceof Error ? e.message : pl.errorGenerateText)
    } finally {
      setGeneratingText(false)
    }
  }

  async function handleGenerateImages(day: number) {
    if (!plan) return
    setImageGenDay(day)
    setError("")
    try {
      const r = await fetch("/api/generate-v2/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, day }),
      })
      const d = await r.json() as { imageUrls?: string[]; caption?: string; error?: string }
      if (d.error) throw new Error(d.error)
      setPlan(prev => prev ? {
        ...prev,
        posts: prev.posts.map(p =>
          p.day === day
            ? { ...p, generatedImages: d.imageUrls!, status: "image_done" }
            : p
        ),
      } : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : `day ${day} の画像生成に失敗しました`)
    } finally {
      setImageGenDay(null)
    }
  }

  async function handleGenerateSingleSlide(day: number, slideNumber: number) {
    if (!plan) return
    setSingleSlideGen({ day, slideNumber })
    setError("")
    try {
      const r = await fetch("/api/generate-v2/slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, day, slideNumber }),
      })
      const d = await r.json() as { imageUrl?: string; error?: string }
      if (d.error) throw new Error(d.error)
      setSingleSlideResults(prev => ({ ...prev, [`${day}-${slideNumber}`]: d.imageUrl! }))
    } catch (e) {
      setError(e instanceof Error ? e.message : `スライド${slideNumber}の生成に失敗しました`)
    } finally {
      setSingleSlideGen(null)
    }
  }

  async function downloadImages(post: PlanPost) {
    if (!post.generatedImages) return
    for (let i = 0; i < post.generatedImages.length; i++) {
      const url = post.generatedImages[i]
      const r = await fetch(url)
      const blob = await r.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `day${post.day}_slide${i + 1}.jpg`
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  function copyCaption(post: PlanPost) {
    if (!post.generatedText) return
    navigator.clipboard.writeText(post.generatedText.caption)
    setCopiedDay(post.day)
    setTimeout(() => setCopiedDay(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ─── ベンチマークプレビューモーダル ─── */}
      {benchmarkPreview && (() => {
        const { post: bp, slideIndex } = benchmarkPreview
        const total = bp.slideUrls.length
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => setBenchmarkPreview(null)}
          >
            <div
              className="relative w-full max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "var(--card)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{bp.folderPath}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {bp.postType} · {bp.tone} · {slideIndex + 1}/{total}{t.results.imageCount}
                  </p>
                </div>
                <button
                  onClick={() => setBenchmarkPreview(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                  style={{ background: "var(--bg)" }}
                >
                  <X className="w-4 h-4" style={{ color: "var(--text)" }} />
                </button>
              </div>
              <div className="relative" style={{ background: "#000" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bp.slideUrls[slideIndex]} alt={`slide ${slideIndex + 1}`} className="w-full object-contain max-h-[60vh]" />
                {total > 1 && (
                  <>
                    <button
                      onClick={() => setBenchmarkPreview(p => p ? { ...p, slideIndex: Math.max(0, p.slideIndex - 1) } : p)}
                      disabled={slideIndex === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBenchmarkPreview(p => p ? { ...p, slideIndex: Math.min(total - 1, p.slideIndex + 1) } : p)}
                      disabled={slideIndex === total - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-1.5 p-3 overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
                {bp.slideUrls.map((url, i) => (
                  <button key={i} onClick={() => setBenchmarkPreview(p => p ? { ...p, slideIndex: i } : p)} className="flex-shrink-0 transition-opacity" style={{ opacity: i === slideIndex ? 1 : 0.45 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-12 h-12 object-cover rounded" style={{ border: i === slideIndex ? "2px solid var(--accent)" : "1px solid var(--border)" }} />
                  </button>
                ))}
              </div>
              {bp.slideStructure.length > 0 && (
                <div className="px-4 pb-4 flex gap-1.5 flex-wrap">
                  {bp.slideStructure.map(s => (
                    <span key={s.slide} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {s.slide}. {s.role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ─── 生成済み画像プレビューモーダル ─── */}
      {imagePreview && (() => {
        const { post: ip, slideIndex } = imagePreview
        const urls = ip.generatedImages ?? []
        const total = urls.length
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={() => setImagePreview(null)}
          >
            <div
              className="relative w-full max-w-sm rounded-2xl overflow-hidden"
              style={{ background: "var(--card)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {pl.dayNames[ip.day - 1]} — {pl.postTypes[ip.postType as keyof typeof pl.postTypes] ?? ip.postType}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {ip.generatedText?.overallTitle} · {slideIndex + 1}/{t.results.imageCount}
                  </p>
                </div>
                <button
                  onClick={() => setImagePreview(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
                  style={{ background: "var(--bg)" }}
                >
                  <X className="w-4 h-4" style={{ color: "var(--text)" }} />
                </button>
              </div>
              <div className="relative" style={{ background: "#000" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[slideIndex]} alt={`slide ${slideIndex + 1}`} className="w-full object-contain max-h-[65vh]" />
                {total > 1 && (
                  <>
                    <button
                      onClick={() => setImagePreview(p => p ? { ...p, slideIndex: Math.max(0, p.slideIndex - 1) } : p)}
                      disabled={slideIndex === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setImagePreview(p => p ? { ...p, slideIndex: Math.min(total - 1, p.slideIndex + 1) } : p)}
                      disabled={slideIndex === total - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              {total > 1 && (
                <div className="flex gap-1.5 p-3 overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
                  {urls.map((url, i) => (
                    <button key={i} onClick={() => setImagePreview(p => p ? { ...p, slideIndex: i } : p)} className="flex-shrink-0 transition-opacity" style={{ opacity: i === slideIndex ? 1 : 0.45 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-12 h-12 object-cover rounded" style={{ border: i === slideIndex ? "2px solid var(--accent)" : "1px solid var(--border)" }} />
                    </button>
                  ))}
                </div>
              )}
              {ip.generatedText?.slides[slideIndex] && (
                <div className="px-4 pb-4 space-y-1">
                  {ip.generatedText.slides[slideIndex].tag && (
                    <p className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                      {ip.generatedText.slides[slideIndex].tag}
                    </p>
                  )}
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    {ip.generatedText.slides[slideIndex].headline}
                  </p>
                  {ip.generatedText.slides[slideIndex].bullets?.map((b, i) => (
                    <p key={i} className="text-[11px]" style={{ color: "var(--muted)" }}>{b}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>{pl.pageTitle}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {pl.settingsTitle}
        </p>
      </div>

      {/* ─── ステップ1: セットアップ ─── */}
      <div
        className="rounded-2xl p-6 space-y-6"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >1</span>
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>{pl.settingsTitle}</h2>
        </div>

        {/* ─── ペルソナ ─── */}
        <div>
          <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
            {t.nav.personas} <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          {personas.length === 0 ? (
            <div
              className="rounded-xl p-4 text-sm text-center"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              {t.personas.noPersonas}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {personas.map(p => {
                const selected = personaId === p.id
                const displayName = p.profile?.displayName ?? p.name
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonaId(p.id)}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      background: selected ? "var(--accent-light)" : "var(--bg)",
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden mb-2 mx-auto">
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-lg font-bold text-white"
                          style={{ background: "var(--accent)" }}
                        >
                          {displayName[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-bold text-center truncate" style={{ color: "var(--text)" }}>
                      {displayName}
                    </p>
                    {p.benchmarkAccount && (
                      <p className="text-[10px] text-center truncate mt-0.5" style={{ color: "var(--muted)" }}>
                        {p.benchmarkAccount}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2 justify-center">
                      {(p.typeRatios.tips    ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "#0891b222", color: "#0891b2" }}>
                          Tips {p.typeRatios.tips}%
                        </span>
                      )}
                      {(p.typeRatios.product ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "#7c3aed22", color: "#7c3aed" }}>
                          PR {p.typeRatios.product}%
                        </span>
                      )}
                      {(p.typeRatios.mixed   ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "#16a34a22", color: "#16a34a" }}>
                          Mix {p.typeRatios.mixed}%
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── 商品（省略可） ─── */}
        <div>
          <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
            {t.nav.products}（{t.common.optional}）
          </label>
          {products.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>{pl.noProducts}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setProductId("")}
                className="rounded-xl p-3 flex flex-col items-center justify-center transition-all"
                style={{
                  minHeight: 120,
                  background: productId === "" ? "var(--accent-light)" : "var(--bg)",
                  border: `2px solid ${productId === "" ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="text-2xl mb-1 leading-none" style={{ color: "var(--muted)" }}>—</span>
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{pl.noProduct}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{pl.noProductHint}</p>
              </button>
              {products.map(prod => {
                const selected = productId === prod.id
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => setProductId(prod.id)}
                    className="rounded-xl overflow-hidden text-left transition-all"
                    style={{
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-light)" : "var(--bg)",
                    }}
                  >
                    <div className="overflow-hidden" style={{ aspectRatio: "1", background: "#f9f9f9" }}>
                      {prod.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--muted)" }}>
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-bold leading-snug" style={{
                        color: "var(--text)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                        {prod.name}
                      </p>
                      {prod.price && (
                        <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>{prod.price}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── 週開始日 ─── */}
        <div>
          <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
            {pl.dayNames[0]}
          </label>
          <input
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </div>

        {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}

        <button
          onClick={handleCreatePlan}
          disabled={creatingPlan || personas.length === 0}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
          style={{ background: "var(--accent)" }}
        >
          {creatingPlan ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {pl.creatingPlan}</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {pl.createPlan}</>
          )}
        </button>
      </div>

      {/* ─── ステップ2: 7日間プラン ─── */}
      {plan && (
        <>
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: textReady ? "#22c55e" : "var(--accent)" }}
                >
                  {textReady ? <CheckCircle className="w-4 h-4" /> : "2"}
                </span>
                <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  {pl.generateTexts}
                  {textReady && <span className="ml-2 text-xs font-normal" style={{ color: "#22c55e" }}>{pl.textsDone}</span>}
                </h2>
              </div>
              {!textReady && (
                <button
                  onClick={handleGenerateText}
                  disabled={generatingText}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
                  style={{ background: "var(--accent)" }}
                >
                  {generatingText ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> {pl.generatingTexts}</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> {pl.generateTexts}</>
                  )}
                </button>
              )}
            </div>

            {/* 7日間グリッド */}
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
              {plan.posts.map(post => {
                const colors = POST_TYPE_COLORS[post.postType] ?? POST_TYPE_COLORS.tips
                const isGenerating = imageGenDay === post.day
                const hasText = !!post.generatedText
                const hasImages = post.status === "image_done"

                return (
                  <div
                    key={post.day}
                    className="rounded-xl overflow-hidden flex flex-col"
                    style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                  >
                    <div className="px-2 py-1.5 text-center" style={{ background: colors.bg }}>
                      <p className="text-xs font-bold" style={{ color: colors.text }}>{pl.dayNames[post.day - 1]}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: colors.text, opacity: 0.8 }}>
                        {pl.postTypes[post.postType as keyof typeof pl.postTypes] ?? post.postType}
                      </p>
                    </div>
                    <div className="p-2 flex-1 flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                        {hasImages ? (
                          <CheckCircle className="w-3 h-3" style={{ color: "#22c55e" }} />
                        ) : hasText ? (
                          <Clock className="w-3 h-3" style={{ color: "var(--accent)" }} />
                        ) : (
                          <Clock className="w-3 h-3" style={{ color: "var(--border)" }} />
                        )}
                        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                          {hasImages ? pl.textsDone : hasText ? pl.textsReady : pl.notGenerated}
                        </span>
                      </div>
                      {post.generatedText && (
                        <div>
                          <p className="text-[11px] font-bold leading-tight" style={{ color: "var(--text)" }}>
                            {post.generatedText.overallTitle}
                          </p>
                          <p className="text-[10px] mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                            {post.generatedText.slides[0]?.headline}
                          </p>
                        </div>
                      )}
                      {hasImages && post.generatedImages && (
                        <div className="grid grid-cols-2 gap-0.5">
                          {post.generatedImages.slice(0, 4).map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={url} alt="" className="w-full aspect-square object-cover rounded" />
                          ))}
                        </div>
                      )}
                      {hasText && !hasImages && (
                        <button
                          onClick={() => handleGenerateImages(post.day)}
                          disabled={isGenerating || imageGenDay !== null}
                          className="w-full py-1.5 rounded-lg text-[11px] font-bold transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center justify-center gap-1"
                          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                        >
                          {isGenerating ? (
                            <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> {t.common.generating}</>
                          ) : (
                            <><ImageIcon className="w-3 h-3" /> {pl.generateImage}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── ステップ3: 詳細・ダウンロード ─── */}
          {textReady && (
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: allDone ? "#22c55e" : "var(--accent)" }}
                >
                  3
                </span>
                <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>{pl.imageSection}</h2>
              </div>

              <div className="space-y-3">
                {plan.posts.map(post => {
                  const hasImages = post.status === "image_done"
                  const isGenerating = imageGenDay === post.day
                  return (
                    <div
                      key={post.day}
                      className="rounded-xl p-4 space-y-3"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{
                                background: POST_TYPE_COLORS[post.postType]?.bg,
                                color: POST_TYPE_COLORS[post.postType]?.text,
                              }}
                            >
                              {pl.postTypes[post.postType as keyof typeof pl.postTypes] ?? post.postType}
                            </span>
                            <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                              {pl.dayNames[post.day - 1]}
                            </span>
                          </div>
                          {post.generatedText && (
                            <p className="text-sm font-bold mt-1" style={{ color: "var(--text)" }}>
                              {post.generatedText.overallTitle}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {post.generatedText && (
                            <button
                              onClick={() => copyCaption(post)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors"
                              style={{
                                background: copiedDay === post.day ? "var(--accent)" : "var(--accent-light)",
                                color: copiedDay === post.day ? "white" : "var(--accent)",
                              }}
                            >
                              {copiedDay === post.day
                                ? <><Check className="w-3 h-3" /> {t.common.copied}</>
                                : <><Copy className="w-3 h-3" /> {pl.caption}</>}
                            </button>
                          )}
                          {hasImages && (
                            <button
                              onClick={() => downloadImages(post)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-bold"
                              style={{ background: "var(--border)", color: "var(--text)" }}
                            >
                              <Download className="w-3 h-3" />
                              DL
                            </button>
                          )}
                          {post.generatedText && !hasImages && (
                            <button
                              onClick={() => handleGenerateImages(post.day)}
                              disabled={isGenerating || imageGenDay !== null}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                              style={{ background: "var(--accent)", color: "white" }}
                            >
                              {isGenerating ? (
                                <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> {pl.generatingImage}</>
                              ) : (
                                <><ImageIcon className="w-3 h-3" /> {pl.generateImage}</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* スライドテキスト一覧 */}
                      {post.generatedText && (
                        <div className="space-y-1.5">
                          {post.generatedText.slides.map(s => {
                            const key = `${post.day}-${s.slideNumber}`
                            const isGenThisSlide = singleSlideGen?.day === post.day && singleSlideGen?.slideNumber === s.slideNumber
                            const resultUrl = singleSlideResults[key]
                            return (
                              <div key={s.slideNumber} className="flex gap-2 text-xs items-start">
                                <span className="font-bold w-4 text-right flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }}>
                                  {s.slideNumber}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium" style={{ color: "var(--muted)" }}>{s.tag}　</span>
                                  <span style={{ color: "var(--text)" }}>{s.headline.replace(/\\n/g, " / ")}</span>
                                  {s.bullets && (
                                    <p style={{ color: "var(--muted)" }}>{s.bullets.join(" | ")}</p>
                                  )}
                                </div>
                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                  <button
                                    onClick={() => handleGenerateSingleSlide(post.day, s.slideNumber)}
                                    disabled={!!singleSlideGen || imageGenDay !== null}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1"
                                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                                  >
                                    {isGenThisSlide ? (
                                      <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <ImageIcon className="w-2.5 h-2.5" />
                                    )}
                                    {isGenThisSlide ? t.common.generatingSlide : pl.generateSlide}
                                  </button>
                                  {resultUrl && (
                                    <button onClick={() => setImagePreview({ post: { ...post, generatedImages: [resultUrl] }, slideIndex: 0 })}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={resultUrl} alt="" className="w-14 h-14 object-cover rounded-lg transition-opacity hover:opacity-80" style={{ border: "2px solid var(--accent)" }} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* 参照したベンチマーク投稿 */}
                      {post.benchmarkPostId && (() => {
                        const ref = benchmarkPosts.find(b => b.id === post.benchmarkPostId)
                        if (!ref) return null
                        return (
                          <div
                            className="rounded-lg p-2 space-y-1.5"
                            style={{ background: "var(--accent-light)", border: "1px solid var(--border)" }}
                          >
                            <div className="flex items-center gap-1">
                              <BookOpen className="w-3 h-3 flex-shrink-0" style={{ color: "var(--accent)" }} />
                              <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                                {t.personas.refPrefix}{ref.folderPath}
                              </span>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {ref.slideUrls.map((url, i) => (
                                <button
                                  key={i}
                                  onClick={() => setBenchmarkPreview({ post: ref, slideIndex: i })}
                                  className="flex-shrink-0 transition-opacity hover:opacity-75"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`ref ${i + 1}`} className="w-12 h-12 object-cover rounded" style={{ border: "1px solid var(--border)" }} />
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "var(--accent)", color: "white" }}>
                                {ref.postType}
                              </span>
                              {ref.themeTags.slice(0, 2).map(t => (
                                <span key={t} className="text-[10px]" style={{ color: "var(--muted)" }}>#{t}</span>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* 生成済み画像 */}
                      {hasImages && post.generatedImages && (
                        <div className="flex gap-2 flex-wrap">
                          {post.generatedImages.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setImagePreview({ post, slideIndex: i })}
                              className="transition-opacity hover:opacity-80 flex-shrink-0"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`slide ${i + 1}`} className="w-20 h-20 object-cover rounded-xl" style={{ border: "1px solid var(--border)" }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 全件一括DL */}
              {allDone && (
                <button
                  onClick={async () => {
                    for (const post of plan.posts) {
                      await downloadImages(post)
                    }
                  }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-85"
                  style={{ background: "var(--accent)" }}
                >
                  <Download className="w-4 h-4" />
                  {pl.imageSection}（{plan.posts.reduce((s, p) => s + (p.generatedImages?.length ?? 0), 0)}{t.results.imageCount}）
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
