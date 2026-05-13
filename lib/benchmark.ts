/**
 * benchmark.ts — ベンチマーク投稿の登録・分析モジュール（v3: 3つの型分類対応）
 *
 * フロー:
 *   1. uploadSlidesToBlob()     — スライド画像をVercel Blobにアップロード → URL一覧を返す
 *   2. analyzeFromUrls()        — Claude VisionでURL一覧+caption から投稿を分析（3つの型を含む）
 *   3. uploadAndAnalyzePost()   — アップロード＋分析＋DB保存を一括実行（APIから呼ぶ）
 */

import Anthropic from "@anthropic-ai/sdk"
import { put } from "@vercel/blob"
import { dbSaveBenchmarkPost } from "@/lib/supabase"
import type {
  BenchmarkAnalysisResult,
  PostType,
  Tone,
  SlideRole,
  HookType,
  StructureType,
  CompositionType,
  PatternNotes,
} from "@/types/v2"

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

// 壊れた JSON を Haiku で修復するヘルパー（caption 内の生 " などのエスケープ漏れを救済）
async function repairJsonWithClaude(rawJson: string, errorMsg: string): Promise<string> {
  const res = await claude().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `以下は壊れた JSON です。valid JSON に修復してください。
よくある原因: 文字列値内の二重引用符 " がエスケープ漏れ（\\" にすべきところ素の " が入っている）。
内容（キー・値の意味）は変更せず、エスケープのみ直してください。

【エラー】 ${errorMsg}

【壊れた JSON】
${rawJson}

valid JSON のみを返答（前後の説明・コードブロック禁止）。`
    }]
  })
  const text = res.content[0].type === "text" ? res.content[0].text : ""
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1) {
    throw new Error("repair output has no JSON braces")
  }
  return text.slice(start, end + 1).replace(/[\r\n\t]/g, " ")
}

// ─── 1. Blobアップロード ─────────────────────────────────────

export async function uploadSlidesToBlob(
  accountName: string,
  postFolderName: string,
  files: File[],
): Promise<string[]> {
  const ts = Date.now()

  const urls = await Promise.all(
    files.map(async (file, index) => {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const ext = file.name.split(".").pop() ?? "jpg"
      const blobPath = `cocochi/v2/benchmark/${accountName}/${postFolderName}/slide_${String(index + 1).padStart(2, "0")}_${ts}.${ext}`

      const { url } = await put(blobPath, buffer, {
        access: "public",
        contentType: file.type || "image/jpeg",
        addRandomSuffix: false,
      })
      return url
    })
  )

  return urls
}

// ─── 2. Claude Visionによる分析（3つの型分類を含む） ────────────────

const HOOK_TYPES: HookType[]               = ["F1", "F2", "F3", "F4", "F5"]
const STRUCTURE_TYPES: StructureType[]     = ["S1", "S2", "S3", "S4", "S5"]
const COMPOSITION_TYPES: CompositionType[] = ["C1", "C2", "C3", "C4", "C5"]

function isHook(v: unknown): v is HookType                 { return typeof v === "string" && (HOOK_TYPES as string[]).includes(v) }
function isStructure(v: unknown): v is StructureType       { return typeof v === "string" && (STRUCTURE_TYPES as string[]).includes(v) }
function isComposition(v: unknown): v is CompositionType   { return typeof v === "string" && (COMPOSITION_TYPES as string[]).includes(v) }

