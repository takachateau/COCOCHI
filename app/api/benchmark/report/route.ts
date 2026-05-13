/**
 * POST /api/benchmark/report
 * ベンチマークアカウントの投稿を一括分析してAIレポートを生成・保存する
 *
 * リクエスト: { accountName: string }
 * レスポンス: { report: string }
 */
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { dbLoadBenchmarkPosts, dbLoadAccountBio, dbSaveAccountReport, dbLoadAccountReport } from "@/lib/supabase"

export const maxDuration = 60

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountName = searchParams.get("accountName")
    if (!accountName) return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })
    const report = await dbLoadAccountReport(accountName)
    return NextResponse.json({ report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { accountName?: string }
    const { accountName } = body
    if (!accountName) return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })

    const [posts, bio] = await Promise.all([
      dbLoadBenchmarkPosts(accountName),
      dbLoadAccountBio(accountName).catch(() => ""),
    ])

    if (posts.length === 0) {
      return NextResponse.json({ error: "投稿が登録されていません" }, { status: 400 })
    }

    // 統計集計
    const typeCounts = posts.reduce((acc, p) => {
      acc[p.postType] = (acc[p.postType] ?? 0) + 1; return acc
    }, {} as Record<string, number>)

    const hookCounts = posts.reduce((acc, p) => {
      if (p.hookMain) acc[p.hookMain] = (acc[p.hookMain] ?? 0) + 1; return acc
    }, {} as Record<string, number>)
    const topHooks = Object.entries(hookCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)

    const structCounts = posts.reduce((acc, p) => {
      if (p.structureType) acc[p.structureType] = (acc[p.structureType] ?? 0) + 1; return acc
    }, {} as Record<string, number>)
    const topStructures = Object.entries(structCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)

    const compCounts = posts.reduce((acc, p) => {
      if (p.compositionType) acc[p.compositionType] = (acc[p.compositionType] ?? 0) + 1; return acc
    }, {} as Record<string, number>)
    const topComps = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 2)

    const toneCounts = posts.reduce((acc, p) => {
      acc[p.tone] = (acc[p.tone] ?? 0) + 1; return acc
    }, {} as Record<string, number>)

    const tagCounts = posts.flatMap(p => p.themeTags).reduce((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1; return acc
    }, {} as Record<string, number>)
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t)

    // スライド構成サンプル（最大4件）
    const samplePosts = posts.slice(0, 4)
    const sampleStructures = samplePosts.map((p, i) => {
      const lines = p.slideStructure.map(s => `  ${s.slide}.「${s.role}」${s.description}`).join("\n")
      return `投稿${i + 1}（${p.postType}・${p.tone}・hook=${p.hookMain ?? "?"}・struct=${p.structureType ?? "?"}）:\n${lines}`
    }).join("\n\n")

    const HOOK_NAMES: Record<string, string> = {
      F1: "証拠付き自己同一化", F2: "数字n選", F3: "逆張り・常識破壊", F4: "危機煽り", F5: "即効・誇張ベネフィット",
    }
    const STRUCT_NAMES: Record<string, string> = {
      S1: "フル装備型", S2: "最短型", S3: "共感型", S4: "カタログ型", S5: "証拠先導型",
    }
    const COMP_NAMES: Record<string, string> = {
      C1: "テキスト主体", C2: "写真メイン", C3: "表・リスト", C4: "ビフォーアフター", C5: "ムード重視",
    }

    const prompt = `あなたはSNSアカウントの戦略アナリストです。
以下のベンチマーク分析データをもとに、このアカウントの「コンテンツ戦略レポート」を作成してください。

【アカウント名】 ${accountName}
${bio ? `【アカウントbio】\n${bio}\n` : ""}
【基本統計】
- 分析投稿数: ${posts.length}件
- 投稿種別: tips ${typeCounts.tips ?? 0}件 / product ${typeCounts.product ?? 0}件 / mixed ${typeCounts.mixed ?? 0}件
- 主要テーマ: ${topTags.join(" / ")}
- トーン分布: ${Object.entries(toneCounts).map(([k, v]) => `${k}:${v}件`).join(" / ")}

【3つの型 — 頻出ランキング】
- フック型TOP3: ${topHooks.map(([k, v]) => `${k}(${HOOK_NAMES[k] ?? k}):${v}件`).join(" / ")}
- 構造型TOP3: ${topStructures.map(([k, v]) => `${k}(${STRUCT_NAMES[k] ?? k}):${v}件`).join(" / ")}
- 構図型TOP2: ${topComps.map(([k, v]) => `${k}(${COMP_NAMES[k] ?? k}):${v}件`).join(" / ")}

【投稿スライド構成サンプル】
${sampleStructures}

【出力フォーマット】
日本語で、以下の4セクションをそれぞれ2〜4文で簡潔に書いてください。
見出しは## で始めてください。

## アカウントの強み
（このアカウントのコンテンツ戦略の最大の特徴・強みを端的に）

## フック戦略
（どのフック型をどう使っているか。視聴者の心理にどう刺さっているか）

## 投稿構造の特徴
（スライド構成・情報の流れ・視覚的スタイルの特徴）

## 活用ポイント
（このアカウントを参照して自社コンテンツを作る際の具体的な活用方法）`

    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const report = res.content[0].type === "text" ? res.content[0].text : ""
    await dbSaveAccountReport(accountName, report)

    return NextResponse.json({ report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[benchmark/report]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
