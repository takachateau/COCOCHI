"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useProducts } from "@/context/products"
import { ArrowLeft, Upload, Plus, Trash2, Package, Check, Pencil, X } from "lucide-react"
import type { Product } from "@/types"

function Field({
  label, value, onChange, placeholder, rows, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
        {label} {required && <span style={{ color: "var(--accent)" }}>*</span>}
      </label>
      {!rows || rows === 1 ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
      )}
    </div>
  )
}

function ProductCard({ product, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="relative" style={{ aspectRatio: "1/1", background: "var(--accent-light)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-2" />
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)", color: "white" }}
            title="編集"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => confirm ? onDelete() : setConfirm(true)}
            onBlur={() => setConfirm(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ background: confirm ? "#ef4444" : "rgba(0,0,0,0.45)", color: "white" }}
            title={confirm ? "本当に削除" : "削除"}
          >
            {confirm ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="p-3 space-y-1">
        <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{product.name}</p>
        <p className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}>{product.efficacy}</p>
        <div className="flex items-center justify-between">
          {product.price && <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>{product.price}</p>}
          <p className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
            {new Date(product.createdAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  )
}

function EditModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (p: Product) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName]         = useState(product.name)
  const [efficacy, setEfficacy] = useState(product.efficacy)
  const [howToUse, setHowToUse] = useState(product.howToUse)
  const [price, setPrice]       = useState(product.price ?? "")
  const [preview, setPreview]   = useState<string | null>(product.imageUrl)
  const [base64, setBase64]     = useState("")
  const [mime, setMime]         = useState(product.imageMime)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMime(file.type || "image/jpeg")
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setPreview(dataUrl)
      setBase64(dataUrl.split(",")[1] ?? "")
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!name || !efficacy || !howToUse) { setError("必須項目を入力してください"); return }
    setSaving(true); setError(null)
    try {
      const body: Record<string, string> = { name, efficacy, howToUse }
      if (price) body.price = price
      if (base64) { body.imageBase64 = base64; body.imageMime = mime }
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? "更新失敗")
      onSaved(data as Product)
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-2xl w-full max-w-sm p-6 space-y-4 overflow-y-auto max-h-[90vh]" style={{ background: "var(--card)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>商品を編集</h3>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: "var(--muted)" }} /></button>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="relative border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-center overflow-hidden"
          style={{ height: 120, borderColor: base64 ? "var(--accent)" : "var(--border)", background: "var(--accent-light)" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <Upload className="w-5 h-5" style={{ color: "var(--accent)" }} />
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        <Field label="商品名" value={name} onChange={setName} placeholder="" required />
        <Field label="効能・特徴" value={efficacy} onChange={setEfficacy} placeholder="" rows={3} required />
        <Field label="使い方" value={howToUse} onChange={setHowToUse} placeholder="" rows={2} required />
        <Field label="価格（任意）" value={price} onChange={setPrice} placeholder="例: ¥2,200（税込）" />

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "保存する"}
        </button>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const { products, loading, addProduct, updateProduct, removeProduct } = useProducts()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [name, setName]         = useState("")
  const [efficacy, setEfficacy] = useState("")
  const [howToUse, setHowToUse] = useState("")
  const [price, setPrice]       = useState("")
  const [preview, setPreview]   = useState<string | null>(null)
  const [base64, setBase64]     = useState("")
  const [mime, setMime]         = useState("image/jpeg")
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMime(file.type || "image/jpeg")
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setPreview(dataUrl)
      setBase64(dataUrl.split(",")[1] ?? "")
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!name || !efficacy || !howToUse || !base64) {
      setError("すべての必須項目を入力してください")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, efficacy, howToUse, price: price || undefined, imageBase64: base64, imageMime: mime }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? "登録失敗")
      addProduct(data as Product)
      // フォームリセット
      setName(""); setEfficacy(""); setHowToUse(""); setPrice("")
      setPreview(null); setBase64(""); setMime("image/jpeg")
      if (fileRef.current) fileRef.current.value = ""
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            ダッシュボード
          </Link>
          <span style={{ color: "var(--border)" }}>|</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <Package className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>商品マスタ管理</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              {products.length}件
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8 flex gap-8">
        {/* ── 登録フォーム ── */}
        <div className="flex-shrink-0 w-72 space-y-4">
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>新規商品を登録</h2>

          {/* 商品画像 */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
              商品画像 <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="relative border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-center overflow-hidden"
              style={{
                height: 140,
                borderColor: preview ? "var(--accent)" : "var(--border)",
                background: "var(--accent-light)",
              }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <div className="text-center">
                  <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--accent)" }} />
                  <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>クリックしてアップロード</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>JPG / PNG</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>

          <Field label="商品名" value={name} onChange={setName} placeholder="例: 22:00 アネトス クレンジングウォーター" required />
          <Field label="効能・特徴" value={efficacy} onChange={setEfficacy} placeholder="例: サリチル酸配合で毛穴の黒ずみをケア..." rows={3} required />
          <Field label="使い方" value={howToUse} onChange={setHowToUse} placeholder="例: コットンに染み込ませて拭き取る" rows={2} required />
          <Field label="価格（任意）" value={price} onChange={setPrice} placeholder="例: ¥2,200（税込）" />

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>✓ 登録しました</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Plus className="w-4 h-4" />登録する</>
            )}
          </button>
        </div>

        {/* ── 商品一覧 ── */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>登録済み商品</h2>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Package className="w-10 h-10" style={{ color: "var(--border)" }} />
              <p className="text-sm" style={{ color: "var(--muted)" }}>まだ商品が登録されていません</p>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {products.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={() => setEditingProduct(p)}
                  onDelete={() => removeProduct(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {editingProduct && (
        <EditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={updated => { updateProduct(updated); setEditingProduct(null) }}
        />
      )}
    </div>
  )
}
