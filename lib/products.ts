/**
 * 商品ストレージ
 * - 画像: Vercel Blob（公開URL）
 * - メタデータ: Vercel Blob（products.json）— ファイルシステム非依存
 */
import { put, list, del } from "@vercel/blob"
import type { Product } from "@/types"

const PRODUCTS_BLOB_PATH = "cocochi/db/products.json"

// ─── 内部ユーティリティ ───────────────────────────────────────────

async function loadProductsFromBlob(): Promise<Product[]> {
  try {
    const { blobs } = await list({ prefix: PRODUCTS_BLOB_PATH })
    const blob = blobs.find(b => b.pathname === PRODUCTS_BLOB_PATH)
    if (!blob) return []
    const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return []
    const raw = await res.json() as (Product & { efficacy?: string })[]
    // backward compat: efficacy → ingredients
    return raw.map(p => ({
      ...p,
      ingredients: p.ingredients ?? p.efficacy ?? "",
    }))
  } catch {
    return []
  }
}

async function saveProductsToBlob(products: Product[]): Promise<void> {
  await put(PRODUCTS_BLOB_PATH, JSON.stringify(products, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  })
}

// ─── 公開API ─────────────────────────────────────────────────────

export async function loadProducts(): Promise<Product[]> {
  return loadProductsFromBlob()
}

export async function createProduct(params: {
  name: string
  ingredients: string
  howToUse: string
  price?: string
  appealPoints?: string
  forbiddenWords?: string
  pdfText?: string
  imageBase64: string
  imageMime: string
}): Promise<Product> {
  const id = crypto.randomUUID()
  const ext = (params.imageMime || "image/jpeg").split("/")[1] || "jpg"
  const buf = Buffer.from(params.imageBase64, "base64")
  const blob = await put(`cocochi/products/${id}.${ext}`, buf, {
    access: "public",
    contentType: params.imageMime,
  })
  const product: Product = {
    id,
    createdAt: new Date().toISOString(),
    name: params.name,
    ingredients: params.ingredients,
    howToUse: params.howToUse,
    price: params.price || undefined,
    appealPoints: params.appealPoints || undefined,
    forbiddenWords: params.forbiddenWords || undefined,
    pdfText: params.pdfText || undefined,
    imageUrl: blob.url,
    imageMime: params.imageMime,
  }
  const products = await loadProductsFromBlob()
  products.unshift(product)
  await saveProductsToBlob(products)
  return product
}

export async function updateProduct(id: string, params: {
  name: string
  ingredients: string
  howToUse: string
  price?: string
  appealPoints?: string
  forbiddenWords?: string
  pdfText?: string
  imageBase64?: string
  imageMime?: string
}): Promise<Product> {
  const products = await loadProductsFromBlob()
  const idx = products.findIndex(p => p.id === id)
  if (idx === -1) throw new Error("商品が見つかりません")
  const existing = products[idx]

  let imageUrl = existing.imageUrl
  let imageMime = existing.imageMime

  if (params.imageBase64 && params.imageMime) {
    const ext = (params.imageMime || "image/jpeg").split("/")[1] || "jpg"
    const buf = Buffer.from(params.imageBase64, "base64")
    // タイムスタンプ付きファイル名で新規アップロード → CDNキャッシュをバイパス
    const blob = await put(`cocochi/products/${id}_${Date.now()}.${ext}`, buf, {
      access: "public",
      contentType: params.imageMime,
    })
    imageUrl = blob.url
    imageMime = params.imageMime
  }

  const updated: Product = {
    ...existing,
    name: params.name,
    ingredients: params.ingredients,
    howToUse: params.howToUse,
    price: params.price || undefined,
    appealPoints: params.appealPoints || undefined,
    forbiddenWords: params.forbiddenWords || undefined,
    pdfText: params.pdfText ?? existing.pdfText,
    imageUrl,
    imageMime,
  }
  products[idx] = updated
  await saveProductsToBlob(products)
  return updated
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await loadProductsFromBlob()
  const target = products.find(p => p.id === id)
  if (target?.imageUrl) {
    try { await del(target.imageUrl) } catch { /* Blob削除失敗は無視 */ }
  }
  const updated = products.filter(p => p.id !== id)
  await saveProductsToBlob(updated)
}
