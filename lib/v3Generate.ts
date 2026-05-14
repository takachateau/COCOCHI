/**
 * v3Generate.ts — v3 生成エンジン
 *
 * 設計:
 *   - ペルソナ × 3つの型 × 商品 で投稿テキストを生成する
 *   - ベンチマーク投稿の specific 行は使わない（型分布だけ参照）
 *   - 自己同一化フック原理: 痩せ依存しない anetos 文脈に置換
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  Persona,
  BenchmarkPost,
  SlideRole,
  HookType,
  StructureType,
  CompositionType,
  PostType,
  GeneratedPostText,
  GeneratedSlide,
  CompetitorProduct,
} from "@/types/v2"
import type { Product } from "@/types"

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

// ─── 3つの型の説明（生成プロンプトに渡す） ───

const HOOK_DESCRIPTIONS: Record<HookType, string> = {
  F1: "証拠付き自己同一化（数字・写真・実績で『この人になりたい』を喚起）",
  F2: "数字n選（数えられる・保存しやすい）",
  F3: "逆張り・常識破壊（想定と逆を提示）",
  F4: "危機煽りNG型（避けるべきものを提示し恐怖喚起）",
  F5: "即効・誇張ベネフィット（強い造語・即効性で訴求）",
}

const STRUCTURE_DESCRIPTIONS: Record<StructureType, string> = {
  S1: "フル装備型（フック→導入→tipsシリーズ→CTA→プロフィール訴求・6〜8枚）",
  S2: "最短型（フック→tipsシリーズ→CTA・4〜5枚）",
  S3: "共感型（フック→共感→ノウハウ→マインド締め・情緒系）",
  S4: "カタログ型（フック→商品紹介列→CTA・8枚以上）",
  S5: "証拠先導型（フック=ビフォーアフター→ステップ→一推し・5〜7枚）",
}

// refSlideStructure がある時（枚数が外部から固定される時）に使うバージョン — 枚数範囲を除去
const STRUCTURE_DESCRIPTIONS_NOCOUNT: Record<StructureType, string> = {
  S1: "フル装備型（フック→導入→tipsシリーズ→CTA→プロフィール訴求）",
  S2: "最短型（フック→tipsシリーズ→CTA）",
  S3: "共感型（フック→共感→ノウハウ→マインド締め・情緒系）",
  S4: "カタログ型（フック→商品紹介列→CTA）",
  S5: "証拠先導型（フック=ビフォーアフター→ステップ→一推し）",
}

const COMPOSITION_DESCRIPTIONS: Record<CompositionType, string> = {
  C1: "テキスト主体（白背景・大文字・余白多）",
  C2: "写真メイン（人物・商品中心、テキスト控えめ）",
  C3: "表・リスト（表形式・色分け・情報密度高）",
  C4: "ビフォーアフター（左右比較・矢印付き）",
  C5: "ムード重視（パステル・統一感・洗練・余白美）",
}

// ─── 型選択（ペルソナのbenchmark由来分布 + emphasis） ───

export function selectTypeCombination(
  persona: Persona,
  benchmarkPosts: BenchmarkPost[],
  postType: PostType,
): { hookType: HookType; structureType: StructureType; compositionType: CompositionType } {
  const analyzed = (p: BenchmarkPost) => p.hookMain && p.structureType && p.compositionType

  // mixed は mixed+tips の両方を参照（tips構造を持つため）
  const targetTypes = postType === "mixed" ? ["mixed", "tips"] : [postType]
  const targetPosts = benchmarkPosts.filter(p => targetTypes.includes(p.postType) && analyzed(p))

  // フォールバック: postType 無視で全件
  const allAnalyzed = benchmarkPosts.filter(analyzed)
  const pool = targetPosts.length > 0 ? targetPosts : allAnalyzed
  if (pool.length === 0) {
    throw new Error(`ベンチマーク投稿に分析済みのものがありません`)
  }
  return weightedPick(pool, persona.typeEmphasis)
}

function weightedPick(
  posts: BenchmarkPost[],
  emphasis: Persona["typeEmphasis"],
): { hookType: HookType; structureType: StructureType; compositionType: CompositionType } {
  const hookCounts:   Record<string, number> = {}
  const structCounts: Record<string, number> = {}
  const compCounts:   Record<string, number> = {}
  for (const p of posts) {
    if (p.hookMain)        hookCounts[p.hookMain]         = (hookCounts[p.hookMain]         ?? 0) + 1
    if (p.structureType)   structCounts[p.structureType]  = (structCounts[p.structureType]  ?? 0) + 1
    if (p.compositionType) compCounts[p.compositionType]  = (compCounts[p.compositionType]  ?? 0) + 1
  }

  function applyEmphasis(counts: Record<string, number>, e?: Record<string, number>): Record<string, number> {
    if (!e) return counts
    const adjusted = { ...counts }
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === "number" && k in adjusted) adjusted[k] *= v
    }
    return adjusted
  }

  const hAdj = applyEmphasis(hookCounts,   emphasis?.hooks        as Record<string, number> | undefined)
  const sAdj = applyEmphasis(structCounts, emphasis?.structures   as Record<string, number> | undefined)
  const cAdj = applyEmphasis(compCounts,   emphasis?.compositions as Record<string, number> | undefined)

  function pick(adj: Record<string, number>): string {
    const keys = Object.keys(adj)
    if (keys.length === 0) throw new Error("型分布が空")
    const total = Object.values(adj).reduce((s, n) => s + n, 0)
    if (total === 0) return keys[Math.floor(Math.random() * keys.length)]
    let r = Math.random() * total
    for (const k of keys) {
      r -= adj[k]
      if (r <= 0) return k
    }
    return keys[0]
  }

  return {
    hookType:        pick(hAdj) as HookType,
    structureType:   pick(sAdj) as StructureType,
    compositionType: pick(cAdj) as CompositionType,
  }
}

// ─── 被り判定（Haiku）── ──────────────────────────────────────────

export async function isDuplicatePost(
  newTitle: string,
  history: string[],
): Promise<boolean> {
  if (history.length === 0) return false
  const res = await claude().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    messages: [{
      role: "user",
      content: `投稿タイトルの被り判定をしてください。

【新しいタイトル】
${newTitle}

【直近の投稿タイトル】
${history.slice(0, 30).map(t => `- ${t}`).join("\n")}

判定基準: 主題（テーマ × ベネフィット × 数字）が同じ/似すぎていれば被り。言い回しが違っても実質同じならYES。

YES または NO のみ回答:`,
    }],
  })
  const answer = res.content[0].type === "text" ? res.content[0].text.trim().toUpperCase() : "NO"
  return answer.startsWith("YES")
}

// ─── 投稿生成 ───

export async function generateV3Post(params: {
  persona: Persona
  postType: PostType
  product: Product | null
  types: { hookType: HookType; structureType: StructureType; compositionType: CompositionType }
  benchmarkSamples?: BenchmarkPost[]   // 同種別のベンチマーク投稿サンプル（構造を学ぶ）
  competitors?: CompetitorProduct[]    // product時の競合商品（比較型ベンチマークなら使う）
  targetSlideCount?: number            // ベンチマークの実際の枚数（必須厳守）
  refSlideStructure?: SlideRole[]      // 選定ベンチマークのスライド構造（商品/非商品スロットを正確に配置するため）
  history?: string[]                   // 過去投稿タイトル一覧（被り防止プロンプト注入用）
}): Promise<GeneratedPostText> {
  const { persona, postType, product, types, benchmarkSamples, competitors, targetSlideCount, refSlideStructure, history } = params

  const hasCompetitors = !!(competitors && competitors.length > 0)

  const productBlock = (postType === "product" || postType === "mixed") && product
    ? postType === "mixed"
      ? `\n【自然に登場させる商品（tips構造の流れの中で1〜2スライド）】
- 商品名: ${product.name}
- 価格: ${product.price ?? "?"}
- 特徴・成分: ${product.ingredients ?? ""}
- 使い方: ${product.howToUse ?? ""}
${product.forbiddenWords ? `- 禁止ワード: ${product.forbiddenWords}` : ""}
⚠ この商品を主役にしない。tipsの文脈で「このステップではこれを使っている」「ここでおすすめなのがこれ」のように自然に1〜2スライドで登場させること。
`
      : `\n【自社商品（必ず独立したスライドとして登場させる — 競合比較投稿では特に厳守）】
- 商品名: ${product.name}
- 価格: ${product.price ?? "?"}
- 特徴・成分: ${product.ingredients ?? ""}
- 訴求ポイント: ${product.appealPoints ?? ""}
- 使い方: ${product.howToUse ?? ""}
${product.forbiddenWords ? `- 禁止ワード: ${product.forbiddenWords}` : ""}
${hasCompetitors ? `⚠ 競合比較投稿では: 競合商品スライドの最後（CTAの直前）に、必ずこの商品の独立スライドを1枚生成すること。
  headline = "〇つ目 | ${product.name}${product.price ? ` ¥${product.price}` : ""}" の形式で。
  bullets には訴求ポイント・特徴を書く。このスライドを省略した出力はルール違反。` : ""}
`
    : ""

  const competitorsBlock = (postType === "product" || postType === "mixed") && competitors && competitors.length > 0
    ? `\n【利用可能な競合商品（${competitors.length}件・実名でスライドに登場させる）】
${competitors.map((c, i) => `[C${i + 1}] ${c.brandName} / ${c.productName} / ${c.price ?? "?"}\n     特徴: ${(c.features ?? "").slice(0, 100)}\n     メリット: ${(c.pros ?? "").slice(0, 80)}\n     デメリット: ${(c.cons ?? "").slice(0, 80)}`).join("\n")}

⚠ ★ 商品比較・選定投稿の絶対ルール（postType=product/mixed で競合商品リストがある場合は必ず守る）:
  - **1スライド = 1商品紹介** が絶対原則。**複数商品を1スライドに詰め込むのは絶対禁止**。
  - 商品スライドの headline には **1商品の実名（ブランド名+商品名）と価格** を必ず書く（例: "SKIN1004 ヒアルーシカ サンセラム ¥2,700"）
  - 商品名は上のリスト [C1]〜[C${competitors.length}] から **そのままコピー** して使う（自分で言い換えない・短縮しない）
  - 各商品スライドの bullets には: 特徴2〜3個・メリット・デメリット を上のリストから引用して書く（各要素は番号・記号・ダッシュなし、プレーンテキストのみ）
  - **複数商品リスト・順位一覧・カタログ的な総覧スライドは作らない**（例: "10位 X / 9位 Y / 8位 Z..." を1スライドに並べるのは絶対NG）

⚠ ★ ランキング形式は絶対に使わない（最重要ルール）:
  - "1位" "2位" "3位" "TOP〇" "第〇位" など **順位を付ける表現は全て禁止**
  - 商品スライドには順位の代わりに "1つ目" "2つ目" "3つ目" のような **順序表現** を使う
    例: headline = "1つ目 | SKIN1004 ヒアルーシカ サンセラム ¥2,700"
  - フックの headline も "〇選ランキング" "ベストランキング" ではなく「7本全部試した」「全部使い比べた」などの **体験ベース表現** にする
  - **商品スライドの順番: 競合${competitors?.length ?? "N"}枚 → 自社商品(anetos)1枚 → CTA**
    - 自社商品スライドは競合スライドの「次の番号」を付けて最後の商品スライドに配置する
    - CTA（最終スライド）は締めであり、自社商品の紹介はCTA前の自社スライドで済ませておくこと

  - **最終スライド（CTA）は「全部試した結論」型の締め**:
    - headline = "全部試した結論" や "使い比べた結果" などの締め表現
    - bullets に自社商品を選ぶ決め手を2〜3個
    - accent = 自社商品名 + "一択" （例: "アネトス一択"）

⚠ ★ タイトルの数字と商品スライド数は **完全に一致** させる:
  - "ベスト5" "5選" "TOP5" を書くなら → 商品スライドを ちょうど5枚 作る（合計: 1 フック + 5 商品 + 1 CTA = 7枚）
  - "10選" を書くなら → 商品スライドを ちょうど10枚 作る（合計: 12枚）
  - 数字を入れない選択も可: "厳選アイテム" "私の定番" など（その場合 3〜5枚の商品スライドで自由）
  - **タイトルに書いた数 と 実際の商品スライド数 が違うのは絶対NG**

⚠ **ベンチマークサンプルにない種類のスライドを勝手に作らない**:
  - 例: 商品ごとの比較まとめ表・ASCII罫線で書いた比較表 などはサンプルに存在しない → 作らない
  - 構成は **フック → 各商品スライド（1個ずつ） → CTA** の順序で
`
    : ""

  const historyBlock = history && history.length > 0
    ? `\n【直近の生成済み投稿（被り防止: これと同じ/似すぎたテーマは避けること）】
${history.slice(0, 30).map(t => `- ${t}`).join("\n")}
⚠ 上記と主題・構成・数字が被る投稿は生成しない（言い回しが違っても実質同じならNG）。
`
    : ""

  const benchmarkBlock = benchmarkSamples && benchmarkSamples.length > 0
    ? `\n【ベンチマーク投稿の実際の構造サンプル（このペルソナの源泉アカウントの ${postType === "mixed" ? "mixed/tips" : postType} 投稿。構造をそのまま参考にする）】
${benchmarkSamples.slice(0, 3).map((s, i) => `
サンプル${i + 1}（${s.folderPath}・${s.slideCount}枚・hook=${s.hookMain ?? "?"}・struct=${s.structureType ?? "?"}）:
${(s.slideStructure ?? []).map(sl => `  ${sl.slide}. [${sl.role}]`).join("\n")}
`).join("\n")}

⚠ ベンチマーク駆動原則:
  - サンプルの slideStructure を観察して、そのままの構成パターンで生成する
  - **assistantの固定観念で型を決めない**。サンプルを実際に見て真似る。
  - postType=product/mixed かつ競合商品リストがある場合のみ: 比較型構成を使う（自社+競合を実名で並べる）
  - postType=tips の場合: スキンケアの知識・体験・コツのみで構成する（商品名・ブランド名を勝手に作らない）
`
    : ""

  const prompt = `Lemon8 投稿のテキストを生成してください。

【ペルソナ】
- 名前: ${persona.name}
- ベンチマーク（性格・作り方の源泉）: ${persona.benchmarkAccount}
- キャラクター・ミッション・口調・世界観:
${persona.characterText}
- テーマ: ${persona.themeTags.join(", ")}

【投稿種別】 ${postType}
${historyBlock}${productBlock}${competitorsBlock}${benchmarkBlock}

【3つの型指定（このパターンで作る）】
- 心理フック型 ${types.hookType}: ${HOOK_DESCRIPTIONS[types.hookType]}
- 投稿構造型   ${types.structureType}: ${refSlideStructure && refSlideStructure.length > 0 ? STRUCTURE_DESCRIPTIONS_NOCOUNT[types.structureType] : STRUCTURE_DESCRIPTIONS[types.structureType]}
- 構図/レイアウト型 ${types.compositionType}: ${COMPOSITION_DESCRIPTIONS[types.compositionType]}

【最重要ルール: 自己同一化フック原理】
ペルソナのベンチマークが「韓ドル習慣」（痩せ系）でも、**痩せ系の表面要素は絶対使わない**。
- ❌ -11kg / 韓国アイドル体型 / kg / カロリー / ダイエット数値
- ✅ 肌・スキンケア・垢抜け・モテ・美肌・敏感肌・保湿 文脈に完全置換
- 数字を使うなら「肌革命1ヶ月」「3つの肌習慣」「12選」のような肌・美容文脈に

3つの型は **構造・心理メカニズムの再現** のために使う（表面の文言は anetos 文脈で書く）。

${postType === "tips" ? `【TIPS投稿の絶対禁止ルール】
- 商品名・ブランド名・製品名を一切使わない（架空の商品を作らない・存在しない商品名を使わない）
- 構造型が S4（カタログ型）でも「商品リスト」ではなく「スキンケアtipsリスト」として構成すること
- すべてペルソナの体験・知識・ルーティン・コツとして書く（「○○クリームがおすすめ」はNG）
` : ""}${postType === "mixed" ? `【mixed投稿（Tips+商品スポット）の特別ルール】
- 投稿全体の8割はtips内容（スキンケアの知識・ルーティン・コツ）で構成すること
- 残り2割（1〜2スライド）で商品を自然に登場させる
- 商品スライドは「このステップには〇〇が最高」「私が今使っているのはこれ」という自然な文脈で
- 商品紹介っぽくしない。あくまでtipsの延長線上に商品が存在する
` : ""}

【ツールの目的】
リアルに見えるペルソナアカウントの自然な投稿を作る。商品紹介ですら「ペルソナの自然な推奨」として書く（広告色は出さない）。

【スライド1（フック）の特別ルール】
ベンチマーク投稿のフックスライドは **ほぼ必ず「短く強いタイトルのみ」** で構成されています（雑誌の表紙のように）。
- ❌ NG: フックに bullets / accent / 補足説明をつける（情報量が多すぎる）
- ✅ OK: headline 1〜2行（合計 8〜20文字目安）の強い表現のみ。bullets は **空配列**、accent は **空文字**

${refSlideStructure && refSlideStructure.length > 0 ? `【スライド構成テンプレート（完全固定・最重要）】
ベンチマーク投稿の構成をそのままコピーします。
以下の slide_number・tag・枚数は **絶対に変更しない**。headline・bullets・accent の「内容」だけを生成すること。
1スライドも増やさず・減らさず・並び替えず、テンプレート通りに出力する。

${refSlideStructure.map(s => `  ${s.slide}枚目: tag="${s.role}"`).join("\n")}

合計 ${refSlideStructure.length} 枚固定（${refSlideStructure.length}枚以外はルール違反）。
` : ""}
【出力フォーマット】
JSONのみ（前後に説明・コードブロック禁止）:
{
  "overall_title": "投稿全体の魅力的な一行タイトル",
  "slides": [
${refSlideStructure && refSlideStructure.length > 0
  ? refSlideStructure.map((s, i) => {
      const isHook = s.role.includes("フック") || s.slide === 1
      const entry = `    {"slide_number": ${s.slide}, "tag": "${s.role}", "headline": "★${s.role}のheadlineを書く★", "bullets": ${isHook ? "[]" : '["内容1", "内容2"]'}, "accent": "${isHook ? "" : "強調ワード"}"}`
      return i < refSlideStructure.length - 1 ? entry + "," : entry
    }).join("\n")
  : `    {"slide_number": 1, "tag": "フック", "headline": "1〜2行の強いタイトル", "bullets": [], "accent": ""},
    {"slide_number": 2, "tag": "...", "headline": "...", "bullets": ["短い説明1", "短い説明2"], "accent": "強調ワード"}`
}
  ],
  "caption": "Lemon8キャプション原文（150〜400文字・自然な口調・絵文字使用OK・改行は\\nでエスケープ）"
}

⚠ bullets の絶対ルール: 各要素の先頭に番号（1. 2. 3.）・記号（・ー- *）を付けない。プレーンテキストのみ。
${refSlideStructure && refSlideStructure.length > 0
  ? `⚠ slide_number と tag はテンプレートから変更禁止。上記JSON出力の slide_number・tag を一字一句そのまま出力すること。`
  : `${targetSlideCount
      ? `【スライド枚数（絶対厳守）】${targetSlideCount}枚ちょうど。1枚でも多くても少なくてもNG。${
          (postType === "product" || postType === "mixed") && competitors && competitors.length > 0
            ? `\n- 内訳（厳守）: フック1枚 + 競合商品${competitors.length}枚 + 自社商品(anetos)1枚 + CTA1枚 = ${targetSlideCount}枚\n- 順番: フック → 競合[1〜${competitors.length}] → 自社(anetos)[${competitors.length + 1}つ目] → CTA`
            : ""
        }`
      : `スライド枚数の目安:
- S1 フル装備: 6〜8枚
- S2 最短: 4〜5枚
- S3 共感型: 5〜6枚
- S4 カタログ: 7〜9枚
- S5 証拠先導: 5〜7枚`
    }`
}

【JSON出力ルール】
- 文字列値内の二重引用符 " は \\" にエスケープ
- 改行は \\n にエスケープ
- 出力前に valid JSON か確認すること`

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const claudeUsage: Array<{ inputTokens: number; outputTokens: number; model: "sonnet" | "haiku" }> = [
    { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: "sonnet" },
  ]

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const jsonStart = text.indexOf("{")
  const jsonEnd   = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("生成結果のJSONが取得できませんでした")
  }

  const rawJson = text.slice(jsonStart, jsonEnd + 1).replace(/[\r\n\t]/g, " ")

  // パース失敗時は Haiku で修復リトライ
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
    console.warn("[generateV3Post] JSON parse failed, retrying with Haiku repair:", firstMsg)
    const fixed = await claude().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `以下の壊れた JSON を valid JSON に修復してください。
よくある原因: 文字列値内の " のエスケープ漏れ。
内容は変更せずエスケープのみ直してください。

【エラー】 ${firstMsg}

【壊れた JSON】
${rawJson}

valid JSON のみ返答（前後の説明禁止）`,
      }],
    })
    claudeUsage.push({ inputTokens: fixed.usage.input_tokens, outputTokens: fixed.usage.output_tokens, model: "haiku" })
    const fixedText = fixed.content[0].type === "text" ? fixed.content[0].text : ""
    const fStart = fixedText.indexOf("{")
    const fEnd   = fixedText.lastIndexOf("}")
    if (fStart === -1 || fEnd === -1) throw new Error("JSON修復に失敗")
    parsed = JSON.parse(fixedText.slice(fStart, fEnd + 1).replace(/[\r\n\t]/g, " "))
  }

  type RawText = {
    overall_title: string
    slides: Array<{ slide_number: number; tag: string; headline: string; bullets?: string[]; accent?: string }>
    caption: string
  }
  const r = parsed as RawText

  const stripBulletPrefix = (text: string) =>
    text.replace(/^\s*(?:\d+[.)、]\s*|[-・ー*]\s+)/, "").trim()

  const slides: GeneratedSlide[] = r.slides.map(s => ({
    slideNumber: s.slide_number,
    tag:         s.tag,
    headline:    s.headline,
    bullets:     s.bullets?.map(stripBulletPrefix),
    accent:      s.accent,
  }))

  return {
    overallTitle: r.overall_title,
    slides,
    caption:      r.caption,
    claudeUsage,
  }
}
