/**
 * POST /api/v4/jobs/[id]/process
 * ジョブを実際に処理する（テキスト生成 → 画像生成）。
 * enqueue から fire-and-forget で呼ばれる。maxDuration=300 で最大5分動き続ける。
 * 各ステップで Supabase の status を更新するのでクライアントはポーリングで進捗を把握できる。
 */
import { NextRequest, NextResponse } from "next/server"
import {
  dbLoadPersonas, dbLoadBenchmarkPosts, dbLoadCompetitorProducts,
  dbLoadRecentPostsByPersona, dbLoadJob, dbUpdateJob, dbUpdateBenchmarkSlideStyleDescs,
  dbLoadHiddenAccountNames, dbSaveGeneratedPost, dbUpdateGeneratedPostImages,
} from "@/lib/supabase"
import { loadProducts } from "@/lib/products"
import { selectTypeCombination, generateV3Post, isDuplicatePost } from "@/lib/v3Generate"
import { describeV3SlideStyle } from "@/lib/referenceV2"
import { generateV2Slide, generateBaseSlide } from "@/lib/fal"
import { uploadSlideBuffers } from "@/lib/storage"
import { calcFalCost, formatCost } from "@/lib/aiCost"
import type { PostType, CompositionType, HookType, StructureType, GeneratedSlide, CompetitorProduct } from "@/types/v2"
import type { Product } from "@/types"

export const maxDuration = 300

// 構図型ヒント（generate-image/route.ts と共通）
const COMPOSITION_HINTS: Record<CompositionType, string> = {
  C1: "Text-dominant layout: white or light background, large bold typography, generous whitespace, minimal imagery.",
  C2: "Photo-dominant layout: a single subject (lifestyle scene) as the visual main, restrained text overlay.",
  C3: "List or table layout: structured rows, color-coded items, high information density, clear visual hierarchy.",
  C4: "Before/after comparison layout: side-by-side or top-bottom split, contrast or arrow highlighting transformation.",
  C5: "Mood-focused aesthetic: pastel and refined color palette, unified atmosphere, abundant whitespace, polished elegance.",
}

function detectColorPalette(themeTags: string[]): string {
  const joined = themeTags.join(" ")
  if (/ニキビ|敏感肌|スキンケア|保湿|肌/.test(joined)) return "pink"
  if (/メイク|コスメ|リップ|アイ/.test(joined))        return "purple"
  if (/UV|美白|日焼け|シミ/.test(joined))             return "yellow"
  if (/ナチュラル|オーガニック|無添加/.test(joined))    return "green"
  return "pink"
}

const CTA_TAG_KEYWORDS = [
  "フォロー", "保存", "cta", "コール", "まとめ", "プロフィール",
  "参加", "フォロバ", "シェア", "コメント", "エンゲージ",
]
function isCTASlide(slide: GeneratedSlide): boolean {
  const tagLower = (slide.tag ?? "").toLowerCase()
  return CTA_TAG_KEYWORDS.some(kw => tagLower.includes(kw.toLowerCase()))
}

// 1枚目 or タグに「フック」を含むスライド = 問題提起のため商品画像は出さない
function isHookSlide(slide: GeneratedSlide): boolean {
  return slide.slideNumber === 1 || (slide.tag ?? "").includes("フック")
}

