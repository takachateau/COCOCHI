/**
 * referenceV2.ts — v2用参照画像モジュール（Blob URL対応版）
 *
 * v1はファイルシステムから画像を読んでいたが、
 * v2はDBに保存されたVercel BlobのURLから直接取得する。
 *
 * フロー:
 *   1. mapV2SlidesToRefUrls()   — Claude VisionでスライドとURL一覧をマッピング
 *   2. describeV2StyleFromUrl() — 1枚目URLからFALプロンプト用スタイル説明を生成
 */

import Anthropic from "@anthropic-ai/sdk"
import type { SlideInfo } from "@/lib/reference"

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

// ─── 1. スライド→参照URL マッピング ─────────────────────────

export interface V2RefMapping {
  thumbnailUrl: string             // 1枚目のURL（スライド1の参照として使う）
  slideUrlMap: Record<number, string>  // slideNumber → 参照URL
  styleDescription: string
}

/**
 * Claude VisionでベンチマークのURL一覧と生成スライドをマッピングし、
 * 各出力スライドに最適な参照URLを割り当てる
 */
export async function mapV2SlidesToRefUrls(
  slideUrls: string[],    // ベンチマーク投稿のURL一覧（DBのslide_urls）
  slides: SlideInfo[],    // 生成するスライドの内容一覧
): Promise<V2RefMapping> {
  const thumbnailUrl = slideUrls[0] ?? ""
  const styleDescription = await describeV2StyleFromUrl(thumbnailUrl)

  if (slideUrls.length === 0) {
    return { thumbnailUrl: "", slideUrlMap: {}, styleDescription: "" }
  }

  if (slideUrls.length === 1) {
    return {
      thumbnailUrl,
      slideUrlMap: Object.fromEntries(slides.map(s => [s.slideNumber, thumbnailUrl])),
      styleDescription,
    }
  }

  // Claude VisionでURL → スライドのマッピングを決定
  const imageBlocks = slideUrls.map(url => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }))

  const slideDescs = slides
    .map(s =>
      `スライド${s.slideNumber}「${s.headline}」タグ:${s.tag}` +
      (s.bullets ? ` 内容:${s.bullets.join("/")}` : "")
    )
    .join("\n")

  const exampleJson = `{${slides.map(s => `"${s.slideNumber}":0`).join(",")}}`

  const slideUrlMap: Record<number, string> = {}

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `${slideUrls.length}枚の参考画像（0始まりのインデックス）と、以下のInstagramスライド内容を照合して、各スライドに最もビジュアルスタイルが合う参考画像のインデックス番号をJSONで返してください。

${slideDescs}

JSONのみ回答（スライド番号: インデックス番号）:
${exampleJson}`,
          },
        ],
      }],
    })

    const raw = res.content[0].type === "text" ? res.content[0].text.trim() : "{}"
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const parsed = JSON.parse(jsonText) as Record<string, number>

    for (const [slideNum, urlIndex] of Object.entries(parsed)) {
      const url = slideUrls[urlIndex]
      if (url) slideUrlMap[Number(slideNum)] = url
    }
  } catch (e) {
    console.warn("[referenceV2] マッピング失敗、順番割り当てにフォールバック", e)
  }

  // 未マッピングのスライドを順番で補完
  slides.forEach((s, i) => {
    if (!slideUrlMap[s.slideNumber]) {
      slideUrlMap[s.slideNumber] = slideUrls[i % slideUrls.length]
    }
  })

  return { thumbnailUrl, slideUrlMap, styleDescription }
}

// ─── 2. スタイル言語化 ──────────────────────────────────────

/**
 * v3: スライド画像1枚から「なぜこの画像が刺さるか」まで含む詳細分析を返す。
 * 各スライドごとに呼び、別々のスタイル説明として FAL プロンプトに渡す。
 *
 * v2 の describeV2StyleFromUrl との違い:
 * - 人物・被写体（顔アップ/全身/パーツ）を **含める**（v2 は含めない指示）
 * - 構図・スライドの役割・刺さる理由まで分析
 * - リアル運用アカウントの再現が目的なので、人物が映る前提
 */
