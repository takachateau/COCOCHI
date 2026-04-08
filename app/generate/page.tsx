"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Upload, Sparkles, ArrowLeft, Download, Save, Package, ChevronRight, X } from "lucide-react"
import { usePosts } from "@/context/posts"
import { useProducts } from "@/context/products"
import type { PostGroup, ProductInput, Product } from "@/types"

const PATTERN_ICONS: Record<string, string> = {
  "商品切り抜き型": "🎨",
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
      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
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
  const [efficacy, setEfficacy]         = useState("")
  const [howToUse, setHowToUse]         = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64]   = useState("")
  const [imageMime, setImageMime]       = useState("image/jpeg")
  const fileRef = useRef<HTMLInputElement>(null)

  // アピール設定（両モード共通）
  const [ageGroup, setAgeGroup]         = useState("")
  const [skinType, setSkinType]         = useState("")
  const [appealDir, setAppealDir]       = useState("")

  // IP-Adapter 設定
  const [useIPAdapter, setUseIPAdapter]     = useState(false)
  const [ipAdapterScale, setIpAdapterScale] = useState(0.65)

  // 生成状態
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError]       = useState<string | null>(null)
  const [group, setGroup]       = useState<PostGroup | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)

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

  function buildTarget(): string {
    return [
      ageGroup    && `年齢層: ${ageGroup}`,
      skinType    && `肌質: ${skinType}`,
      appealDir   && `アピール方向性: ${appealDir}`,
    ].filter(Boolean).join("、")
  }

  async function handleGenerate() {
    const name  = mode === "registered" ? selectedProduct?.name ?? "" : productName
    const eff   = mode === "registered" ? selectedProduct?.efficacy ?? "" : efficacy
    const how   = mode === "registered" ? selectedProduct?.howToUse ?? "" : howToUse

    if (mode === "registered" && !selectedProduct) {
      setError("商品を選択してください")
      return
    }
    if (mode === "manual" && (!name || !eff || !how || !imageBase64)) {
      setError("商品名・効能・使い方・商品画像はすべて必須です")
      return
    }
    if (loadingProduct) return

    setLoading(true)
    setError(null)
    setGroup(null)
    setProgress("生成を開始しています...")

    try {
      const body: ProductInput = {
        productName: name,
        efficacy: eff,
        howToUse: how,
        price: mode === "registered" ? (selectedProduct?.price ?? undefined) : undefined,
        target: buildTarget() || undefined,
        productImageBase64: imageBase64,
        productImageMime: imageMime,
        useIPAdapter: useIPAdapter || undefined,
        ipAdapterScale: useIPAdapter ? ipAdapterScale : undefined,
      }

      const startRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const startData = await startRes.json()
      if (!startRes.ok || startData.error) throw new Error(startData.error ?? "開始エラー")
      const { jobId } = startData as { jobId: string }

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/api/generate/status/${jobId}`)
            const d = await r.json() as {
              status: string
              completedSlides: number
              totalSlides: number
              group?: PostGroup
              error?: string
            }
            setProgress(`${d.completedSlides}/${d.totalSlides}枚 生成中...`)
            if (d.status === "done") { clearInterval(poll); setGroup(d.group!); resolve() }
            else if (d.status === "error") { clearInterval(poll); reject(new Error(d.error ?? "生成エラー")) }
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
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-3">
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

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <div className={`flex gap-8 ${group ? "items-start" : "justify-center"}`}>

          {/* ── 入力パネル ── */}
          <div className="space-y-4 flex-shrink-0 w-full max-w-sm">

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
                  { label: "効能・特徴", value: efficacy, set: setEfficacy, ph: "例: サリチル酸配合で毛穴の黒ずみをケア...", rows: 3, req: true },
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

            {/* ── アピール設定（共通・任意） ── */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                アピール設定 <span className="font-normal" style={{ color: "var(--muted)" }}>（任意）</span>
              </p>
              {[
                { label: "年齢層", value: ageGroup, set: setAgeGroup, ph: "例: 20〜30代" },
                { label: "肌質", value: skinType, set: setSkinType, ph: "例: 脂性肌・毛穴が気になる" },
                { label: "アピール方向性", value: appealDir, set: setAppealDir, ph: "例: 成分重視、ナチュラル志向" },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    className="w-full px-3 py-2 rounded-lg border text-xs outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
              ))}
            </div>

            {/* ── IP-Adapter 設定 ── */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    IP-Adapter スタイル転写
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    参照画像の色調・雰囲気をUGCに転写（β）
                  </p>
                </div>
                <button
                  onClick={() => setUseIPAdapter(v => !v)}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                  style={{ background: useIPAdapter ? "var(--accent)" : "var(--border)" }}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                    style={{ transform: useIPAdapter ? "translateX(22px)" : "translateX(2px)" }}
                  />
                </button>
              </div>
              {useIPAdapter && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs" style={{ color: "var(--muted)" }}>スタイル強度</label>
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                      {Math.round(ipAdapterScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={ipAdapterScale}
                    onChange={e => setIpAdapterScale(Number(e.target.value))}
                    className="w-full accent-pink-400"
                  />
                  <div className="flex justify-between text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    <span>弱（忠実に商品を）</span>
                    <span>強（スタイルに寄せる）</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || loadingProduct}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {progress}
                </>
              ) : loadingProduct ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  画像を読み込み中...
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
                            {PATTERN_ICONS[post.patternName]} {post.patternName}
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

                    <div className="flex gap-3">
                      <div
                        className="rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                        style={{ width: 180, aspectRatio: "1/1", border: "1px solid var(--border)", background: "var(--accent-light)" }}
                      >
                        {post.images[0] ? (
                          <div className="w-full h-full cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImg(post.images[0])}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={post.images[0]} alt="表紙" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <span className="text-xs text-center px-2" style={{ color: "var(--muted)" }}>生成中...</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 flex-1">
                        <div className="grid grid-cols-4 gap-2">
                          {post.images.slice(1).map((img, i) => (
                            <div
                              key={i}
                              className="rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ aspectRatio: "1/1", border: "1px solid var(--border)" }}
                              onClick={() => setPreviewImg(img)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt={`slide ${i + 2}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {post.slides.slice(1).map(s => (
                            <p key={s.slideNumber} className="text-xs truncate text-center" style={{ color: "var(--muted)" }}>
                              {s.accent ?? s.tag}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
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
