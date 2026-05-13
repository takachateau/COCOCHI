"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ListOrdered, X, RefreshCw, CheckCircle, AlertCircle, Clock, Loader } from "lucide-react"
import type { GenerationJob } from "@/types/v2"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

const NAV_HREFS = [
  { href: "/v4/benchmark",     key: "benchmark"    },
  { href: "/v4/competitors",   key: "competitors"  },
  { href: "/v4/products",      key: "products"     },
  { href: "/v4/personas",      key: "personas"     },
  { href: "/v4/test-generate", key: "testGenerate" },
  { href: "/v4/results",       key: "results"      },
  { href: "/v4/plan",          key: "plan"         },
] as const


const STATUS_ICONS = {
  pending:          { icon: Clock,        color: "#6b7280" },
  text_generating:  { icon: Loader,       color: "#0891b2" },
  image_generating: { icon: Loader,       color: "#7c3aed" },
  done:             { icon: CheckCircle, color: "#16a34a" },
  error:            { icon: AlertCircle, color: "#ef4444" },
}

// ─── キューパネル ─────────────────────────────────────────────────
function QueuePanel({ onClose, onSelectJob }: { onClose: () => void; onSelectJob: (job: GenerationJob) => void }) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [loading, setLoading] = useState(true)

  function formatElapsed(createdAt: string): string {
    const diff = (Date.now() - new Date(createdAt).getTime()) / 1000
    if (diff < 60)   return `${Math.floor(diff)}${t.queue.secAgo}`
    if (diff < 3600) return `${Math.floor(diff / 60)}${t.queue.minAgo}`
    return `${Math.floor(diff / 3600)}${t.queue.hrAgo}`
  }

  function getStatusLabel(status: keyof typeof STATUS_ICONS): string {
    switch (status) {
      case "pending":          return t.queue.statusPending
      case "text_generating":  return t.queue.statusTextGen
      case "image_generating": return t.queue.statusImageGen
      case "done":             return t.queue.statusDone
      case "error":            return t.queue.statusError
    }
  }

  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch("/api/v4/jobs")
      const d = await r.json() as { jobs?: GenerationJob[] }
      setJobs(d.jobs ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchJobs()
    // 処理中ジョブがあれば3秒ごとにポーリング
    const timer = setInterval(async () => {
      const r = await fetch("/api/v4/jobs")
      const d = await r.json() as { jobs?: GenerationJob[] }
      setJobs(d.jobs ?? [])
    }, 3000)
    return () => clearInterval(timer)
  }, [fetchJobs])

  const activeCount = jobs.filter(j => j.status === "pending" || j.status === "text_generating" || j.status === "image_generating").length

  return (
    <div
      className="fixed right-4 top-16 z-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 360, maxHeight: "80vh", background: "var(--card)", border: "1px solid var(--border)" }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--text)" }}>{t.queue.title}</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
              {activeCount}{t.queue.processing}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchJobs} className="p-1 rounded hover:opacity-70" title={t.queue.refresh}>
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
          </button>
        </div>
      </div>

      {/* ジョブ一覧 */}
      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            {t.queue.empty}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {jobs.map(job => {
              const cfg = STATUS_ICONS[job.status]
              const Icon = cfg.icon
              const label = getStatusLabel(job.status)
              const isActive = job.status === "text_generating" || job.status === "image_generating"
              const isDone = job.status === "done"
              return (
                <button
                  key={job.id}
                  type="button"
                  disabled={!isDone}
                  onClick={() => isDone && onSelectJob(job)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition-opacity"
                  style={{
                    opacity: 1,
                    cursor: isDone ? "pointer" : "default",
                    background: isDone ? "transparent" : "transparent",
                  }}
                  onMouseEnter={e => { if (isDone) (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-light)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon
                      className={`w-4 h-4 ${isActive ? "animate-spin" : ""}`}
                      style={{ color: cfg.color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${cfg.color}22`, color: cfg.color }}
                      >
                        {label}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {formatElapsed(job.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                      {job.personaName ?? job.personaId} — {job.postType}
                    </p>
                    {job.textResult?.generated.overallTitle && (
                      <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--muted)" }}>
                        {job.textResult.generated.overallTitle}
                      </p>
                    )}
                    {job.errorMessage && (
                      <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: "#ef4444" }}>
                        {job.errorMessage}
                      </p>
                    )}
                    {isDone && (
                      <p className="text-[10px] mt-0.5" style={{ color: "#16a34a" }}>
                        {t.queue.clickToView}
                      </p>
                    )}
                    {isDone && (() => {
                      // DB保存されたコスト or スライド数から推定
                      const cost = job.imageCost
                      if (cost) {
                        return (
                          <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--accent)" }}>
                            💴 {cost.jpy} / {cost.usd}
                          </p>
                        )
                      }
                      // フォールバック: スライド数から推定（DB保存前の旧ジョブ用）
                      const successCount = (job.imageUrls ?? []).filter(Boolean).length
                      if (successCount > 0) {
                        const hasProduct = job.postType === "product" || job.postType === "mixed"
                        const perCall = hasProduct ? 0.06 : 0.04
                        const estimatedJpy = Math.round(successCount * perCall * 155)
                        return (
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                            💴 約¥{estimatedJpy}〜（推定）
                          </p>
                        )
                      }
                      return null
                    })()}
                  </div>
                  {isDone && job.imageUrls && (
                    <div className="flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {job.imageUrls[0] && <img src={job.imageUrls[0]} alt="" className="w-10 rounded" style={{ aspectRatio: "3/4", objectFit: "cover" }} />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 結果モーダル（キューから開く） ──────────────────────────────
function JobResultModal({ job, onClose }: { job: GenerationJob; onClose: () => void }) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const [modalImgIdx, setModalImgIdx] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (modalImgIdx !== null) setModalImgIdx(null); else onClose() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, modalImgIdx])

  const slides = job.textResult?.generated.slides ?? []
  const imageUrls = job.imageUrls ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          width: "min(900px, 95vw)", maxHeight: "90vh",
          background: "var(--card)", border: "1px solid var(--border)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
              {job.personaName} — {job.postType}
            </p>
            <p className="font-bold text-sm mt-0.5" style={{ color: "var(--text)" }}>
              {job.textResult?.generated.overallTitle ?? ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X className="w-5 h-5" style={{ color: "var(--muted)" }} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {slides.map((slide, i) => (
            <div
              key={slide.slideNumber}
              className="rounded-xl p-3 flex gap-3 items-start"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              {/* サムネイル */}
              <button
                className="flex-shrink-0"
                style={{ width: 100 }}
                onClick={() => imageUrls[i] && setModalImgIdx(i)}
                disabled={!imageUrls[i]}
              >
                {imageUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrls[i]!}
                    alt={`slide ${slide.slideNumber}`}
                    className="w-full rounded-lg hover:opacity-90 cursor-zoom-in"
                    style={{ aspectRatio: "3/4", objectFit: "cover", border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div
                    className="w-full rounded-lg flex items-center justify-center"
                    style={{
                      aspectRatio: "3/4",
                      background: "var(--card)",
                      border: `1px dashed ${job.failedSlides?.includes(slide.slideNumber) ? "#ef4444" : "var(--border)"}`,
                    }}
                  >
                    {job.failedSlides?.includes(slide.slideNumber) ? (
                      <span style={{ fontSize: 18 }}>⚠️</span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{t.common.noImage}</span>
                    )}
                  </div>
                )}
              </button>
              {/* テキスト */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--accent)" }}>
                    {slide.slideNumber}
                  </span>
                  <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{slide.tag}</span>
                  {job.policyFallbackSlides?.includes(slide.slideNumber) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fb923c" }}>
                      {t.queue.simpleFallback}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{slide.headline}</p>
                {slide.bullets && slide.bullets.length > 0 && (
                  <ul className="text-[10px] space-y-0.5 list-disc list-inside" style={{ color: "var(--muted)" }}>
                    {slide.bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* フルスクリーン画像プレビュー */}
        {modalImgIdx !== null && imageUrls[modalImgIdx] && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
            style={{ background: "rgba(0,0,0,0.9)" }}
            onClick={() => setModalImgIdx(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[modalImgIdx]!}
              alt=""
              className="rounded-xl"
              style={{ maxHeight: "85vh", maxWidth: "min(420px, 85vw)", objectFit: "contain" }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── メインレイアウト ─────────────────────────────────────────────
export default function V4Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { lang, toggle } = useLanguage()
  const t = useT(lang)
  const [queueOpen, setQueueOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState<GenerationJob | null>(null)
  const [activeCount, setActiveCount] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const NAV = NAV_HREFS.map(n => ({ href: n.href, label: t.nav[n.key] }))

  // バッジ用: 処理中ジョブ数をポーリング
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/v4/jobs")
        const d = await r.json() as { jobs?: GenerationJob[] }
        const active = (d.jobs ?? []).filter(j =>
          j.status === "pending" || j.status === "text_generating" || j.status === "image_generating"
        ).length
        setActiveCount(active)
      } catch { /* silent */ }
    }
    poll()
    pollingRef.current = setInterval(poll, 5000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center flex-shrink-0">
            <Image
              src="/cocochi-logo.png"
              alt="COCOCHI"
              width={120}
              height={36}
              className="h-9 w-auto"
              priority
            />
          </div>

          <nav className="flex items-center gap-1 flex-1">
            {NAV.map(n => {
              const isActive = pathname.startsWith(n.href)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                  style={
                    isActive
                      ? { background: "var(--accent-light)", color: "var(--accent)", fontWeight: 700 }
                      : { color: "var(--text)" }
                  }
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          {/* 言語切り替えボタン */}
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0"
            style={{
              background: "var(--bg)",
              color: "var(--text)",
              border: "1.5px solid var(--border)",
            }}
            title={lang === "ja" ? "中文に切り替え" : "日本語に切り替え"}
          >
            <span style={{ opacity: lang === "ja" ? 1 : 0.4 }}>JA</span>
            <span style={{ color: "var(--border)" }}>|</span>
            <span style={{ opacity: lang === "zh" ? 1 : 0.4 }}>中</span>
          </button>

          {/* 生成キューボタン */}
          <button
            type="button"
            onClick={() => setQueueOpen(v => !v)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0"
            style={{
              background: queueOpen ? "var(--accent-light)" : "var(--bg)",
              color: queueOpen ? "var(--accent)" : "var(--text)",
              border: `1.5px solid ${queueOpen ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <ListOrdered className="w-4 h-4" />
            <span>{t.queue.title}</span>
            {activeCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                style={{ background: "#ef4444" }}
              >
                {activeCount}
              </span>
            )}
          </button>

        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* キューパネル */}
      {queueOpen && (
        <QueuePanel
          onClose={() => setQueueOpen(false)}
          onSelectJob={job => { setSelectedJob(job); setQueueOpen(false) }}
        />
      )}

      {/* 結果モーダル */}
      {selectedJob && (
        <JobResultModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  )
}
