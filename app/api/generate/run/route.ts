/**
 * /api/generate/run
 * after() から fetch で呼ばれる独立したサーバーレス関数。
 * processJob を直接 await して、Vercel の 300 秒タイムアウト内で画像生成を完走させる。
 */
import { NextRequest, NextResponse } from "next/server"
import { generateArticle, qcScore, generateCaption } from "@/lib/claude"
import { generateUGCCover, generateContentSlide, generateEntertainmentSlide } from "@/lib/fal"
import { detectMood, selectPostFolder, mapSlidesToRefs, uploadRefMapping, selectEntertainmentStyle, readCaption } from "@/lib/reference"
import type { UploadedRefMapping } from "@/lib/reference"
import { saveGroup } from "@/lib/storage"
import { updateJob } from "@/lib/jobs"
import type { ProductInput, Post, PostGroup, CostSummary } from "@/types"
import { PATTERN_NAMES, PATTERN_ANGLE_POOLS } from "../route"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── 料金定数 ────────────────────────────────────────────────────────
const FAL_PER_IMAGE_USD    = 0.0398
const CLAUDE_INPUT_PER_TOK = 3 / 1_000_000
const CLAUDE_OUT_PER_TOK   = 15 / 1_000_000
const REMOVEBG_JPY         = 100
const USD_TO_JPY           = 150
const USD_TO_CNY           = 7.2

