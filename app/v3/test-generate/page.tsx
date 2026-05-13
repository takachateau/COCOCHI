"use client"

import { useState, useEffect, useCallback } from "react"
import { Sparkles, Image as ImageIcon, AlertCircle, RefreshCw, X, ChevronLeft, ChevronRight } from "lucide-react"
import type {
  Persona,
  BenchmarkPost,
  PostType,
  GeneratedPostText,
  HookType,
  StructureType,
  CompositionType,
} from "@/types/v2"
import type { Product } from "@/types"

interface Types {
  hookType: HookType
  structureType: StructureType
  compositionType: CompositionType
}

const POST_TYPE_LABELS: Record<PostType, string> = {
  tips:    "Tips",
  product: "商品紹介 (product)",
  mixed:   "混合 (mixed)",
}

const HOOK_LABELS: Record<HookType, string> = {
  F1: "F1 自己同一化",
  F2: "F2 数字n選",
  F3: "F3 逆張り",
  F4: "F4 危機煽り",
  F5: "F5 即効ベネ",
}
const STRUCTURE_LABELS: Record<StructureType, string> = {
  S1: "S1 フル装備",
  S2: "S2 最短",
  S3: "S3 共感型",
  S4: "S4 カタログ",
  S5: "S5 証拠先導",
}
const COMPOSITION_LABELS: Record<CompositionType, string> = {
  C1: "C1 テキスト主体",
  C2: "C2 写真メイン",
  C3: "C3 表リスト",
  C4: "C4 B/A比較",
  C5: "C5 ムード重視",
}

type Phase = "idle" | "text" | "image" | "done"

