import { put, del } from "@vercel/blob"
import fs from "fs"
import path from "path"
import type { Product } from "@/types"

const DATA_DIR      = path.join(process.cwd(), "data")
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json")

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadProducts(): Product[] {
  ensureDirs()
  if (!fs.existsSync(PRODUCTS_FILE)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8")) as (Product & { efficacy?: string })[]
    // backward compat: efficacy → ingredients
    return raw.map(p => ({
      ...p,
      ingredients: p.ingredients ?? p.efficacy ?? "",
    }))
  } catch { return [] }
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
  ensureDirs()
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
  const products = loadProducts()
  products.unshift(product)
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8")
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
  ensureDirs()
  const products = loadProducts()
  const idx = products.findIndex(p => p.id === id)
  if (idx === -1) throw new Error("商品が見つかりません")
  const existing = products[idx]

  let imageUrl = existing.imageUrl
  let imageMime = existing.imageMime

  if (params.imageBase64 && params.imageMime) {
    const ext = (params.imageMime || "image/jpeg").split("/")[1] || "jpg"
    const buf = Buffer.from(params.imageBase64, "base64")
    const blob = await put(`cocochi/products/${id}.${ext}`, buf, {
      access: "public",
      contentType: params.imageMime,
      allowOverwrite: true,
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
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8")
  return updated
}

export async function deleteProduct(id: string): Promise<void> {
  ensureDirs()
  const products = loadProducts()
  const target = products.find(p => p.id === id)
  if (target?.imageUrl) {
    try { await del(target.imageUrl) } catch { /* Blob削除失敗は無視 */ }
  }
  const updated = products.filter(p => p.id !== id)
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(updated, null, 2), "utf-8")
}
