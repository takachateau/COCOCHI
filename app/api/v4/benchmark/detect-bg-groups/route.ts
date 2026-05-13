/**
 * POST /api/v4/benchmark/detect-bg-groups
 * ベンチマーク投稿のスライドから同背景グループを AI 検出して DB に保存する
 *
 * リクエスト: { benchmarkPostId }
 * レスポンス: { groups: number[][] }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadBenchmarkPosts, dbUpdateBackgroundGroups } from "@/lib/supabase"
import { detectBackgroundGroups } from "@/lib/referenceV2"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { benchmarkPostId } = await req.json() as { benchmarkPostId?: string }
    if (!benchmarkPostId) {
      return NextResponse.json({ error: "benchmarkPostId は必須" }, { status: 400 })
    }

    // ベンチマーク投稿を取得
    const all = await dbLoadBenchmarkPosts()
    const post = all.find(b => b.id === benchmarkPostId)
    if (!post) {
      return NextResponse.json({ error: "ベンチマーク投稿が見つかりません" }, { status: 404 })
    }
    if (post.slideUrls.length === 0) {
      return NextResponse.json({ error: "スライドURLがありません" }, { status: 400 })
    }

    // Claude Vision で背景グループを検出
    const groups = await detectBackgroundGroups(post.slideUrls)

    // DB に保存（未確認状態: UI で人間が確認後に再保存）
    await dbUpdateBackgroundGroups(benchmarkPostId, groups)

    return NextResponse.json({ groups })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[detect-bg-groups]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