export async function describeV3SlideStyle(imageUrl: string): Promise<string> {
  if (!imageUrl) return ""

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `これはLemon8のリアルな運用UGC投稿画像（バズっている）です。
この画像を「なぜ刺さるか」まで含めて、画像生成AI（nano-banana）への英語プロンプトとして使える形で詳細に分析してください。

必ず含める要素（生成AIへ「ここに書かれた具体だけが唯一の根拠」として渡されるので、推測ではなく **画像に実際に映っているもの** を具体的に）:

【被写体パターン（最重要・A〜Fのどれか必ず特定）】
   * A) 肌・パーツのドアップ（目元・頬・パーツのクローズアップ・顔全体は見えない）
   * B) マスク/シートパック中の顔（顔が部分的に隠れる）
   * C) 全身ミラー写真（スマホで顔を隠している or 顔が遠目で曖昧）
   * D) 横顔・後ろ姿・斜め向き（顔の特徴が判別しづらい）
   * E) 遠景・引き画（顔が小さくて識別できない）
   * F) 顔が正面・斜め正面からはっきり見えている（目鼻口がクリアに識別できる）
   ※ 実際に画像を見て判断すること。Fに該当する場合は必ず "clear face visible, front-facing" と明記する。

【顔の隠し方】
- マスク / スマホ / 髪 / 角度 / 距離 / 切り取り のどれを使っているか

【ファッション系統・地域感（最重要・固定の決め打ちでなく実際に画像から判断）】
- 系統: 韓国コリアンストリート / 港区系 / 原宿系 / 東京カジュアル / モード / ガーリー / きれいめOL / 海外旅行系 / 関西系 / 北欧 / その他 — どれか具体的に
- 地域感: ソウル / 東京（具体的なエリア感があれば） / 西海岸 / パリ / その他 — 画像から読み取れる場所性

【服装の具体】
- アウター: ジャケット種別（デニム/レザー/ブレザー/パファー/トレンチ）・色・シルエット
- トップス: クロップ丈/ロング丈・タンク/カット/ニット・素材感・色
- ボトム: スカート/ジーンズ/パンツ・丈・シルエット・色
- 小物: キャップ/ヘアアクセ/メガネ/バッグ・ブランド感（さりげなく見えるロゴ等）

【髪型の具体】
- 長さ（ロング/ミディアム/ショート）
- 色味（ブルーブラック/ダークブラウン/ライトブラウン/赤茶/明るめ）
- スタイル（ストレート/ウェーブ/ハーフアップ/ポニー/おだんご・前髪あり/なし/シースルー）

【ポーズ・体の見せ方】
- 体勢: 自撮り角度・視線・手の位置
- 雰囲気: クール / フェミニン / ナチュラル / 主張あり / 控えめ など

【背景】
- 屋内/屋外
- 具体: ソウル住宅街 / 都内おしゃれカフェ / マンション洗面台 / ストリート夜景 / グレー壁 / etc — 画像から読み取れる具体

【色調・光】
- 具体的な色名（モカ・ダスティブルー・くすみピンク・ブラック・etc）
- 照明（自然光・蛍光灯・暖色間接照明・夜の街灯・フラッシュ）
- ホワイトバランス傾向

【写真の質感（最重要）】
- 撮影機材感: iPhone素撮り / Androidスマホ / 一眼レフ / フィルム / プロ撮影 — どれっぽいか
- 編集濃度: 無加工 / VSCO 軽め / 韓国アプリで盛った加工 / 強い色補正
- 全体感: Pinterest的ラフ / きっちりプロ撮影 / 雑誌風 / 生活感UGC

【雰囲気】
- 生活感 / 非日常感 / 高級感 / 親近感 / クール / ガーリー など

【テキストレイアウト】
- 文字の量と密度（タイトルだけ / 短いリスト / 表 / 説明文）
- **配置の具体位置**（上中央 / 中央 / 右側 / 左下 / 主役の隣 など）
- 主役（人物・パーツ）との位置関係（被るか避けるか・余白を活かすか）
- フォントの色（白・黒・陰付き）、行数、フォントサイズ感、余白量

【なぜ刺さるか】
- 「この人になりたい」を喚起する要素、共感を呼ぶ要素、目を止める要素

絶対に含めない要素:
- 画像内のテキストや文字の内容（テキストは別で生成するため）
- 商品の具体的な種類・ブランド名・用途
- ベンチマーク特有のジャンル文言（"-11kg" "ダイエット" などの痩せ系特有表現は完全除外）

英語で120〜180単語、カンマ区切りのフレーズで詳細に。
出力例の形式:
"close-up of a young woman's eye area, natural skin texture visible, no makeup look, soft daylight from window, warm beige background, intimate self-care vibe, Korean idol skincare aesthetic, evokes 'I want this skin' aspiration, ..."
`,
          },
        ],
      }],
    })
    const block = res.content[0]
    return block.type === "text" ? block.text.trim() : ""
  } catch (e) {
    console.warn("[referenceV2] v3スタイル言語化失敗:", e)
    return ""
  }
}

