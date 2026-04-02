import sharp from "sharp"
import type { SlideContent } from "@/types"
import { getMplusFontFace } from "@/lib/fonts"

const W = 1080
const H = 1080
// Noto Sans JP (Bold) — システムフォールバック
const FONT = `Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic UI, sans-serif`

interface Palette {
  bg: string
  bg2: string        // グラデーション用第2色
  accent: string
  accentDark: string
  dark: string
  light: string
  text: string
}

const PALETTES: Record<string, Palette> = {
  pink:   { bg: "#FFE8F0", bg2: "#FFC8DC", accent: "#E8758A", accentDark: "#C4506A", dark: "#2D1A22", light: "#FFD6E4", text: "#1A0A10" },
  blue:   { bg: "#E8F4FF", bg2: "#C0DBFF", accent: "#3B72E8", accentDark: "#2050C0", dark: "#0A1A3A", light: "#DBEAFE", text: "#0A1020" },
  green:  { bg: "#E8FFF0", bg2: "#C0F0D0", accent: "#2EA855", accentDark: "#1A7A38", dark: "#0A2018", light: "#DCFCE7", text: "#0A1A10" },
  yellow: { bg: "#FFFBE8", bg2: "#FFE8A0", accent: "#E8A020", accentDark: "#C07010", dark: "#2A1A00", light: "#FEF3C7", text: "#1A1000" },
  purple: { bg: "#F5E8FF", bg2: "#DFC0FF", accent: "#9040D8", accentDark: "#6820A8", dark: "#1A0A30", light: "#EDE9FE", text: "#100A20" },
  orange: { bg: "#FFF2E8", bg2: "#FFD0A8", accent: "#E86020", accentDark: "#C04010", dark: "#2A0A00", light: "#FFEDD5", text: "#1A0800" },
  teal:   { bg: "#E8FFFE", bg2: "#A8EEE8", accent: "#0A9A90", accentDark: "#087068", dark: "#002A28", light: "#CCFBF1", text: "#001A18" },
  mono:   { bg: "#F5F5F5", bg2: "#E0E0E0", accent: "#1A1A1A", accentDark: "#000000", dark: "#111111", light: "#E8E8E8", text: "#0A0A0A" },
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// 文字幅推定（日本語≈1em、ASCII≈0.55em）
function charW(c: string, size: number): number {
  return (c.codePointAt(0) ?? 0) > 0x7E ? size : size * 0.55
}

// テキストを最大幅でラップ
function wrapText(text: string, maxPx: number, size: number): string[] {
  const rawLines = text.split(/\\n|\n/).filter(Boolean)
  const result: string[] = []
  for (const raw of rawLines) {
    let line = "", lineW = 0
    for (const c of raw) {
      const cw = charW(c, size)
      if (lineW + cw > maxPx && line) { result.push(line); line = c; lineW = cw }
      else { line += c; lineW += cw }
    }
    if (line) result.push(line)
  }
  return result
}

// 最大行数に収まる最大フォントサイズを探す
function fitFont(text: string, maxPx: number, maxLines: number, maxSize: number, minSize = 36): { size: number; lines: string[] } {
  for (let s = maxSize; s >= minSize; s -= 4) {
    const ls = wrapText(text, maxPx, s)
    if (ls.length <= maxLines) return { size: s, lines: ls }
  }
  return { size: minSize, lines: wrapText(text, maxPx, minSize).slice(0, maxLines) }
}

// アウトライン付きテキストブロック（複数行）
function textBlock(lines: string[], x: number, startY: number, lineH: number, size: number, fill: string, stroke: string, sw: number, anchor = "middle"): string {
  return lines.map((l, i) => `
    <text x="${x}" y="${startY + i * lineH}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-0.5" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke fill" fill="${fill}">${esc(l)}</text>`
  ).join("")
}

// 単行アウトラインテキスト（後方互換用）
function outlineText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  strokeColor: string,
  strokeWidth: number,
  anchor = "middle",
  weight = "900",
): string {
  const attrs = `x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${fontSize}" font-weight="${weight}" letter-spacing="-1"`
  return `
    <text ${attrs} stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill" fill="${fill}">${esc(text)}</text>`
}

