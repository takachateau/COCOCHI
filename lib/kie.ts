/**
 * KIE nano-banana-2 — 全スライド画像生成
 *
 * スライド1（表紙）: generateUGCCover
 * スライド2〜5（コンテンツ）: generateContentSlide
 *
 * 共通ルール（全プロンプトに適用）:
 * - no watermark, no repost icon, no social media UI, no share button, no app interface
 */

import { put } from "@vercel/blob"
import fs from "fs"
import path from "path"

const KIE_API_KEY = process.env.KIE_API_KEY!
const CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
const RECORD_INFO_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

// ─── 同時実行制御 ─────────────────────────────────────────────────
// KIE APIのレート制限対策: 同時リクエストを最大4に制限
class Semaphore {
  private queue: (() => void)[] = []
  constructor(private permits: number) {}
  acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return Promise.resolve() }
    return new Promise(resolve => this.queue.push(resolve))
  }
  release() {
    if (this.queue.length > 0) { this.queue.shift()!() } else { this.permits++ }
  }
}
const kieSemaphore = new Semaphore(4)

/** リトライ付きでKIE生成を実行 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 2000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      console.warn(`[KIE] retry ${attempt}/${maxRetries - 1}:`, (err as Error).message)
      await new Promise(r => setTimeout(r, delayMs * attempt))
    }
  }
  throw new Error("unreachable")
}

// パターン名 → 参照カテゴリ
const REF_CATEGORIES: Record<string, string> = {
  "テンプレート":   "A_商品切り抜き",
  "手持ちUGC":     "B_UGC風",
  "ライフスタイル": "C_商品なし",
}

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

// 全プロンプトに付与するネガティブ指示
const NO_UI = "no watermark, no repost icon, no social media UI, no share button, no app interface overlay, no Instagram UI, no TikTok UI, no caption bar, clean image only, no people, no face, no full body, no human figure, close-up of hands holding or applying product is acceptable but no portraits"

// ─── 内部ユーティリティ ──────────────────────────────────────────

async function uploadBlob(buf: Buffer, name: string, ct = "image/jpeg"): Promise<string> {
  const { url } = await put(`cocochi/tmp/${name}`, buf, { access: "public", contentType: ct, addRandomSuffix: true })
  return url
}

/** サムネフォルダからランダムに1枚（表紙用） */
function pickThumbImage(patternName: string): Buffer | null {
  try {
    const category = REF_CATEGORIES[patternName] ?? "B_UGC風"
    const dir = path.join(process.cwd(), "reference", category, "サムネ")
    if (!fs.existsSync(dir)) return null
    const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f))
    if (!files.length) return null
    const file = files[Math.floor(Math.random() * files.length)]
    return fs.readFileSync(path.join(dir, file))
  } catch { return null }
}

/** postフォルダから指定スライド番号の参照画像をランダムに1枚（コンテンツスライド用） */
function pickPostImage(patternName: string, slideNumber: number): Buffer | null {
  try {
    const category = REF_CATEGORIES[patternName] ?? "B_UGC風"
    const baseDir = path.join(process.cwd(), "reference", category)
    const posts = fs.readdirSync(baseDir).filter(d => d.startsWith("post"))

    // slideNumber.jpg を持つpostフォルダを収集
    const candidates: string[] = []
    for (const post of posts) {
      const filePath = path.join(baseDir, post, `${slideNumber}.jpg`)
      if (fs.existsSync(filePath)) candidates.push(filePath)
    }
    if (!candidates.length) return null

    const picked = candidates[Math.floor(Math.random() * candidates.length)]
    return fs.readFileSync(picked)
  } catch { return null }
}

/** KIEタスク作成 → taskId */
async function createTask(prompt: string, imageUrls: string[], aspectRatio = "3:4"): Promise<string> {
  const body = {
    model: "nano-banana-2",
    input: {
      prompt,
      image_input: imageUrls,
      aspect_ratio: aspectRatio,
      resolution: "1K",
      output_format: "jpg",
    },
  }

  const res = await fetch(CREATE_TASK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`KIE createTask (${res.status}): ${(await res.text()).slice(0, 300)}`)

  const json = await res.json() as { data?: { taskId?: string } }
  const taskId = json?.data?.taskId
  if (!taskId) throw new Error(`KIE: taskId取得失敗 — ${JSON.stringify(json)}`)
  console.log(`[KIE] task created: ${taskId}`)
  return taskId
}

