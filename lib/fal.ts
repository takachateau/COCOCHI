/**
 * FAL (fal.ai) — 画像生成モジュール
 *
 * モデルは IMAGE_MODEL 定数で切り替え:
 *   "gpt-image-2"  : openai/gpt-image-2/edit（高品質・日本語テキスト最強・やや高コスト）
 *   "nano-banana"  : nano-banana-pro/edit（旧モデル・安価）
 *
 * 共通ルール: no watermark, no repost icon, no social media UI
 */

import { fal } from "@fal-ai/client"
import { put } from "@vercel/blob"
import fs from "fs"
import path from "path"

fal.config({ credentials: process.env.FAL_KEY! })

// ─── モデル設定 ────────────────────────────────────────────────────
// ここを変えるだけでモデルを切り替えられる
// "gpt-image-2"  → fal-ai/openai/gpt-image-2/edit（推奨: 日本語テキスト品質◎）
// "nano-banana"  → fal-ai/nano-banana-pro/edit（旧モデル・高速・安価）
const IMAGE_MODEL: "gpt-image-2" | "nano-banana" = "gpt-image-2"

// ─── 定数 ────────────────────────────────────────────────────────

// v3: 人物・顔・スタイルが映ることを許容（リアル運用アカウントの再現が目的）
// 削除済みの v2 制約: "absolutely no face, no portrait, no selfie, no person visible..." 系
const NO_UI = "no watermark, no repost icon, no social media UI, no share button, no app interface overlay, no Instagram UI, no TikTok UI, no Lemon8 logo, no @username badge, no account name overlay, no platform branding, no reference image label, no image number text, clean image only, no other products, no additional products in background, no competing products, only the single specified product"

// スマホ素撮り感 — 全パターン共通で末尾に付与
const SMARTPHONE_FEEL = "shot on iPhone, casual smartphone snapshot, slightly flat mobile camera quality, minor JPEG compression, everyday amateur photo feel, not professional photography, no studio lighting, candid and unedited look"

// 全スライド統一フォント指定 — スライドごとにフォントがバラつかないよう毎回同じ記述を付与
// ベンチマーク画像のフォントを完全に無視させる強い指示にする
const FONT_SPEC = "FONT RULE (mandatory — completely override any typography in the reference image): Use ONLY a clean bold Japanese rounded sans-serif for every single text element. Target typeface: Noto Sans JP Bold or M PLUS Rounded 1c Bold. Visual fingerprint: round corners on letterforms, uniform stroke width with zero thick-thin contrast (monoline), geometric structure, absolutely no serifs. Apply this identical font and weight to headline, bullets, and accent — no exceptions. STRICTLY FORBIDDEN regardless of what the reference image shows: handwritten, brush stroke, calligraphic, script, decorative, thin, or serif fonts. This font rule overrides the reference image's typography entirely."

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
      const e = err as { status?: number; message?: string; body?: unknown }
      // body.detail に Pydantic / FAL のフィールドエラー詳細が入る
      const bodyStr = e.body ? JSON.stringify(e.body).slice(0, 500) : ""
      console.error(
        `[FAL] error (attempt ${i}/${retries}): status=${e.status} message=${e.message}`,
        bodyStr ? `body=${bodyStr}` : "",
      )
      // 422 (バリデーション) / 403 (認証) はリトライしても解決しない → 詳細付きErrorで即スロー
      if (e.status === 422 || e.status === 403) {
        // コンテンツポリシー違反は専用メッセージ
        const body422 = e.body as { detail?: Array<{ type?: string }> } | undefined
        const isPolicyViolation = body422?.detail?.some(d => d.type === "content_policy_violation")
        if (isPolicyViolation) {
          throw new Error("FAL_CONTENT_POLICY: スタイル説明または人物説明にFALのコンテンツポリシー違反ワードが含まれています。別のベンチマーク画像を選んで再試行してください。")
        }
        throw new Error(
          `FAL ${e.status} ${e.message ?? "error"}${bodyStr ? " | detail: " + bodyStr : ""}`
        )
      }
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, delay * i))
    }
  }
  throw new Error("unreachable")
}

// ─── 内部ユーティリティ ──────────────────────────────────────────

/**
 * スタイル説明文・人物説明文から FAL/OpenAI のコンテンツポリシーに引っかかりやすいワードを除去する。
 *
 * 背景: describeV3SlideStyle は Claude Vision の詳細分析を返すため、
 *       "acne", "redness", "pores" などの肌トラブル系医療ワードや
 *       visualProfile / personaHint には diet 系ワードが混入しやすい。
 *       これらがそのまま gpt-image-2 に渡ると content_policy_violation になる。
 */
