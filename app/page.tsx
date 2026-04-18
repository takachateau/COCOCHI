"use client"

import { useState } from "react"
import Link from "next/link"
import { usePosts } from "@/context/posts"
import { Plus, Download, Trash2, Sparkles, ChevronDown, ChevronUp, X, RefreshCw, Package, Info, Copy, Check } from "lucide-react"
import type { Post, PostGroup, CostSummary } from "@/types"

const PATTERN_ICONS: Record<string, string> = {
  "エンタメ導入型": "🎬",
  "手持ちUGC型":   "🤳",
  "直置きUGC型":   "🛋️",
  "記事投稿型":    "📰",
}

function CostBadge({ cost }: { cost: CostSummary }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
      >
        <Info className="w-3 h-3" />
        <span className="font-bold">¥{cost.totalJpy.toLocaleString()}</span>
        <span style={{ color: "var(--muted)" }}>/ {cost.totalCny}元</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 rounded-xl p-4 shadow-xl text-xs space-y-2"
            style={{ background: "var(--card)", border: "1px solid var(--border)", minWidth: 240 }}
            onClick={e => e.stopPropagation()}
          >
            <p className="font-bold text-sm mb-3" style={{ color: "var(--text)" }}>原価内訳</p>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-4">
                <span style={{ color: "var(--muted)" }}>FAL画像生成</span>
                <span className="font-bold" style={{ color: "var(--text)" }}>
                  {cost.falImages}枚 × $0.0398 = ${cost.falUsd.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: "var(--muted)" }}>Claude API</span>
                <span className="font-bold" style={{ color: "var(--text)" }}>
                  ${cost.claudeUsd.toFixed(3)}
                  <span className="font-normal text-[10px] ml-1" style={{ color: "var(--muted)" }}>
                    ({cost.claudeInputTokens.toLocaleString()}in / {cost.claudeOutputTokens.toLocaleString()}out tok)
                  </span>
                </span>
              </div>
              {cost.removeBgJpy > 0 && (
                <div className="flex justify-between gap-4">
                  <span style={{ color: "var(--muted)" }}>remove.bg</span>
                  <span className="font-bold" style={{ color: "var(--text)" }}>¥{cost.removeBgJpy}</span>
                </div>
              )}
            </div>
            <div className="pt-2 mt-2 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex justify-between">
                <span className="font-bold" style={{ color: "var(--text)" }}>合計（円）</span>
                <span className="font-bold text-base" style={{ color: "var(--accent)" }}>¥{cost.totalJpy.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold" style={{ color: "var(--text)" }}>合計（元）</span>
                <span className="font-bold text-base" style={{ color: "var(--accent)" }}>{cost.totalCny}元</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                レート: $1 = ¥150 / ¥1 = 0.048元
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

async function downloadPost(post: Post, productName: string) {
  for (let i = 0; i < post.images.length; i++) {
    const img = post.images[i]
    if (!img) continue
    const res = await fetch(img)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${productName}_${post.patternName}_${i + 1}.jpg`
    a.click()
    URL.revokeObjectURL(url)
  }
}

// ジョブのポーリング → 完了したら updatedGroup を返す
async function pollJob(jobId: string, onProgress: (msg: string) => void): Promise<PostGroup> {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/generate/status/${jobId}`)
        const d = await r.json() as {
          status: string
          progress: string
          completedSlides: number
          totalSlides: number
          group?: PostGroup
          error?: string
        }
        onProgress(`${d.completedSlides}/${d.totalSlides}枚 再生成中...`)
        if (d.status === "done") {
          clearInterval(timer)
          resolve(d.group!)
        } else if (d.status === "error") {
          clearInterval(timer)
          reject(new Error(d.error ?? "再生成エラー"))
        }
      } catch { /* 一時失敗は無視 */ }
    }, 2000)
  })
}

