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

const NO_UI = "no watermark, no repost icon, no social media UI, no share button, no app interface overlay, no Instagram UI, no TikTok UI, clean image only, no people, no face, no full body, no human figure, close-up of hands holding product or applying to skin is acceptable but no portraits, no other products, no additional products in background, no competing products, only the single specified product"

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
    const handStyleNote = styleDescription
      ? `Style reference from second image — replicate exactly: background color palette, lighting quality, color grading, overall mood and atmosphere.`
      : ""
    prompt = `${handStyleNote} Authentic Japanese UGC-style Instagram photo. A Japanese woman's hand holding the exact product from the first image in her open palm or fingers. Natural skin tone, manicured nails. Close-up of hand and product, no face, no full body. Warm soft lighting, personal beauty routine atmosphere. ${tone} tones. Large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${NO_UI}`
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

// ─── エンタメ導入型専用 ──────────────────────────────────────────

const HOOK_SCENE: Record<string, string> = {
  "恋愛・感情体験":    "candid lifestyle photo of a Japanese woman in her daily life, emotional authentic moment",
  "ダイエット・ボディ変化": "authentic lifestyle photo of a Japanese woman, body and health journey, natural indoor setting",
  "恋愛・炎上議論":    "edgy authentic Japanese UGC lifestyle, mirror selfie or casual daily moment, bold mood",
  "メイク・美容ハウツー": "authentic Japanese beauty routine, vanity table or bathroom mirror, makeup lifestyle UGC",
  "肌トラブル・悩み解決": "authentic close-up lifestyle, Japanese woman touching face or skin, candid skincare concern",
  "節約・お金":        "everyday life scene, daily routine items, minimalist Japanese lifestyle aesthetic",
  "ファッション・コーデ": "fashion lifestyle photo, Japanese woman with outfit, full body or clothing detail shot",
  "モテ・自己磨き":    "authentic Japanese woman lifestyle, self-care daily routine, confident candid moment",
  "ライフスタイル改善": "morning or evening Japanese lifestyle routine, wellness aesthetic, calm daily life",
  "暮らし・生活Tips":  "cozy Japanese apartment interior, daily life items, aesthetic minimalist living",
  "ストレス・メンタル": "calm introspective Japanese woman, quiet indoor scene, moody emotional lighting",
  "自己啓発・価値観":  "confident Japanese woman, editorial lifestyle feel, thoughtful authentic moment",
}

export interface EntertainmentSlideParams {
  productName: string
  slideNumber: number       // 1〜5
  headline: string
  tag: string
  bullets?: string[]
  accent?: string
  price?: string
  hookTheme?: string
  hookTitle?: string
  colorPalette: string
  productImageBase64: string
  styleDescription?: string
  refImageUrl?: string
  instruction?: string
}

/**
 * エンタメ導入型スライド生成
 * - Slide 1〜3: フックテーマの生活/感情シーン。商品は出さない
 * - Slide 4: 商品が自然に登場（「ずっと使ってたのが…」）
 * - Slide 5: 商品クローズアップ + CTA
 */
export async function generateEntertainmentSlide(params: EntertainmentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, hookTheme, colorPalette, productImageBase64, styleDescription, refImageUrl, instruction } = params
  const tone      = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"
  const styleNote = styleDescription ? ` Visual style reference from reference image: ${styleDescription}.` : ""
  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""

  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_e${slideNumber}_${Date.now()}.jpg`)

  let prompt: string

  if (slideNumber <= 3) {
    // 商品を出さない。フックテーマのUGCシーン
    const sceneDesc = HOOK_SCENE[hookTheme ?? ""] ?? "authentic Japanese lifestyle UGC photo, candid daily life moment"
    const noProduct = "NO skincare products, NO beauty products, NO cosmetics, NO product packaging visible"
    prompt = `Authentic Japanese UGC-style Instagram carousel slide.${styleNote} ${sceneDesc}. ${tone} color tones, natural ambient lighting, authentic amateur photography feel. Large bold Japanese text overlay: "${headline}", small tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}. Portrait orientation. ${noProduct}. ${NO_UI}`
    return generateImage(prompt, refImageUrl ? [refImageUrl] : [])
  }

  if (slideNumber === 4) {
    // 商品が自然に登場するシーン（「出会ったのが〇〇」）
    prompt = `Authentic Japanese UGC-style Instagram. A Japanese woman naturally holding or using the skincare product from the first reference image in her daily routine. Casual, genuine, lifestyle moment. The product is visible but feels incidental, not staged.${styleNote} ${tone} aesthetic, warm soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}${price ? `. Product name "${productName}" and price "${price}" as bold text.` : ""}. Portrait orientation. ${NO_UI}`
    if (instruction) prompt += ` ${instruction}`
    return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
  }

  // Slide 5: 商品クローズアップ + CTA
  prompt = `Authentic Japanese UGC-style Instagram. The skincare product from the reference image as the hero, prominently displayed on a clean aesthetic surface or held in hand.${styleNote} ${tone} aesthetic, beautiful product photography, lifestyle feel. Large bold Japanese CTA text: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}. "保存してね" feel, call-to-action energy. Portrait orientation. ${NO_UI}`
  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
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

  // before/after スライドの肌リアリティ制御
  const allText = `${headline} ${tag} ${bulletText} ${accentText}`.toLowerCase()
  const isBeforeSlide = /before|ビフォー|使う前|使用前|悩み|問題|コンプレックス/.test(allText)
  const isAfterSlide  = /after|アフター|使用後|使った後|変化|改善|結果|効果/.test(allText)
  const skinNote = isBeforeSlide
    ? " Skin shows mild realistic concerns — slightly uneven tone, minor texture, subtle redness. NOT extreme or exaggerated. Believable everyday skin imperfection."
    : isAfterSlide
    ? " Skin looks naturally improved — healthy glow, smoother texture, more even tone. NOT perfect or flawless. Realistic believable improvement, not dramatic transformation."
    : ""

  let prompt: string
  if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image, placed on a surface (no hands).${styleNote} Amateur casual photography feel. ${tone} aesthetic, natural soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else if (patternName === "手持ちUGC型") {
    const handStyleNote = styleDescription
      ? `Style reference from second image — replicate exactly: background color palette, lighting quality, color grading, overall mood and atmosphere.`
      : ""
    prompt = `${handStyleNote} Authentic Japanese UGC-style Instagram carousel slide. A Japanese woman's hand holding or applying the exact product from the first image. Natural skin tone, manicured nails. Close-up of hand and product, no face, no full body. Warm soft lighting, personal beauty routine atmosphere.${skinNote} ${tone} aesthetic. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else {
    // 記事投稿型 など
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image in the scene naturally.${styleNote}${skinNote} Amateur casual photography feel. ${tone} aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
}
