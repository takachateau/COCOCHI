/**
 * GET /api/v4/benchmark/account-report?account=xxx
 * ベンチマークアカウント全体の定性分析レポートを Claude で生成する
 *
 * レスポンス: { report: AccountReport }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadBenchmarkPosts } from "@/lib/supabase"
import Anthropic from "@anthropic-ai/sdk"
import type { BenchmarkPost } from "@/types/v2"

export const maxDuration = 60

const HOOK_NAMES: Record<string, string> = {
  F1: "証拠付き自己同一化", F2: "数字n選", F3: "逆張り・常識破壊",
  F4: "危機煽り", F5: "即効・誇張ベネフィット",
}
const STRUCT_NAMES: Record<string, string> = {
  S1: "フル装備型(6〜8枚)", S2: "最短型(4〜5枚)", S3: "共感型",
  S4: "カタログ型", S5: "証拠先導型",
}
const COMP_NAMES: Record<string, string> = {
  C1: "テキスト主体", C2: "写真メイン", C3: "表・リスト",
  C4: "ビフォーアフター", C5: "ムード重視",
}

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function buildAccountSummary(posts: BenchmarkPost[]): string {
  const total = posts.length
  const typeCount: Record<string, number> = {}
  const hookCount: Record<string, number> = {}
  const structCount: Record<string, number> = {}
  const compCount: Record<string, number> = {}
  const tagCount: Record<string, number> = {}
  let slideTotal = 0

  for (const p of posts) {
    typeCount[p.postType] = (typeCount[p.postType] ?? 0) + 1
    slideTotal += p.slideCount
    if (p.hookMain) hookCount[p.hookMain] = (hookCount[p.hookMain] ?? 0) + 1
    if (p.structureType) structCount[p.structureType] = (structCount[p.structureType] ?? 0) + 1
    if (p.compositionType) compCount[p.compositionType] = (compCount[p.compositionType] ?? 0) + 1
    for (const t of p.themeTags) tagCount[t] = (tagCount[t] ?? 0) + 1
  }

  const topHooks  = topN(hookCount, 3).map(([k, v]) => `${k}(${HOOK_NAMES[k]}): ${v}件`).join(", ")
  const topStruct = topN(structCount, 2).map(([k, v]) => `${k}(${STRUCT_NAMES[k]}): ${v}件`).join(", ")
  const topComp   = topN(compCount, 2).map(([k, v]) => `${k}(${COMP_NAMES[k]}): ${v}件`).join(", ")
  const topTags   = topN(tagCount, 10).map(([t]) => `#${t}`).join(" ")
  const typeStr   = Object.entries(typeCount).map(([t, v]) => `${t}: ${v}件`).join(" / ")

  // キャプションサンプル（最大3件・100文字以内）
  const captionSamples = posts
    .filter(p => p.caption && p.caption.length > 10)
    .slice(0, 3)
    .map(p => `「${p.caption!.slice(0, 120)}...」`)
    .join("\n")

  // スライド構造サンプル（最大3件）
  const structSamples = posts
    .filter(p => p.slideStructure.length > 0)
    .slice(0, 3)
    .map(p => `[${p.postType}] ${p.slideStructure.map(s => s.role).join(" → ")}`)
    .join("\n")

  return `
【アカウント統計】
総投稿数: ${total}件 / 平均スライド枚数: ${(slideTotal / total).toFixed(1)}枚
投稿種別: ${typeStr}

【頻出テーマタグ】 ${topTags}

【3つの型の主要パターン】
フック: ${topHooks}
構造: ${topStruct}
構図: ${topComp}

【スライド構造サンプル】
${structSamples}

【キャプションサンプル】
${captionSamples || "（キャプション未登録）"}
`
}

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account")
  if (!account) {
    return NextResponse.json({ error: "account パラメータが必要です" }, { status: 400 })
  }

  try {
    const posts = await dbLoadBenchmarkPosts(account)
    if (posts.length === 0) {
      return NextResponse.json({ error: `${account} の投稿がありません` }, { status: 404 })
    }

    const summary = buildAccountSummary(posts)

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `以下はLemon8のバズっているUGCアカウント「${account}」の投稿データ分析サマリです。
このアカウントのペルソナ・戦略・なぜバズるかを、マーケター視点で分析してください。

${summary}

以下のJSON形式で分析レポートを返してください（前後の説明・コードブロック禁止）:

{
  "character": {
    "title": "アカウントキャラクター像（10文字以内のキャッチ）",
    "description": "このアカウントが演じているキャラクター・ポジション・世界観（3〜4文）"
  },
  "why_liked": {
    "title": "フォロワーに好かれる理由",
    "points": ["理由1（具体的・30文字以内）", "理由2", "理由3"]
  },
  "why_emulated": {
    "title": "真似したいと思われる理由",
    "points": ["理由1（具体的・30文字以内）", "理由2", "理由3"]
  },
  "content_strategy": {
    "title": "コンテンツ戦略の特徴",
    "description": "どんなフック・構造・ビジュアルで何を実現しているか（3〜4文）"
  },
  "strengths": ["強み1（20文字以内）", "強み2", "強み3"],
  "persona_hint": "このアカウントを参考にペルソナを作るなら、どんな設定にすべきか（2〜3文）"
}`,
      }],
    })

    const text = res.content[0].type === "text" ? res.content[0].text : "{}"
    const jsonStart = text.indexOf("{")
    const jsonEnd   = text.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("JSONが取得できませんでした")

    const report = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AccountReport

    return NextResponse.json({ report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[account-report]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export interface AccountReport {
  character: { title: string; description: string }
  why_liked: { title: string; points: string[] }
  why_emulated: { title: string; points: string[] }
  content_strategy: { title: string; description: string }
  strengths: string[]
  persona_hint: string
}