export default function TestGeneratePage() {
  const [personas, setPersonas]   = useState<Persona[]>([])
  const [products, setProducts]   = useState<Product[]>([])
  const [personaId, setPersonaId] = useState("")
  const [postType, setPostType]   = useState<PostType>("tips")

  const selectedPersona = personas.find(p => p.id === personaId) ?? null
  const availablePostTypes = (Object.keys(POST_TYPE_LABELS) as PostType[]).filter(t => {
    if (!selectedPersona) return true
    const r = selectedPersona.typeRatios
    if (t === "tips")    return (r.tips    ?? 0) > 0
    if (t === "product") return (r.product ?? 0) > 0
    // mixed: ベンチマークにmixedがなくてもTipsがあれば生成可能（Tips構造に商品を乗せる）
    if (t === "mixed")   return (r.mixed ?? 0) > 0 || (r.tips ?? 0) > 0
    return false
  })
  const [productId, setProductId] = useState("")
  const [benchmarkPosts, setBenchmarkPosts] = useState<BenchmarkPost[]>([])
  const [selectedBenchmarkPath, setSelectedBenchmarkPath] = useState<string | null>(null)  // null = ランダム
  const [phase, setPhase]         = useState<Phase>("idle")
  const [textResult, setTextResult]   = useState<{ types: Types; generated: GeneratedPostText } | null>(null)
  const [imageResult, setImageResult] = useState<{ imageUrls: (string | null)[]; refBenchmark: string; policyFallbackSlides: number[]; failedSlides: number[] } | null>(null)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  // 初期データ取得
  useEffect(() => {
    fetch("/api/personas").then(r => r.json()).then((d: { personas?: Persona[] }) => setPersonas(d.personas ?? []))
    fetch("/api/products").then(r => r.json()).then((d: Product[]) => setProducts(Array.isArray(d) ? d : []))
  }, [])

  // ペルソナ選択時: 全件取得してクライアント側でアカウント名フィルタ
  // ※ API の ?accountName= クエリは日本語文字コードの不一致で機能しないため全件取得して絞る
  useEffect(() => {
    const account = selectedPersona?.benchmarkAccount
    if (!account) { setBenchmarkPosts([]); setSelectedBenchmarkPath(null); return }
    fetch("/api/benchmark/posts")
      .then(r => r.json())
      .then((d: { posts?: BenchmarkPost[] }) => {
        const filtered = (d.posts ?? []).filter(p => p.accountName === account)
        setBenchmarkPosts(filtered)
      })
      .catch(() => setBenchmarkPosts([]))
    setSelectedBenchmarkPath(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId])

  // 投稿種別が変わったら選択中ベンチマーク投稿をリセット（種別が合わなくなるため）
  useEffect(() => {
    setSelectedBenchmarkPath(null)
  }, [postType])

  // モーダルのキーボード操作
  const closeModal = useCallback(() => setModalIndex(null), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalIndex === null) return
      if (e.key === "Escape") closeModal()
      if (e.key === "ArrowLeft")  setModalIndex(prev => (prev !== null && prev > 0) ? prev - 1 : prev)
      if (e.key === "ArrowRight") setModalIndex(prev => {
        if (prev === null || !imageResult) return prev
        return prev < imageResult.imageUrls.length - 1 ? prev + 1 : prev
      })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modalIndex, imageResult, closeModal])

  async function handleGenerate(includeImage: boolean) {
    if (!personaId) { setError("ペルソナを選択してください"); return }
    if ((postType === "product" || postType === "mixed") && !productId) { setError("商品を選択してください"); return }
    setError("")
    setTextResult(null)
    setImageResult(null)

    try {
      // ─── テキスト生成 ───
      setPhase("text")
      const r1 = await fetch("/api/v3/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          postType,
          productId: (postType === "product" || postType === "mixed") ? productId : undefined,
          benchmarkFolderPath: selectedBenchmarkPath ?? undefined,
        }),
      })
      const d1 = await r1.json() as { types?: Types; generated?: GeneratedPostText; error?: string; refBenchmark?: string }
      if (d1.error) throw new Error(d1.error)
      if (!d1.types || !d1.generated) throw new Error("テキスト生成失敗")
      setTextResult({ types: d1.types, generated: d1.generated })

      if (!includeImage) {
        setPhase("done")
        return
      }

      // ─── 画像生成 ───
      setPhase("image")
      const r2 = await fetch("/api/v3/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generated: d1.generated,
          personaId,
          postType,
          productId: (postType === "product" || postType === "mixed") ? productId : undefined,
          types: d1.types,
          benchmarkFolderPath: selectedBenchmarkPath ?? d1.refBenchmark,  // 手動選択 > テキスト生成時の自動選択
        }),
      })
      const d2 = await r2.json() as { imageUrls?: (string | null)[]; refBenchmark?: string; policyFallbackSlides?: number[]; failedSlides?: number[]; error?: string }
      if (d2.error) throw new Error(d2.error)
      if (!d2.imageUrls) throw new Error("画像生成失敗")
      setImageResult({ imageUrls: d2.imageUrls, refBenchmark: d2.refBenchmark ?? "", policyFallbackSlides: d2.policyFallbackSlides ?? [], failedSlides: d2.failedSlides ?? [] })

      // 生成結果を Supabase に保存（非ブロッキング）
      fetch("/api/v3/generated-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          postType,
          productId:       (postType === "product" || postType === "mixed") ? productId : null,
          overallTitle:    d1.generated.overallTitle,
          slides:          d1.generated.slides,
          caption:         d1.generated.caption,
          hookType:        d1.types.hookType,
          structureType:   d1.types.structureType,
          compositionType: d1.types.compositionType,
          refBenchmark:    d2.refBenchmark ?? null,
          imageUrls:       d2.imageUrls,
        }),
      }).catch(() => { /* 保存失敗はサイレントに無視 */ })

      setPhase("done")
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗")
      setPhase("idle")
    }
  }

  const generating = phase === "text" || phase === "image"

  // 1スライドだけ再生成
  async function handleRegenerateSlide(slideIndex: number) {
    if (!textResult || !imageResult) return
    if (regeneratingIndex !== null) return
    setRegeneratingIndex(slideIndex)
    setError("")
    try {
      const r = await fetch("/api/v3/regenerate-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slide:                textResult.generated.slides[slideIndex],
          personaId,
          postType,
          productId:            (postType === "product" || postType === "mixed") ? productId : undefined,
          types:                textResult.types,
          slideIndex,
          benchmarkFolderPath:  imageResult.refBenchmark,
        }),
      })
      const d = await r.json() as { imageUrl?: string; policyFallback?: boolean; error?: string }
      if (d.error) throw new Error(d.error)
      if (!d.imageUrl) throw new Error("再生成失敗")
      // 該当インデックスを差し替え + ポリシーフォールバック状態を更新
      setImageResult(prev => {
        if (!prev) return prev
        const updated = [...prev.imageUrls]
        updated[slideIndex] = d.imageUrl!
        const slideNum = textResult!.generated.slides[slideIndex].slideNumber
        const fallbacks = d.policyFallback
          ? [...new Set([...prev.policyFallbackSlides, slideNum])]
          : prev.policyFallbackSlides.filter(n => n !== slideNum)
        const failed = prev.failedSlides.filter(n => n !== slideNum)
        return { ...prev, imageUrls: updated, policyFallbackSlides: fallbacks, failedSlides: failed }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "再生成失敗")
    } finally {
      setRegeneratingIndex(null)
    }
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>生成テスト</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          ペルソナ × 投稿種別 × 商品 を選んで、テキスト + 画像を一気に生成します
        </p>
      </div>

      {/* 入力フォーム */}
      <div
        className="rounded-2xl p-6 space-y-6"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {/* ─── ペルソナ ─── */}
        <div>
          <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
            ペルソナ <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          {personas.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>読み込み中…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {personas.map(p => {
                const selected = personaId === p.id
                const displayName = p.profile?.displayName ?? p.name
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPersonaId(p.id)
                      if ((p.typeRatios[postType] ?? 0) === 0) {
                        const first = (Object.keys(POST_TYPE_LABELS) as PostType[]).find(t => (p.typeRatios[t] ?? 0) > 0)
                        if (first) setPostType(first)
                      }
                    }}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      background: selected ? "var(--accent-light)" : "var(--bg)",
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {/* アバター */}
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
                    {/* 名前 */}
                    <p className="text-xs font-bold text-center truncate" style={{ color: "var(--text)" }}>
                      {displayName}
                    </p>
                    {p.benchmarkAccount && (
                      <p className="text-[10px] text-center truncate mt-0.5" style={{ color: "var(--muted)" }}>
                        {p.benchmarkAccount}
                      </p>
                    )}
                    {/* typeRatios */}
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

        {/* ─── 投稿種別 ─── */}
        <div>
          <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
            投稿種別 <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(POST_TYPE_LABELS) as PostType[]).map(t => {
              const available = availablePostTypes.includes(t)
              const selected  = postType === t
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setPostType(t)
                    if (t === "tips") setProductId("")
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-35"
                  style={{
                    background: selected ? "var(--accent)" : "var(--bg)",
                    color:      selected ? "white"         : "var(--text)",
                    border:     `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {POST_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── ベンチマーク投稿（ペルソナ選択後に表示） ─── */}
        {(() => {
          // 選択中の投稿種別に一致するベンチマーク投稿だけ表示
          const filteredBenchmarkPosts = benchmarkPosts.filter(p => p.postType === postType)
          if (!personaId || filteredBenchmarkPosts.length === 0) return null
          return (
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>
              ベンチマーク投稿
              <span className="ml-2 font-normal" style={{ color: "var(--muted)" }}>
                — 未選択ならランダムで選ばれます
              </span>
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {/* ランダム（デフォルト）カード */}
              <button
                type="button"
                onClick={() => setSelectedBenchmarkPath(null)}
                className="flex-shrink-0 rounded-xl p-2 flex flex-col items-center justify-center transition-all"
                style={{
                  width: 88,
                  border: `2px solid ${selectedBenchmarkPath === null ? "var(--accent)" : "var(--border)"}`,
                  background: selectedBenchmarkPath === null ? "var(--accent-light)" : "var(--bg)",
                }}
              >
                <div
                  className="w-full rounded-lg flex items-center justify-center mb-1.5"
                  style={{ aspectRatio: "3/4", background: "var(--border)", fontSize: 22 }}
                >
                  🎲
                </div>
                <p className="text-[10px] font-bold text-center leading-snug" style={{ color: selectedBenchmarkPath === null ? "var(--accent)" : "var(--muted)" }}>
                  ランダム
                </p>
              </button>

              {/* 各ベンチマーク投稿（選択中の投稿種別でフィルタ済み） */}
              {filteredBenchmarkPosts.map(post => {
                const selected = selectedBenchmarkPath === post.folderPath
                const thumb = post.slideUrls?.[0]
                const label = post.folderPath.split("/").pop() ?? post.folderPath
                const typeColor = post.postType === "tips" ? "#0891b2" : post.postType === "product" ? "#7c3aed" : "#16a34a"
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedBenchmarkPath(post.folderPath)}
                    className="flex-shrink-0 rounded-xl p-2 flex flex-col transition-all"
                    style={{
                      width: 88,
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-light)" : "var(--bg)",
                    }}
                  >
                    {/* サムネイル */}
                    <div className="w-full rounded-lg overflow-hidden mb-1.5 relative" style={{ aspectRatio: "3/4", background: "var(--border)" }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={label} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--muted)", fontSize: 18 }}>📷</div>
                      )}
                      {/* postTypeバッジ */}
                      <span
                        className="absolute top-1 left-1 px-1 rounded text-white font-bold"
                        style={{ fontSize: 8, background: typeColor, lineHeight: "14px" }}
                      >
                        {post.postType}
                      </span>
                      {/* 枚数バッジ */}
                      <span
                        className="absolute bottom-1 right-1 px-1 rounded font-bold"
                        style={{ fontSize: 8, background: "rgba(0,0,0,0.55)", color: "#fff", lineHeight: "14px" }}
                      >
                        {post.slideCount}枚
                      </span>
                    </div>
                    {/* ラベル */}
                    <p className="text-[10px] font-bold text-center leading-snug truncate w-full" style={{ color: selected ? "var(--accent)" : "var(--text)" }}>
                      {label}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* ─── 商品（product / mixed のとき表示） ─── */}
        {(postType === "product" || postType === "mixed") && (
          <div>
            <label className="block text-xs font-bold mb-3" style={{ color: "var(--muted)" }}>
              商品 <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {products.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>商品が登録されていません</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {products.map(prod => {
                  const selected = productId === prod.id
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => setProductId(prod.id)}
                      className="rounded-xl overflow-hidden text-left transition-all"
                      style={{
                        border:     `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                        background: selected ? "var(--accent-light)" : "var(--bg)",
                      }}
                    >
                      {/* 商品画像 */}
                      <div className="overflow-hidden" style={{ aspectRatio: "1", background: "#f9f9f9" }}>
                        {prod.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--muted)" }}>
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      {/* 商品名・価格 */}
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
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ background: "#ef444422", color: "#ef4444" }}>
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="flex gap-3 flex-wrap pt-2">
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--accent)" }}
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {phase === "text" ? "テキスト生成中…（30〜60秒）" : "画像生成中…（30〜120秒）"}
              </>
            ) : (
              <><Sparkles className="w-4 h-4" /> テキスト + 画像を生成</>
            )}
          </button>
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating}
            className="px-6 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            <Sparkles className="w-4 h-4" /> テキストのみ
          </button>
        </div>
      </div>

      {/* 結果: 型バッジ */}
      {textResult && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
        >
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>選択された型:</span>
            <span className="px-3 py-1 rounded-md text-xs font-bold" style={{ background: "#7c3aed", color: "white" }}>
              {HOOK_LABELS[textResult.types.hookType]}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-bold" style={{ background: "#0891b2", color: "white" }}>
              {STRUCTURE_LABELS[textResult.types.structureType]}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-bold" style={{ background: "#ca8a04", color: "white" }}>
              {COMPOSITION_LABELS[textResult.types.compositionType]}
            </span>
            {imageResult?.refBenchmark && (
              <span className="text-xs ml-2 px-2 py-1 rounded-md font-bold" style={{ background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                📌 参照ベンチマーク: {imageResult.refBenchmark}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>
            {textResult.generated.overallTitle}
          </h2>
        </div>
      )}

      {/* スライド一覧（画像 + テキスト） */}
      {textResult && (
        <div className="space-y-3">
          {textResult.generated.slides.map((slide, i) => (
            <div
              key={slide.slideNumber}
              className="rounded-2xl p-4 flex gap-4 items-start"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* 画像 or プレースホルダー */}
              <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 180 }}>
                <div className="relative">
                {imageResult?.imageUrls?.[i] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <button
                      className="block w-full"
                      onClick={() => setModalIndex(i)}
                      title="クリックで拡大"
                    >
                      <img
                        src={imageResult.imageUrls[i]}
                        alt={`slide ${slide.slideNumber}`}
                        className="w-full rounded-lg hover:opacity-90 transition-opacity cursor-zoom-in"
                        style={{ aspectRatio: "3/4", objectFit: "cover", border: "1px solid var(--border)" }}
                      />
                    </button>
                    {/* 再生成中オーバーレイ */}
                    {regeneratingIndex === i && (
                      <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center"
                           style={{ background: "rgba(0,0,0,0.6)" }}>
                        <RefreshCw className="w-5 h-5 text-white animate-spin mb-1" />
                        <span className="text-xs text-white">再生成中...</span>
                      </div>
                    )}
                    {/* 再生成ボタン */}
                    <button
                      onClick={e => { e.preventDefault(); handleRegenerateSlide(i) }}
                      disabled={regeneratingIndex !== null || generating}
                      title="この画像だけ再生成"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-100 opacity-80 disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.6)" }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${regeneratingIndex === i ? "animate-spin" : ""}`} />
                    </button>
                  </>
                ) : (
                  <div
                    className="w-full rounded-lg flex flex-col items-center justify-center"
                    style={{
                      aspectRatio: "3/4",
                      background: "var(--bg)",
                      border: `1px dashed ${imageResult?.failedSlides?.includes(slide.slideNumber) ? "#ef4444" : "var(--border)"}`,
                      color: "var(--muted)",
                    }}
                  >
                    {phase === "image" ? (
                      <>
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mb-2" />
                        <span className="text-xs">画像生成中</span>
                      </>
                    ) : imageResult?.failedSlides?.includes(slide.slideNumber) ? (
                      <>
                        <span className="text-lg mb-1">⚠️</span>
                        <span className="text-xs text-center px-2" style={{ color: "#ef4444" }}>ポリシー違反<br/>再生成を試してください</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs">画像なし</span>
                      </>
                    )}
                  </div>
                )}
                </div>{/* /relative */}

                {/* ポリシー違反フォールバック通知（画像の外・下に表示） */}
                {imageResult?.policyFallbackSlides?.includes(slide.slideNumber) && (
                  <div
                    className="rounded-lg px-2.5 py-2 flex items-start gap-1.5"
                    style={{ background: "#fff7ed", border: "1px solid #fb923c" }}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1 }}>⚠️</span>
                    <p className="text-[10px] leading-snug" style={{ color: "#c2410c" }}>
                      ポリシー違反ワードを検出したため、スタイル説明を省いたシンプル版で生成しました
                    </p>
                  </div>
                )}
              </div>{/* /flex-col */}

              {/* テキスト */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                    {slide.slideNumber}
                  </span>
                  <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{slide.tag}</span>
                </div>
                <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{slide.headline}</p>
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
        </div>
      )}

      {/* キャプション */}
      {textResult && (
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>📝 キャプション</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>
            {textResult.generated.caption}
          </p>
        </div>
      )}

      {/* ─── フルサイズプレビューモーダル ─── */}
      {modalIndex !== null && imageResult?.imageUrls?.[modalIndex] && (
        /* オーバーレイ（クリックで閉じる） */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={closeModal}
        >
          {/* モーダル本体（クリック伝播を止める） */}
          <div
            className="relative flex items-center"
            style={{ maxHeight: "95vh", maxWidth: "95vw" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 前へ */}
            {modalIndex > 0 && (
              <button
                onClick={() => setModalIndex(modalIndex - 1)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ left: "-3rem", background: "rgba(255,255,255,0.15)" }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* 画像 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageResult.imageUrls[modalIndex]}
              alt={`slide ${modalIndex + 1}`}
              className="rounded-xl shadow-2xl"
              style={{ maxHeight: "90vh", maxWidth: "min(420px, 90vw)", objectFit: "contain" }}
            />

            {/* 枚数インジケーター */}
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              {modalIndex + 1} / {imageResult.imageUrls.length}
            </div>

            {/* 次へ */}
            {modalIndex < imageResult.imageUrls.length - 1 && (
              <button
                onClick={() => setModalIndex(modalIndex + 1)}
                className="absolute flex items-center justify-center w-10 h-10 rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
                style={{ right: "-3rem", background: "rgba(255,255,255,0.15)" }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* 閉じるボタン */}
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
