/**
 * FAL (fal.ai) — Nano Banana 2 による UGC風画像生成
 *
 * - カバー: fal-ai/nano-banana-2（参照サムネをスタイルガイドに）
 * - コンテンツスライド2〜5: 同上（各postフォルダの参照画像を使用）
 * - テンプレート表紙は Sharp ローカル合成を使うため FAL 不要
 *
 * 共通ルール: no watermark, no repost icon, no social media UI
 */

import { fal } from "@fal-ai/client"
import { put } from "@vercel/blob"
import fs from "fs"
import path from "path"

fal.config({ credentials: process.env.FAL_KEY! })

// ─── 定数 ────────────────────────────────────────────────────────

const NO_UI = "no watermark, no repost icon, no social media UI, no share button, no app interface overlay, no Instagram UI, no TikTok UI, clean image only, no people, no face, no full body, no human figure, close-up of hands holding product or applying to skin is acceptable but no portraits"

const COLOR_TONES: Record<string, string> = {
  pink:   "soft pink and white feminine pastel",
  blue:   "clean light blue and white fresh minimal",
  green:  "natural green and cream organic botanical",
  yellow: "bright yellow and white vitamin citrus",
  purple: "elegant lavender and white luxury",
  orange: "warm orange and cream energetic glow",
  teal:   "clean teal and white minimal spa",
  mono:   "black and white minimal stylish editorial",
}

const REF_CATEGORIES: Record<string, string> = {
  "商品切り抜き型": "A_商品切り抜き型",
  "手持ちUGC型":   "B_手持ちUGC型",
  "直置きUGC型":   "C_直置きUGC型",
  "記事投稿型":    "D_記事投稿型",
}

// ─── 同時実行制御 + リトライ ──────────────────────────────────────

class Semaphore {
  private queue: (() => void)[] = []
  constructor(private permits: number) {}
  acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return Promise.resolve() }
    return new Promise(r => this.queue.push(r))
  }
  release() {
    if (this.queue.length > 0) { this.queue.shift()!() } else { this.permits++ }
  }
}
const sem = new Semaphore(5)

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  for (let i = 1; i <= retries; i++) {
    try { return await fn() } catch (err) {
      const e = err as { status?: number; message?: string }
      console.error(`[FAL] error (attempt ${i}/${retries}): status=${e.status} message=${e.message}`)
      // 403 Forbidden は再試行しても意味がないので即throw
      if (e.status === 403) throw err
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, delay * i))
    }
  }
  throw new Error("unreachable")
}

// ─── 内部ユーティリティ ──────────────────────────────────────────

async function uploadBlob(buf: Buffer, name: string, ct = "image/jpeg"): Promise<string> {
  const { url } = await put(`cocochi/tmp/${name}`, buf, { access: "public", contentType: ct, addRandomSuffix: true })
  return url
}

function pickThumbImage(patternName: string): Buffer | null {
  try {
    const category = REF_CATEGORIES[patternName] ?? "B_UGC風"
    const dir = path.join(process.cwd(), "reference", category, "サムネ")
    if (!fs.existsSync(dir)) return null
    const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f))
    if (!files.length) return null
    return fs.readFileSync(path.join(dir, files[Math.floor(Math.random() * files.length)]))
  } catch { return null }
}

function pickPostImage(patternName: string, slideNumber: number): Buffer | null {
  try {
    const category = REF_CATEGORIES[patternName] ?? "B_UGC風"
    const baseDir = path.join(process.cwd(), "reference", category)
    const posts = fs.readdirSync(baseDir).filter(d => d.startsWith("post"))
    const candidates: string[] = []
    for (const post of posts) {
      const p = path.join(baseDir, post, `${slideNumber}.jpg`)
      if (fs.existsSync(p)) candidates.push(p)
    }
    if (!candidates.length) return null
    return fs.readFileSync(candidates[Math.floor(Math.random() * candidates.length)])
  } catch { return null }
}

/** FAL で画像を1枚生成して Buffer を返す（セマフォ + リトライ済み） */
async function generateImage(prompt: string, imageUrls: string[]): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      type FalResult = { images: { url: string }[] }

      const baseInput = {
        prompt,
        aspect_ratio: "3:4",
        resolution: "1K",
        output_format: "jpeg",
      }

      // 画像URLがある場合は /edit エンドポイント（image-to-image）、なければテキストのみ
      const model = imageUrls.length > 0 ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2"
      const input = imageUrls.length > 0
        ? { ...baseInput, image_urls: imageUrls }
        : baseInput

      console.log(`[FAL] calling model: ${model}, imageUrls: ${imageUrls.length}`)
      const res = await fal.subscribe(model, { input })
      const resultData = res.data as FalResult

      const imageUrl = resultData?.images?.[0]?.url
      if (!imageUrl) throw new Error("FAL: 画像URLが取得できません")
      console.log(`[FAL] 生成完了: ${imageUrl.slice(0, 60)}...`)

      const dl = await fetch(imageUrl)
      if (!dl.ok) throw new Error(`FAL: 画像DL失敗 ${dl.status}`)
      return Buffer.from(await dl.arrayBuffer())
    })
  } finally {
    sem.release()
  }
}