/** ポーリング → 生成画像URL */
async function pollResult(taskId: string, timeoutMs = 90_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`${RECORD_INFO_URL}?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${KIE_API_KEY}` },
    })
    if (!res.ok) continue
    const json = await res.json() as { data?: { state?: string; resultJson?: string } }
    const { state, resultJson } = json?.data ?? {}
    console.log(`[KIE] ${taskId} → ${state}`)
    if (state === "success") {
      const url = (JSON.parse(resultJson ?? "{}") as { resultUrls?: string[] }).resultUrls?.[0]
      if (!url) throw new Error("KIE: resultUrls空")
      return url
    }
    if (state === "fail") throw new Error("KIE: 生成失敗")
  }
  throw new Error("KIE: タイムアウト (90秒)")
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`画像DL失敗: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** セマフォ + リトライ付きでKIE画像を1枚生成して返す */
async function generateWithKie(prompt: string, imageUrls: string[], aspectRatio = "3:4"): Promise<Buffer> {
  await kieSemaphore.acquire()
  try {
    return await withRetry(async () => {
      const taskId = await createTask(prompt, imageUrls, aspectRatio)
      const resultUrl = await pollResult(taskId)
      return downloadImage(resultUrl)
    })
  } finally {
    kieSemaphore.release()
  }
}

// ─── 公開 API ────────────────────────────────────────────────────

export interface UGCCoverParams {
  productName: string
  headline: string
  tag: string
  patternName: string
  colorPalette: string
  productImageBase64: string
}

/** スライド1（表紙）をnano-banana-2で生成 */
export async function generateUGCCover(params: UGCCoverParams): Promise<Buffer> {
  const { productName, headline, tag, patternName, colorPalette, productImageBase64 } = params
  const tone = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像・参照画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)
  const imageUrls: string[] = [productUrl]

  const refBuf = pickThumbImage(patternName)
  if (refBuf) {
    imageUrls.push(await uploadBlob(refBuf, `ref_thumb_${Date.now()}.jpg`))
    console.log(`[KIE] cover ref loaded for ${patternName}`)
  }

  let prompt: string
  if (patternName === "テンプレート") {
    prompt = `Japanese beauty product clean Instagram post, "${productName}" cosmetic product displayed on minimal background, ${tone} color aesthetic, large bold Japanese text "${headline}" prominently shown, small Japanese subtitle "${tag}", soft studio lighting, beauty photography style, vertical portrait composition, ${NO_UI}`
  } else if (patternName === "手持ちUGC") {
    prompt = `Authentic Japanese UGC-style Instagram post about "${productName}" skincare, ${tone} color tones, lifestyle beauty aesthetic, natural soft lighting, large bold Japanese text overlay "${headline}", small tag text "${tag}", genuine user-generated content feel, not necessarily hand-holding, could be flat lay or shelf styling or beauty desk setup, vertical portrait, ${NO_UI}`
  } else {
    prompt = `Japanese lifestyle beauty Instagram content, cozy minimal aesthetic for "${productName}", ${tone} colors, no product logo visible, soft natural lighting, large elegant bold Japanese text "${headline}" center, small decorative Japanese tag "${tag}", warm inviting atmosphere, magazine editorial quality, vertical portrait, ${NO_UI}`
  }

  return generateWithKie(prompt, imageUrls)
}

// ─────────────────────────────────────────────────────────────────

export interface ContentSlideParams {
  productName: string
  slideNumber: number     // 2〜5
  headline: string
  tag: string
  bullets?: string[]
  accent?: string
  price?: string
  patternName: string
  colorPalette: string
  productImageBase64: string
}

/** スライド2〜5（コンテンツ）をnano-banana-2で生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64 } = params
  const tone = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像・参照画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)
  const imageUrls: string[] = [productUrl]

  const refBuf = pickPostImage(patternName, slideNumber)
  if (refBuf) {
    imageUrls.push(await uploadBlob(refBuf, `ref_post_s${slideNumber}_${Date.now()}.jpg`))
    console.log(`[KIE] slide ${slideNumber} ref loaded for ${patternName}`)
  }

  // テキスト内容をまとめる
  const bulletText = bullets?.join(" / ") ?? ""
  const priceText = price ? `price tag ${price}` : ""
  const accentText = accent ?? ""

  const prompt = `Japanese Instagram carousel slide ${slideNumber} featuring the exact skincare product shown in the reference image — the product must be clearly visible in the scene, placed on a surface, held in hand (close-up), or applied to skin. ${tone} color aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", small tag: "${tag}"${bulletText ? `, bullet points in Japanese: "${bulletText}"` : ""}${accentText ? `, accent text "${accentText}"` : ""}${priceText ? `, ${priceText}` : ""}. Vertical portrait composition. ${NO_UI}`

  return generateWithKie(prompt, imageUrls)
}
