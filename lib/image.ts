import sharp from "sharp"

const OUTPUT_WIDTH = 1080
const OUTPUT_HEIGHT = 1350  // 4:5 (Instagram推奨)

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * UGC背景画像 + 商品画像合成 + タイトルテキストオーバーレイ
 */
export async function compositeUGCImage(params: {
  backgroundBuffer: Buffer   // KIEが生成した背景画像
  productBuffer: Buffer      // ユーザーがアップロードした商品画像
  title: string
}): Promise<Buffer> {
  const { backgroundBuffer, productBuffer, title } = params

  // 1. 背景画像を OUTPUT サイズにリサイズ
  const bg = await sharp(backgroundBuffer)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer()

  // 2. 商品画像をリサイズ（幅の約45%、縦横比維持）
  const productSize = Math.round(OUTPUT_WIDTH * 0.45)
  const productResized = await sharp(productBuffer)
    .resize(productSize, productSize, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer()

  // リサイズ後の実際のサイズを取得
  const productMeta = await sharp(productResized).metadata()
  const pW = productMeta.width ?? productSize
  const pH = productMeta.height ?? productSize

  // 商品を右下寄りに配置（中央やや下）
  const productLeft = Math.round((OUTPUT_WIDTH - pW) * 0.55)
  const productTop  = Math.round((OUTPUT_HEIGHT - pH) * 0.45)

  // 3. 商品画像の下にドロップシャドウ（ぼかした黒楕円）
  const shadowW = Math.round(pW * 0.85)
  const shadowH = Math.round(pH * 0.12)
  const shadowSvg = `<svg width="${shadowW}" height="${shadowH}">
    <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2}" ry="${shadowH / 2}"
      fill="rgba(0,0,0,0.35)"/>
  </svg>`

  const shadowBuffer = await sharp(Buffer.from(shadowSvg))
    .blur(10)
    .png()
    .toBuffer()

  const shadowLeft = productLeft + Math.round((pW - shadowW) / 2)
  const shadowTop  = productTop  + pH - Math.round(shadowH / 2)

  // 4. テキストオーバーレイ SVG
  // タイトルを折り返し（20文字で折り返し）
  const maxChars = 20
  const lines: string[] = []
  let remaining = title
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, maxChars))
    remaining = remaining.slice(maxChars)
  }

  const lineHeight = 62
  const fontSize = 48
  const textBlockH = lines.length * lineHeight + 40
  const textTop = OUTPUT_HEIGHT - textBlockH - 20

  const textLines = lines.map((line, i) => `
    <text
      x="${OUTPUT_WIDTH / 2}"
      y="${textTop + 36 + i * lineHeight}"
      text-anchor="middle"
      font-family="Hiragino Sans, Noto Sans JP, Yu Gothic, sans-serif"
      font-weight="700"
      font-size="${fontSize}px"
      fill="white"
      stroke="rgba(0,0,0,0.9)"
      stroke-width="4"
      paint-order="stroke fill"
    >${escapeXml(line)}</text>
  `).join("")

  const overlaySvg = `<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${textTop - 10}" width="${OUTPUT_WIDTH}" height="${textBlockH + 20}"
      fill="rgba(0,0,0,0.40)" rx="0"/>
    ${textLines}
  </svg>`

  const overlayBuffer = await sharp(Buffer.from(overlaySvg)).png().toBuffer()

  // 5. 合成: 背景 → シャドウ → 商品 → テキスト
  const result = await sharp(bg)
    .composite([
      { input: shadowBuffer, left: shadowLeft, top: shadowTop, blend: "multiply" },
      { input: productResized, left: productLeft, top: productTop },
      { input: overlayBuffer, left: 0, top: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer()

  return result
}