export async function analyzeFromUrls(
  slideUrls: string[],
  caption: string | null,
): Promise<Omit<BenchmarkAnalysisResult, "folderPath" | "slideUrls" | "caption">> {
  if (slideUrls.length === 0) {
    throw new Error("スライドURLが1枚もありません")
  }

  const imageBlocks = slideUrls.map(url => ({
    type: "image" as const,
    source: {
      type: "url" as const,
      url,
    },
  }))

  const captionBlock = caption && caption.trim().length > 0
    ? `【元投稿キャプション】\n${caption.trim()}\n`
    : `【元投稿キャプション】（無し。画像内のテキストから内容を読み取ってください）\n`

  const prompt = `これはLemon8（SNS）の投稿です。${slideUrls.length}枚のスライドを順番に見て、以下を分析してください。

${captionBlock}

【分析項目】

1. post_type
   - "tips"    : 美容・スキンケアのノウハウ・情報系（商品スポットが全くない）
   - "product" : 商品レビュー・紹介・購買訴求（商品が主役）
   - "mixed"   : Tips主体だが1〜2スライドで特定商品（単品）が自然に登場するハイブリッド型。例: スキンケアstepsを紹介しながら、途中スライドで「このステップではXを使っています」と1商品を紹介する投稿。商品比較・複数商品紹介は含まない。

2. tone
   - "emotional"    : 感情・体験・ストーリー中心
   - "informative"  : 情報・成分・ノウハウ中心
   - "review"       : レビュー・ビフォーアフター・正直感
   - "entertainment": エンタメ・バズ狙い・フック重視

3. theme_tags（投稿テーマのキーワード、3〜5個）

4. slide_structure（各スライドの役割: role + description）

─── ここから3つの型分類（重要） ───

【出力フォーマット厳守】
hook_main, structure_type, composition_type の値は **記号のみ** を返してください。
- ✅ OK:  "S1"
- ❌ NG:  "S1のフル装備アーク" / "S1（フル装備）" / "structure_S1"
hook_subs も配列内は記号のみ: ["F2"] / ["F2", "F3"]

【JSON出力ルール】
- 出力は valid JSON のみ。前後に説明・コードブロック・コメント禁止
- 文字列値の中で二重引用符 " を使う場合は **必ず** \\" にエスケープすること
- 例: ❌ "hook_reason": "「肌を壊さない」習慣"  ✅ "hook_reason": "「肌を壊さない」習慣" （日本語の鉤括弧を使う）
- pattern_notes 内の文字列に改行は入れない（1行で書く）
- 出力前に「これは valid JSON か」を確認してから出すこと

【最重要ルール: 自己同一化フック原理】
あなたが選ぶ型は、必ず「肌・垢抜け・モテ・スキンケア」のジャンルでも言い換え可能な完全抽象でなければなりません。
表面の文言（"-11kg" "韓国女子" "ダイエット"）に依存せず、その裏にある心理メカニズムや構造を見てください。

5. hook_main（心理フック型・1つ・必須）
   1枚目（フック）が「なぜ読み手のスクロールを止めるか」の心理メカニズムを1つ選ぶ:
   - "F1": 証拠付き自己同一化 — 数字・写真・実績で「この人になりたい」を喚起する。例: -11kg / 1ヶ月で別人 / 爆美女
   - "F2": 数字n選 — 数えられる・保存しやすい。例: 7選 / 12選 / 3つのこと
   - "F3": 逆張り・常識破壊 — 想定と逆を提示。例: 逆に〜する / これをやめると〜 / 勘違いしてること
   - "F4": 危機煽り（NG型）— 避けるべき物を提示し恐怖を作る。例: 突然〜なるNG / やってはいけない
   - "F5": 即効・誇張ベネフィット — 強い造語・即効性で訴求。例: 秒で〜 / 〜激盛れ / 〜の治安守る / 美容医療レベル

6. hook_subs（心理フック型・補助・最大2個・空配列も可）
   メイン以外で副次的に効いているフック型（メインと同じ型は除外）。F1〜F5のサブセット。

7. structure_type（投稿構造型・1つ・必須）
   1枚目から最後までの「物語のアーク」を1つ選ぶ:
   - "S1": フル装備型 — フック→導入→tipsシリーズ→CTA→プロフィール訴求（6〜8枚・ストーリー込み）
   - "S2": 最短型 — フック→tipsシリーズ→CTA（4〜5枚・素早く読める）
   - "S3": 共感型 — フック→共感（自己開示・寄り添い）→ノウハウ→マインド締め（情緒系）
   - "S4": カタログ型 — フック→商品紹介列（n商品）→CTA（商品レビュー特化、8枚以上が多い）
   - "S5": 証拠先導型 — フック=ビフォーアフター→ステップ→一推し（ビジュアル証拠を冒頭）

8. composition_type（構図/レイアウト型・1つ・必須）
   各スライドの絵作り・見た目の主軸を1つ選ぶ:
   - "C1": テキスト主体 — 白背景・大きい文字・余白多・テキストが主役
   - "C2": 写真メイン — 人物・商品の写真が主役、テキストは控えめ
   - "C3": 表・リスト — 表形式・色分けされたリスト・情報密度高
   - "C4": ビフォーアフター — 左右 or 上下比較・矢印付き・変化を視覚化
   - "C5": ムード重視 — パステル・統一感・洗練・余白美・世界観優先

9. pattern_notes（各型の判定理由・必ず汎用表現で）
   - hook_reason: なぜそのフック型を選んだか（短く1文・痩せ依存しない汎用表現）
   - structure_reason: なぜその構造型か（短く1文）
   - composition_reason: なぜその構図型か（短く1文）
   - abstraction_check: 自己同一化フック原理セルフチェック — 選んだ型は肌・垢抜け・モテ系でも言い換え可能か？短く1文で答える

【出力形式】 JSONのみ（説明や前置きは不要）:
{
  "post_type": "tips または product または mixed",
  "tone": "informative",
  "theme_tags": ["..."],
  "slide_structure": [{"slide": 1, "role": "フック", "description": "..."}],
  "hook_main": "F1",
  "hook_subs": ["F2"],
  "structure_type": "S1",
  "composition_type": "C4",
  "pattern_notes": {
    "hook_reason": "...",
    "structure_reason": "...",
    "composition_reason": "...",
    "abstraction_check": "..."
  }
}`

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [...imageBlocks, { type: "text", text: prompt }],
    }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const jsonStart = text.indexOf("{")
  const jsonEnd = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("分析結果のJSONが取得できませんでした")
  }

  // 文字列値の中に紛れ込んだ改行・制御文字をスペースに置換してからパース
  const rawJson = text.slice(jsonStart, jsonEnd + 1).replace(/[\r\n\t]/g, " ")

  // 安全パース: 1次パース失敗 → Claude Haiku で JSON 修復リトライ → それでも失敗なら諦める
  let parsedAny: unknown
  try {
    parsedAny = JSON.parse(rawJson)
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
    console.warn("[analyzeFromUrls] 1st JSON parse failed, retrying with Haiku repair:", firstMsg)
    try {
      const repaired = await repairJsonWithClaude(rawJson, firstMsg)
      parsedAny = JSON.parse(repaired)
      console.log("[analyzeFromUrls] JSON repair succeeded")
    } catch (repairErr) {
      const repairMsg = repairErr instanceof Error ? repairErr.message : String(repairErr)
      console.error("[analyzeFromUrls] JSON repair also failed:", repairMsg)
      console.error("[analyzeFromUrls] Original raw (first 1000 chars):", rawJson.slice(0, 1000))
      const posMatch = firstMsg.match(/position (\d+)/)
      const pos = posMatch ? parseInt(posMatch[1], 10) : 0
      const around = rawJson.slice(Math.max(0, pos - 80), Math.min(rawJson.length, pos + 80))
      throw new Error(`JSON parse failed even after Haiku repair. Original: ${firstMsg}. Around: ...${around}...`)
    }
  }
  type RawAnalysis = {
    post_type: PostType
    tone: Tone
    theme_tags: string[]
    slide_structure: SlideRole[]
    hook_main?: string
    hook_subs?: string[]
    structure_type?: string
    composition_type?: string
    pattern_notes?: {
      hook_reason?: string
      structure_reason?: string
      composition_reason?: string
      abstraction_check?: string
    }
  }
  const parsed = parsedAny as RawAnalysis

  // 3つの型は AI が誤った値を返した場合に null にフォールバックする（DBのCHECK制約違反を避ける）
  const hookMain        = isHook(parsed.hook_main)               ? parsed.hook_main        : null
  const hookSubs        = (parsed.hook_subs ?? []).filter(isHook).filter(h => h !== hookMain).slice(0, 2)
  const structureType   = isStructure(parsed.structure_type)     ? parsed.structure_type   : null
  const compositionType = isComposition(parsed.composition_type) ? parsed.composition_type : null

  const patternNotes: PatternNotes | null = parsed.pattern_notes
    ? {
        hookReason:        parsed.pattern_notes.hook_reason        ?? "",
        structureReason:   parsed.pattern_notes.structure_reason   ?? "",
        compositionReason: parsed.pattern_notes.composition_reason ?? "",
        abstractionCheck:  parsed.pattern_notes.abstraction_check  ?? "",
      }
    : null

  return {
    slideCount:      slideUrls.length,
    slideStructure:  parsed.slide_structure,
    postType:        parsed.post_type,
    themeTags:       parsed.theme_tags,
    tone:            parsed.tone,
    hookMain,
    hookSubs,
    structureType,
    compositionType,
    patternNotes,
  }
}

// ─── 3. アップロード＋分析＋DB保存を一括実行 ─────────────────

export async function uploadAndAnalyzePost(params: {
  accountName: string
  postFolderName: string
  files: File[]
  caption: string | null
}): Promise<BenchmarkAnalysisResult> {
  const { accountName, postFolderName, files, caption } = params
  const folderPath = `${accountName}/${postFolderName}`

  // 1. Blobにアップロード
  const slideUrls = await uploadSlidesToBlob(accountName, postFolderName, files)

  // 2. Claude Visionで分析（3つの型を含む）
  const analysis = await analyzeFromUrls(slideUrls, caption)

  // 3. DBに保存
  await dbSaveBenchmarkPost({
    accountName,
    folderPath,
    slideUrls,
    caption,
    slideStyleDescs: null,  // 画像生成時に初回分析してキャッシュされる
    isHidden: false,
    ...analysis,
  })

  return {
    folderPath,
    slideUrls,
    caption,
    ...analysis,
  }
}
