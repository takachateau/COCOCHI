/**
 * reference/ フォルダ全体を対象に、colorPalette / angle でマッチングして参照画像を返す。
 *
 * - metadata.json のタグとスコアリングで最適な画像を選択
 * - マッチするものがなければ全画像からランダム
 * - .mp4 などの動画ファイルは除外
 */

import fs from "fs"
import path from "path"

// ─── メタデータ型 ────────────────────────────────────────────────

interface ImageMeta {
  color: string[]
  mood:  string[]
  angle: string[]
}

interface Metadata {
  images: Record<string, ImageMeta>
  _colorPaletteMap: Record<string, string[]>
  _angleMap:        Record<string, string[]>
}

// ─── メタデータ読み込み（起動時に1回だけ） ────────────────────────

let _meta: Metadata | null = null

function loadMeta(): Metadata {
  if (_meta) return _meta
  try {
    const metaPath = path.join(process.cwd(), "reference", "metadata.json")
    _meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as Metadata
  } catch {
    _meta = { images: {}, _colorPaletteMap: {}, _angleMap: {} }
  }
  return _meta
}

// ─── reference/ 以下の全画像パスを収集 ────────────────────────────

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i

function collectAllImages(baseDir: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else if (IMAGE_EXT.test(entry)) {
        results.push(full)
      }
    }
  }
  walk(baseDir)
  return results
}

// ─── スコアリング ────────────────────────────────────────────────

/**
 * colorPalette / angle から検索キーワードリストを生成
 */
function buildSearchKeywords(colorPalette: string, angle: string): string[] {
  const meta = loadMeta()
  const colorKeys  = meta._colorPaletteMap[colorPalette] ?? [colorPalette]
  const angleKeys  = meta._angleMap[angle]               ?? [angle]
  return [...new Set([...colorKeys, ...angleKeys])]
}

/**
 * 画像パスとメタデータのタグをキーワードリストで採点
 * relPath: "B_手持ちUGC型/post1/1サムネ.jpg" 形式
 */
function scoreImage(relPath: string, keywords: string[]): number {
  const meta   = loadMeta()
  const imgMeta = meta.images[relPath]
  if (!imgMeta) return 0

  const allTags = [...imgMeta.color, ...imgMeta.mood, ...imgMeta.angle]
  return keywords.filter(k => allTags.includes(k)).length
}

// ─── 公開 API ─────────────────────────────────────────────────────

export interface PickReferenceOptions {
  colorPalette: string   // "pink" | "blue" | ...
  angle:        string   // "感情体験" | "成分・効果" | "ライフスタイル"
}

/**
 * reference/ 全画像から colorPalette / angle に最もマッチする1枚を返す。
 * マッチがなければランダム。
 */
export function pickReferenceImage(opts: PickReferenceOptions): Buffer | null {
  const refDir  = path.join(process.cwd(), "reference")
  const allPaths = collectAllImages(refDir)
  if (!allPaths.length) return null

  const keywords = buildSearchKeywords(opts.colorPalette, opts.angle)

  // relPath（"A_.../post1/1サムネ.jpg"）でスコアリング
  const scored = allPaths.map(fullPath => {
    const relPath = path.relative(refDir, fullPath).replace(/\\/g, "/")
    return { fullPath, score: scoreImage(relPath, keywords) }
  })

  // スコア最大のものをまとめ、同点はランダムに1つ選ぶ
  const maxScore = Math.max(...scored.map(s => s.score))
  const candidates = maxScore > 0
    ? scored.filter(s => s.score === maxScore)
    : scored  // スコア0でも全画像からランダム

  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  console.log(`[reference] picked: ${path.relative(refDir, picked.fullPath)} (score=${picked.score}, keywords=${keywords.join(",")})`)

  try {
    return fs.readFileSync(picked.fullPath)
  } catch {
    return null
  }
}
