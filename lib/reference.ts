/**
 * reference.ts — 参考画像選択・マッピングモジュール（v2）
 *
 * フロー:
 *   1. detectMood()         — 商品説明 → Claude でムード判定
 *   2. selectPostFolder()   — パターン × ムード → postフォルダをランダム選択
 *   3. mapSlidesToRefs()    — Claude Vision でpostフォルダ内画像をスライドにマッピング
 *   4. uploadRefMapping()   — マッピング画像を Vercel Blob にアップロードしてURL化
 */

import Anthropic from "@anthropic-ai/sdk"
import { put } from "@vercel/blob"
import fs from "fs"
import path from "path"

const REF_DIR = path.join(process.cwd(), "reference")

const PATTERN_DIR: Record<string, string> = {
  "手持ちUGC型":   "B_手持ちUGC型",
  "直置きUGC型":   "C_直置きUGC型",
  "記事投稿型":    "D_記事投稿型",
  "エンタメ導入型": "E_エンタメ導入型",
}

const MOODS = ["natural", "luxury", "pop", "cool", "mono"] as const
export type Mood = typeof MOODS[number]

interface MetaEntry {
  mood: string
  hookCategory?: string
  hookStructure?: string
  screenshotFile?: string
}
interface Metadata {
  posts: Record<string, MetaEntry>
}

// metadata.jsonはリクエストごとに読み直す（タグ追加に即対応）
function loadMetadata(): Metadata {
  try {
    const raw = fs.readFileSync(path.join(REF_DIR, "metadata.json"), "utf8")
    return JSON.parse(raw)
  } catch {
    return { posts: {} }
  }
}

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

// ─── 1. ムード判定 ────────────────────────────────────────────────

/** 商品説明からInstagramビジュアルのムードを推定 */
export async function detectMood(description: string): Promise<Mood> {
  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 32,
      messages: [{
        role: "user",
        content: `以下のコスメ商品説明を読んで、最も合うInstagramビジュアルのムードを1単語で答えてください。

商品説明: ${description}

選択肢（1つだけ回答）:
- natural（ナチュラル・ミニマル・オーガニック系）
- luxury（ラグジュアリー・高級・洗練系）
- pop（ポップ・明るい・カラフル・元気系）
- cool（クール・スタイリッシュ・都会的）

1単語のみ:`,
      }],
    })
    const block = res.content[0]
    const text  = block.type === "text" ? block.text.trim().toLowerCase() : ""
    return (MOODS.find(m => text.includes(m)) ?? "natural") as Mood
  } catch {
    return "natural"
  }
}

// ─── 2. postフォルダ選択 ──────────────────────────────────────────

/** パターン × ムードでpostフォルダキーをランダム選択（該当なければ任意） */
export function selectPostFolder(patternName: string, mood: Mood): string | null {
  const meta   = loadMetadata()
  const dirKey = PATTERN_DIR[patternName]
  if (!dirKey) return null

  const all = Object.entries(meta.posts).filter(([k]) => k.startsWith(dirKey))
  if (all.length === 0) return null

  const matched = all.filter(([, v]) => v.mood === mood)
  const pool    = matched.length > 0 ? matched : all
  return pool[Math.floor(Math.random() * pool.length)][0]
}

// ─── 3. スライド→参照画像マッピング ─────────────────────────────

export interface SlideInfo {
  slideNumber: number
  headline:   string
  tag:        string
  bullets?:   string[]
}

export interface ReferenceMapping {
  thumbnailPath: string             // slide 1 用（絶対パス）
  slideMap: Record<number, string>  // slideNumber → 絶対パス
}

/**
 * Claude Vision でpostフォルダ内の画像をスライドにマッピング
 * - slide 1 → 01_thumbnail.jpg（固定）
 * - slides 2〜5 → Claudeがコンテンツ内容を読んで最適な画像を選択
 */
