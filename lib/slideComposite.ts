/**
 * slideComposite.ts — ベンチマーク方式のスライド画像合成
 *
 * FALで写真を生成するのではなく、ベンチマークと同じ手法で合成する:
 * - ベンチマーク画像を背景として暗くして敷く（全スライド共通）
 * - 商品PNG画像を切り抜きとして左側に配置
 * - 見出し・商品情報・箇条書きをテキストレイヤーとして重ねる
 */

import sharp from "sharp"
import fs from "fs"
import path from "path"

const W = 1080
const H = 1440

// ─── フォント ─────────────────────────────────────────────────────

let _fontB64: string | null = null
function getFontB64(): string {
  if (!_fontB64) {
    const p = path.join(process.cwd(), "public/fonts/mplus-rounded-800.ttf")
    _fontB64 = fs.readFileSync(p).toString("base64")
  }
  return _fontB64
}

function fontFace(): string {
  return `@font-face { font-family:'MPR'; src:url('data:font/ttf;base64,${getFontB64()}') format('truetype'); }`
}

// ─── ユーティリティ ───────────────────────────────────────────────

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchBuffer failed ${res.status}: ${url.slice(-60)}`)
  return Buffer.from(await res.arrayBuffer())
}

/** テキストを maxChars 文字ごとに折り返す */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, maxChars))
    remaining = remaining.slice(maxChars)
    if (lines.length >= 3) break
  }
  return lines
}

// ─── 商品スライド合成（ベンチマーク準拠レイアウト） ──────────────

export interface ProductSlideCompositeParams {
  refImageUrl: string      // ベンチマーク背景画像
  productImageUrl: string  // 商品画像（左側に配置）
  headline: string         // 見出しテキスト（白いピル内に表示）
  tag: string
  productName?: string     // 商品名（右側テキスト）
  brand?: string           // ブランド名（右側テキスト）
  price?: string           // 価格（右側テキスト）
  bullets?: string[]       // 箇条書き（下部ダークバンドに表示）
  accent?: string          // 強調テキスト（おすすめマーク等）
  slideNumber?: number     // スライド番号（01, 02 ...）
  isHighlight?: boolean    // 自社商品強調フラグ（ゴールド枠など）
}

export async function generateProductSlideComposite(
  params: ProductSlideCompositeParams,
): Promise<Buffer> {
  const {
    refImageUrl, productImageUrl, headline, tag, productName, brand,
    price, bullets = [], accent, slideNumber, isHighlight = false,
  } = params

  // ─ 1. 背景: ベンチマーク画像を暗くして全面に敷く ─
  const refBuf = await fetchBuffer(refImageUrl)
  const background = await sharp(refBuf)
    .resize(W, H, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.42 })
    .jpeg({ quality: 88 })
    .toBuffer()

  // ─ 2. 商品画像: 左側上部に配置 ─
  const prodBuf = await fetchBuffer(productImageUrl)
  const PROD_MAX_W = Math.floor(W * 0.40)   // 左40%
  const PROD_MAX_H = Math.floor(H * 0.33)   // 高さ33%
  const productResized = await sharp(prodBuf)
    .resize(PROD_MAX_W, PROD_MAX_H, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const prodMeta = await sharp(productResized).metadata()
  const pW = prodMeta.width  ?? PROD_MAX_W
  const pH = prodMeta.height ?? PROD_MAX_H

  // 商品: 左余白5%、縦は見出しの下250pxから
  const prodLeft = Math.floor(W * 0.05)
  const prodTop  = 250

  // ─ 3. SVGテキストレイヤー ─
  const slideNumStr = slideNumber !== undefined
    ? String(slideNumber).padStart(2, "0")
    : ""

  // 見出しテキスト折り返し（長いと2行）
  const headlineLines = wrapText(headline, 13)
  const pillH = headlineLines.length > 1 ? 170 : 130
  const pillY = 100

  // 右側テキスト（商品情報）
  const infoX = Math.floor(W * 0.46)
  const infoY = prodTop + 40

  // 下部ダークバンド（箇条書きエリア）
  const BAND_TOP = 870
  const BAND_H   = H - BAND_TOP

  // 箇条書き（最大3件）
  const bulletItems = bullets.slice(0, 3)
  const bulletSvgLines = bulletItems.map((b, i) => {
    const bLines = wrapText(b, 18)
    const baseY = BAND_TOP + 80 + i * 140
    return bLines.map((line, li) => `
      <text x="54" y="${baseY + li * 48}" font-family="MPR,sans-serif" font-size="40" fill="white"
        stroke="rgba(0,0,0,0.3)" stroke-width="1" paint-order="stroke fill">${xml(line)}</text>
    `).join("")
  }).join("")

  // ハイライト枠（自社商品）
  const highlightBorder = isHighlight
    ? `<rect x="${prodLeft - 6}" y="${prodTop - 6}" width="${pW + 12}" height="${pH + 12}"
         rx="12" fill="none" stroke="#FFD700" stroke-width="4"/>`
    : ""

  // アクセント（← 最推し など）
  const accentSvg = accent
    ? `<text x="${infoX}" y="${infoY + 230}" font-family="MPR,sans-serif" font-size="34"
         fill="#FFD700" font-weight="bold">${xml(accent)}</text>`
    : ""

  // 見出しのY位置（1行 or 2行）
  const headlineTextSvg = headlineLines.map((line, i) => `
    <text x="${W / 2}" y="${pillY + 76 + i * 64}" text-anchor="middle"
      font-family="MPR,sans-serif" font-size="54" fill="#222">${xml(line)}</text>
  `).join("")

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace()}</style></defs>

    <!-- スライド番号 -->
    ${slideNumStr
      ? `<text x="${W / 2}" y="72" text-anchor="middle" font-family="MPR,sans-serif"
           font-size="44" fill="rgba(255,255,255,0.85)">${xml(slideNumStr)}</text>`
      : ""}

    <!-- 見出しピル（白い角丸ボックス） -->
    <rect x="40" y="${pillY}" width="${W - 80}" height="${pillH}" rx="50" fill="white"/>
    ${headlineTextSvg}

    <!-- 商品ハイライト枠 -->
    ${highlightBorder}

    <!-- 右側: ブランド名 -->
    ${brand
      ? `<text x="${infoX}" y="${infoY}" font-family="MPR,sans-serif" font-size="34"
           fill="rgba(255,255,255,0.75)">${xml(brand)}</text>`
      : ""}

    <!-- 右側: 商品名 -->
    ${productName ? wrapText(productName, 11).map((line, i) => `
      <text x="${infoX}" y="${infoY + 56 + i * 52}" font-family="MPR,sans-serif"
        font-size="46" fill="white" font-weight="bold">${xml(line)}</text>
    `).join("") : ""}

    <!-- 右側: 価格 -->
    ${price
      ? `<text x="${infoX}" y="${infoY + 180}" font-family="MPR,sans-serif" font-size="42"
           fill="white">${xml(price)}</text>`
      : ""}

    ${accentSvg}

    <!-- タグ -->
    <text x="${infoX}" y="${BAND_TOP - 30}" font-family="MPR,sans-serif" font-size="30"
      fill="rgba(255,255,255,0.55)">${xml(tag)}</text>

    <!-- 下部ダークバンド -->
    <rect x="0" y="${BAND_TOP}" width="${W}" height="${BAND_H}" fill="rgba(0,0,0,0.60)"/>

    <!-- 箇条書き -->
    ${bulletSvgLines}
  </svg>`

  // ─ 4. 合成 ─
  const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer()

  return sharp(background)
    .composite([
      { input: productResized, left: prodLeft, top: prodTop },
      { input: overlayBuf,     left: 0,        top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ─── FAL背景へのテキスト後乗せ（フック用） ───────────────────────

export interface HookTextOverlayParams {
  headline: string
  tag?: string
  slideNumber?: number
}

/**
 * FALが生成した背景写真にフックスライド用テキストを後乗せする。
 * - 暗め（70%輝度）でドラマティックな演出
 * - 大きな白ピルで見出しを中央配置
 */
export async function addHookTextOverlay(
  backgroundBuffer: Buffer,
  params: HookTextOverlayParams,
): Promise<Buffer> {
  const { headline, tag, slideNumber } = params

  const bg = await sharp(backgroundBuffer)
    .resize(W, H, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.70 })
    .jpeg({ quality: 88 })
    .toBuffer()

  const slideNumStr = slideNumber !== undefined
    ? String(slideNumber).padStart(2, "0") : ""

  const headlineLines = wrapText(headline, 10)
  const pillH = headlineLines.length > 1 ? 196 : 158
  const pillY = Math.floor(H * 0.38)

  const headlineTextSvg = headlineLines.map((line, i) => `
    <text x="${W / 2}" y="${pillY + 94 + i * 78}" text-anchor="middle"
      font-family="MPR,sans-serif" font-size="66" fill="#111">${xml(line)}</text>
  `).join("")

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace()}</style></defs>
    ${slideNumStr
      ? `<text x="${W / 2}" y="${pillY - 50}" text-anchor="middle" font-family="MPR,sans-serif"
           font-size="46" fill="rgba(255,255,255,0.85)">${xml(slideNumStr)}</text>`
      : ""}
    <rect x="40" y="${pillY}" width="${W - 80}" height="${pillH}" rx="50" fill="white"/>
    ${headlineTextSvg}
    ${tag && tag !== "フック"
      ? `<text x="${W / 2}" y="${pillY + pillH + 55}" text-anchor="middle"
           font-family="MPR,sans-serif" font-size="34" fill="rgba(255,255,255,0.65)">${xml(tag)}</text>`
      : ""}
  </svg>`

  const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer()
  return sharp(bg)
    .composite([{ input: overlayBuf, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ─── FAL背景へのテキスト後乗せ（コンテンツスライド用） ─────────

export interface ContentTextOverlayParams {
  headline: string
  tag: string
  bullets?: string[]
  accent?: string
  slideNumber?: number
}

/**
 * FALが生成した背景写真にコンテンツスライド用テキストを後乗せする。
 * - 輝度はそのまま（FALが生成した自然な明るさを活かす）
 * - 上部白ピル（見出し）+ 下部ダークバンド（箇条書き）
 */
export async function addContentTextOverlay(
  backgroundBuffer: Buffer,
  params: ContentTextOverlayParams,
): Promise<Buffer> {
  const { headline, tag, bullets = [], accent, slideNumber } = params

  const bg = await sharp(backgroundBuffer)
    .resize(W, H, { fit: "cover", position: "center" })
    .jpeg({ quality: 88 })
    .toBuffer()

  const slideNumStr = slideNumber !== undefined
    ? String(slideNumber).padStart(2, "0") : ""

  // ─ 上部白ピル（見出し）─
  const headlineLines = wrapText(headline, 11)
  const PILL_LINE_H  = 76
  const PILL_PAD_V   = 34
  const pillH  = PILL_PAD_V * 2 + PILL_LINE_H * headlineLines.length
  const pillY  = 48
  const textBaseY = pillY + PILL_PAD_V + 58  // first line baseline

  const headlineTextSvg = headlineLines.map((line, i) => `
    <text x="${W / 2}" y="${textBaseY + i * PILL_LINE_H}" text-anchor="middle"
      font-family="MPR,sans-serif" font-size="58" fill="#1a1a1a"
      font-weight="bold">${xml(line)}</text>
  `).join("")

  // ─ 下部ダークバンド（箇条書きエリア）─
  const hasBullets = bullets.length > 0
  const BAND_TOP = H - (hasBullets ? 460 : 0)
  const BAND_H   = hasBullets ? H - BAND_TOP : 0

  const bulletItems = bullets.slice(0, 3)
  const bulletSvgLines = bulletItems.map((b, i) => {
    const bLines = wrapText(b, 15)
    const baseY = BAND_TOP + 64 + i * 130
    return bLines.map((line, li) => `
      <text x="54" y="${baseY + li * 48}" font-family="MPR,sans-serif" font-size="42" fill="white"
        paint-order="stroke fill">${xml(line)}</text>
    `).join("")
  }).join("")

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace()}</style></defs>

    <!-- スライド番号 -->
    ${slideNumStr
      ? `<text x="${W - 44}" y="44" text-anchor="end" font-family="MPR,sans-serif"
           font-size="38" fill="rgba(255,255,255,0.75)">${xml(slideNumStr)}</text>`
      : ""}

    <!-- 上部白ピル -->
    <rect x="36" y="${pillY}" width="${W - 72}" height="${pillH}" rx="54" fill="white"/>
    ${headlineTextSvg}

    <!-- 下部ダークバンド（箇条書きがある場合のみ） -->
    ${hasBullets ? `<rect x="0" y="${BAND_TOP}" width="${W}" height="${BAND_H}" fill="rgba(0,0,0,0.65)"/>` : ""}
    ${hasBullets ? `<text x="50" y="${BAND_TOP + 36}" font-family="MPR,sans-serif" font-size="30"
      fill="rgba(255,255,255,0.50)">${xml(tag)}</text>` : ""}
    ${bulletSvgLines}
    ${accent && hasBullets
      ? `<text x="50" y="${BAND_TOP + BAND_H - 24}" font-family="MPR,sans-serif" font-size="38"
           fill="#FFD700" font-weight="bold">${xml(accent)}</text>`
      : ""}
  </svg>`

  const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer()
  return sharp(bg)
    .composite([{ input: overlayBuf, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ─── フックスライド合成（1枚目: 背景 + 見出しのみ） ─────────────

export interface HookSlideCompositeParams {
  refImageUrl: string
  headline: string
  tag?: string
  slideNumber?: number
}

export async function generateHookSlideComposite(
  params: HookSlideCompositeParams,
): Promise<Buffer> {
  const { refImageUrl, headline, tag, slideNumber } = params

  // ベンチマーク画像を暗くして全面に敷く（フックは暗くてドラマティックが基本）
  const refBuf = await fetchBuffer(refImageUrl)
  const background = await sharp(refBuf)
    .resize(W, H, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.44 })
    .jpeg({ quality: 88 })
    .toBuffer()

  const slideNumStr = slideNumber !== undefined
    ? String(slideNumber).padStart(2, "0")
    : ""

  // 見出しの折り返し: 10文字ごとに最大2行
  const headlineLines = wrapText(headline, 10)
  const LINE_H     = 84  // 行間（ピクセル）
  const PILL_PAD_V = 44  // 上下余白
  const pillH = PILL_PAD_V * 2 + LINE_H * headlineLines.length
  // ピルを縦方向中央よりやや上に置く
  const pillY = Math.floor(H * 0.36)

  // 見出しテキスト（ピル内中央）
  const textBaseY = pillY + PILL_PAD_V + 66  // first line baseline
  const headlineTextSvg = headlineLines.map((line, i) => `
    <text x="${W / 2}" y="${textBaseY + i * LINE_H}" text-anchor="middle"
      font-family="MPR,sans-serif" font-size="68" fill="#1a1a1a"
      font-weight="bold">${xml(line)}</text>
  `).join("")

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace()}</style></defs>

    <!-- スライド番号: ピルの上に小さく -->
    ${slideNumStr
      ? `<text x="${W / 2}" y="${pillY - 28}" text-anchor="middle"
           font-family="MPR,sans-serif" font-size="40"
           fill="rgba(255,255,255,0.88)">${xml(slideNumStr)}</text>`
      : ""}

    <!-- 白ピル: 角丸を大きめに、左右は余白36px -->
    <rect x="36" y="${pillY}" width="${W - 72}" height="${pillH}" rx="60" fill="white"/>

    <!-- 見出しテキスト -->
    ${headlineTextSvg}

    <!-- タグ: フック以外のとき小さくピルの下に表示 -->
    ${tag && tag !== "フック"
      ? `<text x="${W / 2}" y="${pillY + pillH + 52}" text-anchor="middle"
           font-family="MPR,sans-serif" font-size="32"
           fill="rgba(255,255,255,0.60)">${xml(tag)}</text>`
      : ""}
  </svg>`

  const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer()

  return sharp(background)
    .composite([{ input: overlayBuf, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}
