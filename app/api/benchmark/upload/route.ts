/**
 * POST /api/benchmark/upload
 * 1投稿分のスライド画像を受け取り、Blobアップロード→Claude分析→DB保存を一括実行
 *
 * リクエスト: multipart/form-data
 *   accountName    : string  （例: "accountA"）
 *   postFolderName : string  （例: "post_001"、省略時は自動採番）
 *   caption        : string  （省略可。元投稿のキャプション原文）
 *   slides         : File[]  （スライド画像、ファイル名順にソート）
 *
 * レスポンス: { result: BenchmarkAnalysisResult }
 */
import { NextRequest, NextResponse } from "next/server"
import { uploadAndAnalyzePost } from "@/lib/benchmark"
import { dbLoadBenchmarkPosts } from "@/lib/supabase"

export const maxDuration = 120

const CAPTION_MAX_LENGTH = 5000

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const accountName     = form.get("accountName") as string | null
    let   postFolderName  = form.get("postFolderName") as string | null
    const captionRaw      = form.get("caption") as string | null

    if (!accountName) {
      return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })
    }

    // 入力サニタイズ：空文字は null 扱い、長さ上限チェック
    const captionTrimmed = captionRaw?.trim() ?? ""
    if (captionTrimmed.length > CAPTION_MAX_LENGTH) {
      return NextResponse.json(
        { error: `caption は ${CAPTION_MAX_LENGTH} 文字以内にしてください` },
        { status: 400 },
      )
    }
    const caption = captionTrimmed.length > 0 ? captionTrimmed : null

    // postFolderNameが省略された場合、既存の投稿数から自動採番
    if (!postFolderName) {
      const existing = await dbLoadBenchmarkPosts(accountName)
      const nextNum = existing.length + 1
      postFolderName = `post_${String(nextNum).padStart(3, "0")}`
    }

    // slides フィールドから画像ファイルを取得（複数）
    const files = form.getAll("slides") as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: "slides（画像ファイル）が必要です" }, { status: 400 })
    }

    // ファイル名順にソート（slide_01, slide_02... の順を保証）
    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name))

    const result = await uploadAndAnalyzePost({
      accountName,
      postFolderName,
      files: sortedFiles,
      caption,
    })

    return NextResponse.json({ result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[benchmark/upload]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