function sanitizeForFal(text: string): string {
  if (!text) return ""
  return text
    // 肌悩み・肌トラブル系
    .replace(/\bacne[-\w]*\b/gi, "skin texture")
    .replace(/\bpimple[s]?\b/gi, "texture")
    .replace(/\bblackhead[s]?\b/gi, "")
    .replace(/\bwhitehead[s]?\b/gi, "")
    .replace(/\bbreakout[s]?\b/gi, "")
    .replace(/\bpore[s]?\b/gi, "skin detail")
    .replace(/\bblemish(es)?\b/gi, "")
    .replace(/\bimperfection[s]?\b/gi, "natural texture")
    .replace(/\bredness\b/gi, "warm tone")
    .replace(/\birritation\b/gi, "")
    .replace(/\binflammation\b/gi, "")
    .replace(/\bdermatitis\b/gi, "")
    .replace(/\buneven[\s-]?tone\b/gi, "natural tone")
    .replace(/\bdullness\b/gi, "matte finish")
    .replace(/\bdull[\s-]?skin\b/gi, "matte skin")
    // 医療・傷系
    .replace(/\bscar[s]?\b/gi, "")
    .replace(/\blesion[s]?\b/gi, "")
    .replace(/\bwound[s]?\b/gi, "")
    .replace(/\bskin[\s-]?(condition|disease|problem|issue|concern)[s]?\b/gi, "skin")
    // ダイエット・体重系（visualProfile / personaHint に混入しやすい）
    .replace(/\b(weight[\s-]?loss|diet(ing)?|slim(ming)?|thin(ner)?|fat[\s-]?burn(ing)?)\b/gi, "")
    .replace(/\b\d+\s?(kg|lb[s]?|pound[s]?)\b/gi, "")
    // 医療・薬・施術系
    .replace(/\b(prescription|medication|drug[s]?|surgery|inject(ion)[s]?|botox|filler[s]?)\b/gi, "")
    // 多重スペース除去
    .replace(/\s{2,}/g, " ")
    .trim()
}

/** 後方互換エイリアス */
const sanitizeStyleDesc = sanitizeForFal

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
 * 画像生成（1ステップ）— IMAGE_MODEL 設定で gpt-image-2 / nano-banana を切り替え
 *
 * gpt-image-2:
 *   - 参照画像あり: openai/gpt-image-2/edit（高品質編集・日本語テキスト◎）
 *   - 参照画像なし: openai/gpt-image-2（テキストのみ生成）
 * nano-banana:
 *   - 参照画像あり: nano-banana-pro/edit
 *   - 参照画像なし: nano-banana-2
 */