/**
 * ベンチマーク投稿の1枚目URLからFALプロンプト用のスタイル説明文を生成（v2旧版・残しておく）
 */
export async function describeV2StyleFromUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return ""

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: `これはLemon8のUGC投稿画像です。
この画像の「ビジュアルスタイル」だけを、画像生成AIへの英語プロンプトとして使える形で説明してください。

必ず含める要素:
- 色調・カラーパレット（具体的な色名）
- 照明の質（自然光・柔らかい光・明るい・暗いなど）
- 写真の質感（プロ風・素人風・フラットレイ・接写など）
- 背景の色・質感
- 全体のムードと雰囲気

絶対に含めない要素:
- 画像内のテキストや文字の内容
- 商品の具体的な種類・名前・用途
- 構図（before/after・比較・分割画面など）
- 人物の具体的なポーズや動作の内容
- スライドの役割（フック・CTA・説明など）

英語で60単語以内、カンマ区切りのフレーズのみ:`,
          },
        ],
      }],
    })
    const block = res.content[0]
    return block.type === "text" ? block.text.trim() : ""
  } catch (e) {
    console.warn("[referenceV2] スタイル言語化失敗:", e)
    return ""
  }
}

// ─── 同背景グループ検出 ────────────────────────────────────────

/**
 * ベンチマーク投稿の全スライドを Claude Vision で分析し、
 * 同じ背景（写真背景・シーン）を共有するスライドをグループ化する。
 *
 * @returns number[][] — 各要素が1グループ。値はスライドの 0-based インデックス。
 * 例: [[0], [1,2,3,4,5,6,7], [8]] = スライド2〜8（0-indexed: 1〜7）が同背景
 */
export async function detectBackgroundGroups(slideUrls: string[]): Promise<number[][]> {
  if (slideUrls.length === 0) return []
  if (slideUrls.length === 1) return [[0]]

  const imageBlocks = slideUrls.map(url => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }))

  try {
    const res = await claude().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `You are analyzing ${slideUrls.length} slides from a Lemon8/Instagram carousel post.

Task: Identify which slides share the EXACT SAME photographic background (same scene, same environment, same lighting setup).

Rules:
- Ignore text overlays, product images, and graphic elements — focus only on the background photo/scene
- Slides that were taken in the same location at the same time = same group
- The hook slide (slide 1) and CTA/last slide often have different backgrounds from the middle slides
- Middle "content" slides (2 to N-1) often share the same background

Return ONLY a JSON array of arrays. Each inner array contains the 0-based indices of slides that share the same background.
Example response: [[0],[1,2,3,4,5],[6]]

Slides are numbered 0 to ${slideUrls.length - 1} (left to right in the order shown).
Return JSON only, no explanation:`,
          },
        ],
      }],
    })

    const raw = res.content[0].type === "text" ? res.content[0].text.trim() : "[]"
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const parsed = JSON.parse(jsonText) as number[][]

    // バリデーション: 全インデックスが含まれているか確認し、漏れを補完
    const covered = new Set(parsed.flat())
    const missing: number[] = []
    for (let i = 0; i < slideUrls.length; i++) {
      if (!covered.has(i)) missing.push(i)
    }
    // 漏れたものは個別グループとして追加
    const result = [...parsed, ...missing.map(i => [i])]
    // インデックス順にソートして返す
    return result.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
  } catch (e) {
    console.warn("[referenceV2] detectBackgroundGroups 失敗、フォールバック:", e)
    // フォールバック: 先頭・末尾は単独、中間は1グループ
    if (slideUrls.length <= 2) return slideUrls.map((_, i) => [i])
    const middle = Array.from({ length: slideUrls.length - 2 }, (_, i) => i + 1)
    return [[0], middle, [slideUrls.length - 1]]
  }
}
