import { NextRequest, NextResponse } from "next/server"
import { createJob, pruneOldJobs } from "@/lib/jobs"
import type { ProductInput } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 30

// ─── パターン別アピール角度プール ──────────────────────────────────
export const PATTERN_NAMES = ["エンタメ導入型", "手持ちUGC型", "直置きUGC型", "記事投稿型"] as const

export const PATTERN_ANGLE_POOLS: Record<string, string[]> = {
  "エンタメ導入型": ["感情体験", "共感・あるある", "ギャップ体験", "衝撃告白"],
  "手持ちUGC型":   ["ビフォーアフター", "継続結果レポ", "正直レビュー", "周りの反応"],
  "直置きUGC型":   ["ルーティン紹介", "時短・ズボラ", "シーン訴求", "映え・世界観"],
  "記事投稿型":    ["成分・効果", "皮膚科目線", "他社比較", "ハウツー解説"],
}

// ─── エンドポイント ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as ProductInput
  const { productName, ingredients, howToUse, productImageBase64 } = body

  if (!productName || !ingredients || !howToUse || !productImageBase64) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  pruneOldJobs()
  const job = await createJob()

  // jobId と body を返す。クライアントが /api/generate/run を fire-and-forget で呼ぶ。
  return NextResponse.json({ jobId: job.id, body })
}