async function generateImage(prompt: string, imageUrls: string[]): Promise<Buffer> {
  await sem.acquire()
  try {
    return await withRetry(async () => {
      if (IMAGE_MODEL === "gpt-image-2") {
        // ── GPT-Image-2 ────────────────────────────────────────────
        // 縦型 3:4 ≒ 1024×1365 で出力。quality は medium でコスト抑制（約$0.06/枚）
        if (imageUrls.length > 0) {
          console.log(`[FAL] gpt-image-2/edit, images: ${imageUrls.length}`)
          const res = await fal.subscribe("openai/gpt-image-2/edit", {
            input: {
              prompt,
              image_urls: imageUrls,
              image_size: "portrait_4_3",  // 768×1024（3:4縦型）
              quality: "medium",
              output_format: "jpeg",
            },
          })
          const url = (res.data as FalResult)?.images?.[0]?.url
          if (!url) throw new Error("FAL: 画像URLが取得できません")
          console.log(`[FAL] gpt-image-2 生成完了: ${url.slice(0, 60)}...`)
          return falFetch(url)
        } else {
          console.log(`[FAL] gpt-image-2 (text only)`)
          const res = await fal.subscribe("openai/gpt-image-2", {
            input: {
              prompt,
              image_size: "portrait_4_3",
              quality: "medium",
              output_format: "jpeg",
            },
          })
          const url = (res.data as FalResult)?.images?.[0]?.url
          if (!url) throw new Error("FAL: 画像URLが取得できません")
          console.log(`[FAL] gpt-image-2 生成完了: ${url.slice(0, 60)}...`)
          return falFetch(url)
        }
      } else {
        // ── Nano Banana（旧モデル・フォールバック） ─────────────────
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
          console.log(`[FAL] nano-banana 生成完了: ${url.slice(0, 60)}...`)
          return falFetch(url)
        } else {
          console.log(`[FAL] nano-banana-2 (text only)`)
          const res = await fal.subscribe("fal-ai/nano-banana-2", {
            input: { prompt, aspect_ratio: "3:4", resolution: "1K", output_format: "jpeg" },
          })
          const url = (res.data as FalResult)?.images?.[0]?.url
          if (!url) throw new Error("FAL: 画像URLが取得できません")
          console.log(`[FAL] nano-banana 生成完了: ${url.slice(0, 60)}...`)
          return falFetch(url)
        }
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

  // 商品画像がない（daily/tips投稿）場合はライフスタイルシーンとして生成
  const hasProduct = productImageBase64.length > 100
  if (!hasProduct) {
    const noProductStyle = styleDescription
      ? `Style reference: ${styleDescription}. Replicate this exact visual style.`
      : ""
    const prompt = `Japanese beauty lifestyle Instagram cover. ${noProductStyle} Authentic UGC-style scene — morning skincare routine, aesthetic vanity, botanical shelf, soft window light. NO beauty products, NO product packaging visible. ${tone} colors, warm soft ambient lighting. Large bold Japanese title: "${headline}", small tag: "${tag}". Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI.replace("no other products, no additional products in background, no competing products, only the single specified product", "no skincare products, no cosmetics, no product packaging")}`
    return generateImage(prompt, refImageUrl ? [refImageUrl] : [])
  }

  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_${Date.now()}.jpg`)

  if (patternName === "記事投稿型") {
    const prompt = `Japanese beauty lifestyle Instagram cover. Aesthetic background scene — morning vanity, botanical shelf, soft window light. No product visible.${styleNote} Large bold Japanese title: "${headline}", small tag: "${tag}". ${tone} colors. Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
    return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
  }

  let prompt: string
  if (patternName === "手持ちUGC型") {
    const handStyleNote = styleDescription
      ? `Style reference from second image — replicate exactly: background color palette, lighting quality, color grading, overall mood and atmosphere.`
      : ""
    prompt = `${handStyleNote} Authentic Japanese UGC-style Instagram photo. EXACTLY ONE hand holding the product from the first image. One hand only — no second hand, no extra hands, no additional limbs. Natural realistic hand anatomy with five fingers. Natural skin tone, manicured nails. Tight close-up of hand and product only, absolutely no face, no wrist-above body part, no full body. Warm soft lighting, personal beauty routine atmosphere. ${tone} tones. Large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
  } else if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram photo. The exact product from the first image, placed on a surface — desk, shelf, or bathroom counter. No hands.${styleNote} Amateur casual photography feel, genuine user-generated content. ${tone} tones, natural soft lighting. Large bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
  } else {
    prompt = `Japanese beauty Instagram photo. The exact product from the first image in the scene naturally.${styleNote} ${tone} colors, soft natural lighting. Large elegant bold Japanese text: "${headline}", small tag: "${tag}". Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
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
    prompt = `Authentic Japanese UGC-style Instagram. EXACTLY ONE hand holding the skincare product from the first reference image in a daily routine. One hand only, no second hand, no extra hands. Natural realistic hand anatomy with five fingers. Tight close-up of hand and product, absolutely no face, no body above the wrist. Casual, genuine, lifestyle moment. The product is visible but feels incidental, not staged.${styleNote} ${tone} aesthetic, warm soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}${price ? `. Product name "${productName}" and price "${price}" as bold text.` : ""}. Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
    if (instruction) prompt += ` ${instruction}`
    return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
  }

  // Slide 5: 商品クローズアップ + CTA
  prompt = `Authentic Japanese UGC-style Instagram. The skincare product from the reference image as the hero, prominently displayed on a clean aesthetic surface or held in hand.${styleNote} ${tone} aesthetic, beautiful product photography, lifestyle feel. Large bold Japanese CTA text: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}. "保存してね" feel, call-to-action energy. Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI}`
  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
}

// ─── 比較レビュー投稿専用 ────────────────────────────────────────

export interface ComparisonSlideParams {
  slideNumber: number
  headline: string   // 商品名を含む見出し（テキスト生成時に正しく生成済み）
  tag: string
  pros: string
  cons: string
  verdict: string
  refImageUrl?: string
  styleDescription?: string
  isOwnProduct: boolean
  productImageUrl?: string  // 自社商品スライドのみ渡す（登録済み商品画像）
}

/**
 * 比較レビュー「〇〇選」投稿の各商品スライドを生成
 * - headline/bulletsに正しい商品情報が入っているためそのまま使う
 * - 自社商品スライドのみ productImageUrl を渡してFALに商品写真を反映させる
 */
export async function generateComparisonSlide(params: ComparisonSlideParams): Promise<Buffer> {
  const { headline, tag, pros, cons, verdict, refImageUrl, styleDescription, isOwnProduct, productImageUrl } = params

  const prompt = [
    `Keep the EXACT same visual style as this image: same background, colors, lighting, mood, composition, and overall aesthetic.`,
    styleDescription ? `Style to preserve: ${styleDescription}.` : "",
    `Replace any existing text with: large bold Japanese headline "${headline}", small tag "${tag}".`,
    productImageUrl ? `Feature the product from the second image prominently.` : "",
    pros ? `Benefit text: "${pros}".` : "",
    cons ? `Concern text: "${cons}".` : "",
    verdict ? `Verdict: "${verdict}".` : "",
    isOwnProduct ? `Premium warm feel, glowing atmosphere.` : `Neutral balanced review atmosphere.`,
    `Portrait orientation. ${NO_UI}`,
  ].filter(Boolean).join(" ")

  // ベンチマーク → 商品画像（自社・競合とも）の順で渡す
  const imageUrls: string[] = []
  if (refImageUrl) imageUrls.push(refImageUrl)
  if (productImageUrl) imageUrls.push(productImageUrl)

  return generateImage(prompt, imageUrls)
}

/**
 * 比較レビュー投稿の1枚目フックスライド・まとめスライドを生成
 */
export async function generateComparisonHookSlide(params: {
  hookHeadline: string
  tag: string
  totalCount: number
  refImageUrl?: string
  styleDescription?: string
}): Promise<Buffer> {
  const { hookHeadline, tag, refImageUrl, styleDescription } = params
  const multiNOUI = NO_UI.replace(
    "no other products, no additional products in background, no competing products, only the single specified product",
    "multiple beauty products arranged aesthetically",
  )
  const prompt = [
    `Keep the EXACT same visual style as this image: same background, colors, lighting, mood, and overall aesthetic.`,
    styleDescription ? `Style to preserve: ${styleDescription}.` : "",
    `Replace any existing text with: large bold Japanese title "${hookHeadline}", small tag "${tag}".`,
    `Portrait orientation. ${multiNOUI}`,
  ].filter(Boolean).join(" ")

  return generateImage(prompt, refImageUrl ? [refImageUrl] : [])
}

/** スライド2〜5（コンテンツ）を nano-banana-pro/edit で生成 */
export async function generateContentSlide(params: ContentSlideParams): Promise<Buffer> {
  const { productName, slideNumber, headline, tag, bullets, accent, price, patternName, colorPalette, productImageBase64, refImageUrl, styleDescription, instruction } = params
  const tone       = COLOR_TONES[colorPalette] ?? "soft pastel aesthetic"
  const bulletText = bullets?.join(" / ") ?? ""
  const accentText = accent ?? ""
  const styleNote  = styleDescription ? ` Replicate this exact visual style: ${styleDescription}.` : ""
  const slide2Text = slideNumber === 2 && productName
    ? ` Prominently include product name "${productName}"${price ? ` and price "${price}"` : ""} as bold Japanese text.`
    : ""

  // 商品画像がない（daily/tips投稿）場合はライフスタイルシーンとして生成
  const hasProduct = productImageBase64.length > 100
  if (!hasProduct) {
    const noProductStyle = styleDescription
      ? `Style reference: ${styleDescription}. Replicate this exact visual style.`
      : ""
    const prompt = `Japanese beauty lifestyle Instagram carousel slide. ${noProductStyle} Authentic UGC-style scene. NO skincare products, NO cosmetics, NO product packaging. ${tone} colors, warm natural lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullets: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}. Portrait orientation. ${SMARTPHONE_FEEL}. ${NO_UI.replace("no other products, no additional products in background, no competing products, only the single specified product", "no skincare products, no cosmetics")}`
    return generateImage(prompt, refImageUrl ? [refImageUrl] : [])
  }

  const productUrl = await uploadBlob(Buffer.from(productImageBase64, "base64"), `product_s${slideNumber}_${Date.now()}.jpg`)

  // before/after スライドの肌リアリティ制御
  const allText = `${headline} ${tag} ${bulletText} ${accentText}`.toLowerCase()
  const isBeforeSlide = /before|ビフォー|使う前|使用前|悩み|問題|コンプレックス/.test(allText)
  const isAfterSlide  = /after|アフター|使用後|使った後|変化|改善|結果|効果/.test(allText)
  const skinNote = isBeforeSlide
    ? " BEFORE skin: mild realistic imperfections — slightly uneven tone, minor texture, subtle dullness. STRICTLY NOT: severe acne, heavy scarring, extreme redness, damaged or diseased-looking skin, exaggerated ugliness. Must look like a real person's everyday skin on a normal day. Subtle and believable only."
    : isAfterSlide
    ? " AFTER skin: naturally improved — healthy soft glow, smoother texture, more even tone. Realistic believable improvement. NOT perfectly flawless CGI skin. Real human skin that looks better, not airbrushed."
    : ""

  let prompt: string
  if (patternName === "直置きUGC型") {
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image, placed on a surface (no hands).${styleNote} Amateur casual photography feel. ${tone} aesthetic, natural soft lighting. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else if (patternName === "手持ちUGC型") {
    const handStyleNote = styleDescription
      ? `Style reference from second image — replicate exactly: background color palette, lighting quality, color grading, overall mood and atmosphere.`
      : ""
    prompt = `${handStyleNote} Authentic Japanese UGC-style Instagram carousel slide. EXACTLY ONE hand holding or applying the product from the first image — one hand only, no second hand, no extra hands, no additional limbs. Natural realistic hand anatomy with five fingers, no mutated or extra fingers. Natural skin tone, manicured nails. Tight close-up of hand and product only, absolutely no face, no body above the wrist, no full body.${skinNote} Warm soft lighting, personal beauty routine atmosphere. ${tone} aesthetic. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  } else {
    // 記事投稿型 など
    prompt = `Authentic Japanese UGC-style Instagram carousel slide. The exact product from the first image in the scene naturally.${styleNote}${skinNote} Amateur casual photography feel. ${tone} aesthetic, beauty lifestyle photography. Large bold Japanese headline: "${headline}", tag: "${tag}"${bulletText ? `, bullet points: "${bulletText}"` : ""}${accentText ? `, accent: "${accentText}"` : ""}.${slide2Text} Portrait orientation. ${NO_UI}`
  }

  if (instruction) prompt += ` ${instruction}`
  return generateImage(prompt, refImageUrl ? [productUrl, refImageUrl] : [productUrl])
}