function calcCost(params: {
  falImages: number
  claudeInputTokens: number
  claudeOutputTokens: number
  removeBgUsed: boolean
}): CostSummary {
  const { falImages, claudeInputTokens, claudeOutputTokens, removeBgUsed } = params
  const falUsd      = falImages * FAL_PER_IMAGE_USD
  const claudeUsd   = claudeInputTokens * CLAUDE_INPUT_PER_TOK + claudeOutputTokens * CLAUDE_OUT_PER_TOK
  const removeBgJpy = removeBgUsed ? REMOVEBG_JPY : 0
  const totalUsd    = falUsd + claudeUsd + removeBgJpy / USD_TO_JPY
  return {
    falImages,
    falUsd:              Math.round(falUsd * 10000) / 10000,
    claudeInputTokens,
    claudeOutputTokens,
    claudeUsd:           Math.round(claudeUsd * 10000) / 10000,
    removeBgJpy,
    totalUsd:            Math.round(totalUsd * 10000) / 10000,
    totalJpy:            Math.round(totalUsd * USD_TO_JPY),
    totalCny:            Math.round(totalUsd * USD_TO_CNY * 10) / 10,
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const HOOK_THEMES = [
  "恋愛・感情体験", "ダイエット・ボディ変化", "恋愛・炎上議論", "メイク・美容ハウツー",
  "肌トラブル・悩み解決", "節約・お金", "ファッション・コーデ", "モテ・自己磨き",
  "ライフスタイル改善", "暮らし・生活Tips", "ストレス・メンタル", "自己啓発・価値観",
] as const

export async function POST(req: NextRequest) {
  const { jobId, body } = await req.json() as { jobId: string; body: ProductInput }

  // 即座に 200 を返す（呼び出し元の after() が完了を待つ必要はない）
  // ただし Vercel はレスポンス後もこの関数を生かし続けるため、processJob を await する
  const responsePromise = processJob(jobId, body)

  // レスポンスを先に返して接続を切る
  const res = NextResponse.json({ ok: true })

  // processJob は引き続き実行される（このサーバーレス関数のライフタイムとして）
  await responsePromise

  return res
}

async function processJob(jobId: string, body: ProductInput) {
  const { productName, ingredients, howToUse, price, appealPoints, forbiddenWords, pdfText, target, appealAngles, productImageBase64, productImageMime } = body

  try {
    updateJob(jobId, { status: "generating", progress: "Claudeがコンテンツを考えています...", startTime: Date.now() })

    const patternAngles = PATTERN_NAMES.map((pattern, i) => {
      const userAngle = appealAngles?.[i]?.trim()
      return userAngle || pickRandom(PATTERN_ANGLE_POOLS[pattern])
    })
    console.log(`[run] patternAngles: ${patternAngles.join(" / ")}`)

    const hookTheme = pickRandom([...HOOK_THEMES])
    console.log(`[run] hookTheme: ${hookTheme}`)

    // 1. Claude でテキスト生成
    const articleResult = await generateArticle({
      productName, ingredients, howToUse, price,
      appealPoints, forbiddenWords, pdfText,
      target, patternAngles,
      hookTheme,
      productImageBase64, productImageMime,
    })
    const { content } = articleResult
    let claudeInputTokens  = articleResult.inputTokens
    let claudeOutputTokens = articleResult.outputTokens

    const ARTICLE_INDICES = PATTERN_NAMES.map((_, i) => i)

    // 2. ムード判定
    updateJob(jobId, { progress: "参考スタイルを解析中..." })
    const removeBgUsed = false

    const mood = await detectMood(`${ingredients} ${howToUse}`)
    console.log(`[run] detected mood: ${mood}`)

    // 3. 参照画像マッピングを並列で取得
    const refMappings: Record<string, UploadedRefMapping> = {}
    const postKeyMap:  Record<string, string> = {}

    const UGC_PATTERNS = ["手持ちUGC型", "直置きUGC型", "記事投稿型"] as const

    await Promise.all([
      (async () => {
        try {
          const ref = await selectEntertainmentStyle(mood)
          if (ref) refMappings["エンタメ導入型"] = ref
        } catch (e) {
          console.warn("[run] エンタメ導入型 style 失敗:", e)
        }
      })(),
      ...UGC_PATTERNS.map(async patternName => {
        const articleIdx = ARTICLE_INDICES[PATTERN_NAMES.indexOf(patternName)]
        const article    = content.articles[articleIdx]
        const postKey    = selectPostFolder(patternName, mood)
        if (!postKey) return
        postKeyMap[patternName] = postKey

        const slides = article.slides.slice(1).map((s, j) => ({
          slideNumber: j + 2,
          headline:    s.headline,
          tag:         s.tag,
          bullets:     s.bullets,
        }))

        try {
          const mapping = await mapSlidesToRefs(postKey, slides)
          refMappings[patternName] = await uploadRefMapping(mapping)
          console.log(`[run] ref uploaded for ${patternName}: ${postKey}`)
        } catch (e) {
          console.warn(`[run] 参照マッピング失敗 ${patternName}:`, e)
        }
      }),
    ])

    // キャプション参照
    const captionRefMap: Record<string, string | undefined> = {}
    for (const [patternName, postKey] of Object.entries(postKeyMap)) {
      const cap = readCaption(postKey)
      if (cap) captionRefMap[patternName] = cap
    }

    // 4. 4パターン × スライド並列生成
    updateJob(jobId, { progress: "画像を生成中（2〜4分かかります）..." })

    let completedSlides = 0
    const totalSlides   = 20
    const falImages     = 15

    const postResults = await Promise.all(
      PATTERN_NAMES.map(async (patternName, i) => {
        const article = content.articles[ARTICLE_INDICES[i]]
        const ref     = refMappings[patternName]

        let coverImageStr = ""
        let contentBuffers: Buffer[]

        try {
          if (patternName === "エンタメ導入型") {
            const allSlides = await Promise.all(
              article.slides.map(async (slide, i) => {
                const slideNumber = i + 1
                const buf = await generateEntertainmentSlide({
                  productName,
                  slideNumber,
                  headline:         slide.headline,
                  tag:              slide.tag,
                  bullets:          slide.bullets,
                  accent:           slide.accent,
                  price:            slide.price,
                  hookTheme:        article.hookTheme,
                  hookTitle:        article.hookTitle,
                  colorPalette:     article.colorPalette,
                  productImageBase64,
                  styleDescription: ref?.styleDescription,
                  refImageUrl:      ref?.thumbnailUrl,
                })
                completedSlides++
                updateJob(jobId, { completedSlides, progress: `画像生成中 ${completedSlides}/${totalSlides}枚...` })
                return buf
              })
            )
            coverImageStr  = `data:image/jpeg;base64,${allSlides[0].toString("base64")}`
            contentBuffers = allSlides.slice(1)
          } else {
            const coverBuffer = await generateUGCCover({
              productName,
              headline:         article.slides[0].headline,
              tag:              article.slides[0].tag,
              patternName,
              colorPalette:     article.colorPalette,
              productImageBase64,
              refImageUrl:      ref?.thumbnailUrl,
              styleDescription: ref?.styleDescription,
            })
            completedSlides++
            updateJob(jobId, { completedSlides, progress: `画像生成中 ${completedSlides}/${totalSlides}枚...` })
            coverImageStr = `data:image/jpeg;base64,${coverBuffer.toString("base64")}`

            contentBuffers = await Promise.all(
              article.slides.slice(1).map(async (slide, j) => {
                const slideNumber = j + 2
                const buf = await generateContentSlide({
                  productName,
                  slideNumber,
                  headline:         slide.headline,
                  tag:              slide.tag,
                  bullets:          slide.bullets,
                  accent:           slide.accent,
                  price:            slide.price,
                  patternName,
                  colorPalette:     article.colorPalette,
                  productImageBase64,
                  refImageUrl:      ref?.slideUrlMap[slideNumber],
                  styleDescription: ref?.styleDescription,
                })
                completedSlides++
                updateJob(jobId, { completedSlides, progress: `画像生成中 ${completedSlides}/${totalSlides}枚...` })
                return buf
              })
            )
          }
        } catch (err) {
          console.error(`[run] パターン生成失敗（スキップ）${patternName}:`, err)
          return null
        }

        const [qc, captionResult] = await Promise.all([
          (async () => {
            if (!coverImageStr) return { score: 0, comment: "", inputTokens: 0, outputTokens: 0 }
            try {
              return await qcScore(coverImageStr.replace(/^data:image\/\w+;base64,/, ""))
            } catch {
              return { score: 0, comment: "", inputTokens: 0, outputTokens: 0 }
            }
          })(),
          (async () => {
            try {
              return await generateCaption({
                productName,
                angle: article.angle,
                slides: article.slides,
                referenceCaption: captionRefMap[patternName],
              })
            } catch {
              return { caption: "", inputTokens: 0, outputTokens: 0 }
            }
          })(),
        ])

        return {
          post: {
            id: crypto.randomUUID(),
            angle: article.angle,
            patternName,
            overallTitle: article.overallTitle,
            slides: article.slides,
            colorPalette:     article.colorPalette,
            styleDescription: ref?.styleDescription,
            refImageUrl:      ref?.thumbnailUrl,
            hookTheme:        article.hookTheme,
            hookTitle:        article.hookTitle,
            hookStructure:    article.hookStructure,
            images: [
              coverImageStr,
              ...contentBuffers.map(buf => `data:image/jpeg;base64,${buf.toString("base64")}`),
            ],
            qcScore:   qc.score,
            qcComment: qc.comment,
            caption:   captionResult.caption || undefined,
          } satisfies Post,
          qcInputTokens:       qc.inputTokens,
          qcOutputTokens:      qc.outputTokens,
          captionInputTokens:  captionResult.inputTokens,
          captionOutputTokens: captionResult.outputTokens,
        }
      })
    )

    const validResults = postResults.filter((r): r is NonNullable<typeof r> => r !== null)
    for (const r of validResults) {
      claudeInputTokens  += r.qcInputTokens + r.captionInputTokens
      claudeOutputTokens += r.qcOutputTokens + r.captionOutputTokens
    }
    const posts = validResults.map(r => r.post)

    if (posts.length === 0) {
      throw new Error("すべてのパターンの生成に失敗しました")
    }

    const costSummary = calcCost({ falImages, claudeInputTokens, claudeOutputTokens, removeBgUsed })

    updateJob(jobId, { progress: "保存中..." })
    const group: PostGroup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      productName,
      productImageBase64,
      productImageMime,
      posts,
      costSummary,
    }
    const savedGroup = await saveGroup(group)

    updateJob(jobId, { status: "done", progress: "完了", group: savedGroup })
  } catch (err) {
    console.error("[run] processJob失敗:", err)
    updateJob(jobId, { status: "error", error: String(err) })
  }
}
