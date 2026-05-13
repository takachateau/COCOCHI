"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Upload, Sparkles, ArrowLeft, Download, Save, Package, ChevronRight, X, Shuffle } from "lucide-react"
import { usePosts } from "@/context/posts"
import { useProducts } from "@/context/products"
import type { PostGroup, ProductInput, Product } from "@/types"

// パターン定義（route.ts の PATTERN_NAMES / PATTERN_ANGLE_POOLS と必ず一致させること）
const ALL_PATTERNS = ["エンタメ導入型", "手持ちUGC型", "直置きUGC型", "記事投稿型"] as const
type PatternName = typeof ALL_PATTERNS[number]

const PATTERN_ANGLE_POOLS: Record<PatternName, string[]> = {
  "エンタメ導入型": ["感情体験", "共感・あるある", "ギャップ体験", "衝撃告白"],
  "手持ちUGC型":   ["ビフォーアフター", "継続結果レポ", "正直レビュー", "周りの反応"],
  "直置きUGC型":   ["ルーティン紹介", "時短・ズボラ", "シーン訴求", "映え・世界観"],
  "記事投稿型":    ["成分・効果", "皮膚科目線", "他社比較", "ハウツー解説"],
}

interface Slot { pattern: PatternName; angle: string }

function randomSlot(pattern: PatternName): Slot {
  const pool = PATTERN_ANGLE_POOLS[pattern]
  return { pattern, angle: pool[Math.floor(Math.random() * pool.length)] }
}

function randomSlots(): Slot[] {
  return ALL_PATTERNS.map(randomSlot)
}

const PATTERN_ICONS: Record<PatternName, string> = {
  "エンタメ導入型": "🎬",
  "手持ちUGC型":   "🤳",
  "直置きUGC型":   "🛋️",
  "記事投稿型":    "📰",
}

/** Blob URLの画像をfetchしてbase64に変換 */
async function urlToBase64(url: string): Promise<{ base64: string; mime: string }> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      resolve({ base64: dataUrl.split(",")[1] ?? "", mime: blob.type || "image/jpeg" })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── 登録商品選択パネル ──────────────────────────────────────────────