// ─── 公開 API ─────────────────────────────────────────────────────

export interface UGCCoverParams {
  productName: string
  headline: string
  tag: string
  patternName: string
  colorPalette: string
  productImageBase64: string
  instruction?: string
}

/** スライド1（表紙）を FAL FLUX で生成 */
export async function generateUGCCover(params: UGCCoverParams): Promise<Buffer> {
  const { productName, headline, tag, patternName, colorPalette, productImageBase64, instruction } = params
  const tone = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)
  const imageUrls: string[] = [productUrl]

  // 参照サムネをBlobにアップ
  const refBuf = pickThumbImage(patternName)
  if (refBuf) {
    imageUrls.push(await uploadBlob(refBuf, `ref_thumb_${Date.now()}.jpg`))
    console.log(`[FAL] cover ref loaded for ${patternName}`)
  }

  // 記事投稿型のカバーは商品画像を使わない（背景＋タイトルのみ）
  if (patternName === "記事投稿型") {
    const refOnly: string[] = []
    const refBuf = pickThumbImage(patternName)
    if (refBuf) refOnly.push(await uploadBlob(refBuf, `ref_thumb_${Date.now()}.jpg`))
    const prompt = `Japanese beauty lifestyle Instagram cover, aesthetic background scene — morning vanity, botanical shelf, soft window light. No product visible. Large bold Japanese title text: "${headline}", small stylish tag: "${tag}". ${tone} colors, editorial magazine quality. Portrait orientation. ${NO_UI}`
    return generateImage(prompt, refOnly)
  }

  let prompt: string
  if (patternName === "手持ちUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram photo featuring the exact skincare product shown in the reference image. The product must be clearly visible — held in hand or being applied to skin (close-up hands only). ${tone} color tones, natural soft lighting, genuine user-generated content feel. Large bold Japanese text overlay: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram photo featuring the exact skincare product shown in the reference image. The product must be resting on a surface — placed on a desk, wooden shelf, bathroom counter, or fluffy rug. Do NOT show hands holding the product. ${tone} color tones, natural soft lighting, genuine user-generated content feel. Large bold Japanese text overlay: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Japanese beauty Instagram photo featuring the exact product shown in the reference image. The product must appear naturally in the scene — on a shelf, vanity, or surrounded by botanical props. ${tone} colors, soft natural lighting, cozy minimal aesthetic. Large elegant bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` Additional style note: ${instruction}`
  return generateImage(prompt, imageUrls)
}

// ─────────────────────────────────────────────────────────────────

export interface ContentSlideParams {
  productName: string
  slideNumber: number
  headline: string
  tag: string
  bullets?: string[]
  accent?: string
  price?: string
  patternName: string
  colorPalette: string
  productImageBase64: string
  instruction?: string
}

/** スライド2〜5（コンテンツ）を FAL FLUX で生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64, instruction } = params
  const tone = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)
  const imageUrls: string[] = [productUrl]

  // 対応するpostフォルダの参照画像をBlobにアップ
  const refBuf = pickPostImage(patternName, slideNumber)
  if (refBuf) {
    imageUrls.push(await uploadBlob(refBuf, `ref_post_s${slideNumber}_${Date.now()}.jpg`))
    console.log(`[FAL] slide ${slideNumber} ref loaded for ${patternName}`)
  }

  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""
  const priceText = price ? `price tag showing ${price}` : ""

  let prompt: string
  if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram carousel slide featuring the exact skincare product shown in the reference image. The product must be clearly visible — placed on a desk, shelf, or bathroom counter (not held in hand). ${tone} color aesthetic, natural soft lighting. Large bold Japanese headline: "${headline}", small tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}${priceText ? `, ${priceText}` : ""}. Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Japanese Instagram carousel slide photo featuring the exact skincare product shown in the reference image. The product must be clearly visible in the scene — placed on a surface, held close, or applied to skin (close-up hands or skin only). ${tone} color aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", small tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}${priceText ? `, ${priceText}` : ""}. Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` Additional style note: ${instruction}`
  return generateImage(prompt, imageUrls)
}