// ─── v2専用: ベンチマークスタイル準拠スライド生成 ────────────────

export interface V2SlideParams {
  headline: string
  tag: string
  bullets?: string[]
  accent?: string
  productName?: string
  colorPalette: string
  productImageBase64?: string  // product投稿のみ（既存・後方互換）
  productImageUrl?: string     // v3: 商品画像を画面に登場させる用（自社 or 競合）
  refImageUrl?: string         // ベンチマーク参照URL（スタイル参照）
  styleDescription?: string    // Claude Visionが生成したスタイル説明
  noTextOverlay?: boolean      // 未使用（後方互換のため残す）
  personaHint?: string         // fallback: visualProfileがない既存ペルソナ用
  visualProfile?: {            // v3: ペルソナの固定ビジュアルプロフィール（優先）
    hair: string
    fashion: string
    setting: string
    photoStyle: string
  }
  slideNumber?: number         // スライド番号（01など）
  instruction?: string         // ユーザー追加指示（再生成時の修正内容など）
  bgInherit?: boolean          // true = 同背景グループ継承モード（背景をそのままコピー）
}

/**
 * v2スライド生成。パターンテンプレートは使わず、ベンチマーク参照画像の
 * スタイルをそのままFALに渡す。
 * - 商品あり: [商品画像, ベンチマーク画像] → 「1枚目の商品をこのスタイルで」
 * - 商品なし: [ベンチマーク画像] → 「このスタイルで生活感のある画像を」
 */
