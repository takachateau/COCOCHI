/**
 * /api/regenerate/run
 * クライアントから fire-and-forget で呼ばれる長時間実行エンドポイント。
 * processRegenJob を直接 await することでサーバーレス関数のライフタイム中に処理を完走させる。
 */
import { NextRequest, NextResponse } from "next/server"
import { generateUGCCover, generateContentSlide, generateEntertainmentSlide } from "@/lib/fal"
import { loadGroups, updateGroup } from "@/lib/storage"
import { getJob, writeJob } from "@/lib/jobs"
import { put } from "@vercel/blob"
import type { Post, PostGroup } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { jobId, body } = await req.json() as {
    jobId: string
    body: { groupId: string; postId?: string; slideIndex?: number; instruction?: string }
  }
  await processRegenJob(jobId, body)
  return NextResponse.json({ ok: true })
}

async function processRegenJob(
  jobId: string,
  { groupId, postId, slideIndex, instruction }: { groupId: string; postId?: string; slideIndex?: number; instruction?: string },
) {
  const job = await getJob(jobId)
  if (!job) { console.error(`[regen/run] job ${jobId} not found`); return }

  async function updateStatus(patch: Partial<typeof job>) {
    await writeJob({ ...job!, ...patch })
  }
  function updateProgress(patch: Partial<typeof job>) {
    writeJob({ ...job!, ...patch })
  }

  try {
    await updateStatus({ status: "generating", progress: "商品画像を取得中..." })

    const groups = await loadGroups()
    const group = groups.find(g => g.id === groupId)
    if (!group || !group.productImageUrl) throw new Error("グループまたは商品画像が見つかりません")

    const productRes = await fetch(group.productImageUrl)
    if (!productRes.ok) throw new Error("商品画像の取得に失敗しました")
    const productImageBase64 = Buffer.from(await productRes.arrayBuffer()).toString("base64")

    const postsToRegen = postId ? group.posts.filter(p => p.id === postId) : group.posts
    let completedSlides = 0

    const updatedPosts: Post[] = await Promise.all(
      group.posts.map(async post => {
        if (!postsToRegen.some(p => p.id === post.id)) return post

        const colorPalette = post.colorPalette ?? "pink"
        const newImages = [...post.images]

        if (slideIndex !== undefined) {
          const buf = await regenSlide(post, slideIndex, colorPalette, productImageBase64, instruction)
          newImages[slideIndex] = await uploadRegenImage(buf, group.id, post.id, slideIndex)
          completedSlides++
          updateProgress({ completedSlides, progress: `画像再生成中 ${completedSlides}枚完了...` })
        } else {
          const bufs = await Promise.all(
            post.slides.map(async (_, i) => {
              const buf = await regenSlide(post, i, colorPalette, productImageBase64, instruction)
              completedSlides++
              updateProgress({ completedSlides, progress: `画像再生成中 ${completedSlides}枚完了...` })
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
    await updateStatus({ status: "done", progress: "完了", groupId: updatedGroup.id })
  } catch (err) {
    console.error("[regen/run] 失敗:", err)
    await updateStatus({ status: "error", error: String(err) })
  }
}

async function regenSlide(
  post: Post, index: number, colorPalette: string,
  productImageBase64: string, instruction?: string,
): Promise<Buffer> {
  const slide = post.slides[index]
  if (!slide) throw new Error(`スライド ${index} が存在しません`)

  const styleDescription = post.styleDescription
  const refImageUrl      = post.refImageUrl

  if (post.patternName === "エンタメ導入型") {
    return generateEntertainmentSlide({
      productName: post.overallTitle, slideNumber: index + 1,
      headline: slide.headline, tag: slide.tag, bullets: slide.bullets,
      accent: slide.accent, price: slide.price,
      hookTheme: post.hookTheme, hookTitle: post.hookTitle,
      colorPalette, productImageBase64, styleDescription, refImageUrl, instruction,
    })
  }
  if (index === 0) {
    return generateUGCCover({
      productName: post.overallTitle, headline: slide.headline, tag: slide.tag,
      patternName: post.patternName, colorPalette, productImageBase64,
      styleDescription, refImageUrl, instruction,
    })
  }
  return generateContentSlide({
    productName: post.overallTitle, slideNumber: index + 1,
    headline: slide.headline, tag: slide.tag, bullets: slide.bullets,
    accent: slide.accent, price: slide.price,
    patternName: post.patternName, colorPalette, productImageBase64,
    styleDescription, refImageUrl, instruction,
  })
}

async function uploadRegenImage(buf: Buffer, groupId: string, postId: string, index: number): Promise<string> {
  const { url } = await put(
    `cocochi/${groupId}/${postId}_${index}_regen_${Date.now()}.jpg`,
    buf,
    { access: "public", contentType: "image/jpeg" },
  )
  return url
}