// ── スライド1: 表紙 SVG ──────────────────────────────────────
function coverSvg(slide: SlideContent, p: Palette): string {
  const { size: fontSize, lines: headLines } = fitFont(slide.headline, W - 120, 3, 100, 52)
  const lineH = fontSize <= 70 ? fontSize * 1.15 : fontSize * 1.2
  const textAreaTop = H - 400
  const textStartY = textAreaTop + 90

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- グラデーション背景 -->
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${p.bg}"/>
        <stop offset="100%" stop-color="${p.bg2}"/>
      </linearGradient>
      <!-- 下部テキストエリア用グラデーション -->
      <linearGradient id="textFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="60%" stop-color="rgba(0,0,0,0.55)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.82)"/>
      </linearGradient>
    </defs>

    <!-- 背景 -->
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

    <!-- 装飾: ランダム丸 -->
    <circle cx="80" cy="120" r="60" fill="${p.accent}" opacity="0.12"/>
    <circle cx="${W - 60}" cy="200" r="45" fill="${p.accentDark}" opacity="0.10"/>
    <circle cx="160" cy="${H - 320}" r="35" fill="${p.accent}" opacity="0.08"/>
    <circle cx="${W - 120}" cy="${H - 260}" r="55" fill="${p.bg2}" opacity="0.5"/>

    <!-- 上部タグバッジ（角丸タグ） -->
    <rect x="40" y="42" width="360" height="58" rx="29" fill="${p.accent}"/>
    <text x="220" y="81" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="800" fill="white" letter-spacing="1">${esc(slide.tag)}</text>

    <!-- 下部テキストオーバーレイ -->
    <rect x="0" y="${textAreaTop}" width="${W}" height="${H - textAreaTop}" fill="url(#textFade)"/>

    <!-- ヘッドライン（アウトライン付き大文字） -->
    ${textBlock(headLines, W / 2, textStartY, lineH, fontSize, "white", "rgba(0,0,0,0.7)", 6)}

    <!-- 下部アクセント帯 -->
    <rect x="0" y="${H - 90}" width="${W}" height="90" fill="${p.accent}"/>
    <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="white" letter-spacing="1">${esc(slide.accent ?? "")}</text>

    <!-- スライド番号 -->
    <text x="${W - 40}" y="${H - 104}" text-anchor="end" font-family="${FONT}" font-size="22" fill="rgba(255,255,255,0.7)">1/5</text>
  </svg>`
}

// ── スライド2: マガジンヘッダースタイル ────────────────────────
function slide2Svg(slide: SlideContent, p: Palette): string {
  const headerH = 220
  const { size: fontSize, lines: headLines } = fitFont(slide.headline, W - 180, 3, 80, 36)
  const lineH = Math.round(fontSize * 1.25)
  const bullets = slide.bullets ?? []
  const pillH = 80
  const pillGap = 18
  const priceH = slide.price ? 68 : 0
  const bulletsStartY = headerH + 60 + priceH

  const bulletPills = bullets.map((b, i) => {
    const py = bulletsStartY + i * (pillH + pillGap)
    const { size: bSize, lines: bLines } = fitFont(b, W - 200, 2, 34, 22)
    const bLineH = Math.round(bSize * 1.3)
    const textY = py + pillH / 2 - ((bLines.length - 1) * bLineH) / 2 + bSize * 0.36
    return `
      <rect x="60" y="${py}" width="${W - 120}" height="${pillH}" rx="40" fill="white" opacity="0.95"/>
      <rect x="60" y="${py}" width="8" height="${pillH}" rx="4" fill="${p.accent}"/>
      ${bLines.map((bl, bi) => `<text x="90" y="${textY + bi * bLineH}" font-family="${FONT}" font-size="${bSize}" font-weight="700" fill="${p.dark}">${esc(bl)}</text>`).join("")}`
  }).join("")

  const tagTextLen = slide.tag.length
  const tagW = Math.min(Math.max(tagTextLen * 28 + 48, 200), 420)

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0%" stop-color="${p.bg}"/>
        <stop offset="100%" stop-color="${p.bg2}"/>
      </linearGradient>
      <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${p.accent}"/>
        <stop offset="100%" stop-color="${p.accentDark}"/>
      </linearGradient>
    </defs>

    <!-- 背景 -->
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

    <!-- 装飾丸 -->
    <circle cx="${W - 60}" cy="${headerH + 80}" r="70" fill="${p.accent}" opacity="0.07"/>
    <circle cx="60" cy="${H - 160}" r="50" fill="${p.accentDark}" opacity="0.06"/>

    <!-- ヘッダー帯 -->
    <rect x="0" y="0" width="${W}" height="${headerH}" rx="0" fill="url(#headerGrad)"/>
    <!-- ヘッダー装飾丸 -->
    <circle cx="${W - 80}" cy="40" r="80" fill="rgba(255,255,255,0.08)"/>
    <circle cx="30" cy="${headerH + 10}" r="50" fill="rgba(255,255,255,0.06)"/>

    <!-- タグバッジ -->
    <rect x="40" y="28" width="${tagW}" height="48" rx="24" fill="rgba(255,255,255,0.25)"/>
    <text x="${40 + tagW / 2}" y="61" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="800" fill="white" letter-spacing="1">${esc(slide.tag)}</text>

    <!-- ヘッドライン -->
    ${textBlock(headLines, 60, 110, lineH, fontSize, "white", "rgba(0,0,0,0.3)", 3, "start")}

    <!-- 価格バッジ -->
    ${slide.price ? `
    <rect x="60" y="${headerH + 18}" width="280" height="52" rx="26" fill="${p.accentDark}"/>
    <text x="200" y="${headerH + 53}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="900" fill="white">${esc(slide.price)}</text>` : ""}

    <!-- ピルカード群 -->
    ${bulletPills}

    <!-- 下部フッター帯 -->
    <rect x="0" y="${H - 80}" width="${W}" height="80" fill="${p.accentDark}"/>
    <text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>

    <!-- スライド番号 -->
    <text x="${W - 40}" y="${H - 92}" text-anchor="end" font-family="${FONT}" font-size="22" fill="rgba(255,255,255,0.7)">2/5</text>
  </svg>`
}

// ── スライド3: サイドバーリストスタイル ────────────────────────
function slide3Svg(slide: SlideContent, p: Palette): string {
  const sidebarW = 80
  const contentX = sidebarW + 48
  const contentW = W - contentX - 48
  const bullets = slide.bullets ?? []

  const { size: fontSize, lines: headLines } = fitFont(slide.headline, contentW, 3, 72, 36)
  const lineH = Math.round(fontSize * 1.25)
  const headEndY = 160 + headLines.length * lineH

  const circleR = 28
  const rowH = 100
  const bulletsStartY = headEndY + 50

  const bulletRows = bullets.map((b, i) => {
    const ry = bulletsStartY + i * rowH
    const cy = ry + rowH / 2
    const { size: bSize, lines: bLines } = fitFont(b, contentW - circleR * 2 - 20, 2, 32, 20)
    const bLineH = Math.round(bSize * 1.3)
    const textStartBY = cy - ((bLines.length - 1) * bLineH) / 2 + bSize * 0.36
    return `
      <!-- bullet row ${i} -->
      <rect x="${contentX - 10}" y="${ry + 8}" width="${W - contentX}" height="${rowH - 16}" rx="20" fill="white" opacity="0.75"/>
      <circle cx="${contentX + circleR + 8}" cy="${cy}" r="${circleR}" fill="${p.accent}"/>
      <text x="${contentX + circleR + 8}" y="${cy + 11}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="900" fill="white">${i + 1}</text>
      ${bLines.map((bl, bi) => `<text x="${contentX + circleR * 2 + 28}" y="${textStartBY + bi * bLineH}" font-family="${FONT}" font-size="${bSize}" font-weight="700" fill="${p.dark}">${esc(bl)}</text>`).join("")}`
  }).join("")

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="${p.light}"/>
        <stop offset="100%" stop-color="${p.bg}"/>
      </linearGradient>
    </defs>

    <!-- 背景 -->
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

    <!-- 装飾丸 -->
    <circle cx="${W - 80}" cy="${H - 160}" r="90" fill="${p.accent}" opacity="0.06"/>
    <circle cx="${W / 2}" cy="40" r="140" fill="${p.bg2}" opacity="0.4"/>

    <!-- 左サイドバー -->
    <rect x="0" y="0" width="${sidebarW}" height="${H}" fill="${p.accent}"/>
    <!-- サイドバー装飾 -->
    <circle cx="${sidebarW / 2}" cy="120" r="36" fill="rgba(255,255,255,0.2)"/>
    <circle cx="${sidebarW / 2}" cy="${H - 120}" r="28" fill="rgba(255,255,255,0.15)"/>
    <!-- サイドバー縦テキスト（スライド番号） -->
    <text x="${sidebarW / 2}" y="${H / 2}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="800" fill="rgba(255,255,255,0.6)" transform="rotate(-90, ${sidebarW / 2}, ${H / 2})">3 / 5</text>

    <!-- タグバッジ -->
    <rect x="${contentX}" y="40" width="320" height="50" rx="25" fill="${p.accent}"/>
    <text x="${contentX + 160}" y="75" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="800" fill="white">${esc(slide.tag)}</text>

    <!-- ヘッドライン -->
    ${textBlock(headLines, contentX, 130, lineH, fontSize, p.dark, p.bg2, 3, "start")}

    <!-- 仕切り線 -->
    <rect x="${contentX}" y="${headEndY + 20}" width="${W - contentX - 40}" height="3" rx="2" fill="${p.accent}" opacity="0.3"/>

    <!-- bullet rows -->
    ${bulletRows}

    <!-- 下部アクセント帯 -->
    <rect x="${sidebarW}" y="${H - 72}" width="${W - sidebarW}" height="72" fill="${p.accentDark}"/>
    <text x="${sidebarW + (W - sidebarW) / 2}" y="${H - 26}" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>
  </svg>`
}

