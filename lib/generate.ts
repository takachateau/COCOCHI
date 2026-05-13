/**
 * generate.ts — v2テキスト生成モジュール
 *
 * 設計原則:
 * - ベンチマーク slideStructure は「スライドの流れ・ロール」の参考のみ
 * - コンテンツ（何を言うか・どう語るか）はペルソナのcharacterTextから導く
 * - 投稿種別ごとにcharacterTextの参照セクションを変える
 *
 * - generateTipsPost()                美容tips投稿
 * - generatePersonaProductPost()      単品商品投稿（ペルソナ口調版）
 * - generateComparisonPost()          比較レビュー「〇〇選」投稿
 */

import Anthropic from "@anthropic-ai/sdk"
import { jsonrepair } from "jsonrepair"
import type { Persona, SlideRole, CompetitorProduct, GeneratedPostText } from "@/types/v2"
import type { Product } from "@/types"

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

// ─── 共通：JSON抽出ヘルパー ────────────────────

function extractJson<T>(text: string): T {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("JSONが取得できませんでした")
  // 制御文字を除去してから jsonrepair で修复（未エスケープ " やバックスラッシュ問題を一括対処）
  const raw = text.slice(start, end + 1).replace(/[\x00-\x1F\x7F\u2028\u2029]/g, " ")
  try {
    return JSON.parse(jsonrepair(raw)) as T
  } catch (e) {
    const pos = parseInt(String(e).match(/position (\d+)/)?.[1] ?? "0")
    console.error(`[extractJson] repair failed pos=${pos}: "${raw.slice(Math.max(0, pos - 40), pos + 40)}"`)  
    throw e
  }
}
// ─── 共通：ハッシュタグ上限強制（Claudeが超過する場合の後処理） ──
function limitHashtags(caption: string, max = 5): string {
  const pattern = /#[\w぀-ヿ㐀-鿿！-￯]+/g
  const tags = [...caption.matchAll(pattern)].map(m => m[0])
  if (tags.length <= max) return caption
  let result = caption
  for (const tag of tags.slice(max)) {
    result = result.replace(tag, "")
  }
  return result.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

// ─── 共通：スライド構成を「型として遵守」で提示 ──────────────

function structureAsMandatory(structure: SlideRole[]): string {
  if (structure.length === 0) {
    return "スライド数: 4〜5枚（フック→内容→まとめ→CTAの流れで作成）"
  }
  const lines = structure.map(s => `  スライド${s.slide}「${s.role}」: ${s.description}`)
  return `スライド数: 必ず${structure.length}枚\n${lines.join("\n")}`
}

// ─── 共通：テーマ軸を強制する指示文 ─────────────────────────

function themeEnforcementSection(themeAxis: string): string {
  return `【この投稿で扱うテーマ（絶対厳守）】
扱うテーマ: ${themeAxis}
- このテーマ軸のトピック以外は投稿内容に一切含めないこと
- ペルソナ情報に体重・kg・ダイエット数値・体型変化・痩せ・食事カロリー・リバウンドの記述があっても、投稿内容には絶対に反映しない
- テーマ軸に「スキンケア」「肌」「美容」系が含まれる場合、ダイエット・体重・食事・リバウンド系の話は一切しない
- 「垢抜け」との接続はこのテーマ内で自然に語ること（テーマを変えて接続しない）`
}

// ─── 共通：全投稿に通す大テーマ ──────────────────────────────

const BRAND_THEME = `【このアカウントの大テーマ】
すべての投稿は「垢抜け」という上位概念でつながっている。
スキンケア・メイク・美容習慣は「垢抜けるための手段」として語る。
商品（化粧品）は「垢抜けへの一手」として紹介する。
「きれいになりたい」ではなく「垢抜けた自分になりたい」という欲求に接続すること。

【1投稿1テーマ原則（必ず守ること）】
1つの投稿は1つのテーマで最初から最後まで一貫させること。
- overallTitleで設定したテーマ・切り口をすべてのスライドで保ち続ける
- 「食材・食事」の投稿中にスキンケアや化粧品の話を混ぜない
- 「スキンケア」の投稿中にダイエット・食事・体重の話を混ぜない
- 「垢抜け」との接続は、そのテーマの文脈の中で自然に語ること（テーマを変えて接続しない）
  ✓ 良い例（食材投稿）: 「この食材が腸を整えて肌に透明感が出た＝垢抜けた」
  ✗ 悪い例（食材投稿）: 途中のスライドで突然「スキンケア難民だった私が…」と話題転換`

// ─── 共通：characterTextから投稿種別に応じたセクションを抽出 ──

function extractPersonaContext(characterText: string, postType: "tips" | "product"): string {
  // 5次元構造テキストのセクションを抽出（旧3行形式にも対応）
  const hasStructure = characterText.includes("【キャラクター】")

  if (!hasStructure) {
    // 旧形式: そのまま全文使用
    return characterText
  }

  // 投稿種別ごとに使うセクションを変える
  const sections: Record<string, RegExp[]> = {
    tips:    [/【キャラクター】([\s\S]*?)(?=【|$)/, /【アカウントのミッション】([\s\S]*?)(?=【|$)/, /【口調・スタイル】([\s\S]*?)(?=【|$)/],
    product: [/【キャラクター】([\s\S]*?)(?=【|$)/, /【フォロワーへの価値】([\s\S]*?)(?=【|$)/, /【フォローされる理由】([\s\S]*?)(?=【|$)/, /【口調・スタイル】([\s\S]*?)(?=【|$)/],
  }

  const extracted = (sections[postType] ?? sections.tips)
    .map(re => {
      const m = characterText.match(re)
      return m ? m[0].trim() : null
    })
    .filter(Boolean)
    .join("\n\n")

  return extracted || characterText
}

// ─── 1. 日常系投稿 ────────────────────────────────────────────

// ─── 1. 美容tips投稿 ──────────────────────────────────────────

export async function generateTipsPost(
  persona: Persona,
  slideStructure: SlideRole[],
  usedTitles: string[] = [],
): Promise<GeneratedPostText> {
  const personaContext = extractPersonaContext(persona.characterText, "tips")
  const themeAxis = (persona.contentThemeTags?.length ? persona.contentThemeTags : persona.themeTags).join(" / ")

  const prompt = `あなたはSNSコンテンツのプロデューサーです。
以下のペルソナ（人物像）として、Lemon8の美容tipsカルーセル投稿のテキストを作成してください。

${BRAND_THEME}

${themeEnforcementSection(themeAxis)}

【ペルソナ情報】
${personaContext}

【スライド構成（必ず守ること）】
${structureAsMandatory(slideStructure)}
※ スライドの枚数・各スライドの役割は変えないこと。中身（言葉・体験・テーマ）はペルソナの専門性・体験から独自に作ること。ベンチマークの表現をそのまま使わないこと。

${usedTitles.length > 0 ? `【この週ですでに生成した投稿（テーマ・切り口が被らないこと）】\n${usedTitles.map(t => `- ${t}`).join("\n")}\n` : ""}【ルール】
- ペルソナの専門性・失敗談・試行錯誤から来るtipsを語る（読者が「これ知らなかった！」と感じる密度）
- tipsは「垢抜けるための知識・習慣」として位置づける
- 商品名は出してもOKだが主役にしない（あくまでtipsが主役）
- 読んで「保存したい」と思える情報密度にする
- 実際の20〜30代女性UGCクリエイター風の口語体
- tagは「\\ 〜！/」「✨〜✨」スタイルで15字以内
- headlineは最大30文字
- bulletsは各3〜4項目、各20字以内
- accentは20字以内

以下のJSON形式のみで返してください:
{
  "overall_title": "この投稿全体のタイトル（30字以内）",
  "caption": "Instagramキャプション（150〜200字・ハッシュタグ5個以内で末尾に）",
  "slides": [
    {
      "slide_number": 1,
      "tag": "\\\\ テキスト /",
      "headline": "見出しテキスト",
      "bullets": ["✔ 項目1", "✔ 項目2"],
      "accent": "印象的なフレーズ"
    }
  ]
}`

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const parsed = extractJson<{
    overall_title: string
    caption: string
    slides: Array<{ slide_number: number; tag: string; headline: string; bullets?: string[]; accent?: string }>
  }>(text)

  return {
    overallTitle: parsed.overall_title,
    caption: limitHashtags(parsed.caption),
    slides: parsed.slides.map(s => ({
      slideNumber: s.slide_number, tag: s.tag, headline: s.headline,
      bullets: s.bullets, accent: s.accent,
    })),
  }
}

// ─── 3. 単品商品投稿（ペルソナ口調版）────────────────────────

export async function generatePersonaProductPost(
  persona: Persona,
  product: Product,
  slideStructure: SlideRole[],
  usedTitles: string[] = [],
): Promise<GeneratedPostText> {
  const personaContext = extractPersonaContext(persona.characterText, "product")
  const themeAxis = (persona.contentThemeTags?.length ? persona.contentThemeTags : persona.themeTags).join(" / ")

  const prompt = `あなたはSNSコンテンツのプロデューサーです。
以下のペルソナ（人物像）として、この商品をLemon8で紹介するカルーセル投稿を作成してください。

${BRAND_THEME}

【ペルソナ情報】
${personaContext}

投稿テーマ軸: ${themeAxis}

【紹介する商品】
商品名: ${product.name}
価格: ${product.price ?? "未設定"}
成分・特徴: ${product.ingredients}
使い方: ${product.howToUse}
${product.appealPoints ? `アピールポイント: ${product.appealPoints}` : ""}
${product.forbiddenWords ? `使用禁止ワード: ${product.forbiddenWords}` : ""}

【スライド構成（必ず守ること）】
${structureAsMandatory(slideStructure)}
※ スライドの枚数・各スライドの役割は変えないこと。中身はペルソナの体験・価値観から独自に作ること。ベンチマークの表現をそのまま使わないこと。

${usedTitles.length > 0 ? `【この週ですでに生成した投稿（テーマ・切り口が被らないこと）】\n${usedTitles.map(t => `- ${t}`).join("\n")}\n` : ""}【ルール】
- 「垢抜けへの一手」としてこの化粧品を紹介する（単なる商品紹介にしない）
- ペルソナのキャラクター・バックストーリーと商品の相性が伝わる内容にする
- ペルソナの体験談として語る（「私が使ってみて〜」という視点）
- 実際の20〜30代女性UGCクリエイター風の口語体
- tagは「\\ 〜！/」「✨〜✨」スタイルで15字以内
- headlineは最大30文字
- bulletsは3〜4項目、各20字以内
- 2枚目のみ価格を記載

以下のJSON形式のみで返してください:
{
  "overall_title": "この投稿全体のタイトル（30字以内）",
  "caption": "Instagramキャプション（150〜200字・ハッシュタグ5個以内で末尾に）",
  "slides": [
    {
      "slide_number": 1,
      "tag": "\\\\ テキスト /",
      "headline": "見出しテキスト",
      "bullets": ["✔ 項目1", "✔ 項目2"],
      "price": "2枚目のみ記載",
      "accent": "印象的なフレーズ"
    }
  ]
}`

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const parsed = extractJson<{
    overall_title: string
    caption: string
    slides: Array<{ slide_number: number; tag: string; headline: string; bullets?: string[]; price?: string; accent?: string }>
  }>(text)

  return {
    overallTitle: parsed.overall_title,
    caption: limitHashtags(parsed.caption),
    slides: parsed.slides.map(s => ({
      slideNumber: s.slide_number, tag: s.tag, headline: s.headline,
      bullets: s.bullets, accent: s.accent,
    })),
  }
}

// ─── 4. 比較レビュー「〇〇選」投稿 ──────────────────────────

// スライドの種別 — ベンチマーク構造に対応したポジション管理用
export type ComparisonSlideType = "hook" | "overview" | "product" | "summary"

export interface ComparisonUnifiedSlide {
  slideNumber: number
  type: ComparisonSlideType
  tag: string
  headline: string
  bullets?: string[]
  accent?: string
  // product スライドのみ
  productName?: string
  brandName?: string
  price?: string | null
  pros?: string
  cons?: string
  verdict?: string
  isOwnProduct?: boolean
}

export interface ComparisonPostText {
  overallTitle: string
  caption: string
  slides: ComparisonUnifiedSlide[]
}

export async function generateComparisonPost(
  persona: Persona,
  ownProduct: Product,
  competitors: CompetitorProduct[],
  slideStructure: SlideRole[],
  benchmarkHookDescriptions?: string[], // バズっているベンチマーク投稿のフックスライド内容説明
): Promise<ComparisonPostText> {
  const personaContext = extractPersonaContext(persona.characterText, "product")
  const themeAxis = (persona.contentThemeTags?.length ? persona.contentThemeTags : persona.themeTags).join(" / ")
  const totalCount = competitors.length + 1

  // ベンチマーク構造の各スライドに「何を置くか」をマッピング
  let productIdx = 0
  const slideLines = slideStructure.map(s => {
    const isProductSlide = /商品紹介[①②③④⑤⑥⑦⑧⑨⑩\d]|アイテム[①②③④⑤⑥⑦⑧⑨⑩\d]|製品[①②③④⑤\d]/.test(s.role)

    if (isProductSlide) {
      if (productIdx < competitors.length) {
        const c = competitors[productIdx++]
        return `  スライド${s.slide}「${s.role}」→ [type: "product"] 競合${productIdx}「${c.brandName} ${c.productName}」 pros:${c.pros} / cons:${c.cons}`
      } else {
        productIdx++
        return `  スライド${s.slide}「${s.role}」→ [type: "product", is_own_product: true] 自社商品「${ownProduct.name}」最高評価`
      }
    }
    if (/フック|タイトル|表紙/.test(s.role) || s.slide === 1) {
      return `  スライド${s.slide}「${s.role}」→ [type: "hook"] ${totalCount}選のキャッチコピー・フック`
    }
    if (/商品一覧|一覧|まとめ一覧/.test(s.role)) {
      return `  スライド${s.slide}「${s.role}」→ [type: "overview"] 比較商品の一覧・概要（${s.description}）`
    }
    return `  スライド${s.slide}「${s.role}」→ [type: "summary"] まとめ・ランキング・CTA（${s.description}）`
  })

  const prompt = `あなたはSNSコンテンツのプロデューサーです。
以下のペルソナ（人物像）として、複数商品を比較する「${totalCount}選」形式のLemon8投稿テキストを作成してください。

${BRAND_THEME}

${themeEnforcementSection(themeAxis)}

【ペルソナ情報】
${personaContext}

【自社商品（最後の商品スライドに配置・最高評価）】
商品名: ${ownProduct.name}
価格: ${ownProduct.price ?? "未設定"}
特徴: ${ownProduct.ingredients}
アピールポイント: ${ownProduct.appealPoints ?? ""}

【比較する競合商品（各商品スライドでこの情報を必ず使う）】
${competitors.map((c, i) => `競合${i + 1}: ${c.brandName} ${c.productName} / 価格:${c.price ?? "不明"} / メリット:${c.pros} / デメリット:${c.cons}`).join("\n")}

【ベンチマーク投稿のスライド構成（このポジション通りに生成する）】
スライド数: 必ず${slideStructure.length}枚
${slideLines.join("\n")}

${benchmarkHookDescriptions && benchmarkHookDescriptions.length > 0 ? `【フックタイトルの参考：バズっているベンチマーク投稿の1枚目スライド】
${benchmarkHookDescriptions.map(d => `- ${d}`).join("\n")}

↑ type:"hook" のスライドの headline を生成するときは、上記ベンチマークをまず分析すること。
分析の観点：
1. 言語構造（「○選！」「○○が変わった！」「正直レビュー」「比較してみた」など）
2. 目を引く仕掛け（数字・感情訴求・問いかけ・意外性・緊迫感・共感）
3. テンポ感（短く一瞬で読める・でも気になって続きを見たくなる）
4. ターゲットの悩みへの直球度（「乾燥肌の人必見」より「ずっと乾燥肌だった私が変えた1本」の方が刺さる理由）

上記パターンを理解した上で、今回の商品・テーマに合わせた新しいフックタイトルを作ること。
ベンチマークをコピーしない・同じ言語的戦略で独自のタイトルを生成すること。
` : ""}【ルール】
- 競合商品のスライドには上記の実際の商品名・ブランド名・pros/consをそのまま使うこと
- ペルソナの口調で語る（「ずっと悩んでた私が実際に試した」系）
- 競合は正直に（良いところも悪いところも）→ 信頼感を出す
- 自社商品だけ明確に一番推す
- verdict は「★★★★☆ 〜」形式（ダブルクォートは使わない）

以下のJSON形式で全${slideStructure.length}枚のスライドを返してください:
{
  "overall_title": "${totalCount}選タイトル（25字以内）",
  "caption": "キャプション（150〜200字・ハッシュタグ5個以内で末尾に）",
  "slides": [
    {
      "slide_number": スライド番号（上記の構成通り）,
      "type": "hook" | "overview" | "product" | "summary",
      "tag": "\\\\ テキスト /",
      "headline": "見出し（30字以内）",
      "bullets": ["項目1", "項目2"],
      "accent": "強調フレーズ（任意）",
      "product_name": "商品名（typeがproductのみ）",
      "brand_name": "ブランド名（typeがproductのみ）",
      "price": "価格（typeがproductのみ）",
      "pros": "メリット1行（typeがproductのみ）",
      "cons": "デメリット1行（typeがproductのみ）",
      "verdict": "★★★☆☆ コスパ重視ならアリ",
      "is_own_product": false
    }
  ]
}`

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const parsed = extractJson<{
    overall_title: string
    caption: string
    slides: Array<{
      slide_number: number
      type: string
      tag: string
      headline: string
      bullets?: string[]
      accent?: string
      product_name?: string
      brand_name?: string
      price?: string | null
      pros?: string
      cons?: string
      verdict?: string
      is_own_product?: boolean
    }>
  }>(text)

  return {
    overallTitle: parsed.overall_title,
    caption: limitHashtags(parsed.caption),
    slides: parsed.slides.map(s => ({
      slideNumber: s.slide_number,
      type: (s.type ?? "summary") as ComparisonSlideType,
      tag: s.tag,
      headline: s.headline,
      bullets: s.bullets,
      accent: s.accent,
      productName: s.product_name,
      brandName: s.brand_name,
      price: s.price,
      pros: s.pros,
      cons: s.cons,
      verdict: s.verdict,
      isOwnProduct: s.is_own_product ?? false,
    })),
  }
}