export async function mapSlidesToRefs(
  postFolderKey: string,
  slides: SlideInfo[],
): Promise<ReferenceMapping> {
  const folderPath = path.join(REF_DIR, postFolderKey)
  const allFiles = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith("."))
    .sort()

  const thumbnailFile = allFiles.find(f => f.startsWith("01_thumbnail"))
  const contentFiles  = allFiles.filter(f => !f.startsWith("01_thumbnail"))
  const thumbnailPath = path.join(folderPath, thumbnailFile ?? allFiles[0])

  // コンテンツ画像がなければサムネで代替
  if (contentFiles.length === 0) {
    return {
      thumbnailPath,
      slideMap: Object.fromEntries(slides.map(s => [s.slideNumber, thumbnailPath])),
    }
  }

  // Claude Vision で一括マッピング
  const imageBlocks = contentFiles.map(file => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: fs.readFileSync(path.join(folderPath, file)).toString("base64"),
    },
  }))

  const slideDescs = slides
    .map(s =>
      `スライド${s.slideNumber}「${s.headline}」タグ:${s.tag}` +
      (s.bullets ? ` 内容:${s.bullets.join("/")}` : "")
    )
    .join("\n")

  const fileList   = contentFiles.map((f, i) => `画像${i + 1}:${f}`).join(", ")
  const exampleJson = `{${slides.map(s => `"${s.slideNumber}":"ファイル名"`).join(",")}}`

  const slideMap: Record<number, string> = {}

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `${contentFiles.length}枚の参考画像（${fileList}）と、以下のInstagramスライド内容を照合して、各スライドに最もビジュアルスタイルが合う画像ファイル名をJSONで返してください。画像のレイアウト・雰囲気・情報密度が近いものを選んでください。

${slideDescs}

JSONのみ回答（他のテキスト不要）:
${exampleJson}`,
          },
        ],
      }],
    })

    const block0 = res.content[0]
    const rawText = block0.type === "text" ? block0.text.trim() : "{}"
    // Claudeがmarkdownコードブロックで返してくることがあるので除去
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim()
    const parsed = JSON.parse(jsonText)
    for (const [k, v] of Object.entries(parsed)) {
      const filePath = path.join(folderPath, v as string)
      if (fs.existsSync(filePath)) slideMap[Number(k)] = filePath
    }
    console.log(`[reference] Claude Vision マッピング成功: ${postFolderKey}`, Object.entries(slideMap).map(([k,v]) => `${k}→${path.basename(v)}`).join(", "))
  } catch (e) {
    console.warn("[reference] Claude Vision マッピング失敗、順番割り当てにフォールバック", e)
  }

  // 未マッピングのスライドを順番割り当てで補完
  slides.forEach((s, i) => {
    if (!slideMap[s.slideNumber]) {
      slideMap[s.slideNumber] = path.join(folderPath, contentFiles[i % contentFiles.length])
    }
  })

  return { thumbnailPath, slideMap }
}

// ─── 4. Vercel Blob アップロード ─────────────────────────────────

// ─── 4. スタイル言語化 ───────────────────────────────────────────

/**
 * Claude Vision でpostフォルダのサムネ画像を分析し、
 * FALプロンプトに挿入するスタイル説明文を生成する
 */
async function describeRefStyle(thumbnailPath: string): Promise<string> {
  const imageData = fs.readFileSync(thumbnailPath).toString("base64")

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageData },
          },
          {
            type: "text",
            text: `これはInstagramのコスメ系UGC投稿画像です。
この画像のビジュアルスタイルを、画像生成AIへの英語プロンプトとして使える形で簡潔に説明してください。

含める要素:
- 色調・カラーパレット（例: warm beige and cream tones）
- 背景の質感・雰囲気（例: soft natural lighting, minimalist white background）
- 写真スタイル（例: close-up lifestyle photography, flat lay composition）
- テキストスタイル（例: bold Japanese typography with thin elegant fonts）
- 全体のムード（例: clean organic aesthetic, luxury editorial feel）

英語で50単語以内、カンマ区切りのフレーズのみ（説明文不要）:`,
          },
        ],
      }],
    })
    const block = res.content[0]
    return block.type === "text" ? block.text.trim() : ""
  } catch (e) {
    console.warn("[reference] スタイル言語化失敗:", e)
    return ""
  }
}