function pickProductForSlide(
  slide: GeneratedSlide,
  product: Product | null,
  competitors: CompetitorProduct[],
  postType: PostType = "tips",
): { imageUrl: string; displayName: string; isOwn: boolean } | null {
  if (!slide.headline) return null
  // フック（1枚目 or タグに「フック」）と CTA 系は商品画像なし
  if (isHookSlide(slide) || isCTASlide(slide)) return null

  // テキスト + タグを結合して照合
  const text     = `${slide.headline} ${(slide.bullets ?? []).join(" ")} ${slide.accent ?? ""}`.toLowerCase()
  const tagLower = (slide.tag ?? "").toLowerCase()
  const combined = `${text} ${tagLower}`

  // ① 競合商品マッチングを最優先（product/mixed 両方）
  //   2段階照合: 商品名先頭トークン（具体的）→ 親会社ブランド名（汎用）
  if (postType === "product" || postType === "mixed") {
    for (const c of competitors) {
      const firstToken = ((c.productName ?? "").toLowerCase().split(/[\s　]+/)[0] ?? "")
      if (firstToken.length >= 3 && combined.includes(firstToken)) {
        console.log(`[process pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 競合(line): ${c.brandName} ${c.productName}`)
        return { imageUrl: c.imageUrl, displayName: `${c.brandName} ${c.productName}`, isOwn: false }
      }
    }
    for (const c of competitors) {
      const brandLower = (c.brandName ?? "").toLowerCase().trim()
      if (brandLower.length >= 2 && combined.includes(brandLower)) {
        console.log(`[process pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 競合(brand): ${c.brandName} ${c.productName}`)
        return { imageUrl: c.imageUrl, displayName: `${c.brandName} ${c.productName}`, isOwn: false }
      }
    }
  }

  // ② 自社商品マッチング：ブランド名「アネトス/anetos」が明示的に書かれているスライドのみ
  //    商品名トークン（ウォータリー/エマルジョン等）は競合と被るため照合に使わない
  if (product) {
    const brandHit = combined.includes("アネトス") || combined.includes("anetos")
    if (brandHit) {
      console.log(`[process pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 自社商品表示`)
      return { imageUrl: product.imageUrl, displayName: product.name, isOwn: true }
    }
    console.log(`[process pickProductForSlide] slide ${slide.slideNumber} tag="${slide.tag}" → 商品言及なしのためスキップ`)
  }
  return null
}

// ─── 1スライド再生成処理 ─────────────────────────────────────────
async function processSlideRegen(
  jobId: string,
  job: import("@/types/v2").GenerationJob,
): Promise<import("next/server").NextResponse> {
  const { NextResponse } = await import("next/server")
  const p = job.slideRegenParams
  if (!p) {
    await dbUpdateJob(jobId, { status: "error", errorMessage: "slideRegenParams が未設定です" })
    return NextResponse.json({ ok: true })
  }

  await dbUpdateJob(jobId, { status: "image_generating" })

  try {
    // ペルソナ取得
    const personas = await dbLoadPersonas()
    const persona = personas.find(pe => pe.id === job.personaId)
    if (!persona) {
      await dbUpdateJob(jobId, { status: "error", errorMessage: "ペルソナが見つかりません" })
      return NextResponse.json({ ok: true })
    }

    // ベンチマーク取得（指定があればそれ、なければ postType 一致のランダム）
    const allBenchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount ?? "")
    const hiddenAccounts = await dbLoadHiddenAccountNames()
    const benchmarkPosts = allBenchmarkPosts.filter(b => !b.isHidden && !hiddenAccounts.has(b.accountName))

    let refBenchmark = p.refBenchmark
      ? benchmarkPosts.find(b => b.folderPath === p.refBenchmark)
      : undefined
    if (!refBenchmark) {
      const pool = benchmarkPosts.filter(b => b.postType === job.postType)
      refBenchmark = (pool.length > 0 ? pool : benchmarkPosts)[Math.floor(Math.random() * (pool.length || benchmarkPosts.length))]
    }
    if (!refBenchmark) {
      await dbUpdateJob(jobId, { status: "error", errorMessage: "ベンチマーク投稿が見つかりません" })
      return NextResponse.json({ ok: true })
    }

    const benchmarkUrls = refBenchmark.slideUrls ?? []
    const refImageUrl = benchmarkUrls[p.slideIndex] ?? benchmarkUrls[0] ?? ""

    // スタイル分析
    const cachedDescs = refBenchmark.slideStyleDescs ?? {}
    const styleDescMap = new Map<string, string>()
    if (refImageUrl) {
      if (cachedDescs[refImageUrl]) {
        styleDescMap.set(refImageUrl, cachedDescs[refImageUrl])
      } else {
        const desc = await describeV3SlideStyle(refImageUrl)
        styleDescMap.set(refImageUrl, desc)
        dbUpdateBenchmarkSlideStyleDescs(refBenchmark.id, { [refImageUrl]: desc }).catch(() => {})
      }
    }

    const compositionHint = p.types ? COMPOSITION_HINTS[p.types.compositionType] : ""
    const styleDescription = [styleDescMap.get(refImageUrl) ?? "", compositionHint].filter(Boolean).join("  ")
    const colorPalette = detectColorPalette(persona.themeTags)
    const visualProfile = persona.visualProfile ?? undefined
    const personaHint = visualProfile ? undefined : extractPersonaVisual(persona.characterText)

    // 1枚生成
    const result = await generateV2Slide({
      headline:         p.slide.headline,
      tag:              p.slide.tag,
      bullets:          p.slide.bullets,
      accent:           p.slide.accent,
      colorPalette,
      refImageUrl,
      styleDescription,
      slideNumber:      p.slide.slideNumber,
      visualProfile,
      personaHint,
      instruction:      p.instruction || undefined,
    })

    if (!result.buffer) {
      await dbUpdateJob(jobId, { status: "error", errorMessage: "ポリシー違反のため生成できませんでした" })
      return NextResponse.json({ ok: true })
    }

    const [imageUrl] = await uploadSlideBuffers([result.buffer])

    // generated_posts の該当スライド URL を先に更新する（競合状態を防ぐため）
    // ※ status="done" を先に書くとクライアントのポーリングが先に拾ってしまい、
    //   DB更新前に loadResults() が走って古い画像が表示される
    if (p.generatedPostId && !p.generatedPostId.startsWith("job_")) {
      const { createClient } = await import("@supabase/supabase-js")
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data } = await sb
        .from("generated_posts")
        .select("image_urls")
        .eq("id", p.generatedPostId)
        .single()
      if (data) {
        const urls: string[] = [...((data.image_urls as string[]) ?? [])]
        urls[p.slideIndex] = imageUrl
        await dbUpdateGeneratedPostImages(p.generatedPostId, urls)
      }
    }

    // generated_posts 更新が完了してからステータスを done にする
    await dbUpdateJob(jobId, {
      status:       "done",
      imageUrls:    [imageUrl],
      refBenchmark: refBenchmark.folderPath,
    })

    console.log(`[v4/process] slide_regen job ${jobId} done. slideIndex=${p.slideIndex}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[v4/process] slide_regen job ${jobId} error:`, e)
    await dbUpdateJob(jobId, { status: "error", errorMessage: msg }).catch(() => {})
    return NextResponse.json({ ok: true })
  }
}

