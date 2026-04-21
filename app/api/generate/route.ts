import { NextRequest, NextResponse, after } from "next/server"
import { createJob, updateJob, pruneOldJobs } from "@/lib/jobs"
import type { ProductInput } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 300

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

  const job = createJob()

  // after() で独立したサーバーレス関数 /api/generate/run を呼び出す。
  // 同一プロセス内でのバックグラウンド処理ではなく、新しい HTTP リクエストとして
  // Vercel が別インスタンスを立ち上げるため、maxDuration=300 が有効になる。
  after(async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"
      await fetch(`${baseUrl}/api/generate/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, body }),
      })
    } catch (err) {
      console.error("[generate] run fetch失敗:", err)
      updateJob(job.id, { status: "error", error: String(err) })
    }
  })

  return NextResponse.json({ jobId: job.id })
}
