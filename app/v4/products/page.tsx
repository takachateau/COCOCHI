"use client"

import { useState, useRef, useEffect } from "react"
import { useProducts } from "@/context/products"
import { Upload, Plus, Trash2, Package, Check, Pencil, X, FileText, Loader2, ChevronRight, ChevronLeft } from "lucide-react"
import type { Product } from "@/types"
import type { CompetitorProduct } from "@/types/v2"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

// ─── 共通コンポーネント ────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, rows, required, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; rows?: number; required?: boolean; hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
        {label} {required && <span style={{ color: "var(--accent)" }}>*</span>}
      </label>
      {hint && <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>{hint}</p>}
      {!rows || rows === 1 ? (
        <input
          type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
      ) : (
        <textarea
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={rows}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
      )}
    </div>
  )
}

function PdfUploader({ pdfText, onExtracted }: { pdfText: string; onExtracted: (text: string) => void }) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const p = t.products
  const pdfRef = useRef<HTMLInputElement>(null)
  const [extracting, setExtracting] = useState(false)
  const [pdfName, setPdfName] = useState("")

  async function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfName(file.name)
    setExtracting(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = ev => resolve((ev.target?.result as string).split(",")[1] ?? "")
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onExtracted(data.text as string)
    } catch (err) {
      alert(err instanceof Error ? err.message : p.pdfReadFailed)
    } finally {
      setExtracting(false)
      if (pdfRef.current) pdfRef.current.value = ""
    }
  }

  return (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
        {p.pdfLabel}
        <span className="font-normal ml-1" style={{ color: "var(--muted)" }}>{p.pdfOptional}</span>
      </label>
      <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>{p.pdfHint}</p>
      <div className="flex items-center gap-2">
        <button
          type="button" onClick={() => pdfRef.current?.click()} disabled={extracting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        >
          {extracting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{p.pdfExtracting}</>
            : <><FileText className="w-3.5 h-3.5" />{p.pdfSelect}</>}
        </button>
        {pdfText && !extracting && (
          <span className="text-xs" style={{ color: "var(--accent)" }}>{p.pdfExtracted}{pdfName && ` (${pdfName})`}</span>
        )}
      </div>
      <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfSelect} />
      {pdfText && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>{p.pdfPreview}</p>
            <button onClick={() => onExtracted("")} className="text-xs" style={{ color: "var(--muted)" }}>{t.common.clearPreview}</button>
          </div>
          <div className="px-3 py-2 rounded-lg text-xs overflow-auto max-h-32"
            style={{ background: "var(--accent-light)", border: "1px solid var(--border)", color: "var(--muted)", whiteSpace: "pre-wrap" }}>
            {pdfText}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 商品カード（一覧用） ─────────────────────────────────────────

function ProductListCard({
  product, competitorCount, onClick,
}: {
  product: Product; competitorCount: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-2xl text-left transition-opacity hover:opacity-80 w-full"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl} alt={product.name}
        className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
        style={{ border: "1px solid var(--border)" }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{product.name}</p>
        {product.price && <p className="text-xs mt-0.5" style={{ color: "var(--accent)" }}>{product.price}</p>}
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>競合商品 {competitorCount}件登録済み</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted)" }} />
    </button>
  )
}

// ─── 商品編集フォーム（詳細ビュー内） ────────────────────────────

function ProductEditForm({
  product, onSaved, onDeleted,
}: {
  product: Product; onSaved: (p: Product) => void; onDeleted: (id: string) => void
}) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const p = t.products
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName]                   = useState(product.name)
  const [ingredients, setIngredients]     = useState(product.ingredients)
  const [howToUse, setHowToUse]           = useState(product.howToUse)
  const [price, setPrice]                 = useState(product.price ?? "")
  const [appealPoints, setAppealPoints]   = useState(product.appealPoints ?? "")
  const [forbiddenWords, setForbiddenWords] = useState(product.forbiddenWords ?? "")
  const [pdfText, setPdfText]             = useState(product.pdfText ?? "")
  const [preview, setPreview]             = useState<string | null>(product.imageUrl)
  const [base64, setBase64]               = useState("")
  const [mime, setMime]                   = useState(product.imageMime)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    if (!name || !ingredients || !howToUse) { setError(p.errorEditRequired); return }
    setSaving(true); setError(null)
    try {
      const body: Record<string, string> = { name, ingredients, howToUse }
      if (price) body.price = price
      if (appealPoints) body.appealPoints = appealPoints
      if (forbiddenWords) body.forbiddenWords = forbiddenWords
      if (pdfText) body.pdfText = pdfText
      if (base64) { body.imageBase64 = base64; body.imageMime = mime }
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? p.updateFailed)
      onSaved(data as Product)
    } catch (err) {
      setError(err instanceof Error ? err.message : p.updateFailed)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await fetch(`/api/products/${product.id}`, { method: "DELETE" })
      onDeleted(product.id)
    } catch {
      alert("削除に失敗しました")
    }
  }

  return (
    <div className="space-y-4">
      {/* 商品画像 */}
      <div>
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
          {p.imageLabel}
        </label>
        <div
          onClick={() => fileRef.current?.click()}
          className="relative border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-center overflow-hidden"
          style={{ height: 140, borderColor: base64 ? "var(--accent)" : "var(--border)", background: "var(--accent-light)" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <Upload className="w-5 h-5" style={{ color: "var(--accent)" }} />
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
      </div>

      <Field label={p.nameLabel} value={name} onChange={setName} placeholder="" required />
      <Field label={p.ingredientsLabel} value={ingredients} onChange={setIngredients} placeholder="" rows={4} required hint={p.ingredientsHint} />
      <Field label={p.howToUseLabel} value={howToUse} onChange={setHowToUse} placeholder="" rows={2} required />
      <Field label={p.priceLabel} value={price} onChange={setPrice} placeholder="例: ¥2,200（税込）" />
      <Field label={p.appealLabel} value={appealPoints} onChange={setAppealPoints} placeholder="" rows={2} hint={p.appealHint} />
      <Field label={p.forbiddenLabel} value={forbiddenWords} onChange={setForbiddenWords} placeholder="" rows={2} hint={p.forbiddenHint} />
      <PdfUploader pdfText={pdfText} onExtracted={setPdfText} />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave} disabled={saving}
          className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t.common.save}
        </button>
        <button
          onClick={() => confirmDelete ? handleDelete() : setConfirmDelete(true)}
          onBlur={() => setConfirmDelete(false)}
          className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-colors"
          style={{
            background: confirmDelete ? "#ef4444" : "var(--bg)",
            color: confirmDelete ? "white" : "var(--muted)",
            border: `1px solid ${confirmDelete ? "#ef4444" : "var(--border)"}`,
          }}
        >
          {confirmDelete ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── 競合商品セクション ───────────────────────────────────────────

const EMPTY_COMP_FORM = {
  brandName: "", productName: "", price: "",
  features: "", pros: "", cons: "", category: "", tags: "",
}

function CompetitorSection({
  product, competitors, onAdd, onDelete,
}: {
  product: Product
  competitors: CompetitorProduct[]
  onAdd: (c: CompetitorProduct) => void
  onDelete: (id: string) => void
}) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const c = t.competitors
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_COMP_FORM)
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState("")
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState("")
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    if (!imageFile) { setError(c.errorImage); return }
    if (!form.brandName || !form.productName || !form.features || !form.pros || !form.cons) {
      setError(c.errorRequired); return
    }
    setError(""); setSaving(true)
    try {
      const fd = new FormData()
      fd.append("productId",   product.id)
      fd.append("brandName",   form.brandName)
      fd.append("productName", form.productName)
      fd.append("price",       form.price)
      fd.append("features",    form.features)
      fd.append("pros",        form.pros)
      fd.append("cons",        form.cons)
      fd.append("category",    form.category)
      fd.append("tags",        JSON.stringify(
        form.tags.split(",").map(tag => tag.trim()).filter(Boolean)
      ))
      fd.append("image", imageFile)
      const r = await fetch("/api/competitors", { method: "POST", body: fd })
      const d = await r.json() as { product?: CompetitorProduct; error?: string }
      if (d.error) throw new Error(d.error)
      onAdd(d.product!)
      setForm(EMPTY_COMP_FORM); setImageFile(null); setImagePreview(""); setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : c.registerFailed)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.common.confirmDelete)) return
    await fetch(`/api/competitors?id=${id}`, { method: "DELETE" })
    onDelete(id)
  }

  return (
    <div className="space-y-4">
      {/* 追加ボタン */}
      <div className="flex justify-end">
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
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
            「{product.name}」{c.formTitle}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["brandName",   c.brandName,   "例: COSRX",             true],
              ["productName", c.productName, "例: スネイルエッセンス", true],
              ["price",       c.price,       "例: ¥2,000",             false],
              ["category",    c.category,    "例: 化粧水",              false],
            ] as [keyof typeof form, string, string, boolean][]).map(([key, label, ph, req]) => (
              <div key={key}>
                <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                  {label} {req && <span style={{ color: "var(--accent)" }}>*</span>}
                </label>
                <input
                  type="text" value={form[key]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
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
            ["tags",     c.tags,     "例: 保湿, 毛穴, プチプラ",          false],
          ] as [keyof typeof form, string, string, boolean][]).map(([key, label, ph, req]) => (
            <div key={key}>
              <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                {label} {req && <span style={{ color: "var(--accent)" }}>*</span>}
              </label>
              <textarea
                value={form[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={ph} rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </div>
          ))}

          {/* 画像アップロード */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
              {c.imageLabel} <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {imagePreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" className="w-32 h-32 object-cover rounded-xl"
                  style={{ border: "1px solid var(--border)" }} />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview("") }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                  style={{ background: "var(--accent)" }}
                >×</button>
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
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setImage(f); e.target.value = "" }} />
                <Upload className="w-6 h-6 mx-auto mb-1" style={{ color: "var(--muted)" }} />
                <p className="text-xs" style={{ color: "var(--muted)" }}>{c.imageDrop}</p>
              </div>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}

          <button
            type="submit" disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--accent)" }}
          >
            {saving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t.common.registering}</>
              : t.common.register}
          </button>
        </form>
      )}

      {/* 競合商品一覧 */}
      {competitors.length === 0 && !showForm ? (
        <div className="rounded-2xl p-10 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{c.noCompetitors}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{c.noCompetitorsHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {competitors.map(cp => (
            <div key={cp.id} className="rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cp.imageUrl} alt={cp.productName}
                  className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                  style={{ border: "1px solid var(--border)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{cp.brandName}</p>
                  <p className="font-bold text-sm mt-0.5 leading-tight" style={{ color: "var(--text)" }}>{cp.productName}</p>
                  {cp.price && <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>{cp.price}</p>}
                  {cp.category && (
                    <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      {cp.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-4 pb-3 space-y-1.5 text-xs"
                style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.featureLabel}</span>{cp.features}</p>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.prosLabel}</span>{cp.pros}</p>
                <p style={{ color: "var(--text)" }}><span style={{ color: "var(--muted)" }}>{c.consLabel}</span>{cp.cons}</p>
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={() => handleDelete(cp.id)}
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

// ─── メインページ ─────────────────────────────────────────────────

type View = "list" | "new" | "detail"

export default function V3ProductsPage() {
  const { lang } = useLanguage()
  const t = useT(lang)
  const p = t.products
  const { products, loading, addProduct, updateProduct, removeProduct } = useProducts()

  const [view, setView]                   = useState<View>("list")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [competitors, setCompetitors]     = useState<CompetitorProduct[]>([])
  const [compLoading, setCompLoading]     = useState(false)

  // 新規登録フォームの state
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName]               = useState("")
  const [ingredients, setIngredients] = useState("")
  const [howToUse, setHowToUse]       = useState("")
  const [price, setPrice]             = useState("")
  const [appealPoints, setAppealPoints]   = useState("")
  const [forbiddenWords, setForbiddenWords] = useState("")
  const [pdfText, setPdfText]         = useState("")
  const [preview, setPreview]         = useState<string | null>(null)
  const [base64, setBase64]           = useState("")
  const [mime, setMime]               = useState("image/jpeg")
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  // 競合商品を一覧表示用にマウント時に読み込む
  useEffect(() => {
    fetch("/api/competitors")
      .then(r => r.json() as Promise<{ products: CompetitorProduct[] }>)
      .then(d => setCompetitors(d.products ?? []))
  }, [])

  // 商品選択時に競合商品を再読み込み（最新状態を保証）
  useEffect(() => {
    if (!selectedProduct) return
    setCompLoading(true)
    fetch("/api/competitors")
      .then(r => r.json() as Promise<{ products: CompetitorProduct[] }>)
      .then(d => setCompetitors(d.products ?? []))
      .finally(() => setCompLoading(false))
  }, [selectedProduct])

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

  function resetNewForm() {
    setName(""); setIngredients(""); setHowToUse(""); setPrice("")
    setAppealPoints(""); setForbiddenWords(""); setPdfText("")
    setPreview(null); setBase64(""); setMime("image/jpeg")
    if (fileRef.current) fileRef.current.value = ""
    setError(null); setSuccess(false)
  }

  async function handleSave() {
    if (!name || !ingredients || !howToUse || !base64) { setError(p.errorRequired); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, ingredients, howToUse,
          price: price || undefined,
          appealPoints: appealPoints || undefined,
          forbiddenWords: forbiddenWords || undefined,
          pdfText: pdfText || undefined,
          imageBase64: base64, imageMime: mime,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? p.registerFailed)
      addProduct(data as Product)
      resetNewForm()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : p.registerFailed)
    } finally {
      setSaving(false)
    }
  }

  function openDetail(product: Product) {
    setSelectedProduct(product)
    setView("detail")
  }

  const currentCompetitors = selectedProduct
    ? competitors.filter(c => c.productId === selectedProduct.id)
    : []

  // ── 一覧ビュー ───────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>{p.pageTitle}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              {products.length}件
            </span>
          </div>
          <button
            onClick={() => { resetNewForm(); setView("new") }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
            style={{ background: "var(--accent)" }}
          >
            <Plus className="w-4 h-4" />
            {p.newProduct}
          </button>
        </div>

        {/* 商品カードグリッド */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--muted)" }}>
            <Package className="w-10 h-10" style={{ color: "var(--border)" }} />
            <p className="text-sm">{p.noProducts}</p>
            <button
              onClick={() => { resetNewForm(); setView("new") }}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              <Plus className="w-4 h-4" />{p.newProduct}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map(prod => (
              <ProductListCard
                key={prod.id}
                product={prod}
                competitorCount={competitors.filter(c => c.productId === prod.id).length}
                onClick={() => openDetail(prod)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 新規登録ビュー ────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <ChevronLeft className="w-4 h-4" />{t.common.back}
          </button>
          <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>{p.newProduct}</h1>
        </div>

        <div className="max-w-sm rounded-2xl p-6 space-y-4"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          {/* 画像アップロード */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
              {p.imageLabel} <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="relative border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-center overflow-hidden"
              style={{ height: 140, borderColor: preview ? "var(--accent)" : "var(--border)", background: "var(--accent-light)" }}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <div className="text-center">
                  <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--accent)" }} />
                  <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>{p.imageDrop}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{p.imageFormats}</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>

          <Field label={p.nameLabel} value={name} onChange={setName} placeholder="例: 22:00 アネトス クレンジングウォーター" required />
          <Field label={p.ingredientsLabel} value={ingredients} onChange={setIngredients} placeholder="例: セラミド配合で肌バリアを補強..." rows={4} required hint={p.ingredientsHint} />
          <Field label={p.howToUseLabel} value={howToUse} onChange={setHowToUse} placeholder="例: コットンに染み込ませて優しく拭き取る" rows={2} required />
          <Field label={p.priceLabel} value={price} onChange={setPrice} placeholder="例: ¥2,200（税込）" />
          <Field label={p.appealLabel} value={appealPoints} onChange={setAppealPoints} placeholder="例: 敏感肌処方・無香料・皮膚科医監修" rows={2} hint={p.appealHint} />
          <Field label={p.forbiddenLabel} value={forbiddenWords} onChange={setForbiddenWords} placeholder="例: 治る, 治療する, メラニン分解" rows={2} hint={p.forbiddenHint} />
          <PdfUploader pdfText={pdfText} onExtracted={setPdfText} />

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>{p.successMsg}</p>
            </div>
          )}

          <button
            onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Plus className="w-4 h-4" />{t.common.register}</>}
          </button>
        </div>
      </div>
    )
  }

  // ── 詳細ビュー ───────────────────────────────────────────────────
  if (!selectedProduct) return null

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setView("list"); setSelectedProduct(null) }}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70 flex-shrink-0"
          style={{ color: "var(--muted)" }}
        >
          <ChevronLeft className="w-4 h-4" />{t.common.back}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedProduct.imageUrl} alt={selectedProduct.name}
          className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
          style={{ border: "1px solid var(--border)" }}
        />
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate" style={{ color: "var(--text)" }}>{selectedProduct.name}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>競合商品 {currentCompetitors.length}件</p>
        </div>
      </div>

      {/* 2カラムレイアウト */}
      <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
        {/* 左：商品編集 */}
        <div className="lg:flex-shrink-0 lg:w-80 rounded-2xl p-6 space-y-1"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Pencil className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>商品編集</h2>
          </div>
          <ProductEditForm
            product={selectedProduct}
            onSaved={updated => {
              updateProduct(updated)
              setSelectedProduct(updated)
            }}
            onDeleted={id => {
              removeProduct(id)
              setView("list")
              setSelectedProduct(null)
            }}
          />
        </div>

        {/* 右：競合商品 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
              競合商品
              <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--muted)" }}>
                {currentCompetitors.length}件
              </span>
            </h2>
          </div>
          {compLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-4 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            </div>
          ) : (
            <CompetitorSection
              product={selectedProduct}
              competitors={currentCompetitors}
              onAdd={cp => setCompetitors(prev => [cp, ...prev])}
              onDelete={id => setCompetitors(prev => prev.filter(c => c.id !== id))}
            />
          )}
        </div>
      </div>
    </div>
  )
}