// モーダル: 1パターンの5枚を大きく表示
function SlideModal({
  post, productName, groupId, onClose, onRegenDone,
}: {
  post: Post
  productName: string
  groupId: string
  onClose: () => void
  onRegenDone: (updated: PostGroup) => void
}) {
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [regenIdx, setRegenIdx] = useState<number | null>(null)   // 再生成中のスライドindex
  const [regenMsg, setRegenMsg] = useState("")
  const [captionCopied, setCaptionCopied] = useState(false)

  async function handleRegenSlide(slideIndex: number) {
    if (regenIdx !== null) return
    setRegenIdx(slideIndex)
    setRegenMsg("開始中...")
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, postId: post.id, slideIndex }),
      })
      const { jobId, error } = await res.json()
      if (error) throw new Error(error)
      const updated = await pollJob(jobId, setRegenMsg)
      onRegenDone(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : "再生成に失敗しました")
    } finally {
      setRegenIdx(null)
      setRegenMsg("")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl overflow-auto max-h-[90vh] w-full max-w-2xl p-6 space-y-4"
        style={{ background: "var(--card)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 画像フルスクリーンプレビュー（モーダル内） */}
        {previewImg && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
            style={{ background: "rgba(0,0,0,0.9)" }}
            onClick={() => setPreviewImg(null)}
          >
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImg}
              alt="プレビュー"
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
              {PATTERN_ICONS[post.patternName]} {post.patternName} / {post.angle}
            </p>
            <h2 className="text-base font-bold mt-0.5" style={{ color: "var(--text)" }}>{post.overallTitle}</h2>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => downloadPost(post, productName)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <Download className="w-3 h-3" />
              全DL
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
            </button>
          </div>
        </div>

        {/* 5枚グリッド（クリックでその場プレビュー、↻で1枚再生成） */}
        <div className="grid grid-cols-5 gap-2">
          {post.images.map((img, i) => {
            const isRegening = regenIdx === i
            return (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden group"
                style={{ border: "1px solid var(--border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img || undefined}
                  alt={`slide ${i + 1}`}
                  className="w-full h-auto cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => img && setPreviewImg(img)}
                />
                {/* 再生成ボタン（ホバーで表示） */}
                <button
                  onClick={e => { e.stopPropagation(); handleRegenSlide(i) }}
                  disabled={regenIdx !== null}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                  title={`スライド${i + 1}を再生成`}
                >
                  <RefreshCw className={`w-3 h-3 ${isRegening ? "animate-spin" : ""}`} />
                </button>
                {/* 再生成中オーバーレイ */}
                {isRegening && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg" style={{ background: "rgba(0,0,0,0.55)" }}>
                    <RefreshCw className="w-4 h-4 text-white animate-spin mb-1" />
                    <p className="text-white text-[9px] text-center px-1">{regenMsg}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* スライド内容一覧（全文表示） */}
        <div className="space-y-2">
          {post.slides.map(s => (
            <div key={s.slideNumber} className="flex gap-3 text-xs" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <span className="font-bold w-4 flex-shrink-0" style={{ color: "var(--accent)" }}>{s.slideNumber}</span>
              <div className="min-w-0">
                <p className="font-bold" style={{ color: "var(--text)" }}>{s.tag}</p>
                <p style={{ color: "var(--muted)" }}>{s.headline.replace(/\\n/g, " / ")}</p>
                {s.bullets && <p style={{ color: "var(--muted)" }}>{s.bullets.join(" | ")}</p>}
                {s.accent && <p style={{ color: "var(--accent)" }}>{s.accent}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* キャプション */}
        {post.caption && (
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>📝 キャプション</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(post.caption!)
                  setCaptionCopied(true)
                  setTimeout(() => setCaptionCopied(false), 2000)
                }}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-bold transition-colors"
                style={{
                  background: captionCopied ? "var(--accent)" : "var(--accent-light)",
                  color: captionCopied ? "white" : "var(--accent)",
                }}
              >
                {captionCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {captionCopied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--muted)" }}>
              {post.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// 行コンポーネント（1商品 = 1 PostGroup）
function GroupRow({ group, index, onRemove, onGroupUpdate }: {
  group: PostGroup
  index: number
  onRemove: () => void
  onGroupUpdate: (g: PostGroup) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<Post | null>(null)
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)

  // 一括再生成
  const [bulkRegen, setBulkRegen] = useState(false)
  const [bulkMsg, setBulkMsg] = useState("")

  // 1枚再生成（展開パネル用）
  const [regenKey, setRegenKey] = useState<string | null>(null) // "postId-slideIndex"
  const [slideMsg, setSlideMsg] = useState("")

  // 追加指示文
  const [instruction, setInstruction] = useState("")

  const date = new Date(group.createdAt).toLocaleDateString("ja-JP", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })

  async function handleBulkRegen() {
    if (bulkRegen) return
    if (!group.productImageUrl) {
      alert("この投稿は再生成できません（商品画像URLが保存されていません）")
      return
    }
    setBulkRegen(true)
    setBulkMsg("開始中...")
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, instruction: instruction || undefined }),
      })
      const { jobId, error } = await res.json()
      if (error) throw new Error(error)
      const updated = await pollJob(jobId, setBulkMsg)
      onGroupUpdate(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : "再生成に失敗しました")
    } finally {
      setBulkRegen(false)
      setBulkMsg("")
    }
  }

  async function handleSlideRegen(postId: string, slideIndex: number) {
    if (regenKey) return
    if (!group.productImageUrl) {
      alert("この投稿は再生成できません（商品画像URLが保存されていません）")
      return
    }
    const key = `${postId}-${slideIndex}`
    setRegenKey(key)
    setSlideMsg("開始中...")
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, postId, slideIndex, instruction: instruction || undefined }),
      })
      const { jobId, error } = await res.json()
      if (error) throw new Error(error)
      const updated = await pollJob(jobId, setSlideMsg)
      onGroupUpdate(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : "再生成に失敗しました")
    } finally {
      setRegenKey(null)
      setSlideMsg("")
    }
  }

  return (
    <>
      {modal && (
        <SlideModal
          post={modal}
          productName={group.productName}
          groupId={group.id}
          onClose={() => setModal(null)}
          onRegenDone={updated => { onGroupUpdate(updated); setModal(null) }}
        />
      )}

      {/* 展開パネル内フルスクリーンプレビュー */}
      {expandedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setExpandedPreview(null)}
        >
          <button
            onClick={() => setExpandedPreview(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expandedPreview}
            alt="プレビュー"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* 一括再生成中オーバーレイ */}
      {bulkRegen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div className="rounded-2xl p-8 flex flex-col items-center gap-4" style={{ background: "var(--card)", minWidth: 260 }}>
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>一括再生成中</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{bulkMsg}</p>
          </div>
        </div>
      )}

      {/* メイン行 */}
      <div
        className="border-t"
        style={{ borderColor: "var(--border)", background: index % 2 === 0 ? "var(--card)" : "var(--bg)" }}
      >
        {/* 上段: No. / 商品名+日時 / ボタン群 */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <span className="text-sm font-bold w-6 flex-shrink-0 text-right" style={{ color: "var(--muted)" }}>{index + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>{group.productName}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{date}</p>
          </div>
          {/* 原価 */}
          {group.costSummary && <CostBadge cost={group.costSummary} />}

          {/* 一括再生成 */}
          <button
            onClick={handleBulkRegen}
            disabled={bulkRegen || !!regenKey}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-70 whitespace-nowrap disabled:opacity-40 flex-shrink-0"
            style={{ color: "var(--accent)", background: "var(--accent-light)", border: "1px solid var(--accent)" }}
          >
            <RefreshCw className={`w-3 h-3 ${bulkRegen ? "animate-spin" : ""}`} />
            一括再生成
          </button>
          {/* 詳細 */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-70 whitespace-nowrap flex-shrink-0"
            style={{ color: "var(--accent)", background: "var(--accent-light)" }}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "閉じる" : "詳細"}
          </button>
          {/* 削除 */}
          <button
            onClick={onRemove}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
            style={{ color: "var(--muted)" }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* 下段: 4パターンのサムネ */}
        <div className="flex gap-3 px-5 pb-3" style={{ overflowX: "auto" }}>
          {group.posts.map(post => (
            <button
              key={post.id}
              onClick={() => setModal(post)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:opacity-80 transition-opacity text-left flex-shrink-0"
              style={{ background: "var(--accent-light)", border: "1px solid var(--border)", minWidth: 180 }}
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.images[0] || undefined} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                  {PATTERN_ICONS[post.patternName]} {post.patternName}
                </p>
                <p className="text-xs truncate font-medium" style={{ color: "var(--text)", maxWidth: 120 }}>{post.overallTitle}</p>
                <p className="text-xs truncate" style={{ color: "var(--muted)", maxWidth: 120 }}>{post.angle}</p>
              </div>
            </button>
          ))}
        </div>

        {/* 展開パネル: 全スライド一覧 */}
        {expanded && (
          <div className="px-5 pb-5 space-y-5 border-t" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            {/* 追加指示文 */}
            <div className="pt-4 flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>
                  再生成時の追加指示（任意）
                </label>
                <input
                  type="text"
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  placeholder="例: もっと明るいトーンで / 商品を大きく映して / 桜の背景を入れて"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                />
              </div>
            </div>
            {group.posts.map(post => (
              <div key={post.id}>
                <div className="flex items-center justify-between py-3">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {PATTERN_ICONS[post.patternName]} {post.patternName} —{" "}
                    <span style={{ color: "var(--accent)" }}>{post.overallTitle}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadPost(post, group.productName)}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold hover:opacity-80"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                    >
                      <Download className="w-3 h-3" />
                      5枚DL
                    </button>
                  </div>
                </div>
                {/* 画像グリッド: 縦横比そのまま表示＋↻ボタン */}
                <div className="grid grid-cols-5 gap-2 items-start">
                  {post.images.map((img, i) => {
                    const key = `${post.id}-${i}`
                    const isRegening = regenKey === key
                    return (
                      <div
                        key={i}
                        className="relative rounded-xl overflow-hidden group"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img || undefined}
                          alt={`slide ${i + 1}`}
                          className="w-full h-auto cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => img && setExpandedPreview(img)}
                        />
                        {/* 1枚再生成ボタン */}
                        <button
                          onClick={e => { e.stopPropagation(); handleSlideRegen(post.id, i) }}
                          disabled={!!regenKey || bulkRegen}
                          className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                          style={{ background: "rgba(0,0,0,0.65)" }}
                          title={`スライド${i + 1}を再生成`}
                        >
                          <RefreshCw className={`w-3 h-3 ${isRegening ? "animate-spin" : ""}`} />
                        </button>
                        {/* 再生成中オーバーレイ */}
                        {isRegening && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
                            <RefreshCw className="w-4 h-4 text-white animate-spin mb-1" />
                            <p className="text-white text-[9px] text-center px-1 leading-tight">{slideMsg}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* キャプション（展開パネル内） */}
                {post.caption && (
                  <div
                    className="mt-2 rounded-xl p-3"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>📝 キャプション</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(post.caption!)
                          setCopiedPostId(post.id)
                          setTimeout(() => setCopiedPostId(null), 2000)
                        }}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-bold transition-colors"
                        style={{
                          background: copiedPostId === post.id ? "var(--accent)" : "var(--accent-light)",
                          color: copiedPostId === post.id ? "white" : "var(--accent)",
                        }}
                      >
                        {copiedPostId === post.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedPostId === post.id ? "コピーしました" : "コピー"}
                      </button>
                    </div>
                    <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--muted)" }}>
                      {post.caption}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default function Dashboard() {
  const { groups, loading, removeGroup, updateGroup } = usePosts()

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base" style={{ color: "var(--text)" }}>COCOCHI</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              投稿管理ツール
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {groups.length} 商品 / {groups.reduce((sum, g) => sum + g.posts.length, 0)} 投稿
            </span>
            <Link
              href="/products"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              <Package className="w-4 h-4" />
              商品管理
            </Link>
            <Link
              href="/generate"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-85"
              style={{ background: "var(--accent)" }}
            >
              <Plus className="w-4 h-4" />
              新規生成
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "var(--accent-light)" }}>
              <Sparkles className="w-8 h-8" style={{ color: "var(--accent)" }} />
            </div>
            <p className="text-base font-medium" style={{ color: "var(--muted)" }}>まだ投稿がありません</p>
            <Link
              href="/generate"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              <Plus className="w-4 h-4" />
              最初の投稿を生成する
            </Link>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {/* テーブルヘッダー */}
            <div
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <span className="w-6 text-right flex-shrink-0">#</span>
              <span className="flex-1">商品名 / パターン（クリックで詳細確認）</span>
            </div>

            {groups.map((group, i) => (
              <GroupRow
                key={group.id}
                group={group}
                index={i}
                onRemove={() => removeGroup(group.id)}
                onGroupUpdate={updateGroup}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
