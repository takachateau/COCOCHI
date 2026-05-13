/**
 * contentPlan.ts — 週次投稿プラン生成モジュール（v3 B系統統一版）
 *
 * フロー:
 *   1. buildPostTypeSchedule()  ペルソナの割合に基づいて月〜日の投稿種別を決定
 *   2. buildWeeklyPlan()        各日にベンチマーク投稿を割り当て
 *   3. generateAllText()        全投稿を並列生成 → Haiku AI被り判定QCで再生成
 */

import { dbFindBenchmarkPost, dbPickCompetitors, dbLoadBenchmarkPosts, dbLoadRecentPostsByPersona } from "@/lib/supabase"
import { selectTypeCombination, generateV3Post, isDuplicatePost } from "@/lib/v3Generate"
import type { BenchmarkPost, Persona, ContentPlan, PlanPost, PostType, SlideRole, GeneratedPostText, CompetitorProduct } from "@/types/v2"
import type { Product } from "@/types"

// ─── 1. 週次プランの骨格を作る ───────────────────────────────────

export function buildPostTypeSchedule(typeRatios: Persona["typeRatios"]): PostType[] {
  const total = 7
  const mixedPct = typeRatios.mixed ?? 0

  const counts = {
    tips:    Math.round((typeRatios.tips    / 100) * total),
    product: Math.round((typeRatios.product / 100) * total),
    mixed:   Math.round((mixedPct          / 100) * total),
  }

  const sum = counts.tips + counts.product + counts.mixed
  // 合計が7を下回る/超える場合は tips で調整
  if (sum < total) counts.tips += total - sum
  if (sum > total) counts.tips = Math.max(0, counts.tips - (sum - total))

  const groups: PostType[] = [
    ...Array(counts.tips).fill("tips" as PostType),
    ...Array(counts.product).fill("product" as PostType),
    ...Array(counts.mixed).fill("mixed" as PostType),
  ]

  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
  }

  return groups.slice(0, total)
}

// ─── 2. 各投稿にベンチマーク投稿を割り当て ───────────────────────

export async function buildWeeklyPlan(
  persona: Persona,
  productId: string | null,
  weekStart: string,
): Promise<Omit<ContentPlan, "id" | "createdAt">> {
  const schedule = buildPostTypeSchedule(persona.typeRatios)

  const usedBenchmarkIds = new Set<string>()
  const posts: PlanPost[] = []

  for (const [index, postType] of schedule.entries()) {
    const day = index + 1
    const benchmark = await dbFindBenchmarkPost(postType, persona.themeTags, usedBenchmarkIds)
    if (benchmark?.id) usedBenchmarkIds.add(benchmark.id)

    posts.push({
      day,
      postType,
      benchmarkPostId: benchmark?.id ?? "",
      generatedText: null,
      generatedImages: null,
      status: "planned" as const,
    })
  }

  posts.sort((a, b) => a.day - b.day)

  return { personaId: persona.id, productId, weekStart, posts }
}

// ─── 比較型ベンチマーク検出（商品投稿のみで使用）────────────────

function detectPostPattern(structure: SlideRole[]): "comparison" | "single" {
  if (structure.length === 0) return "single"
  const text = structure.map(s => `${s.role} ${s.description}`).join(" ")
  const hasKeyword = /比較|VS|vs|\d+選|ランキング|競合/.test(text)
  const multiProductCount = structure.filter(s =>
    /商品紹介[①②③④⑤⑥⑦⑧⑨⑩\d]|アイテム[①②③④⑤⑥⑦⑧⑨⑩\d]|製品[①②③④⑤\d]/.test(s.role)
  ).length
  return (hasKeyword || multiProductCount >= 3) ? "comparison" : "single"
}

// ─── 3. 全投稿のテキストを並列生成（B系統）──────────────────────

// benchmarkMap の value は BenchmarkPost 全体（型選択・枚数・構造すべてに使う）
export type BenchmarkMap = Map<string, BenchmarkPost>

export interface TextGenerationOptions {
  competitorCount?: number
}