// ── スライド4: ステップ/チュートリアルスタイル ──────────────────
function slide4Svg(slide: SlideContent, p: Palette): string {
  const headerH = Math.round(H * 0.40)
  const bodyY = headerH
  const bodyH = H - headerH
  const bullets = slide.bullets ?? []
  const stepCount = Math.min(bullets.length, 3)
  const stepH = Math.floor((bodyH - 80) / Math.max(stepCount, 1))

  const { size: fontSize, lines: headLines } = fitFont(slide.headline, W - 120, 3, 82, 36)
  const lineH = Math.round(fontSize * 1.22)
  const tagH = 88
  const headStartY = tagH + 40

  const stepBoxes = bullets.slice(0, 3).map((b, i) => {
    const sy = bodyY + 40 + i * stepH
    const { size: bSize, lines: bLines } = fitFont(b, W - 220, 2, 32, 20)
    const bLineH = Math.round(bSize * 1.3)
    const labelW = 100
    const textX = 80 + labelW + 24
    const textAreaW = W - textX - 48
    const { size: bSize2, lines: bLines2 } = fitFont(b, textAreaW, 2, 32, 20)
    const bLineH2 = Math.round(bSize2 * 1.3)
    const boxH = stepH - 20
    const textY = sy + boxH / 2 - ((bLines2.length - 1) * bLineH2) / 2 + bSize2 * 0.36
    void bSize; void bLines; void bLineH
    return `
      <!-- step box ${i} -->
      <rect x="60" y="${sy}" width="${W - 120}" height="${boxH}" rx="24" fill="white" opacity="0.9"/>
      <!-- step label -->
      <rect x="68" y="${sy + 8}" width="${labelW}" height="${boxH - 16}" rx="18" fill="${p.accent}"/>
      <text x="${68 + labelW / 2}" y="${sy + boxH / 2 - 10}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="900" fill="white">STEP</text>
      <text x="${68 + labelW / 2}" y="${sy + boxH / 2 + 22}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="900" fill="white">${i + 1}</text>
      ${bLines2.map((bl, bi) => `<text x="${textX}" y="${textY + bi * bLineH2}" font-family="${FONT}" font-size="${bSize2}" font-weight="700" fill="${p.dark}">${esc(bl)}</text>`).join("")}`
  }).join("")

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="${p.accent}"/>
        <stop offset="100%" stop-color="${p.accentDark}"/>
      </linearGradient>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.bg}"/>
        <stop offset="100%" stop-color="${p.light}"/>
      </linearGradient>
    </defs>

    <!-- ヘッダー -->
    <rect x="0" y="0" width="${W}" height="${headerH}" fill="url(#headerGrad)"/>
    <!-- ヘッダー装飾 -->
    <circle cx="${W - 60}" cy="60" r="90" fill="rgba(255,255,255,0.08)"/>
    <circle cx="60" cy="${headerH - 40}" r="60" fill="rgba(255,255,255,0.07)"/>

    <!-- ボディ背景 -->
    <rect x="0" y="${bodyY}" width="${W}" height="${bodyH}" fill="url(#bodyGrad)"/>

    <!-- タグバッジ -->
    <rect x="40" y="30" width="320" height="52" rx="26" fill="rgba(255,255,255,0.25)"/>
    <text x="200" y="65" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="800" fill="white">${esc(slide.tag)}</text>

    <!-- ヘッドライン -->
    ${textBlock(headLines, W / 2, headStartY, lineH, fontSize, "white", "rgba(0,0,0,0.25)", 4)}

    <!-- スライド番号（ヘッダー内） -->
    <text x="${W - 44}" y="${headerH - 16}" text-anchor="end" font-family="${FONT}" font-size="22" fill="rgba(255,255,255,0.6)">4/5</text>

    <!-- ステップ boxes -->
    ${stepBoxes}

    <!-- 下部アクセント帯 -->
    <rect x="0" y="${H - 68}" width="${W}" height="68" fill="${p.accentDark}"/>
    <text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>
  </svg>`
}

// ── スライド5: ダークCTAスタイル ──────────────────────────────
function ctaSvg(slide: SlideContent, p: Palette): string {
  const { size: fontSize, lines: headLines } = fitFont(slide.headline, W - 120, 3, 92, 40)
  const lineH = Math.round(fontSize * 1.2)
  const bullets = slide.bullets ?? []
  const tagH = 90
  const headStartY = tagH + 60
  const headEndY = headStartY + headLines.length * lineH
  const bulletCardH = 76
  const bulletGap = 16
  const bulletStartY = headEndY + 60

  const bulletCards = bullets.map((b, i) => {
    const by = bulletStartY + i * (bulletCardH + bulletGap)
    const { size: bSize, lines: bLines } = fitFont(b, W - 200, 2, 32, 20)
    const bLineH = Math.round(bSize * 1.3)
    const textY = by + bulletCardH / 2 - ((bLines.length - 1) * bLineH) / 2 + bSize * 0.36
    return `
      <rect x="60" y="${by}" width="${W - 120}" height="${bulletCardH}" rx="20" fill="rgba(255,255,255,0.12)"/>
      <rect x="60" y="${by}" width="6" height="${bulletCardH}" rx="3" fill="${p.light}"/>
      ${bLines.map((bl, bi) => `<text x="90" y="${textY + bi * bLineH}" font-family="${FONT}" font-size="${bSize}" font-weight="700" fill="white">${esc(bl)}</text>`).join("")}`
  }).join("")

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${p.accentDark}"/>
        <stop offset="100%" stop-color="${p.dark}"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

    <!-- 装飾丸 -->
    <circle cx="100" cy="100" r="120" fill="rgba(255,255,255,0.05)"/>
    <circle cx="${W - 80}" cy="${H - 200}" r="150" fill="rgba(255,255,255,0.04)"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="200" fill="rgba(255,255,255,0.03)"/>

    <!-- 上部タグ帯 -->
    <rect x="0" y="0" width="${W}" height="${tagH}" fill="rgba(0,0,0,0.25)"/>
    <rect x="${W / 2 - 180}" y="20" width="360" height="50" rx="25" fill="${p.accent}" opacity="0.85"/>
    <text x="${W / 2}" y="55" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="800" fill="white">${esc(slide.tag)}</text>

    <!-- ヘッドライン -->
    ${textBlock(headLines, W / 2, headStartY, lineH, fontSize, "white", "rgba(0,0,0,0.4)", 5)}

    <!-- bullet カード -->
    ${bulletCards}

    <!-- 下部CTA帯 -->
    <rect x="0" y="${H - 100}" width="${W}" height="100" fill="${p.accent}"/>
    <!-- ハート装飾 -->
    <text x="${W / 2 - 160}" y="${H - 40}" text-anchor="middle" font-family="${FONT}" font-size="32" fill="rgba(255,255,255,0.6)">♡</text>
    <text x="${W / 2 + 160}" y="${H - 40}" text-anchor="middle" font-family="${FONT}" font-size="32" fill="rgba(255,255,255,0.6)">♡</text>
    <text x="${W / 2}" y="${H - 38}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="800" fill="white">${esc(slide.accent ?? "保存して♡")}</text>

    <!-- スライド番号 -->
    <text x="${W - 40}" y="${H - 112}" text-anchor="end" font-family="${FONT}" font-size="22" fill="rgba(255,255,255,0.5)">5/5</text>
  </svg>`
}