function ProductSelector({
  selected,
  onSelect,
  onManage,
}: {
  selected: Product | null
  onSelect: (p: Product) => void
  onManage: () => void
}) {
  const { products, loading } = useProducts()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Package className="w-10 h-10" style={{ color: "var(--border)" }} />
        <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
          まだ商品が登録されていません
        </p>
        <button
          onClick={onManage}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          <Package className="w-4 h-4" />
          商品を登録する
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted)" }}>クリックして選択</p>
        <button
          onClick={onManage}
          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          <Package className="w-3.5 h-3.5" />
          商品管理
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
        {products.map(p => {
          const isSelected = selected?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="rounded-xl overflow-hidden text-left transition-all"
              style={{
                border: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                background: "var(--card)",
                outline: isSelected ? "none" : undefined,
                boxShadow: isSelected ? "0 0 0 2px var(--accent-light)" : "none",
              }}
            >
              <div style={{ aspectRatio: "1/1", background: "var(--accent-light)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain p-1" />
              </div>
              <div className="px-2 py-1.5">
                <p className="text-xs font-bold truncate" style={{ color: isSelected ? "var(--accent)" : "var(--text)" }}>
                  {isSelected && "✓ "}{p.name}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── メインページ ─────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter()
  const { addGroup } = usePosts()

  // モード: "registered" = 登録商品から選択 / "manual" = 手動入力
  const [mode, setMode] = useState<"registered" | "manual">("registered")

  // 登録商品モード
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [loadingProduct, setLoadingProduct]   = useState(false)

  // 手動入力モード
  const [productName, setProductName]   = useState("")
  const [ingredients, setIngredients]   = useState("")
  const [howToUse, setHowToUse]         = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64]   = useState("")
  const [imageMime, setImageMime]       = useState("image/jpeg")
  const fileRef = useRef<HTMLInputElement>(null)

  // スロット設定（両モード共通）
  const [target, setTarget] = useState("")
  const [slots, setSlots]   = useState<Slot[]>(randomSlots)

  // 生成状態
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState("")
  const [completedSlides, setCompletedSlides] = useState(0)
  const [totalSlides, setTotalSlides]         = useState(20)
  const [startTime, setStartTime]             = useState<number | null>(null)
  const [elapsed, setElapsed]                 = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [group, setGroup]       = useState<PostGroup | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null)

  // 経過時間タイマー
  useEffect(() => {
    if (loading && startTime) {
      elapsedTimerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)
    } else {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      if (!loading) setElapsed(0)
    }
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current) }
  }, [loading, startTime])

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageMime(file.type || "image/jpeg")
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(",")[1] ?? "")
    }
    reader.readAsDataURL(file)
  }

  async function handleSelectProduct(p: Product) {
    setSelectedProduct(p)
    setLoadingProduct(true)
    try {
      const { base64, mime } = await urlToBase64(p.imageUrl)
      setImageBase64(base64)
      setImageMime(mime)
      setImagePreview(p.imageUrl)
    } catch {
      setError("商品画像の読み込みに失敗しました")
    } finally {
      setLoadingProduct(false)
    }
  }

  async function handleGenerate() {
    const name  = mode === "registered" ? selectedProduct?.name ?? "" : productName
    const ing   = mode === "registered" ? (selectedProduct?.ingredients ?? selectedProduct?.efficacy ?? "") : ingredients
    const how   = mode === "registered" ? selectedProduct?.howToUse ?? "" : howToUse

    if (mode === "registered" && !selectedProduct) {
      setError("商品を選択してください")
      return
    }
    if (mode === "manual" && (!name || !ing || !how || !imageBase64)) {
      setError("商品名・成分・使い方・商品画像はすべて必須です")
      return
    }
    if (loadingProduct) return

    setLoading(true)
    setError(null)
    setGroup(null)
    setProgress("生成を開始しています...")
    setCompletedSlides(0)
    setTotalSlides(20)
    setStartTime(null)
    setElapsed(0)

    try {
      const body: ProductInput = {
        productName: name,
        ingredients: ing,
        howToUse: how,
        price: mode === "registered" ? (selectedProduct?.price ?? undefined) : undefined,
        appealPoints: mode === "registered" ? (selectedProduct?.appealPoints ?? undefined) : undefined,
        forbiddenWords: mode === "registered" ? (selectedProduct?.forbiddenWords ?? undefined) : undefined,
        pdfText: mode === "registered" ? (selectedProduct?.pdfText ?? undefined) : undefined,
        target: target || undefined,
        slots,
        productImageBase64: imageBase64,
        productImageMime: imageMime,
      }

      // 1. ジョブIDを取得（バリデーション込み）
      const startRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const startData = await startRes.json()
      if (!startRes.ok || startData.error) throw new Error(startData.error ?? "開始エラー")
      const { jobId } = startData as { jobId: string }

      // 2. 画像生成を開始（fire-and-forget）
      // /api/generate/run はレスポンスを返すまで Vercel が関数を維持し続けるため、
      // クライアントが接続を切っても maxDuration=300 の範囲で処理が継続される
      fetch("/api/generate/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, body }),
      }).catch(() => { /* エラーはステータスポーリングで検知 */ })

      await new Promise<void>((resolve, reject) => {
        // 9分でタイムアウト（maxDuration=300秒 + バッファ）
        const timeout = setTimeout(() => {
          clearInterval(poll)
          reject(new Error("タイムアウト: 生成処理に時間がかかっています。ページをリロードして管理画面を確認してください。"))
        }, 9 * 60 * 1000)

        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/api/generate/status/${jobId}`)
            const d = await r.json() as {
              status: string
              progress: string
              completedSlides: number
              totalSlides: number
              startTime?: number
              group?: PostGroup
              error?: string
            }
            setProgress(d.progress ?? "")
            setCompletedSlides(d.completedSlides)
            setTotalSlides(d.totalSlides)
            if (d.startTime) setStartTime(d.startTime)
            if (d.status === "done") {
              clearInterval(poll)
              clearTimeout(timeout)
              if (!d.group) { reject(new Error("生成結果を取得できませんでした。もう一度お試しください。")); return }
              setGroup(d.group)
              resolve()
            } else if (d.status === "error") {
              clearInterval(poll)
              clearTimeout(timeout)
              reject(new Error(d.error ?? "生成エラー"))
            }
          } catch { /* 一時失敗は無視 */ }
        }, 3000)
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました")
    } finally {
      setLoading(false)
      setProgress("")
    }
  }

  function handleSave() {
    if (!group) return
    addGroup(group)
    router.push("/")
  }

  async function downloadPost(postIdx: number) {
    if (!group) return
    const post = group.posts[postIdx]
    for (let i = 0; i < post.images.length; i++) {
      const res = await fetch(post.images[i])
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${group.productName}_${post.patternName}_${i + 1}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const currentProductName = mode === "registered" ? (selectedProduct?.name ?? "") : productName

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* フルスクリーンプレビューモーダル */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setPreviewImg(null)}
        >
          <button
            onClick={() => setPreviewImg(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl transition-opacity hover:opacity-70"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImg}
            alt="プレビュー"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            ダッシュボード
          </button>
          <span style={{ color: "var(--border)" }}>|</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>新規投稿を生成</span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8 ${group ? "lg:items-start" : "lg:justify-center"}`}>

          {/* ── 入力パネル ── */}
          <div className="space-y-4 w-full lg:flex-shrink-0 lg:w-80 xl:w-96">

            {/* モード切替タブ */}
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              {(["registered", "manual"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null) }}
                  className="flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{
                    background: mode === m ? "var(--accent)" : "var(--card)",
                    color: mode === m ? "white" : "var(--muted)",
                  }}
                >
                  {m === "registered" ? <><Package className="w-3.5 h-3.5" />登録商品から選ぶ</> : <><Upload className="w-3.5 h-3.5" />手動で入力</>}
                </button>
              ))}
            </div>

            {/* ── 登録商品モード ── */}
            {mode === "registered" && (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <ProductSelector
                  selected={selectedProduct}
                  onSelect={handleSelectProduct}
                  onManage={() => router.push("/products")}
                />
                {selectedProduct && (
                  <div
                    className="rounded-lg p-3 flex items-start gap-3"
                    style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "var(--bg)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedProduct.imageUrl} alt="" className="w-full h-full object-contain p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>{selectedProduct.name}</p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--muted)" }}>{selectedProduct.efficacy}</p>
                    </div>
                    <button onClick={() => { setSelectedProduct(null); setImageBase64(""); setImagePreview(null) }}>
                      <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── 手動入力モード ── */}
            {mode === "manual" && (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                {/* 商品画像 */}
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
                    商品画像 <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="relative border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-center overflow-hidden"
                    style={{
                      height: 120,
                      borderColor: imagePreview ? "var(--accent)" : "var(--border)",
                      background: "var(--accent-light)",
                    }}
                  >
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt="" className="h-full w-full object-contain p-2" />
                    ) : (
                      <div className="text-center">
                        <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--accent)" }} />
                        <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>クリックしてアップロード</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>JPG / PNG</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                </div>

                {[
                  { label: "商品名", value: productName, set: setProductName, ph: "例: 22:00 アネトス クレンジングウォーター", rows: 1, req: true },
                  { label: "成分表とその効能", value: ingredients, set: setIngredients, ph: "例: サリチル酸（BHA）で毛穴ケア、セラミドNPで肌バリア補強...", rows: 4, req: true },
                  { label: "使い方", value: howToUse, set: setHowToUse, ph: "例: コットンに染み込ませて拭き取る", rows: 2, req: true },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
                      {f.label} {f.req && <span style={{ color: "var(--accent)" }}>*</span>}
                    </label>
                    {f.rows === 1 ? (
                      <input
                        type="text"
                        value={f.value}
                        onChange={e => f.set(e.target.value)}
                        placeholder={f.ph}
                        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                    ) : (
                      <textarea
                        value={f.value}
                        onChange={e => f.set(e.target.value)}
                        placeholder={f.ph}
                        rows={f.rows}
                        className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── 投稿スロット設定 ── */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* ターゲット */}
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>ターゲット層（任意）</label>
                <input
                  type="text"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="例: 20〜30代・脂性肌・毛穴が気になる"
                  className="w-full px-3 py-2 rounded-lg border text-xs outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>

              {/* スロット設定 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                    投稿スロット（4枠）
                  </label>
                  <button
                    type="button"
                    onClick={() => setSlots(randomSlots())}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    <Shuffle className="w-3 h-3" />
                    全てシャッフル
                  </button>
                </div>

                <div className="space-y-2">
                  {slots.map((slot, i) => (
                    <div
                      key={i}
                      className="rounded-lg p-2.5 space-y-1.5"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    >
                      {/* スロットヘッダー */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                          スロット {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...slots]
                            next[i] = randomSlot(slot.pattern)
                            setSlots(next)
                          }}
                          className="text-xs px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
                          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                        >
                          <Shuffle className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 大分類（パターン）プルダウン */}
                      <div>
                        <label className="block text-xs mb-0.5" style={{ color: "var(--muted)", fontSize: "10px" }}>
                          大分類（パターン）
                        </label>
                        <select
                          value={slot.pattern}
                          onChange={e => {
                            const pattern = e.target.value as PatternName
                            const next = [...slots]
                            next[i] = { pattern, angle: PATTERN_ANGLE_POOLS[pattern][0] }
                            setSlots(next)
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                        >
                          {ALL_PATTERNS.map(p => (
                            <option key={p} value={p}>
                              {PATTERN_ICONS[p]} {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 中分類（訴求角度）プルダウン */}
                      <div>
                        <label className="block text-xs mb-0.5" style={{ color: "var(--muted)", fontSize: "10px" }}>
                          中分類（訴求角度）
                        </label>
                        <select
                          value={slot.angle}
                          onChange={e => {
                            const next = [...slots]
                            next[i] = { ...next[i], angle: e.target.value }
                            setSlots(next)
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                        >
                          {PATTERN_ANGLE_POOLS[slot.pattern].map(a => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  同じパターンを複数スロットに設定できます
                </p>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* プログレスバー（生成中のみ表示） */}
            {loading && (
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{progress}</p>
                  <p className="text-xs font-mono tabular-nums" style={{ color: "var(--muted)" }}>
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                  </p>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${totalSlides > 0 ? Math.round((completedSlides / totalSlides) * 100) : 0}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
                  {completedSlides} / {totalSlides} 枚完了
                </p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || loadingProduct}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {loadingProduct ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  画像を読み込み中...
                </>
              ) : loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  4パターンを一括生成
                </>
              )}
            </button>
          </div>

          {/* ── 生成結果: 4パターン ── */}
          {group && (
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{group.productName}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>4パターン生成完了 — クリックで拡大プレビュー</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border disabled:opacity-60"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-light)" }}
                  >
                    <Sparkles className="w-3 h-3" />
                    再生成
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-80"
                    style={{ background: "var(--accent)" }}
                  >
                    <Save className="w-3 h-3" />
                    保存して管理画面へ
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {group.posts.map((post, pi) => (
                  <div
                    key={post.id}
                    className="rounded-2xl p-5 space-y-4"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                            {PATTERN_ICONS[post.patternName as PatternName] ?? ""} {post.patternName}
                          </span>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>{post.angle}</span>
                        </div>
                        <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{post.overallTitle}</h3>
                      </div>
                      <button
                        onClick={() => downloadPost(pi)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        <Download className="w-3 h-3" />
                        5枚DL
                      </button>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {post.images.map((img, i) => (
                        <div
                          key={i}
                          className="rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ aspectRatio: "3/4", border: "1px solid var(--border)", background: "var(--accent-light)" }}
                          onClick={() => img && setPreviewImg(img)}
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={`slide ${i + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-center px-2 flex items-center justify-center h-full" style={{ color: "var(--muted)" }}>生成中...</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* キャプション */}
                    {post.caption && (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold" style={{ color: "var(--text)" }}>キャプション</p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(post.caption!)
                              setCopiedPostId(post.id)
                              setTimeout(() => setCopiedPostId(null), 2000)
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg font-bold transition-colors"
                            style={{
                              background: copiedPostId === post.id ? "var(--accent)" : "var(--accent-light)",
                              color: copiedPostId === post.id ? "white" : "var(--accent)",
                            }}
                          >
                            {copiedPostId === post.id ? "コピーしました ✓" : "コピー"}
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
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
