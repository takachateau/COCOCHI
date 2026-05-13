/**
 * POST /api/v3/benchmark/analyze-styles
 * ベンチマーク投稿のスライドを Claude Vision で一括分析し、
 * slide_style_descs としてDBにキャッシュ保存する。
 *
 * リクエスト:
 *   {} — 全未分析ポストを処理
 *   { accountName: string } — 指定アカウントのみ
 *   { id: string } — 指定ポスト1件のみ
 *
 * レスポンス: { processed: number, skipped: number, errors: number }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadBenchmarkPosts, dbUpdateBenchmarkSlideStyleDescs } from "@/lib/supabase"
import { describeV3SlideStyle } from "@/lib/referenceV2"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      accountName?: string
      id?: string
      forceReanalyze?: boolean  // trueにすると既存キャッシュを上書き
    }
    const { accountName, id, forceReanalyze = false } = body

    // 対象ポストを取得
    const allPosts = await dbLoadBenchmarkPosts(accountName)
    const targetPosts = id ? allPosts.filter(p => p.id === id) : allPosts

    let processed = 0
    let skipped   = 0
    let errors    = 0

    for (const post of targetPosts) {
      const urls = post.slideUrls.filter(Boolean)
      if (urls.length === 0) { skipped++; continue }

      const existingCache = post.slideStyleDescs ?? {}

      // 未キャッシュのURLのみ対象（forceReanalyze=true なら全URL）
      const uncachedUrls = forceReanalyze
        ? urls
        : urls.filter(url => !existingCache[url])

      if (uncachedUrls.length === 0) {
        console.log(`[analyze-styles] SKIP (all cached): ${post.folderPath}`)
        skipped++
        continue
      }

      console.log(`[analyze-styles] Analyzing ${uncachedUrls.length} slides for: ${post.folderPath}`)

      try {
        const newDescs: Record<string, string> = {}
        // 直列処理（API負荷を抑えるため）
        for (const url of uncachedUrls) {
          const desc = await describeV3SlideStyle(url)
          newDescs[url] = desc
        }
        await dbUpdateBenchmarkSlideStyleDescs(post.id, newDescs)
        processed++
        console.log(`[analyze-styles] DONE: ${post.folderPath} (${uncachedUrls.length} slides)`)
      } catch (err) {
        console.error(`[analyze-styles] ERROR: ${post.folderPath}`, err)
        errors++
      }
    }

    return NextResponse.json({ processed, skipped, errors, total: targetPosts.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[analyze-styles]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const accountName = req.nextUrl.searchParams.get("accountName") ?? undefined
    const posts = await dbLoadBenchmarkPosts(accountName)

    const stats = posts.map(p => {
      const total  = p.slideUrls.filter(Boolean).length
      const cached = Object.keys(p.slideStyleDescs ?? {}).length
      return {
        id:          p.id,
        folderPath:  p.folderPath,
        total,
        cached,
        complete:    total > 0 && cached >= total,
      }
    })

    const complete   = stats.filter(s => s.complete).length
    const incomplete = stats.filter(s => !s.complete).length

    return NextResponse.json({ complete, incomplete, posts: stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