async function generateOnePost(
  planPost: PlanPost,
  persona: Persona,
  product: Product | null,
  allPersonaBenchmarks: BenchmarkPost[],
  assignedBenchmark: BenchmarkPost | undefined,
  history: string[],
  competitorCount: number,
): Promise<GeneratedPostText | null> {
  // ペルソナのベンチマーク分布から3つの型を選択
  const types = selectTypeCombination(persona, allPersonaBenchmarks, planPost.postType)

  // 同postTypeのベンチマーク最大3件（構造サンプルとして渡す）
  const benchmarkSamples = allPersonaBenchmarks
    .filter(b => b.postType === planPost.postType)
    .slice(0, 3)

  // 割り当てベンチマークの実際の枚数（生成枚数の厳守に使う）
  const urlCount = (assignedBenchmark?.slideUrls ?? []).length
  const targetSlideCount = urlCount > 0 ? urlCount : (assignedBenchmark?.slideCount || undefined)

  // 商品投稿（product/mixed）かつ比較型ベンチマークなら競合商品を取得
  let competitors: CompetitorProduct[] = []
  if ((planPost.postType === "product" || planPost.postType === "mixed") && product) {
    const structure = assignedBenchmark?.slideStructure ?? []
    if (detectPostPattern(structure) === "comparison") {
      const multiCount = structure.filter(s =>
        /商品紹介[①②③④⑤⑥⑦⑧⑨⑩\d]|アイテム[①②③④⑤⑥⑦⑧⑨⑩\d]|製品[①②③④⑤\d]/.test(s.role)
      ).length
      const needed = multiCount > 0 ? Math.max(1, multiCount - 1) : competitorCount
      competitors = await dbPickCompetitors(needed, product.id).catch(() => [])
      console.log(`[contentPlan] day${planPost.day}: 競合商品 ${competitors.length}件取得 (needed=${needed})`)
    }
  }

  return generateV3Post({
    persona,
    postType: planPost.postType,
    product,
    types,
    benchmarkSamples,
    competitors,
    targetSlideCount,
    history,
  })
}

export async function generateAllText(
  plan: ContentPlan,
  persona: Persona,
  product: Product | null,
  benchmarkMap: BenchmarkMap,
  options: TextGenerationOptions = {},
): Promise<PlanPost[]> {
  const { competitorCount = 3 } = options

  // ペルソナ固有のベンチマーク一覧（型選択に使う）
  const allPersonaBenchmarks = await dbLoadBenchmarkPosts(persona.benchmarkAccount ?? undefined)

  // 過去30件のタイトル（DB履歴 → 被り防止プロンプト注入用）
  const recentPosts = await dbLoadRecentPostsByPersona(persona.id, 30).catch(() => [])
  const history = recentPosts.map(p => p.overallTitle)

  // ── フェーズ1: 全7投稿を並列生成 ──────────────────────────────
  const results = await Promise.allSettled(
    plan.posts.map(planPost => {
      const assignedBenchmark = benchmarkMap.get(planPost.benchmarkPostId)
      return generateOnePost(
        planPost, persona, product, allPersonaBenchmarks, assignedBenchmark, history, competitorCount,
      ).then(text => ({ planPost, text }))
    })
  )

  const firstPass: PlanPost[] = results.map((r, i) => {
    const planPost = plan.posts[i]
    if (r.status === "fulfilled" && r.value.text) {
      return { ...planPost, generatedText: r.value.text, status: "text_done" as const }
    }
    if (r.status === "rejected") {
      console.error(`[contentPlan] 並列生成失敗 day${planPost.day}:`, r.reason)
    }
    return planPost
  })

  // ── フェーズ2: AI被り判定QC（Haiku）→ 被りは1回再生成 ─────────
  // 週内で順番に見ていき、history + 確定済みタイトルと比較する
  const weekTitles: string[] = []
  const finalPosts = [...firstPass]

  for (let i = 0; i < finalPosts.length; i++) {
    const planPost = finalPosts[i]
    if (!planPost.generatedText?.overallTitle) continue

    const checkAgainst = [...history, ...weekTitles]
    const isDup = await isDuplicatePost(planPost.generatedText.overallTitle, checkAgainst)

    if (isDup) {
      console.log(`[contentPlan] QC被り検出 day${planPost.day}: "${planPost.generatedText.overallTitle}" → 再生成`)
      try {
        const assignedBenchmark = benchmarkMap.get(planPost.benchmarkPostId)
        // 再生成には確定済みタイトルも history として渡す（二重被りを防ぐ）
        const newText = await generateOnePost(
          planPost, persona, product, allPersonaBenchmarks, assignedBenchmark,
          checkAgainst, competitorCount,
        )
        if (newText) {
          finalPosts[i] = { ...planPost, generatedText: newText, status: "text_done" as const }
          weekTitles.push(newText.overallTitle)
          continue
        }
      } catch (e) {
        console.error(`[contentPlan] QC再生成失敗 day${planPost.day}:`, e)
      }
    }

    weekTitles.push(planPost.generatedText.overallTitle)
  }

  return finalPosts
}
