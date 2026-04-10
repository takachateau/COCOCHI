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
type FalResult = { images: { url: string }[] }

async function falFetch(url: string): Promise<Buffer> {
  const dl = await fetch(url)
  if (!dl.ok) throw new Error(`FAL: 画像DL失敗 ${dl.status}`)
  return Buffer.from(await dl.arrayBuffer())
}

/**
 * 画像生成（1ステップ）
 * - 画像あり: nano-banana-pro/edit（スタイル踏襲 + 日本語テキスト強化 + 商品反映）
 * - 画像なし: nano-banana-2（テキストのみ生成）
 */
async function generateImage(prompt: string, imageUrls: string[]): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      if (imageUrls.length > 0) {
        console.log(`[FAL] nano-banana-pro/edit, images: ${imageUrls.length}`)
        const res = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
          input: {
            prompt,
            image_urls: imageUrls,
            aspect_ratio: "3:4",
            resolution: "1K",
            output_format: "jpeg",
          },
        })
        const url = (res.data as FalResult)?.images?.[0]?.url
        if (!url) throw new Error("FAL: 画像URLが取得できません")
        console.log(`[FAL] 生成完了: ${url.slice(0, 60)}...`)
        return falFetch(url)
      } else {
        console.log(`[FAL] nano-banana-2 (text only)`)
        const res = await fal.subscribe("fal-ai/nano-banana-2", {
          input: { prompt, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" },
        })
        const url = (res.data as FalResult)?.images?.[0]?.url
        if (!url) throw new Error("FAL: 画像URLが取得できません")
        console.log(`[FAL] 生成完了: ${url.slice(0, 60)}...`)
        return falFetch(url)
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

/** スライド1（表紙）を nano-banana-pro/edit で生成 */
export async function generateUGCCover(params: UGCCoverParams): Promise<Buffer> {
  const { headline, tag, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone      = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"
  const styleNote = styleDescription ? ` Replicate this exact visual style: ${styleDescription}.` : ""

  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)

  if (patternName === "記事投稿型") {
    const prompt = `Japanese beauty lifestyle Instagram cover. Aesthetic background scene — morning vanity, botanical shelf, soft window light. No product visible.${styleNote} Large bold Japanese title: "${headline}", small tag: "${tag}". ${tone} colors. Portrait orientation. ${NO_UI}`
    return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
  }

  let prompt: string
  if (patternName === "手持ちUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram photo. The exact product from the first image, held in hand or applied to skin (close-up hands only, no face).${styleNote} Amateur casual photography feel, genuine user-generated content. ${tone} tones, natural soft lighting. Large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram photo. The exact product from the first image, placed on a surface — desk, shelf, or bathroom counter. No hands.${styleNote} Amateur casual photography feel, genuine user-generated content. ${tone} tones, natural soft lighting. Large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Japanese beauty Instagram photo. The exact product from the first image in the scene naturally.${styleNote} ${tone} colors, soft natural lighting. Large elegant bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
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

/** スライド2〜5（コンテンツ）を nano-banana-pro/edit で生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone       = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"
  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""
  const styleNote  = styleDescription ? ` Replicate this exact visual style: ${styleDescription}.` : ""
  const slide2Text = slideNumber === 2
    ? ` Prominently include product name "${productName}"${price ? ` and price "${price}"` : ""} as bold Japanese text.`
    : ""

  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_s${slideNumber}_${Date.now()}.jpg`)

  let prompt: string
  if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image, placed on a surface (no hands).${styleNote} Amateur casual photography feel. ${tone} aesthetic, natural soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else {
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image — held in hand, on a surface, or applied to skin.${styleNote} Amateur casual photography feel. ${tone} aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
}
