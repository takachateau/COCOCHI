"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, ChevronDown, ChevronUp, Image, X, ChevronLeft, ChevronRight } from "lucide-react"
import type { BenchmarkPost } from "@/types/v2"

const POST_TYPE_LABELS: Record<string, string> = {
  daily: "日常系", tips: "Tips", product: "商品",
}
const TONE_LABELS: Record<string, string> = {
  emotional: "感情", informative: "情報", review: "レビュー", entertainment: "エンタメ",
}

export default function BenchmarkPage() {
  const [accountName, setAccountName]     = useState("")
  const [folderName, setFolderName]       = useState("")
  const [files, setFiles]                 = useState<File[]>([])
  const [dragging, setDragging]           = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [result, setResult]               = useState<BenchmarkPost | null>(null)
  const [error, setError]                 = useState("")
  const [posts, setPosts]                 = useState<BenchmarkPost[]>([])
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [preview, setPreview]             = useState<{ post: BenchmarkPost; slideIndex: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    const r = await fetch("/api/benchmark/posts")
    const d = await r.json() as { posts: BenchmarkPost[] }
    if (d.posts) setPosts(d.posts)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))
    setFiles(prev => [...prev, ...dropped].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    setFiles(prev => [...prev, ...picked].sort((a, b) => a.name.localeCompare(b.name)))
    e.target.value = ""
  }

  async function handleUpload() {
    if (!accountName.trim()) { setError("アカウント名を入力してください"); return }
    if (files.length === 0) { setError("スライド画像を選択してください"); return }
    setError("")
    setUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append("accountName", accountName.trim())
      if (folderName.trim()) form.append("postFolderName", folderName.trim())
      files.forEach(f => form.append("slides", f))

      const r = await fetch("/api/benchmark/upload", { method: "POST", body: form })
      const d = await r.json() as { result?: BenchmarkPost; error?: string }
      if (d.error) throw new Error(d.error)
      setResult(d.result!)
      setFiles([])
      setFolderName("")
      await loadPosts()
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました")
    } finally {
      setUploading(false)
    }
  }

  // group posts by accountName
  const grouped = posts.reduce<Record<string, BenchmarkPost[]>>((acc, p) => {
    ;(acc[p.accountName] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="space-y-8">

      {/* ─── スライドプレビューモーダル ─── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex flex-col items-center gap-4 p-4 max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* 閉じるボタン */}
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-white z-10"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <X className="w-4 h-4" />
            </button>

            {/* メイン画像 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.post.slideUrls[preview.slideIndex]}
              alt={`slide ${preview.slideIndex + 1}`}
              className="rounded-xl w-full object-contain"
              style={{ maxHeight: "65vh" }}
            />

            {/* 前後ナビ */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPreview(p => p ? { ...p, slideIndex: Math.max(0, p.slideIndex - 1) } : null)}
                disabled={preview.slideIndex === 0}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-bold">
                {preview.slideIndex + 1} / {preview.post.slideUrls.length}
              </span>
              <button
                onClick={() => setPreview(p => p ? { ...p, slideIndex: Math.min(p.post.slideUrls.length - 1, p.slideIndex + 1) } : null)}
                disabled={preview.slideIndex === preview.post.slideUrls.length - 1}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* サムネイル一覧 */}
            <div className="flex gap-1.5 flex-wrap justify-center">
              {preview.post.slideUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  onClick={() => setPreview(p => p ? { ...p, slideIndex: i } : null)}
                  className="w-10 h-10 object-cover rounded-lg cursor-pointer transition-opacity"
                  style={{
                    border: i === preview.slideIndex ? "2px solid white" : "2px solid transparent",
                    opacity: i === preview.slideIndex ? 1 : 0.5,
                  }}
                />
              ))}
            </div>

            {/* 投稿メタ情報 */}
            <p className="text-white text-xs opacity-60">{preview.post.folderPath}</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>ベンチマーク投稿 登録</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Lemon8の参考投稿をアップロードしてAIが種別・構造・テーマを自動分析します
        </p>
      </div>

      {/* アップロードフォーム */}
      <div
        className="rounded-2xl p-6 space-y-5"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
              アカウント名 <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder="例: accountA"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
              投稿フォルダ名（省略で自動採番）
            </label>
            <input
              type="text"
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="例: post_001"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* ドロップゾーン */}
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
          style={{
            borderColor: dragging ? "var(--accent)" : "var(--border)",
            background: dragging ? "var(--accent-light)" : "var(--bg)",
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={onFileInput} />
          <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            スライド画像をドロップ または クリックして選択
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            ファイル名順にスライド番号が決まります（複数可）
          </p>
        </div>

        {/* 選択ファイルのプレビュー */}
        {files.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="w-16 h-16 object-cover rounded-lg"
                  style={{ border: "1px solid var(--border)" }}
                />
                <button
                  onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)) }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-xs items-center justify-center hidden group-hover:flex"
                  style={{ background: "var(--accent)" }}
                >
                  ×
                </button>
                <p className="text-[10px] text-center mt-0.5 truncate w-16" style={{ color: "var(--muted)" }}>
                  {i + 1}
                </p>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "var(--accent)" }}
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              分析中（30〜60秒）...
            </>
          ) : (
            <><Upload className="w-4 h-4" /> アップロード・分析する</>
          )}
        </button>
      </div>

      {/* 分析結果 */}
      {result && (
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>✓ 登録完了</p>
          <div className="flex flex-wrap gap-3">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {POST_TYPE_LABELS[result.postType] ?? result.postType}
            </span>
            <span
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: "var(--card)", color: "var(--muted)" }}
            >
              {TONE_LABELS[result.tone] ?? result.tone}
            </span>
            <span className="px-3 py-1 rounded-full text-xs" style={{ background: "var(--card)", color: "var(--muted)" }}>
              {result.slideCount}枚
            </span>
            {result.themeTags.map(t => (
              <span key={t} className="px-3 py-1 rounded-full text-xs" style={{ background: "var(--card)", color: "var(--text)" }}>
                #{t}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {result.slideStructure.map(s => (
              <div key={s.slide} className="flex gap-3 text-xs">
                <span className="font-bold w-5 text-right flex-shrink-0" style={{ color: "var(--accent)" }}>
                  {s.slide}
                </span>
                <span className="font-medium" style={{ color: "var(--text)" }}>{s.role}</span>
                <span style={{ color: "var(--muted)" }}>{s.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 登録済み投稿一覧 */}
      {Object.keys(grouped).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>
            登録済みベンチマーク — {posts.length}件
          </h2>
          {Object.entries(grouped).map(([account, accountPosts]) => (
            <div
              key={account}
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <button
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:opacity-80"
                style={{ background: "var(--card)" }}
                onClick={() => setExpanded(prev => prev === account ? null : account)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm" style={{ color: "var(--text)" }}>{account}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    {accountPosts.length}投稿
                  </span>
                </div>
                {expanded === account
                  ? <ChevronUp className="w-4 h-4" style={{ color: "var(--muted)" }} />
                  : <ChevronDown className="w-4 h-4" style={{ color: "var(--muted)" }} />}
              </button>

              {expanded === account && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {accountPosts.map(p => (
                    <div
                      key={p.id}
                      className="flex gap-4 px-5 py-3 items-start"
                      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
                    >
                      {/* スライドサムネ（クリックでプレビュー） */}
                      <div className="flex gap-1 flex-shrink-0">
                        {p.slideUrls.slice(0, 3).map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={url}
                            alt=""
                            onClick={() => setPreview({ post: p, slideIndex: i })}
                            className="w-10 h-10 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        ))}
                        {p.slideUrls.length > 3 && (
                          <div
                            onClick={() => setPreview({ post: p, slideIndex: 3 })}
                            className="w-10 h-10 rounded-md flex items-center justify-center text-xs font-bold cursor-pointer hover:opacity-80"
                            style={{ background: "var(--border)", color: "var(--muted)" }}
                          >
                            +{p.slideUrls.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>{p.folderPath}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                          >
                            {POST_TYPE_LABELS[p.postType] ?? p.postType}
                          </span>
                          {p.themeTags.slice(0, 3).map(t => (
                            <span key={t} className="text-xs" style={{ color: "var(--muted)" }}>#{t}</span>
                          ))}
                        </div>
                        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          {p.slideCount}枚 / {p.slideStructure.map(s => s.role).join(" → ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Image className="w-3 h-3" style={{ color: "var(--muted)" }} />
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{p.slideCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
