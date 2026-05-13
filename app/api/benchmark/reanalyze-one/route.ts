/**
 * POST /api/benchmark/reanalyze-one
 * 既存ベンチマーク投稿1件を Claude Vision で再分析し、3つの型を含めて DB を更新する。
 *
 * リクエスト: { id: string }
 * レスポンス: { ok: true, hookMain, structureType, compositionType, ... }
 *
 * 使い方: フロントから全件のIDをループして1件ずつ呼ぶ（順次・並行禁止）
 */
import { NextRequest, NextResponse } from "next/server"
import { analyzeFromUrls } from "@/lib/benchmark"
import { dbUpdateBenchmarkPostAnalysis, supabase } from "@/lib/supabase"

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string }
    const id = body.id
    if (!id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 })
    }

    // 該当レコードを取得
    const { data, error } = await supabase
      .from("benchmark_posts")
      .select("id, slide_urls, caption, folder_path")
      .eq("id", id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: `post ${id} not found` }, { status: 404 })
    }

    const slideUrls = (data.slide_urls as string[]) ?? []
    if (slideUrls.length === 0) {
      return NextResponse.json({ error: "スライドURLがありません" }, { status: 400 })
    }

    // Claude Vision で再分析（3つの型を含む）
    const analysis = await analyzeFromUrls(slideUrls, data.caption ?? null)

    // 既存レコードを更新
    await dbUpdateBenchmarkPostAnalysis(id, {
      postType:        analysis.postType,
      tone:            analysis.tone,
      themeTags:       analysis.themeTags,
      slideStructure:  analysis.slideStructure,
      hookMain:        analysis.hookMain,
      hookSubs:        analysis.hookSubs,
      structureType:   analysis.structureType,
      compositionType: analysis.compositionType,
      patternNotes:    analysis.patternNotes,
    })

    return NextResponse.json({
      ok: true,
      folderPath:      data.folder_path,
      hookMain:        analysis.hookMain,
      hookSubs:        analysis.hookSubs,
      structureType:   analysis.structureType,
      compositionType: analysis.compositionType,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[benchmark/reanalyze-one]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
