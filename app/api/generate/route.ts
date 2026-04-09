import { NextRequest, NextResponse } from "next/server"
import { generateArticle, qcScore } from "@/lib/claude"
import { generateUGCCover, generateContentSlide } from "@/lib/fal"
import { renderTemplateCover, renderTemplateContentSlide } from "@/lib/slides"
import { detectMood, selectPostFolder, mapSlidesToRefs, uploadRefMapping } from "@/lib/reference"
import type { UploadedRefMapping } from "@/lib/reference"
import { saveGroup } from "@/lib/storage"
import { createJob, updateJob, pruneOldJobs } from "@/lib/jobs"
import type { ProductInput, Post, PostGroup, CostSummary } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── 料金定数 ────────────────────────────────────────────────────────
const FAL_PER_IMAGE_USD    = 0.0398
const CLAUDE_INPUT_PER_TOK = 3 / 1_000_000    // $3 / 1M tokens
const CLAUDE_OUT_PER_TOK   = 15 / 1_000_000   // $15 / 1M tokens
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

// ─── エンドポイント ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as ProductInput
  const { productName, efficacy, howToUse, productImageBase64 } = body

  if (!productName || !efficacy || !howToUse || !productImageBase64) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  pruneOldJobs()

  const job = createJob()
  processJob(job.id, body).catch(err => {
    updateJob(job.id, { status: "error", error: String(err) })
  })

  return NextResponse.json({ jobId: job.id })
}

// ─── バックグラウンド処理 ──────────────────────────────────────────

async function processJob(jobId: string, body: ProductInput) {
  const { productName, efficacy, howToUse, price, target, productImageBase64, productImageMime } = body
  const PATTERN_NAMES  = ["商品切り抜き型", "手持ちUGC型", "直置きUGC型", "記事投稿型"]
  const ARTICLE_INDICES = [0, 1, 1, 2]

  updateJob(jobId, { status: "generating", progress: "Claudeがコンテンツを考えています..." })

  // 1. Claude でテキスト生成（token追跡）
  const articleResult = await generateArticle({
    productName, efficacy, howToUse, price, target,
    productImageBase64, productImageMime,
  })
  const { content } = articleResult
  let claudeInputTokens  = articleResult.inputTokens
  let claudeOutputTokens = articleResult.outputTokens

  // 2. 商品切り抜き型用バッファ（remove.bg はスキップ、元画像をそのまま使用）
  const cutoutBuffer = Buffer.from(productImageBase64, "base64")
  const removeBgUsed = false

  // 3. ムード判定 + 参照画像マッピング（UGC 3パターン分を並列処理）
  updateJob(jobId, { progress: "参考スタイルを解析中..." })

  const UGC_PATTERNS = ["手持ちUGC型", "直置きUGC型", "記事投稿型"] as const
  const mood = await detectMood(`${efficacy} ${howToUse}`)
  console.log(`[route] detected mood: ${mood}`)

  // 各UGCパターンの参照マッピングを並列で取得
  const refMappings: Record<string, UploadedRefMapping> = {}
  await Promise.all(
    UGC_PATTERNS.map(async patternName => {
      const articleIdx = ARTICLE_INDICES[PATTERN_NAMES.indexOf(patternName)]
      const article    = content.articles[articleIdx]
      const postKey    = selectPostFolder(patternName, mood)
      if (!postKey) return

      const slides = article.slides.slice(1).map((s, j) => ({
        slideNumber: j + 2,
        headline:    s.headline,
        tag:         s.tag,
        bullets:     s.bullets,
      }))

      try {
        const mapping = await mapSlidesToRefs(postKey, slides)
        refMappings[patternName] = await uploadRefMapping(mapping)
        console.log(`[route] ref uploaded for ${patternName}: ${postKey}`)
      } catch (e) {
        console.warn(`[route] 参照マッピング失敗 ${patternName}:`, e)
      }
    })
  )

  // 4. 4パターン × スライド並列生成
  updateJob(jobId, { progress: "画像を生成中（2〜4分かかります）..." })

  let completedSlides = 0
  const totalSlides   = 20

  // FAL使用枚数カウント（商品切り抜き型はSVGなので0）
  // 3パターン（手持ちUGC・直置きUGC・記事投稿）× 5枚 = 15枚
  const falImages = 15

  const postResults = await Promise.all(
    PATTERN_NAMES.map(async (patternName, i) => {
      const article = content.articles[ARTICLE_INDICES[i]]
      const ref     = refMappings[patternName]  // UGC以外はundefined

      let coverImageStr = ""
      let contentBuffers: Buffer[]

      if (patternName === "商品切り抜き型") {
        const coverBuf = await renderTemplateCover(article.slides[0], cutoutBuffer, article.colorPalette)
        completedSlides++
        updateJob(jobId, { completedSlides, progress: `画像生成中 ${completedSlides}/${totalSlides}枚...` })
        coverImageStr = `data:image/jpeg;base64,${coverBuf.toString("base64")}`

        contentBuffers = await Promise.all(
          article.slides.slice(1).map(async slide => {
            const buf = await renderTemplateContentSlide(slide, cutoutBuffer, article.colorPalette, productName)
            completedSlides++
            updateJob(jobId, { completedSlides, progress: `画像生成中 ${completedSlides}/${totalSlides}枚...` })
            return buf
          })
        )
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

      // QC（token追跡）
      let qc = { score: 0, comment: "", inputTokens: 0, outputTokens: 0 }
      if (coverImageStr) {
        try {
          qc = await qcScore(coverImageStr.replace(/^data:image\/\w+;base64,/, ""))
        } catch { /* QC失敗は無視 */ }
      }

      return {
        post: {
          id: crypto.randomUUID(),
          angle: article.angle,
          patternName,
          overallTitle: article.overallTitle,
          slides: article.slides,
          colorPalette: article.colorPalette,
          images: [
            coverImageStr,
            ...contentBuffers.map(buf => `data:image/jpeg;base64,${buf.toString("base64")}`),
          ],
          qcScore: qc.score,
          qcComment: qc.comment,
        } satisfies Post,
        qcInputTokens:  qc.inputTokens,
        qcOutputTokens: qc.outputTokens,
      }
    })
  )

  // QC token を合算
  for (const r of postResults) {
    claudeInputTokens  += r.qcInputTokens
    claudeOutputTokens += r.qcOutputTokens
  }
  const posts = postResults.map(r => r.post)

  // 4. コスト計算
  const costSummary = calcCost({ falImages, claudeInputTokens, claudeOutputTokens, removeBgUsed })

  // 5. 保存
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
}
