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

// パターン別参照画像フォルダ
const REF_DIRS: Record<string, string> = {
  "手持ちUGC型": "reference/B_手持ちUGC型",
  "直置きUGC型": "reference/C_直置きUGC型",
  "記事投稿型":  "reference/D_記事投稿型",
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

/** パターンのサムネフォルダからランダムに1枚選択 */
function pickThumbImage(patternName: string): Buffer | null {
  const dir = REF_DIRS[patternName]
  if (!dir) return null
  const thumbDir = path.join(process.cwd(), dir, "サムネ")
  try {
    const files = fs.readdirSync(thumbDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    if (files.length === 0) return null
    const file = files[Math.floor(Math.random() * files.length)]
    return fs.readFileSync(path.join(thumbDir, file))
  } catch {
    return null
  }
}

/** パターンのpostフォルダからスライド番号に対応する画像を選択 */
function pickPostImage(patternName: string, slideNumber: number): Buffer | null {
  const dir = REF_DIRS[patternName]
  if (!dir) return null
  const baseDir = path.join(process.cwd(), dir)
  try {
    // postフォルダ一覧をランダム順で取得
    const posts = fs.readdirSync(baseDir).filter(d => d.startsWith("post"))
    if (posts.length === 0) return null
    const post = posts[Math.floor(Math.random() * posts.length)]
    const postDir = path.join(baseDir, post)
    // slideNumber に対応するファイル（2.jpg, 3.jpg …）
    const target = `${slideNumber}.jpg`
    const filePath = path.join(postDir, target)
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath)
    // なければ最初の画像を返す
    const files = fs.readdirSync(postDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    if (files.length === 0) return null
    return fs.readFileSync(path.join(postDir, files[0]))
  } catch {
    return null
  }
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

  // 参照サムネを取得してBlobにアップ
  const refBuf = pickThumbImage(patternName)
  const refUrl = refBuf ? await uploadBlob(refBuf, `ref_thumb_${Date.now()}.jpg`) : null

  if (patternName === "記事投稿型") {
    const prompt = `Japanese beauty lifestyle Instagram cover, aesthetic background scene — morning vanity, botanical shelf, soft window light. No product visible. Large bold Japanese title text: "${headline}", small stylish tag: "${tag}". ${tone} colors, editorial magazine quality. Portrait orientation. ${NO_UI}`
    return generateImage(prompt, refUrl ? [refUrl] : [])
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

  const imageUrls = [productUrl, ...(refUrl ? [refUrl] : [])]
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
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_s${slideNumber}_${Date.now()}.jpg`)

  // 参照画像を取得してBlobにアップ
  const refBuf = pickPostImage(patternName, slideNumber)
  const refUrl = refBuf ? await uploadBlob(refBuf, `ref_post_s${slideNumber}_${Date.now()}.jpg`) : null

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

  const imageUrls = [productUrl, ...(refUrl ? [refUrl] : [])]
  return generateImage(prompt, imageUrls)
}