// ── 商品画像の配置設定 ──────────────────────────────────────
function productPlacement(slideNumber: number): { maxW: number; maxH: number; topRatio: number } {
  if (slideNumber === 1) return { maxW: 580, maxH: 500, topRatio: 0.42 }
  if (slideNumber === 5) return { maxW: 360, maxH: 300, topRatio: 0.28 }
  return { maxW: 300, maxH: 260, topRatio: 0.25 }
}

// ── メイン: 1枚スライド生成（SVGテンプレート） ──────────────
export async function renderSlide(
  slide: SlideContent,
  productBuffer: Buffer,
  paletteKey: string,
): Promise<Buffer> {
  const p = PALETTES[paletteKey] ?? PALETTES.teal

  let svgStr: string
  if (slide.slideNumber === 1) svgStr = coverSvg(slide, p)
  else if (slide.slideNumber === 2) svgStr = slide2Svg(slide, p)
  else if (slide.slideNumber === 3) svgStr = slide3Svg(slide, p)
  else if (slide.slideNumber === 4) svgStr = slide4Svg(slide, p)
  else svgStr = ctaSvg(slide, p)

  const bgBuf = await sharp(Buffer.from(svgStr)).png().toBuffer()

  // スライド2〜5: 商品画像なし、SVGをそのままJPEGで返す
  if (slide.slideNumber !== 1) {
    return sharp(bgBuf).jpeg({ quality: 92 }).toBuffer()
  }

  // スライド1: 商品画像コンポジット（中央上部）
  const { maxW, maxH, topRatio } = productPlacement(slide.slideNumber)

  const productResized = await sharp(productBuffer)
    .resize(maxW, maxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()

  const meta = await sharp(productResized).metadata()
  const pW = meta.width ?? maxW
  const pH = meta.height ?? maxH
  const imgLeft = Math.round((W - pW) / 2)
  const imgTop = Math.round(H * topRatio - pH / 2)

  // ドロップシャドウ
  const shadowW = Math.round(pW * 0.85)
  const shadowH = Math.round(pH * 0.10)
  const shadowSvg = `<svg width="${shadowW}" height="${shadowH}">
    <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2}" ry="${shadowH / 2}" fill="rgba(0,0,0,0.30)"/>
  </svg>`
  const shadowBuf = await sharp(Buffer.from(shadowSvg)).blur(12).png().toBuffer()
  const shadowLeft = imgLeft + Math.round((pW - shadowW) / 2)
  const shadowTop  = imgTop + pH - Math.round(shadowH * 0.6)

  return sharp(bgBuf)
    .composite([
      { input: shadowBuf, left: shadowLeft, top: Math.min(shadowTop, H - 20) },
      { input: productResized, left: Math.max(0, imgLeft), top: Math.max(0, imgTop) },
    ])
    .jpeg({ quality: 92 })
    .toBuffer()
}


// ── KIE背景使用: Slide1カバー（①手持ちUGC / ②切り抜き合成 / ③ライフスタイル） ──
export async function renderCoverWithKieBackground(
  slide: SlideContent,
  kieBackgroundBuffer: Buffer,
  productCutoutBuffer: Buffer | null,
  paletteKey: string,
): Promise<Buffer> {
  const p = PALETTES[paletteKey] ?? PALETTES.teal

  const bgResized = await sharp(kieBackgroundBuffer)
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer()

  const { size: fontSize, lines: headLines } = fitFont(slide.headline, W - 120, 3, 98, 44)
  const overlayH = 360
  const lineH = Math.round(fontSize * 1.18)
  const textStartY = H - overlayH + 80

  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="textFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="50%" stop-color="rgba(0,0,0,0.5)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
      </linearGradient>
    </defs>

    <!-- タグバッジ -->
    <rect x="40" y="42" width="360" height="58" rx="29" fill="${p.accent}" opacity="0.92"/>
    <text x="220" y="81" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="800" fill="white">${esc(slide.tag)}</text>

    <!-- 下部グラデーションオーバーレイ -->
    <rect x="0" y="${H - overlayH}" width="${W}" height="${overlayH}" fill="url(#textFade)"/>

    <!-- ヘッドライン -->
    ${textBlock(headLines, W / 2, textStartY, lineH, fontSize, "white", "rgba(0,0,0,0.6)", 6)}

    <!-- アクセント帯 -->
    <rect x="0" y="${H - 90}" width="${W}" height="90" fill="${p.accent}" opacity="0.92"/>
    <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>

    <text x="${W - 40}" y="${H - 104}" text-anchor="end" font-family="${FONT}" font-size="22" fill="rgba(255,255,255,0.7)">1/5</text>
  </svg>`

  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer()
  const composites: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [{ input: overlayBuf }]

  if (productCutoutBuffer) {
    const cutoutResized = await sharp(productCutoutBuffer)
      .resize(460, 420, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer()
    const meta = await sharp(cutoutResized).metadata()
    const pW = meta.width ?? 460
    const pH = meta.height ?? 420
    const left = Math.round((W - pW) / 2)
    const top  = Math.round((H - overlayH) / 2 - pH / 2 + 60)
    composites.push({ input: cutoutResized, left: Math.max(0, left), top: Math.max(80, top) })
  }

  return sharp(bgResized)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ── テンプレート表紙: 単色背景 + 切り抜き商品配置 ──────────────────
// A_商品切り抜き サムネ参考: シンプルな背景に商品画像を大きく配置するスタイル
export async function renderTemplateCover(
  slide: SlideContent,
  cutoutBuffer: Buffer,       // remove.bg 済みの透過PNG
  colorPalette: string,
): Promise<Buffer> {
  const CW = 1080
  const CH = 1350
  const p = PALETTES[colorPalette] ?? PALETTES.pink

  // 1. 単色背景を生成
  const bgSvg = `<svg width="${CW}" height="${CH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.bg}"/>
        <stop offset="100%" stop-color="${p.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="${CW}" height="${CH}" fill="url(#bg)"/>
  </svg>`
  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer()

  // 2. 切り抜き商品画像をリサイズ（画面の65%高さに収める）
  const maxH = Math.round(CH * 0.65)
  const maxW = Math.round(CW * 0.78)
  const resizedCutout = await sharp(cutoutBuffer)
    .resize(maxW, maxH, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer()
  const meta = await sharp(resizedCutout).metadata()
  const pW = meta.width ?? maxW
  const pH = meta.height ?? maxH

  // 商品を上寄りに配置（テキスト帯を下に確保）
  const textAreaH = 260
  const availH = CH - textAreaH
  const left = Math.round((CW - pW) / 2)
  const top  = Math.max(60, Math.round((availH - pH) / 2))

  // 3. テキストオーバーレイ（下部）
  const { size: tagSize, lines: tagLines } = fitFont(slide.tag ?? "", CW - 80, 1, 32, 22)
  const { size: headSize, lines: headLines } = fitFont(slide.headline, CW - 80, 3, 72, 40)
  const lineH = Math.round(headSize * 1.28)

  const textStartY = CH - textAreaH + 40
  const tagY = textStartY
  const headStartY = tagY + tagSize + 28

  const overlaySvg = `<svg width="${CW}" height="${CH}" xmlns="http://www.w3.org/2000/svg">
    <!-- アクセントライン -->
    <rect x="60" y="${tagY - tagSize - 12}" width="6" height="${tagSize + 8}" rx="3" fill="${p.accent}"/>
    <!-- タグ -->
    ${textBlock(tagLines, 80, tagY, Math.round(tagSize * 1.2), tagSize, p.accent, "none", 0, "start")}
    <!-- ヘッドライン -->
    ${textBlock(headLines, CW / 2, headStartY, lineH, headSize, p.dark, p.bg, 6)}
    <!-- 下部アクセント帯 -->
    <rect x="0" y="${CH - 72}" width="${CW}" height="72" fill="${p.accent}"/>
    <text x="${CW / 2}" y="${CH - 24}" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>
  </svg>`
  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer()

  return sharp(bgBuf)
    .composite([
      { input: resizedCutout, left, top },
      { input: overlayBuf },
    ])
    .jpeg({ quality: 93 })
    .toBuffer()
}

// ══════════════════════════════════════════════════════════════════
// 商品切り抜き型 専用 — 参照デザイン準拠
// レイアウト: 上部ヘッドライン / 左:商品エリア / 右:コンテンツカード
// ══════════════════════════════════════════════════════════════════

const MFONT = `'MPR', 'Hiragino Maru Gothic ProN', sans-serif`

// 共通ヘルパー: 左右分割レイアウトSVG（商品はSharpでコンポジット）
// 左列: x=0〜SPLIT_X (商品 + 商品名 + 価格)
// 右列: x=SPLIT_X+20〜W (白カード + タグ + 箇条書き)
function splitSvg(
  slide: SlideContent,
  productName: string,
  p: Palette,
  ff: string,
  slideNum: number,
): string {
  const SPLIT_X  = 440
  const HEAD_H   = 190
  const BOT_H    = 100
  const CARD_X   = SPLIT_X + 20
  const CARD_W   = W - CARD_X - 24
  const CARD_Y   = HEAD_H + 16
  const CARD_H   = H - HEAD_H - BOT_H - 32
  const TAG_H    = 56
  const bullets  = slide.bullets ?? []

  // ヘッドライン
  const { size: hSz, lines: hLns } = fitFont(slide.headline, W - 80, 2, 72, 36)
  const hLH = Math.round(hSz * 1.18)
  const headTopY = Math.round((HEAD_H - hLns.length * hLH) / 2) + Math.round(hSz * 0.82)

  // 箇条書き (右カード内)
  const bulletStartY = CARD_Y + TAG_H + 52
  const bulletAreaH  = CARD_Y + CARD_H - bulletStartY - 24
  const rowH = bullets.length > 0 ? Math.floor(bulletAreaH / bullets.length) : 120
  const bulletItems = bullets.map((b, i) => {
    const by = bulletStartY + i * rowH
    const { size: bs, lines: bl } = fitFont(b, CARD_W - 52, 2, 32, 20)
    const blH = Math.round(bs * 1.32)
    const ty  = by + rowH / 2 - ((bl.length - 1) * blH) / 2 + bs * 0.36
    return `
      <line x1="${CARD_X + 20}" y1="${by + rowH - 1}" x2="${CARD_X + CARD_W - 20}" y2="${by + rowH - 1}" stroke="${p.accent}" stroke-width="1" opacity="0.2"/>
      <text x="${CARD_X + 22}" y="${ty}" font-family="${MFONT}" font-size="20" font-weight="800" fill="${p.accent}">・</text>
      ${bl.map((l, li) => `<text x="${CARD_X + 44}" y="${ty + li * blH}" font-family="${MFONT}" font-size="${bs}" font-weight="800" fill="${p.dark}">${esc(l)}</text>`).join("")}`
  }).join("")

  // 左下: 商品名 + 価格
  const priceY = H - BOT_H - 18
  const nameY  = slide.price ? priceY - 38 : priceY - 10
  const { lines: nameLns } = fitFont(productName, SPLIT_X - 24, 2, 28, 18)

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <style>${ff}</style>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.08" y2="1">
      <stop offset="0%" stop-color="${p.bg}"/>
      <stop offset="100%" stop-color="${p.bg2}"/>
    </linearGradient>
    <filter id="cshadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="2" dy="4" stdDeviation="10" flood-color="rgba(0,0,0,0.10)"/>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- ヘッドラインエリア (上部) -->
  <line x1="24" y1="28" x2="${W - 24}" y2="28" stroke="${p.accent}" stroke-width="1.5" stroke-dasharray="10 7" opacity="0.45"/>
  ${hLns.map((l, i) => `<text x="${W / 2}" y="${headTopY + i * hLH}" text-anchor="middle" font-family="${MFONT}" font-size="${hSz}" font-weight="800" fill="${p.dark}">${esc(l)}</text>`).join("")}
  <line x1="24" y1="${HEAD_H - 8}" x2="${W - 24}" y2="${HEAD_H - 8}" stroke="${p.accent}" stroke-width="1.5" stroke-dasharray="10 7" opacity="0.45"/>

  <!-- 右: コンテンツカード -->
  <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="rgba(255,255,255,0.93)" filter="url(#cshadow)"/>

  <!-- カードタグピル -->
  <rect x="${CARD_X + 16}" y="${CARD_Y + 16}" width="${CARD_W - 32}" height="${TAG_H}" rx="${TAG_H / 2}" fill="${p.accent}"/>
  <text x="${CARD_X + CARD_W / 2}" y="${CARD_Y + 16 + TAG_H * 0.65}" text-anchor="middle" font-family="${MFONT}" font-size="24" font-weight="800" fill="white">${esc(slide.tag)}</text>

  <!-- 箇条書き -->
  ${bulletItems}

  <!-- アクセントテキスト(カード内下部) -->
  ${slide.accent ? `<text x="${CARD_X + CARD_W / 2}" y="${CARD_Y + CARD_H - 20}" text-anchor="middle" font-family="${MFONT}" font-size="22" font-weight="800" fill="${p.accentDark}" opacity="0.7">${esc(slide.accent)}</text>` : ""}

  <!-- 左下: 商品名 + 価格 -->
  ${nameLns.map((l, li) => `<text x="16" y="${nameY + li * 34}" font-family="${MFONT}" font-size="26" font-weight="800" fill="${p.dark}" opacity="0.75">${esc(l)}</text>`).join("")}
  ${slide.price ? `<text x="16" y="${priceY}" font-family="${MFONT}" font-size="32" font-weight="800" fill="${p.accentDark}">${esc(slide.price)}</text>` : ""}

  <!-- ボトムアクセント帯 -->
  <rect x="0" y="${H - BOT_H}" width="${W}" height="${BOT_H}" fill="${p.accentDark}"/>
  <text x="${W / 2}" y="${H - BOT_H / 2 + 12}" text-anchor="middle" font-family="${MFONT}" font-size="26" font-weight="800" fill="white">${esc(slide.accent ?? "")}</text>
  <text x="${W - 20}" y="${H - BOT_H + 24}" text-anchor="end" font-family="${MFONT}" font-size="19" fill="rgba(255,255,255,0.45)">${slideNum}/5</text>
</svg>`
}

// ── スライド5: ダーク CTA ────────────────────────────────────────
function tSlide5Svg(slide: SlideContent, p: Palette, ff: string): string {
  const bullets = slide.bullets ?? []
  const { size: hSize, lines: hLines } = fitFont(slide.headline, W - 60, 2, 96, 48)
  const hLineH = Math.round(hSize * 1.2)
  const TAG_H = 100
  const headStartY = TAG_H + 60
  const headEndY = headStartY + hLines.length * hLineH
  const cardH = 82
  const cardGap = 14
  const cardsStart = headEndY + 50

  const cards = bullets.map((b, i) => {
    const by = cardsStart + i * (cardH + cardGap)
    const { size: bs, lines: bl } = fitFont(b, W - 80, 2, 34, 20)
    const blH = Math.round(bs * 1.3)
    const ty = by + cardH / 2 - ((bl.length - 1) * blH) / 2 + bs * 0.36
    return `
      <rect x="0" y="${by}" width="${W}" height="${cardH}" fill="rgba(255,255,255,0.1)"/>
      <rect x="0" y="${by}" width="8" height="${cardH}" fill="${p.light}"/>
      ${bl.map((l, li) => `<text x="30" y="${ty + li * blH}" font-family="${MFONT}" font-size="${bs}" font-weight="800" fill="white">${esc(l)}</text>`).join("")}`
  }).join("")

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>${ff}</style>
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="${p.accentDark}"/>
        <stop offset="100%" stop-color="${p.dark}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="100" cy="100" r="130" fill="rgba(255,255,255,0.04)"/>
    <circle cx="${W - 80}" cy="${H - 200}" r="160" fill="rgba(255,255,255,0.04)"/>

    <!-- タグ帯 -->
    <rect x="0" y="0" width="${W}" height="${TAG_H}" fill="rgba(0,0,0,0.3)"/>
    <rect x="${W / 2 - 200}" y="22" width="400" height="56" rx="28" fill="${p.accent}" opacity="0.9"/>
    <text x="${W / 2}" y="58" text-anchor="middle" font-family="${MFONT}" font-size="28" font-weight="800" fill="white">${esc(slide.tag)}</text>

    <!-- ヘッドライン -->
    ${hLines.map((l, i) => `<text x="${W / 2}" y="${headStartY + i * hLineH}" text-anchor="middle" font-family="${MFONT}" font-size="${hSize}" font-weight="800" fill="white">${esc(l)}</text>`).join("")}

    <!-- カード -->
    ${cards}

    <!-- CTA帯 -->
    <rect x="0" y="${H - 110}" width="${W}" height="110" fill="${p.accent}"/>
    <text x="${W / 2 - 120}" y="${H - 42}" text-anchor="middle" font-family="${MFONT}" font-size="38" fill="rgba(255,255,255,0.5)">♡</text>
    <text x="${W / 2 + 120}" y="${H - 42}" text-anchor="middle" font-family="${MFONT}" font-size="38" fill="rgba(255,255,255,0.5)">♡</text>
    <text x="${W / 2}" y="${H - 38}" text-anchor="middle" font-family="${MFONT}" font-size="30" font-weight="800" fill="white">${esc(slide.accent ?? "保存して♡")}</text>
  </svg>`
}

// ── 商品切り抜き型 コンテンツスライド（2〜5）レンダリング ─────────
export async function renderTemplateContentSlide(
  slide: SlideContent,
  cutoutBuffer: Buffer,
  paletteKey: string,
  productName = "",
): Promise<Buffer> {
  const p = PALETTES[paletteKey] ?? PALETTES.pink
  const ff = getMplusFontFace()

  // スライド5: ダーク CTA — 商品画像コンポジット不要
  if (slide.slideNumber === 5) {
    const svgStr = tSlide5Svg(slide, p, ff)
    return sharp(Buffer.from(svgStr)).jpeg({ quality: 93 }).toBuffer()
  }

  // スライド2〜4: 左:商品 / 右:コンテンツカード の分割レイアウト
  const SPLIT_X = 440
  const HEAD_H  = 190
  const BOT_H   = 100
  const maxW    = SPLIT_X - 20
  const maxH    = H - HEAD_H - BOT_H - 20

  const resized = await sharp(cutoutBuffer)
    .resize(maxW, maxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
  const meta = await sharp(resized).metadata()
  const pW = meta.width ?? maxW
  const pH = meta.height ?? maxH

  const left = Math.round((SPLIT_X - pW) / 2)
  const top  = HEAD_H + Math.round(((H - HEAD_H - BOT_H) - pH) / 2)

  const svgStr = splitSvg(slide, productName, p, ff, slide.slideNumber)
  const bgBuf  = await sharp(Buffer.from(svgStr)).png().toBuffer()

  return sharp(bgBuf)
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 93 })
    .toBuffer()
}

// ── FAL スライド2 用: 商品名 + 価格オーバーレイ ───────────────────
// FAL が生成した画像バッファの上に Sharp でテキストを確実に描画する
export async function addSlide2Overlay(
  imageBuffer: Buffer,
  productName: string,
  price: string | undefined,
  paletteKey: string,
): Promise<Buffer> {
  const p   = PALETTES[paletteKey] ?? PALETTES.pink
  const ff  = getMplusFontFace()
  const BAND_H = price ? 130 : 90

  const { lines: nameLns } = fitFont(productName, W - 80, 2, 36, 24)
  const nameLineH = 42

  const bandY    = H - BAND_H
  const nameY    = bandY + 28 + 36
  const priceY   = nameY + nameLns.length * nameLineH + 4

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <style>${ff}</style>
  <!-- 半透明グラデーション帯 -->
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.72)" />
    </linearGradient>
  </defs>
  <rect x="0" y="${bandY - 60}" width="${W}" height="${BAND_H + 60}" fill="url(#band)"/>
  <!-- 商品名 -->
  ${nameLns.map((l, i) => `<text x="40" y="${nameY + i * nameLineH}" font-family="${MFONT}" font-size="36" font-weight="800" fill="white">${esc(l)}</text>`).join("")}
  <!-- 価格 -->
  ${price ? `
  <rect x="40" y="${priceY - 34}" width="240" height="48" rx="24" fill="${p.accent}"/>
  <text x="160" y="${priceY}" text-anchor="middle" font-family="${MFONT}" font-size="28" font-weight="800" fill="white">${esc(price)}</text>
  ` : ""}
</svg>`

  const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer()
  return sharp(imageBuffer)
    .composite([{ input: overlayBuf }])
    .jpeg({ quality: 93 })
    .toBuffer()
}
