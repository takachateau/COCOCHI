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
 * テキストのみ生成（参照画像なし）
 * nano-banana-2 を使用（日本語テキスト生成に強い）
 */
async function generateImageTextOnly(prompt: string): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      console.log(`[FAL] nano-banana-2 (text only)`)
      const res = await fal.subscribe("fal-ai/nano-banana-2", {
        input: { prompt, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" },
      })
      const url = (res.data as FalResult)?.images?.[0]?.url
      if (!url) throw new Error("FAL: 画像URLが取得できません")
      return falFetch(url)
    })
  } finally {
    sem.release()
  }
}

/**
 * 2ステップ生成（参照画像あり）
 * Step1: Kontext でスタイル背景を生成（参照画像のスタイルを抽出）
 * Step2: nano-banana-2 で商品+日本語テキストを追加（文字化けなし）
 */
async function generateImageTwoStep(
  productUrl: string,
  refImageUrl: string,
  step1Prompt: string,
  step2Prompt: string,
): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      // Step 1: Kontext でスタイルだけ抽出した背景を生成
      console.log(`[FAL] Step1: Kontext スタイル背景生成...`)
      const step1Res = await fal.subscribe("fal-ai/flux-pro/kontext", {
        input: {
          prompt: step1Prompt,
          image_url: refImageUrl,
          output_format: "jpeg" as const,
        },
      })
      const bgUrl = (step1Res.data as FalResult)?.images?.[0]?.url
      if (!bgUrl) throw new Error("FAL Step1: 背景URL取得失敗")
      console.log(`[FAL] Step1完了: ${bgUrl.slice(0, 60)}...`)

      // Step 2: nano-banana-2 で商品+日本語テキストを追加
      console.log(`[FAL] Step2: nano-banana-2 商品+テキスト追加...`)
      const step2Res = await fal.subscribe("fal-ai/nano-banana-2/edit", {
        input: {
          prompt: step2Prompt,
          image_urls: [bgUrl, productUrl],
          aspect_ratio: "3:4",
          resolution: "1K",
          output_format: "jpeg",
        },
      })
      const finalUrl = (step2Res.data as FalResult)?.images?.[0]?.url
      if (!finalUrl) throw new Error("FAL Step2: 最終画像URL取得失敗")
      console.log(`[FAL] Step2完了: ${finalUrl.slice(0, 60)}...`)

      return falFetch(finalUrl)
    })
  } finally {
    sem.release()
  }
}

// 後方互換用ラッパー（参照なし → テキストのみ）
async function generateImage(prompt: string, imageUrls: string[]): Promise<Buffer> {
  if (imageUrls.length === 0) return generateImageTextOnly(prompt)
  // imageUrls ありの場合は呼び出し元で generateImageTwoStep を直接使う
  throw new Error("generateImage: 画像あり生成はgenerateImageTwoStepを使ってください")
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

/** スライド1（表紙）を 2ステップ生成 */
export async function generateUGCCover(params: UGCCoverParams): Promise<Buffer> {
  const { headline, tag, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)

  // 参照画像なし → テキストのみ生成（nano-banana-2）
  if (!refImageUrl) {
    let prompt: string
    if (patternName === "記事投稿型") {
      prompt = `Japanese beauty lifestyle Instagram cover, aesthetic background scene. ${tone} colors. Large bold Japanese title: "${headline}", tag: "${tag}". Portrait orientation. ${NO_UI}`
    } else if (patternName === "手持ちUGC型") {
      prompt = `Japanese UGC-style Instagram cover, skincare product held in hand. ${tone} tones. Large bold Japanese text: "${headline}", tag: "${tag}". Portrait orientation. ${NO_UI}`
    } else {
      prompt = `Japanese UGC-style Instagram cover, skincare product on surface. ${tone} tones. Large bold Japanese text: "${headline}", tag: "${tag}". Portrait orientation. ${NO_UI}`
    }
    return generateImageTextOnly(prompt)
  }

  // Step1: Kontext でスタイル背景を生成
  const styleHint = styleDescription ? ` Target style: ${styleDescription}.` : ""
  let step1Prompt: string
  if (patternName === "記事投稿型") {
    step1Prompt = `Remove all products, text, and people from this image. Keep the background scene, color palette, lighting, and decorative elements exactly as-is. Output a clean empty background ready for text placement.${styleHint}`
  } else {
    step1Prompt = `Remove all products, text, and people from this image. Keep the background, surface, color palette, lighting, and props exactly as-is. Output a clean empty scene ready for product placement.${styleHint}`
  }

  // Step2: nano-banana-2 で商品+テキストを追加
  let step2Prompt: string
  if (patternName === "記事投稿型") {
    step2Prompt = `Using this background, create a Japanese beauty lifestyle Instagram cover. Add large bold Japanese title text: "${headline}" and small tag: "${tag}". ${tone} colors, editorial quality. Portrait orientation. ${NO_UI}`
  } else if (patternName === "手持ちUGC型") {
    step2Prompt = `Place the exact product shown in the second image into this background, held in hand or applied to skin (close-up hands only). ${tone} tones, natural soft lighting. Add large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else if (patternName === "直置きUGC型") {
    step2Prompt = `Place the exact product shown in the second image into this background, resting on the surface — no hands. ${tone} tones, natural soft lighting. Add large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  } else {
    step2Prompt = `Place the exact product shown in the second image naturally into this background scene. ${tone} colors, soft natural lighting. Add large elegant bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
  }

  if (instruction) step2Prompt += ` ${instruction}`

  return generateImageTwoStep(productUrl, refImageUrl, step1Prompt, step2Prompt)
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

/** スライド2〜5（コンテンツ）を 2ステップ生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone       = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"
  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""
  const slide2Text = slideNumber === 2
    ? ` Include product name "${productName}"${price ? ` and price "${price}"` : ""} as bold Japanese text.`
    : ""

  // 商品画像をBlobにアップ
  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_s${slideNumber}_${Date.now()}.jpg`)

  // 参照画像なし → nano-banana-2 テキストのみ
  if (!refImageUrl) {
    const prompt = `Japanese UGC-style Instagram carousel slide. ${tone} aesthetic. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
    return generateImageTextOnly(prompt)
  }

  // Step1: Kontext でスタイル背景を生成
  const styleHint = styleDescription ? ` Target style: ${styleDescription}.` : ""
  const step1Prompt = `Remove all products, text, and people from this image. Keep the background, surface, color palette, lighting, and layout structure exactly as-is. Output a clean empty background.${styleHint}`

  // Step2: nano-banana-2 で商品+テキストを追加
  let step2Prompt: string
  if (patternName === "直置きUGC型") {
    step2Prompt = `Place the exact product shown in the second image into this background, resting on the surface (no hands). ${tone} aesthetic, natural soft lighting. Add large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else {
    step2Prompt = `Place the exact product shown in the second image into this background — held in hand, on a surface, or applied to skin. ${tone} aesthetic, beauty lifestyle photography. Add large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  }

  if (instruction) step2Prompt += ` ${instruction}`

  return generateImageTwoStep(productUrl, refImageUrl, step1Prompt, step2Prompt)
}
