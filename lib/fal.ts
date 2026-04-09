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


/** FAL で画像を1枚生成して Buffer を返す（セマフォ + リトライ済み） */
async function generateImage(prompt: string, imageUrls: string[]): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      type FalResult = { images: { url: string }[] }

      // 画像ありの場合は FLUX Kontext Multi（スタイル+内容を分離して理解できる）
      // 画像なしの場合は nano-banana-2（テキストのみ生成）
      if (imageUrls.length > 0) {
        const input = {
          prompt,
          image_urls: imageUrls,
          output_format: "jpeg" as const,
        }
        console.log(`[FAL] calling model: fal-ai/flux-pro/kontext/multi, images: ${imageUrls.length}`)
        const res = await fal.subscribe("fal-ai/flux-pro/kontext/multi", { input })
        const resultData = res.data as FalResult
        const imageUrl = resultData?.images?.[0]?.url
        if (!imageUrl) throw new Error("FAL: 画像URLが取得できません")
        console.log(`[FAL] 生成完了: ${imageUrl.slice(0, 60)}...`)
        const dl = await fetch(imageUrl)
        if (!dl.ok) throw new Error(`FAL: 画像DL失敗 ${dl.status}`)
        return Buffer.from(await dl.arrayBuffer())
      } else {
        const input = {
          prompt,
          aspect_ratio: "3:4",
          resolution: "1K",
          output_format: "jpeg",
        }
        console.log(`[FAL] calling model: fal-ai/nano-banana-2 (text only)`)
        const res = await fal.subscribe("fal-ai/nano-banana-2", { input })
        const resultData = res.data as FalResult
        const imageUrl = resultData?.images?.[0]?.url
        if (!imageUrl) throw new Error("FAL: 画像URLが取得できません")
        console.log(`[FAL] 生成完了: ${imageUrl.slice(0, 60)}...`)
        const dl = await fetch(imageUrl)
        if (!dl.ok) throw new Error(`FAL: 画像DL失敗 ${dl.status}`)
        return Buffer.from(await dl.arrayBuffer())
      }
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
  refImageUrl?:       string   // reference.ts が選択・アップロード済みのURL
  styleDescription?:  string   // Claude Vision が生成したスタイル説明文
  instruction?: string
}

/** スライド1（表紙）を FAL FLUX Kontext で生成 */
export async function generateUGCCover(params: UGCCoverParams): Promise<Buffer> {
  const { productName, headline, tag, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone      = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)

  // Kontext向けプロンプト:
  // image_urls[0] = 商品画像（内容の参照）
  // image_urls[1] = 参照スライド（スタイルの参照）
  // 「画像1の商品を使って、画像2のスタイルでInstagramスライドを作れ」という指示形式
  const styleGuide = styleDescription
    ? `Match the visual style of the second reference image exactly: ${styleDescription}.`
    : "Use a clean Japanese UGC beauty aesthetic."

  if (patternName === "記事投稿型") {
    const prompt = `Create a Japanese beauty lifestyle Instagram cover slide. ${styleGuide} The scene should feel like a morning vanity or botanical shelf with soft window light. No product in the scene. Include large bold Japanese title text: "${headline}" and small tag: "${tag}". ${tone} color palette. Portrait orientation. ${NO_UI}`
    return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
  }

  let prompt: string
  if (patternName === "手持ちUGC型") {
    prompt = `Using the product from the first image, create a Japanese UGC-style Instagram cover slide in the visual style of the second image. The product must be held in hand or applied to skin (close-up hands only, no face). ${styleGuide} ${tone} tones, natural soft lighting. Include large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else if (patternName === "直置きUGC型") {
    prompt = `Using the product from the first image, create a Japanese UGC-style Instagram cover slide in the visual style of the second image. The product must be placed on a surface (desk, shelf, or bathroom counter) — no hands. ${styleGuide} ${tone} tones, natural soft lighting. Include large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Using the product from the first image, create a Japanese beauty Instagram cover slide in the visual style of the second image. The product appears naturally in the scene. ${styleGuide} ${tone} colors, soft natural lighting. Include large elegant bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`

  const imageUrls = [productUrl, ...(refImageUrl ? [refImageUrl] : [])]
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
  refImageUrl?:      string   // reference.ts が選択・アップロード済みのURL
  styleDescription?: string   // Claude Vision が生成したスタイル説明文
  instruction?: string
}

/** スライド2〜5（コンテンツ）を FAL FLUX Kontext で生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone      = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_s${slideNumber}_${Date.now()}.jpg`)

  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""
  const styleGuide = styleDescription
    ? `Match the visual style of the second reference image exactly: ${styleDescription}.`
    : "Use a clean Japanese UGC beauty aesthetic."

  // slide 2: 商品名・価格をFAL生成に含める（Sharpオーバーレイ不要）
  const slide2Text = slideNumber === 2
    ? ` Prominently include product name "${productName}"${price ? ` and price "${price}"` : ""} as bold styled Japanese text, integrated naturally into the design.`
    : ""

  let prompt: string
  if (patternName === "直置きUGC型") {
    prompt = `Using the product from the first image, create a Japanese UGC-style Instagram carousel slide in the visual style of the second image. The product must rest on a surface (no hands). ${styleGuide} ${tone} aesthetic, natural soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent text: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Using the product from the first image, create a Japanese UGC-style Instagram carousel slide in the visual style of the second image. The product must be clearly visible — held in hand, on a surface, or applied to skin. ${styleGuide} ${tone} aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent text: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`

  const imageUrls = [productUrl, ...(refImageUrl ? [refImageUrl] : [])]
  return generateImage(prompt, imageUrls)
}