function extractPersonaVisual(characterText: string): string {
  const m = characterText.match(/【キャラクター】\s*([\s\S]*?)(?=【|$)/)
  return m?.[1]?.trim().slice(0, 300) ?? characterText.slice(0, 300)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params

  // ジョブ存在確認
  const job = await dbLoadJob(jobId)
  if (!job) {
    console.error(`[v4/process] job not found: ${jobId}`)
    return NextResponse.json({ error: "job not found" }, { status: 404 })
  }
  // 既に処理済みなら何もしない（二重起動対策）
  if (job.status !== "pending") {
    console.warn(`[v4/process] job ${jobId} already in status=${job.status}, skipping`)
    return NextResponse.json({ ok: true })
  }

  try {
    // ─── slide_regen ジョブ（1枚だけ再生成）────────────────────────
    if (job.jobType === "slide_regen") {
      return await processSlideRegen(jobId, job)
    }

    // ─── ペルソナ・ベンチマーク取得 ───────────────────────────────
    const personas = await dbLoadPersonas()
    const persona = personas.find(p => p.id === job.personaId)
    if (!persona || !persona.benchmarkAccount) {
      await dbUpdateJob(jobId, { status: "error", errorMessage: "ペルソナまたはベンチマークアカウントが見つかりません" })
      return NextResponse.json({ ok: true })
    }

    const allBenchmarkPosts = await dbLoadBenchmarkPosts(persona.benchmarkAccount)
    // 投稿レベル + アカウントレベルの両方で非表示フィルタリング
    const hiddenAccounts = await dbLoadHiddenAccountNames()
    const benchmarkPosts = allBenchmarkPosts.filter(b => !b.isHidden && !hiddenAccounts.has(b.accountName))
    if (benchmarkPosts.length === 0) {
      await dbUpdateJob(jobId, { status: "error", errorMessage: "ベンチマーク投稿がありません（全件非表示の場合はベンチマーク設定を確認してください）" })
      return NextResponse.json({ ok: true })
    }

    // 商品取得
    let product: Product | null = null
    let competitors: CompetitorProduct[] = []
    if ((job.postType === "product" || job.postType === "mixed") && job.productId) {
      const products = await loadProducts()
      product = products.find(p => p.id === job.productId) ?? null
      competitors = await dbLoadCompetitorProducts(job.productId).catch(() => [])
    }

    // ─── テキスト生成 ──────────────────────────────────────────────
    await dbUpdateJob(jobId, { status: "text_generating" })

    const types = selectTypeCombination(persona, benchmarkPosts, job.postType as PostType)

    const hasSlidUrls = (b: (typeof benchmarkPosts)[0]) => (b.slideUrls ?? []).length > 0
    let selectedBenchmark = job.benchmarkFolderPath
      ? benchmarkPosts.find(b => b.folderPath === job.benchmarkFolderPath && hasSlidUrls(b))
      : undefined
    if (!selectedBenchmark) {
      const typeMatched = benchmarkPosts.filter(b =>
        b.postType === job.postType && b.structureType === types.structureType && hasSlidUrls(b),
      )
      const postMatched = benchmarkPosts.filter(b => b.postType === job.postType && hasSlidUrls(b))
      const anyMatched  = benchmarkPosts.filter(hasSlidUrls)
      const pool = typeMatched.length > 0 ? typeMatched : postMatched.length > 0 ? postMatched : anyMatched
      selectedBenchmark = pool[Math.floor(Math.random() * pool.length)]
    }
    const targetSlideCount = selectedBenchmark ? (selectedBenchmark.slideUrls ?? []).length : undefined

    const samplesExact = benchmarkPosts.filter(b => b.postType === job.postType)
    const benchmarkSamples = samplesExact.length > 0
      ? samplesExact.slice(0, 3)
      : benchmarkPosts.filter(b => b.postType === "tips").slice(0, 3)

    const recentPosts = await dbLoadRecentPostsByPersona(job.personaId, 30).catch(() => [])
    const history = recentPosts.map(p => p.overallTitle)

    // ベンチマークの slideStructure から商品スロット数を正確に取得して競合件数を制限
    // 役割に「商品」を含むスライドを商品スロットと判定し、-1（自社商品1枚分）が最大競合件数
    // slideStructure が空の場合: 旧来の targetSlideCount - 3 にフォールバック
    const benchmarkStructure = selectedBenchmark?.slideStructure ?? []
    const isProductRole = (role: string) =>
      ["商品", "item", "アイテム", "product"].some(kw => role.toLowerCase().includes(kw))
    const benchmarkProductSlots = benchmarkStructure.filter(s => isProductRole(s.role)).length
    const maxCompetitors = targetSlideCount !== undefined
      ? benchmarkProductSlots > 0
        ? Math.max(0, benchmarkProductSlots - 1)   // 正確: 商品スロット数 − 自社1枚
        : Math.max(0, targetSlideCount - 3)         // fallback: フック+自社+CTA = 3固定
      : competitors.length
    const trimmedCompetitors = competitors.slice(0, maxCompetitors)

    const generateParams = {
      persona, postType: job.postType as PostType, product, types, benchmarkSamples,
      competitors: trimmedCompetitors, targetSlideCount,
      refSlideStructure: benchmarkStructure.length > 0 ? benchmarkStructure : undefined,
      history,
    }
    let generated = await generateV3Post(generateParams)
    for (let attempt = 0; attempt < 2; attempt++) {
      const duplicate = await isDuplicatePost(generated.overallTitle, history)
      if (!duplicate) break
      generated = await generateV3Post(generateParams)
    }

    const textResult = { types, generated }
    await dbUpdateJob(jobId, { status: "image_generating", textResult })

    // ─── 画像生成 ──────────────────────────────────────────────────
    const benchmarkUrls = selectedBenchmark!.slideUrls
    const firstRefUrl = benchmarkUrls[0]
    const slides = generated.slides
    const slideRefUrls = slides.map((_, i) => benchmarkUrls[i] ?? firstRefUrl)

    // スタイル分析（キャッシュ優先）
    const uniqueUrls = [...new Set(slideRefUrls.filter(Boolean))]
    const styleDescMap = new Map<string, string>()
    const cachedDescs = selectedBenchmark!.slideStyleDescs ?? {}
    const uncachedUrls = uniqueUrls.filter(url => {
      if (cachedDescs[url]) { styleDescMap.set(url, cachedDescs[url]); return false }
      return true
    })
    if (uncachedUrls.length > 0) {
      const newDescs: Record<string, string> = {}
      await Promise.all(uncachedUrls.map(async url => {
        const desc = await describeV3SlideStyle(url)
        styleDescMap.set(url, desc)
        newDescs[url] = desc
      }))
      dbUpdateBenchmarkSlideStyleDescs(selectedBenchmark!.id, newDescs).catch(() => {})
    }

    const compositionHint = COMPOSITION_HINTS[types.compositionType]
    const colorPalette = detectColorPalette(persona.themeTags)
    const visualProfile = persona.visualProfile ?? undefined
    const personaHint = visualProfile ? undefined : extractPersonaVisual(persona.characterText)

    type SlideResult = { buffer: Buffer | null; policyFallback: boolean; falCalls: number; slideNumber: number; index: number }

    const jobPostType = job.postType as PostType

    async function generateOneSlide(
      i: number,
      overrideRefImageUrl?: string,
    ): Promise<SlideResult> {
      const slide = slides[i]
      const refImageUrl = overrideRefImageUrl ?? slideRefUrls[i]
      const slideProduct = (jobPostType === "product" || jobPostType === "mixed")
        ? pickProductForSlide(slide, product, competitors, jobPostType)
        : null
      const slideStyleDesc = slideRefUrls[i] ? (styleDescMap.get(slideRefUrls[i]) ?? "") : ""
      const finalStyleDesc = [slideStyleDesc, compositionHint].filter(Boolean).join("  ")
      console.log(`[v4/process] slide ${i + 1} → FAL${overrideRefImageUrl ? " (bg-inherit)" : ""}`)
      const result = await generateV2Slide({
        headline: slide.headline, tag: slide.tag, bullets: slide.bullets, accent: slide.accent,
        colorPalette, refImageUrl, styleDescription: finalStyleDesc,
        slideNumber: slide.slideNumber, visualProfile, personaHint,
        productImageUrl: slideProduct?.imageUrl,
        bgInherit: !!overrideRefImageUrl,
      })
      return { ...result, slideNumber: slide.slideNumber, index: i }
    }

    // 背景グループ対応: 同背景スライドをグループ化してベース画像を共有
    // 競合比較投稿は自動で全スライドを1グループ化（同一背景を強制）
    // 背景グループは 商品比較投稿（product/mixed）のみに適用する
    // tips投稿ではベンチマークのテキスト配置・スタイルを優先するためグループ化しない
    const rawBackgroundGroups = selectedBenchmark!.backgroundGroups as number[][] | null | undefined
    const backgroundGroups = (jobPostType === "product" || jobPostType === "mixed")
      ? (rawBackgroundGroups ?? (competitors.length > 0 ? [slides.map((_, i) => i)] : null))
      : null

    const slideResults: SlideResult[] = new Array(slides.length)

    if (backgroundGroups && backgroundGroups.length > 0) {
      await Promise.all(backgroundGroups.map(async (group) => {
        const validIndices = group.filter(bi => bi < slides.length)
        if (validIndices.length === 0) return

        if (validIndices.length === 1) {
          slideResults[validIndices[0]] = await generateOneSlide(validIndices[0]).catch(() =>
            ({ buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[validIndices[0]].slideNumber, index: validIndices[0] } as SlideResult)
          )
          return
        }

        // 複数スライドが同背景: 素背景を先に1枚生成してから全スライドに使い回す
        const first = validIndices[0]
        const firstStyleDesc = styleDescMap.get(slideRefUrls[first]) ?? ""
        console.log(`[v4/process] group ${JSON.stringify(validIndices)}: 素背景を生成中...`)
        const baseResult = await generateBaseSlide({
          refImageUrl:      slideRefUrls[first],
          styleDescription: [firstStyleDesc, compositionHint].filter(Boolean).join("  "),
          colorPalette,
          visualProfile,
          personaHint,
        })

        let groupBaseUrl: string | undefined
        if (baseResult.buffer) {
          const [url] = await uploadSlideBuffers([baseResult.buffer])
          groupBaseUrl = url
          console.log(`[v4/process] 素背景アップロード完了: ${url.slice(0, 60)}`)
        } else {
          // 素背景生成失敗: 旧来フォールバック（1枚目を通常生成して残りの参照に使う）
          console.warn(`[v4/process] 素背景生成失敗 — フォールバック`)
          const firstResult = await generateOneSlide(first).catch(() =>
            ({ buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[first].slideNumber, index: first } as SlideResult)
          )
          slideResults[first] = firstResult
          if (firstResult.buffer) {
            const [url] = await uploadSlideBuffers([firstResult.buffer])
            groupBaseUrl = url
            slideResults[first] = { ...firstResult, buffer: null, _uploadedUrl: url } as SlideResult & { _uploadedUrl: string }
          }
          for (const bi of validIndices.slice(1)) {
            if (bi >= slides.length) continue
            slideResults[bi] = await generateOneSlide(bi, groupBaseUrl).catch(() =>
              ({ buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[bi].slideNumber, index: bi } as SlideResult)
            )
          }
          return
        }

        // 素背景取得成功: 全スライドを並列生成
        const groupSettled = await Promise.allSettled(
          validIndices.filter(bi => bi < slides.length).map(bi => generateOneSlide(bi, groupBaseUrl))
        )
        groupSettled.forEach((r, idx) => {
          const bi = validIndices[idx]
          slideResults[bi] = r.status === "fulfilled"
            ? r.value
            : { buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[bi].slideNumber, index: bi }
        })
      }))
    } else {
      // 背景グループなし: 全スライド並列生成（従来通り）
      const settled = await Promise.allSettled(slides.map((_, i) => generateOneSlide(i)))
      settled.forEach((s, i) => {
        slideResults[i] = s.status === "fulfilled"
          ? s.value
          : { buffer: null, policyFallback: false, falCalls: 1, slideNumber: slides[i].slideNumber, index: i }
      })
    }

    // null でないバッファだけアップロード（素背景フォールバック時の1枚目は既アップロード済みなので除く）
    const toUpload = slideResults.filter((r): r is SlideResult & { buffer: Buffer } => r?.buffer !== null && r?.buffer !== undefined)
    const uploadedUrls = toUpload.length > 0 ? await uploadSlideBuffers(toUpload.map(r => r.buffer)) : []
    const urlByIndex = new Map<number, string>()
    slideResults.forEach((r, i) => {
      const ext = r as SlideResult & { _uploadedUrl?: string }
      if (ext?._uploadedUrl) urlByIndex.set(i, ext._uploadedUrl)
    })
    toUpload.forEach((r, ui) => urlByIndex.set(r.index, uploadedUrls[ui]))
    const imageUrls = slides.map((_, i) => urlByIndex.get(i) ?? null)

    const policyFallbackSlides = slideResults.filter(r => r.policyFallback && r.buffer !== null).map(r => r.slideNumber)
    const failedSlides = slideResults.filter(r => r.buffer === null).map(r => r.slideNumber)

    // コスト計算
    const totalFalCalls = slideResults.reduce((s, r) => s + (r?.falCalls ?? 1), 0)
    const hasImageSlides = slideResults.some((_, i) => {
      const slide = slides[i]
      return (jobPostType === "product" || jobPostType === "mixed") &&
        pickProductForSlide(slide, product, competitors, jobPostType) !== null
    })
    const imageCost = formatCost(calcFalCost(totalFalCalls, hasImageSlides))

    await dbUpdateJob(jobId, {
      status: "done",
      imageUrls,
      refBenchmark: selectedBenchmark!.folderPath,
      policyFallbackSlides,
      failedSlides,
      imageCost,
    })

    // 生成結果を generated_posts にも保存（結果ページで表示するため）
    await dbSaveGeneratedPost({
      personaId:       job.personaId,
      postType:        job.postType as PostType,
      productId:       job.productId ?? null,
      overallTitle:    generated.overallTitle,
      slides:          generated.slides,
      caption:         generated.caption ?? null,
      hookType:        types.hookType,
      structureType:   types.structureType,
      compositionType: types.compositionType,
      refBenchmark:    selectedBenchmark!.folderPath,
      imageUrls:       imageUrls.filter((u): u is string => u !== null),
      imageCost,
    }).catch(err => console.warn("[v4/process] generated_posts 保存失敗（続行）:", err))

    console.log(`[v4/process] job ${jobId} done. slides=${slides.length} failed=${failedSlides.length}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[v4/process] job ${jobId} error:`, e)
    await dbUpdateJob(jobId, { status: "error", errorMessage: msg }).catch(() => {})
    return NextResponse.json({ ok: true })  // enqueue 側がエラーを受け取る必要はない
  }
}