// ─── 5. Vercel Blob アップロード ─────────────────────────────────

export interface UploadedRefMapping {
  thumbnailUrl:     string
  slideUrlMap:      Record<number, string>  // slideNumber → URL
  styleDescription: string                  // FALプロンプトに挿入するスタイル説明
}

/** ReferenceMapping の画像を Vercel Blob にアップロードしてURL化 + スタイル言語化 */
export async function uploadRefMapping(
  mapping: ReferenceMapping,
): Promise<UploadedRefMapping> {
  const ts = Date.now()

  const thumbBuf = fs.readFileSync(mapping.thumbnailPath)

  // スタイル言語化とBlob uploadを並列実行
  const [{ url: thumbnailUrl }, styleDescription] = await Promise.all([
    put(
      `cocochi/ref/thumb_${ts}.jpg`,
      thumbBuf,
      { access: "public", contentType: "image/jpeg", addRandomSuffix: true },
    ),
    describeRefStyle(mapping.thumbnailPath),
  ])

  console.log(`[reference] style description: "${styleDescription}"`)

  const slideUrlMap: Record<number, string> = {}
  await Promise.all(
    Object.entries(mapping.slideMap).map(async ([slideNum, filePath]) => {
      const buf = fs.readFileSync(filePath)
      const { url } = await put(
        `cocochi/ref/s${slideNum}_${ts}.jpg`,
        buf,
        { access: "public", contentType: "image/jpeg", addRandomSuffix: true },
      )
      slideUrlMap[Number(slideNum)] = url
    })
  )

  return { thumbnailUrl, slideUrlMap, styleDescription }
}

// ─── 6. エンタメ導入型専用スタイル選択 ───────────────────────────

/**
 * エンタメ導入型専用: metadata.jsonのE_エントリからmoodに合うスクリーンショットを選び
 * スタイル説明 + BlobURLを返す
 */
export async function selectEntertainmentStyle(mood: Mood): Promise<UploadedRefMapping | null> {
  const meta    = loadMetadata()
  const dirKey  = "E_エンタメ導入型"
  const eDir    = path.join(REF_DIR, dirKey)

  const all = Object.entries(meta.posts).filter(([k]) => k.startsWith(dirKey))
  if (all.length === 0) return null

  const matched = all.filter(([, v]) => v.mood === mood)
  const pool    = matched.length > 0 ? matched : all
  const [key, entry] = pool[Math.floor(Math.random() * pool.length)]

  const screenshotFile = entry.screenshotFile ?? key.split("/")[1]
  const filePath = path.join(eDir, screenshotFile)
  if (!fs.existsSync(filePath)) return null

  console.log(`[reference] エンタメ導入型 style ref: ${screenshotFile} (${entry.hookCategory ?? "?"}/${entry.hookStructure ?? "?"})`)

  const buf = fs.readFileSync(filePath)
  const ts  = Date.now()

  const [{ url: thumbnailUrl }, styleDescription] = await Promise.all([
    put(`cocochi/ref/e_thumb_${ts}.jpg`, buf, { access: "public", contentType: "image/jpeg", addRandomSuffix: true }),
    describeRefStyle(filePath),
  ])

  return {
    thumbnailUrl,
    slideUrlMap: {},   // エンタメ導入型は個別スライドマッピング不使用
    styleDescription,
  }
}

// ─── 7. キャプション読み込み ──────────────────────────────────────

/**
 * postフォルダ内の caption.txt を読み込んで返す
 * ファイルが存在しない場合は null を返す
 */
export function readCaption(postFolderKey: string): string | null {
  const captionPath = path.join(REF_DIR, postFolderKey, "caption.txt")
  try {
    if (fs.existsSync(captionPath)) {
      return fs.readFileSync(captionPath, "utf8").trim()
    }
  } catch { /* ignore */ }
  return null
}