export interface V2SlideResult {
  buffer: Buffer | null   // null = ポリシー違反でフォールバックも失敗（生成不可）
  policyFallback: boolean // trueの場合: FALポリシー違反でスタイル説明なしで再生成した
  falCalls: number        // 実際に FAL を呼んだ回数（ポリシー再生成は2）
}

export async function generateV2Slide(params: V2SlideParams): Promise<V2SlideResult> {
  const {
    headline, tag, bullets, accent, colorPalette,
    productImageBase64, productImageUrl, refImageUrl,
    styleDescription, personaHint, visualProfile, slideNumber,
    bgInherit = false,
    instruction,
  } = params

  const hasProduct = !!productImageUrl || (productImageBase64?.length ?? 0) > 100
  const accentText = accent ?? ""

  console.log(`[generateV2Slide] slide=${slideNumber} tag=${tag} hasProduct=${hasProduct} ref=${refImageUrl?.slice(-30) ?? "NONE"}`)

  // コンテンツポリシー違反防止: 全テキストフィールドをサニタイズしてからプロンプトに含める
  const safeStyleDesc = sanitizeForFal(styleDescription ?? "")
  const safePersonaHint = personaHint ? sanitizeForFal(personaHint) : undefined
  const safeVisualProfile = visualProfile ? {
    hair:       sanitizeForFal(visualProfile.hair),
    fashion:    sanitizeForFal(visualProfile.fashion),
    setting:    sanitizeForFal(visualProfile.setting),
    photoStyle: sanitizeForFal(visualProfile.photoStyle),
  } : undefined

  const noProductNOUI = NO_UI.replace(
    "no other products, no additional products in background, no competing products, only the single specified product",
    "no skincare products, no cosmetics, no product packaging",
  )
  const noUI = hasProduct ? NO_UI : noProductNOUI

  // ─── 構造化テキスト（階層明示） ───────────────────────────────
  // FAL に渡すbulletは:
  //   ① 丸数字などの特殊記号を除去（FALがレンダリングできない）
  //   ② 縦線「｜」を " / " に変換（視認性向上）
  //   ③ 1bullet あたり最大 28文字に切り詰め（長すぎるとテキスト生成をスキップされる）
  function normalizeBullet(text: string): string {
    return text
      .replace(/^[①-⑳]\s*/, "")          // 先頭の丸数字を除去（マーカーはbulletStyle側で決定）
      .replace(/^[\d]+[.)、．]\s*/, "")    // 先頭の「1.」「2.」「1)」も除去（同上）
      .replace(/^[・•\-]\s*/, "")          // 先頭の点・ハイフンを除去（マーカー統一のため）
      .replace(/[｜|]/g, " / ")
      .replace(/※\s*/g, "")
      .trim()
      .slice(0, 28)
  }

  const bulletItems = (bullets ?? []).filter(Boolean).slice(0, 5)

  // 元テキストの形式に準拠: 数字箇条書きなら "1." 形式、そうでなければ "•" 形式
  const isNumberedStyle = (() => {
    if (bulletItems.length === 0) return false
    const first = bulletItems[0].trim()
    return /^[①-⑳]/.test(first) || /^\d+[.)、．]/.test(first)
  })()

  const normalizedBullets = bulletItems.map(normalizeBullet)

  const hasBullets = normalizedBullets.length > 0
  const structuredText = [
    `HEADLINE (large bold): "${headline ?? ""}"`,
    hasBullets
      ? `BODY BULLETS (medium font — noticeably smaller than headline): ${normalizedBullets.map((b, i) =>
          isNumberedStyle ? `"${i + 1}. ${b}"` : `"• ${b}"`
        ).join(" | ")}`
      : "NO BULLETS — do NOT add any list items, numbered items, or bullet points",
    accentText
      ? `SMALL ACCENT text (smallest size): "${accentText.replace(/※\s*/g, "").slice(0, 25)}"`
      : null,
  ].filter(Boolean).join("  ")

  // ─── プロンプト ───────────────────────────────────────────────
  // 設計方針:
  //   [1] iPhone品質の土台
  //   [2] 構図（写真的背景のみ参照・グラフィック無視）
  //   [3] 背景完全新規（パクリ防止）
  //   [4] 人物（スタイルはベンチマーク準拠・個人は変更）
  //   [5] 顔の処理
  //   [6] テキスト
  //   [7] Lemon8 UI 消去
  //   [8] 商品（product スライドのみ）
  //       → GPT-Image-2 に「白背景を除去して単品カットアウトとして左側に配置」と指示
  //       → Sharp 合成は使わない（白背景の四角がそのまま乗るため）
  const prompt = [

    // [1]
    `Authentic candid phone photo. ${SMARTPHONE_FEEL}. This is a genuine Japanese woman's Lemon8 post — real, slightly imperfect, human. Never AI-looking, never studio-polished.`
    + (safeStyleDesc ? ` Visual style reference: ${safeStyleDesc}.` : "")
    + (safeVisualProfile?.photoStyle ? ` Persona photo style (consistent across all posts): ${safeVisualProfile.photoStyle}.` : ""),

    // [2]
    `Composition: copy ONLY these three things from the reference — (1) framing, (2) camera angle, (3) shot type (selfie/portrait/flatlay etc.). That is all.`
    + ` DO NOT copy: scene, room, location, background, decor, color scheme, objects, or any visual environment element from the reference.`
    + ` DO NOT reproduce any of the following from the reference: floating food icons or dishes, product thumbnail overlays, comparison panels, graphic stickers, rating bubbles, calorie labels, or any non-photographic composite elements.`
    + ` The generated image must look like a clean real photo — no floating graphics, no product thumbnails, no food items composited over the image.`,

    // [3] 背景
    // bgInherit=true (同背景グループの2枚目以降): 参照画像と同一背景を維持
    // bgInherit=false (通常): ベンチマークの屋内/屋外タイプを踏襲しつつ具体的場所は変える
    bgInherit
      ? `Background: KEEP THE EXACT SAME background as the reference image — copy it with pixel-perfect precision.`
        + ` The background must be IDENTICAL: same outdoor/indoor setting, same specific location (same street, same building, same room), same sky color and cloud pattern, same trees or foliage, same architecture, same surface textures, same ambient lighting direction, same color grading, same time of day, same atmosphere and mood.`
        + ` This is a BACKGROUND INHERITANCE shot — the background must look like a continuation of the exact same moment and location.`
        + ` ONLY update: the text overlay content, and adjust the person's outfit if the persona spec requires it. Nothing else changes.`
        + ` FORBIDDEN: changing location type, adding new background objects, altering lighting color, shifting time of day, replacing the scene with a different place.`
      : `Background setting type: READ the style description above to determine if the reference image is OUTDOOR, INDOOR, CAFE/SHOP, ROOFTOP, STREET, etc.`
        + ` MATCH that setting type exactly — if the reference is outdoor, generate an outdoor scene; if cafe, generate a cafe; if indoor apartment, generate an indoor room. NEVER force all slides indoors.`
        + (safeVisualProfile?.setting
          ? ` Persona's typical settings for creative direction: "${safeVisualProfile.setting}". Use as inspiration within the matched setting type, not as an override.`
          : "")
        + (slideNumber !== undefined
          ? ` Slide ${slideNumber} — choose a DIFFERENT specific sub-location than the reference: e.g. if reference shows a bedroom → use a living room or hallway; if reference is one street corner → use a different plaza or alley; if one cafe → different cafe style. Each slide must have a visually distinct background.`
          : ` Use a DIFFERENT specific sub-location than the reference so each slide has a distinct background.`)
        + ` DO NOT copy: same wall color, same objects, same furniture layout, same decor as the reference. Specific details must be completely new.`
        + ` Lighting quality and time of day should match the reference's mood (bright natural daylight / warm evening glow / nighttime street light / etc.).`
        + ` If reference is a plain white wall: add furniture, shelves, plants, or textured wall elements. Do NOT reproduce a blank plain wall.`,

    // [4] 人物 — visualProfile がある場合は固定の外見仕様を使う（ペルソナの再現性）
    //         ない場合は personaHint（旧ペルソナ向けフォールバック）
    safeVisualProfile
      ? `Person: this is a FIXED PERSONA — always generate the SAME visual individual across all posts.`
        + ` Hair: ${safeVisualProfile.hair}.`
        + ` Fashion: ${safeVisualProfile.fashion}.`
        + ` Do NOT deviate from these specifications — this persona's appearance is fixed.`
        + ` Critical: do NOT copy the reference image's outfit, silhouette, or accessories. Use this persona's fashion identity instead.`
        + ` Young woman (20s), photogenic, East Asian aesthetic.`
        + ` Same shot type and framing as the reference (mirror selfie stays mirror selfie, portrait stays portrait etc.).`
        + ` If selfie/mirror/first-person shot: only ONE hand visible holding the phone. Never two hands simultaneously.`
      : `Person: create a visually distinct individual who would never be confused with the person in the reference.`
        + ` Keep the same energy level (fashionable/casual/edgy etc.) and body confidence, but express it through a COMPLETELY DIFFERENT outfit combination.`
        + ` Critical rule: do NOT copy the silhouette. Different hair length AND color from the reference. Different accessories.`
        + ` Base requirement: young woman (20s), photogenic, East Asian aesthetic.`
        + ` Same shot type and framing as the reference.`
        + ` If selfie/mirror/first-person shot: only ONE hand visible holding the phone. Never two hands simultaneously.`
        + (safePersonaHint ? ` Character context: ${safePersonaHint}.` : ""),

    // [5] 顔の処理 — ベンチマーク参照画像に合わせる
    // 参照が顔を出している → 顔の見え方は同じ（正面・斜め等）だが顔立ちは完全別人
    // 参照が顔を隠している → 同じ隠し方を踏襲
    `Face: match the reference image's face VISIBILITY style only — do NOT copy the actual face.`
    + ` If the reference shows a clear, visible face → generate a completely DIFFERENT person's face: different face shape, different features, different expression. This must be a unique new individual who looks nothing like the reference person. Young woman (20s), East Asian aesthetic, approachable and attractive.`
    + ` CRITICAL: The generated face must be clearly distinguishable as a different person from the reference. Never reproduce the reference person's likeness.`
    + ` If the reference hides the face (phone blocking, back of head, skin close-up, sideways angle, distance) → use the exact same face-hiding method as the reference.`,

    // [6]
    `TEXT OVERLAY (mandatory — this image MUST have visible text): COMPLETELY ERASE every word and character in the reference image.`
    + ` Then render new text that EXACTLY matches the LAYOUT STYLE from the reference:`
    + ` — Text container: if the reference has NO container → NO box or pill; if it has a pill/rounded box/overlay → replicate that exact shape and color.`
    + ` — Text position: same location (left side / top / center / etc.) as the reference.`
    + ` — Text color: same as reference. If text would be hard to read, use white with subtle dark shadow.`
    + ` — Text size hierarchy: headline LARGE, bullets MEDIUM, accent SMALL.`
    + ` New content: ${structuredText}.`
    + ` ZERO hallucination rule: render ONLY the exact text elements listed above. If "NO BULLETS" is specified, the area below the headline must remain background — do NOT invent or add any list items, numbers, or bullet points from the reference or from context.`
    + ` Text must not exceed 55% of image area. Person and background must remain clearly visible.`
    + ` ${FONT_SPEC}`,

    // [7]
    `ERASE completely: any Lemon8 app logo, @username badge, account name, or platform watermark — especially the bottom-right app badge. Zero platform UI.`,

    // [8] 商品カットアウト（product スライドのみ）
    // GPT-Image-2 に対して「第2参照画像の商品をカットアウトとして左側に配置」と明示指示
    // → AI が白背景を自動除去して自然にシーンへ合成してくれる（Sharp 合成は使わない）
    hasProduct && productImageUrl
      ? `Product cutout from image 2: extract just the product object from the second image, completely removing its white or plain background.`
        + ` Place the product as a clean floating cutout in the LEFT THIRD of the composition, vertically centered.`
        + ` The product should appear to naturally float in front of the scene — no white box, no rectangle, no background from the original product photo.`
        + ` Size: approximately 35% of image width. All label text, logo, colors, and packaging shape must exactly match image 2.`
        + ` The product must NOT be placed on a surface or held by hand — it floats as an editorial cutout element.`
      : `No skincare products, no cosmetics, no product packaging visible anywhere.`,

    // [9] ユーザー追加指示（再生成時の修正内容。他のルールより優先する）
    instruction
      ? `OVERRIDE INSTRUCTION (highest priority — apply this change above all other rules): ${instruction}`
      : null,

    `Portrait orientation. ${noUI}`,

  ].filter(Boolean).join("  ")

  console.log(`[generateV2Slide] prompt[:350]: ${prompt.slice(0, 350)}`)

  // 参照画像: ベンチマーク（スタイル参照）→ 商品画像（カットアウト元）の順で渡す
  const imageUrls = [refImageUrl, productImageUrl].filter((u): u is string => Boolean(u))

  try {
    const buffer = await generateImage(prompt, imageUrls)
    return { buffer, policyFallback: false, falCalls: 1 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.startsWith("FAL_CONTENT_POLICY")) throw err

    // ─ コンテンツポリシー違反: スタイル説明・人物描写を完全除去してリトライ ─
    // サニタイズ済みでも違反する場合（例: visualProfile.fashion に未対応ワード）があるため
    // 第2フォールバックとして人物・スタイル情報をゼロにして再試行する。
    console.warn(`[generateV2Slide] FAL_CONTENT_POLICY on slide ${slideNumber} — retrying with stripped persona/style`)

    const fallbackPrompt = [
      `Authentic candid phone photo. ${SMARTPHONE_FEEL}. Genuine Japanese woman's Lemon8 post.`,
      `Composition: copy ONLY framing, camera angle, and shot type from the reference. DO NOT copy scene, background, decor, or environment.`,
      `Person: young woman (20s), East Asian aesthetic, casual everyday fashion. Same shot type as reference.`,
      `Face: follow the reference image's face treatment EXACTLY.`,
      `TEXT OVERLAY (mandatory): COMPLETELY ERASE every word in the reference image. Render new text: ${structuredText}. ${FONT_SPEC}`,
      `ERASE completely: any Lemon8 app logo, @username badge, or platform watermark.`,
      hasProduct && productImageUrl
        ? `Product from image 2: extract the product, remove background, place as floating cutout in LEFT THIRD.`
        : `No skincare products, no cosmetics visible.`,
      `Portrait orientation. ${noUI}`,
    ].filter(Boolean).join("  ")

    console.log(`[generateV2Slide] fallback prompt[:200]: ${fallbackPrompt.slice(0, 200)}`)
    try {
      const buffer = await generateImage(fallbackPrompt, imageUrls)
      return { buffer, policyFallback: true, falCalls: 2 }
    } catch (fallbackErr) {
      // フォールバックも失敗した場合は null を返す（例外は投げない）
      // → Promise.all が他スライドを道連れにするのを防ぐ
      console.error(`[generateV2Slide] fallback also failed on slide ${slideNumber}:`, fallbackErr)
      return { buffer: null, policyFallback: true, falCalls: 2 }
    }
  }
}
