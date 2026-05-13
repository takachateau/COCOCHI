"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, Trash2, Upload, X, ChevronRight } from "lucide-react"
import type { CompetitorProduct } from "@/types/v2"
import type { Product } from "@/types"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

const EMPTY_FORM = {
  brandName: "", productName: "", price: "",
  features: "", pros: "", cons: "", category: "", tags: "",
}

export default function CompetitorsPage() {
  const { lang } = useLanguage()
  const t = useT(lang)
  const c = t.competitors
  const [ownProducts, setOwnProducts]     = useState<Product[]>([])
  const [competitors, setCompetitors]     = useState<CompetitorProduct[]>([])
  const [loading, setLoading]             = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showForm, setShowForm]           = useState(false)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [imageFile, setImageFile]         = useState<File | null>(null)
  const [imagePreview, setImagePreview]   = useState("")
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState("")
  const [dragging, setDragging]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/products").then(r => r.json() as Promise<Product[]>),
      fetch("/api/competitors").then(r => r.json() as Promise<{ products: CompetitorProduct[] }>),
    ]).then(([prods, comps]) => {
      setOwnProducts(Array.isArray(prods) ? prods : [])
      setCompetitors(comps.products ?? [])
      setLoading(false)
    })
  }, [])

  function setImage(f: File) {
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  function onImageDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"))
    if (f) setImage(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProduct) return
    if (!imageFile) { setError(c.errorImage); return }
    if (!form.brandName || !form.productName || !form.features || !form.pros || !form.cons) {
      setError(c.errorRequired); return
    }
    setError("")
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append("productId",   selectedProduct.id)
      fd.append("brandName",   form.brandName)
      fd.append("productName", form.productName)
      fd.append("price",       form.price)
      fd.append("features",    form.features)
      fd.append("pros",        form.pros)
      fd.append("cons",        form.cons)
      fd.append("category",    form.category)
      fd.append("tags",        JSON.stringify(
        form.tags.split(",").map(t => t.trim()).filter(Boolean)
      ))
      fd.append("image", imageFile)

      const r = await fetch("/api/competitors", { method: "POST", body: fd })
      const d = await r.json() as { product?: CompetitorProduct; error?: string }
      if (d.error) throw new Error(d.error)
      setCompetitors(prev => [d.product!, ...prev])
      setForm(EMPTY_FORM)
      setImageFile(null)
      setImagePreview("")
      setShowForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : c.registerFailed)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.common.confirmDelete)) return
    await fetch(`/api/competitors?id=${id}`, { method: "DELETE" })
    setCompetitors(prev => prev.filter(p => p.id !== id))
  }

  const currentCompetitors = selectedProduct
    ? competitors.filter(c => c.productId === selectedProduct.id)
    : []

  // ── 商品選択前：自社商品一覧 ───────────────────────────────────
  if (!selectedProduct) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>{c.pageTitle}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{c.pageDesc}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 rounded-full animate-spin" style={{ border: "3px solid var(--accent)", borderTopColor: "transparent" }} />
          </div>
        ) : ownProducts.length === 0 ? (
          <div className="text-center py-20" style={{ color: "var(--muted)" }}>
            <p className="text-sm">{c.noOwnProducts}</p>
            <p className="text-xs mt-1">{c.noOwnProductsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ownProducts.map(p => {
              const count = competitors.filter(c => c.productId === p.id).length
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="flex items-center gap-4 p-4 rounded-2xl text-left transition-opacity hover:opacity-80"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                    style={{ border: "1px solid var(--border)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{p.name}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      {c.registeredCount} {count}{c.countSuffix}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted)" }} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── 商品選択後：競合商品一覧 ──────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedProduct(null); setShowForm(false) }}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {t.common.back}
          </button>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedProduct.imageUrl}
              alt={selectedProduct.name}
              className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
              style={{ border: "1px solid var(--border)" }}
            />
            <div>
              <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>{selectedProduct.name}</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{c.countLabel} {currentCompetitors.length}{t.common.count}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: "var(--accent)" }}
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? t.common.cancel : c.addBtn}
        </button>
      </div>

      {/* 登録フォーム */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
            「{selectedProduct.name}」{c.formTitle}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["brandName",   c.brandName,   "例: COSRX",            true],
              ["productName", c.productName, "例: スネイルエッセンス", true],
              ["price",       c.price,       "例: ¥2,000",            false],
              ["category",    c.category,    "例: 化粧水",             false],
            ] as [keyof typeof form, string, string, boolean][]).map(([key, label, ph, req]) => (
              <div key={key}>
                <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                  {label} {req && <span style={{ color: "var(--accent)" }}>*</span>}
                </label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={ph}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
            ))}
          </div>

          {([
            ["features", c.features, "例: ヒアルロン酸・セラミド配合",  true],
            ["pros",     c.pros,     "例: 保湿力が高くべたつかない",     true],
            ["cons",     c.cons,     "例: 香料が強め、テクスチャが重い",  true],
            ["tags",     c.tags,     "例: 保湿, 毛穴, プチプラ",         false],
          ] as [keyof typeof form, string, string, boolean][]).map(([key, label, ph, req]) => (
            <div key={key}>
              <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                {label} {req && <span style={{ color: "var(--accent)" }}>*</span>}
              </label>
              <textarea
                value={form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder={ph}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
              {c.imageLabel} <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {imagePreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" className="w-32 h-32 object-cover rounded-xl" style={{ border: "1px solid var(--border)" }} />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview("") }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                  style={{ background: "var(--accent)" }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
                style={{
                  borderColor: dragging ? "var(--accent)" : "var(--border)",
                  background:  dragging ? "var(--accent-light)" : "var(--bg)",
                }}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onImageDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setImage(f); e.target.value = "" }}
                />
                <Upload className="w-6 h-6 mx-auto mb-1" style={{ color: "var(--muted)" }} />
                <p className="text-xs" style={{ color: "var(--muted)" }}>{c.imageDrop}</p>
              </div>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--accent)" }}
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t.common.registering}</>
            ) : t.common.register}
          </button>
        </form>
      )}

      {/* 競合商品一覧 */}
      {currentCompetitors.length === 0 && !showForm ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>{c.noCompetitors}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.noCompetitorsHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentCompetitors.map(p => (
            <div
              key={p.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.imageUrl}
                  alt={p.productName}
                  className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                  style={{ border: "1px solid var(--border)" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{p.brandName}</p>
                  <p className="font-bold text-sm mt-0.5 leading-tight" style={{ color: "var(--text)" }}>{p.productName}</p>
                  {p.price && <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>{p.price}</p>}
                  {p.category && (
                    <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {p.category}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-4 pb-3 space-y-1.5 text-xs" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.featureLabel}</span>{p.features}</p>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.prosLabel}</span>{p.pros}</p>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.consLabel}</span>{p.cons}</p>
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: "var(--muted)" }}
                >
                  <Trash2 className="w-3 h-3" /> {t.common.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
