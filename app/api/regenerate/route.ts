/**
 * 再生成 API
 * POST /api/regenerate
 * Body:
 *   { groupId }                          → 一括再生成（全4パターン × 5枚）
 *   { groupId, postId }                  → 1パターン再生成（5枚）
 *   { groupId, postId, slideIndex }      → 1枚再生成
 *
 * instruction フィールドで修正プロンプトを指定可能（任意）
 * styleDescription / refImageUrl は Post から自動で引き継がれる
 */
import { NextRequest, NextResponse } from "next/server"
import { generateUGCCover, generateContentSlide, generateEntertainmentSlide } from "@/lib/fal"
import { loadGroups, updateGroup } from "@/lib/storage"
import { createJob, updateJob, pruneOldJobs } from "@/lib/jobs"
import { put } from "@vercel/blob"
import type { Post, PostGroup } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { groupId, postId, slideIndex, instruction } = await req.json() as {
    groupId: string
    postId?: string
    slideIndex?: number
    instruction?: string
  }

  const groups = loadGroups()
  const group = groups.find(g => g.id === groupId)
  if (!group) return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 })
  if (!group.productImageUrl) return NextResponse.json({ error: "商品画像URLがありません" }, { status: 400 })

  pruneOldJobs()

  const postsToRegen = postId ? group.posts.filter(p => p.id === postId) : group.posts
  const slidesCount = slideIndex !== undefined ? postsToRegen.length : postsToRegen.length * 5
  const job = createJob()
  updateJob(job.id, { totalSlides: slidesCount, completedSlides: 0, startTime: Date.now() })

  processRegenJob(job.id, group, postsToRegen, slideIndex, instruction).catch(err => {
    updateJob(job.id, { status: "error", error: String(err) })
  })

  return NextResponse.json({ jobId: job.id })
}

async function processRegenJob(
  jobId: string,
  group: PostGroup,
  postsToRegen: Post[],
  slideIndex?: number,
  instruction?: string,
) {
  updateJob(jobId, { status: "generating", progress: "商品画像を取得中..." })

  // 商品画像を Blob URL から取得
  const productRes = await fetch(group.productImageUrl!)
  if (!productRes.ok) throw new Error("商品画像の取得に失敗しました")
  const productBuf = Buffer.from(await productRes.arrayBuffer())
  const productImageBase64 = productBuf.toString("base64")

  let completedSlides = 0

  const updatedPosts: Post[] = await Promise.all(
    group.posts.map(async post => {
      const shouldRegen = postsToRegen.some(p => p.id === post.id)
      if (!shouldRegen) return post

      const colorPalette = post.colorPalette ?? "pink"
      const newImages = [...post.images]

      if (slideIndex !== undefined) {
        // 1枚だけ再生成
        const buf = await regenSlide(post, slideIndex, colorPalette, productImageBase64, instruction)
        const blobUrl = await uploadRegenImage(buf, group.id, post.id, slideIndex)
        newImages[slideIndex] = blobUrl
        completedSlides++
        updateJob(jobId, { completedSlides, progress: `画像再生成中 ${completedSlides}枚完了...` })
      } else {
        // 5枚全部再生成
        const bufs = await Promise.all(
          post.slides.map(async (_, i) => {
            const buf = await regenSlide(post, i, colorPalette, productImageBase64, instruction)
            completedSlides++
            updateJob(jobId, { completedSlides, progress: `画像再生成中 ${completedSlides}枚完了...` })
            return buf
          })
        )
        for (let i = 0; i < bufs.length; i++) {
          newImages[i] = await uploadRegenImage(bufs[i], group.id, post.id, i)
        }
      }

      return { ...post, images: newImages }
    })
  )

  const updatedGroup: PostGroup = { ...group, posts: updatedPosts }
  await updateGroup(group.id, updatedGroup)

  updateJob(jobId, { status: "done", progress: "完了", group: updatedGroup })
}

async function regenSlide(
  post: Post,
  index: number,
  colorPalette: string,
  productImageBase64: string,
  instruction?: string,
): Promise<Buffer> {
  const slide = post.slides[index]
  if (!slide) throw new Error(`スライド ${index} が存在しません`)

  // 初回生成時のスタイル情報を引き継ぐ
  const styleDescription = post.styleDescription
  const refImageUrl      = post.refImageUrl

  if (post.patternName === "エンタメ導入型") {
    return generateEntertainmentSlide({
      productName:      post.overallTitle,
      slideNumber:      index + 1,
      headline:         slide.headline,
      tag:              slide.tag,
      bullets:          slide.bullets,
      accent:           slide.accent,
      price:            slide.price,
      hookTheme:        post.hookTheme,
      hookTitle:        post.hookTitle,
      colorPalette,
      productImageBase64,
      styleDescription,
      refImageUrl,
      instruction,
    })
  } else {
    if (index === 0) {
      return generateUGCCover({
        productName:      post.overallTitle,
        headline:         slide.headline,
        tag:              slide.tag,
        patternName:      post.patternName,
        colorPalette,
        productImageBase64,
        styleDescription,
        refImageUrl,
        instruction,
      })
    } else {
      return generateContentSlide({
        productName:      post.overallTitle,
        slideNumber:      index + 1,
        headline:         slide.headline,
        tag:              slide.tag,
        bullets:          slide.bullets,
        accent:           slide.accent,
        price:            slide.price,
        patternName:      post.patternName,
        colorPalette,
        productImageBase64,
        styleDescription,
        refImageUrl,
        instruction,
      })
    }
  }
}

async function uploadRegenImage(buf: Buffer, groupId: string, postId: string, index: number): Promise<string> {
  const filename = `cocochi/${groupId}/${postId}_${index}_regen_${Date.now()}.jpg`
  const blob = await put(filename, buf, { access: "public", contentType: "image/jpeg" })
  return blob.url
}
