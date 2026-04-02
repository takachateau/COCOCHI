import Anthropic from "@anthropic-ai/sdk"
import type { ArticleContent } from "@/types"

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export async function generateArticle(params: {
  productName: string
  efficacy: string
  howToUse: string
  price?: string
  target?: string
  productImageBase64: string
  productImageMime: string
}): Promise<{ content: ArticleContent; inputTokens: number; outputTokens: number }> {
  const { productName, efficacy, howToUse, price, target } = params

  const prompt = `あなたはInstagramでバズるUGCコンテンツを量産するプロのクリエイターです。
以下の化粧品について、3つの全く異なる切り口でInstagramカルーセル投稿（5枚1セット）を作成してください。

【商品情報】
商品名: ${productName}
効能・特徴: ${efficacy}
使い方: ${howToUse}
${price ? `価格: ${price}（2枚目のpriceフィールドにこの価格をそのまま使うこと）` : ""}
${target ? `ターゲット: ${target}` : ""}

【3つの切り口】
1. 感情体験: 「使ってみたら人生変わった」「衝撃すぎて語らずにいられない」系の感情訴求
2. 成分・効果: 「なぜこれが効くのか成分から解説」「皮膚科医も認める」系の科学的訴求
3. ライフスタイル: 「この1本で朝晩ルーティンが変わった」「〇〇するだけで肌が変わる」系の習慣訴求

【スライド構成（各パターン共通）】
1枚目: 表紙 — 思わずスクロールが止まるキャッチコピー（バズ前提）
2枚目: 第一印象・価格・おすすめポイント
3枚目: 成分・特徴の深堀り
4枚目: 使用感・テクスチャ・使い方レポ
5枚目: まとめ・こんな人に・CTA

【文体ルール】
- 実際の20〜30代女性UGCクリエイター風。読んで「わかる〜」となる口語体
- tagは「\\〜！/」「✨〜✨」スタイルで15字以内
- headlineは「！」「...」「〜すぎ」など感情的な表現を使い最大30文字（改行は不要）
- bulletsは3〜4項目、各20字以内、頭に「✔」「→」「◎」をつける
- accentは20字以内の印象的なフレーズ
- 2枚目のみpriceを記入（不明なら"プチプラ〜"など）
- 本文は不要。bulletsで完結させること

【colorPalette選択基準】
pink=フェミニン・保湿系, blue=さっぱり・メンズも, green=オーガニック・敏感肌,
yellow=ビタミン・明るさ, purple=高級感・エイジング, orange=活力・ニキビケア,
teal=清潔感・毛穴ケア, mono=シンプル・スタイリッシュ
※3パターンで別々のcolorPaletteを選ぶこと

以下のJSON形式のみで返してください（説明文不要）:
{
  "articles": [
    {
      "angle": "感情体験",
      "colorPalette": "teal",
      "overallTitle": "この化粧水、やばすぎた件",
      "slides": [
        {
          "slideNumber": 1,
          "tag": "\\ もう手放せない！/",
          "headline": "夜だけで肌が変わった嘘みたいな話",
          "accent": "敏感肌さん絶対見て♡"
        },
        {
          "slideNumber": 2,
          "tag": "\\ まず結論 /",
          "headline": "これ1本で全部解決した",
          "bullets": ["✔ べたつかないのに保湿◎", "✔ 敏感肌でも刺激ゼロ", "✔ 翌朝の肌ツヤが別人"],
          "price": "¥2,200",
          "accent": "コスパ神すぎ♡"
        },
        {
          "slideNumber": 3,
          "tag": "\\ 成分チェック /",
          "headline": "なぜ効くのか成分から見た",
          "bullets": ["✔ BHA配合で毛穴ケア", "✔ セラミドで保護膜を補強", "✔ 防腐剤フリーで安心"],
          "accent": "成分神✨"
        },
        {
          "slideNumber": 4,
          "tag": "\\ 使用感レポ /",
          "headline": "テクスチャがとろ〜っとして神すぎた",
          "bullets": ["→ コットンでも手でもOK", "→ 重ねづけするともち◎", "→ 夜だけでも効果実感"],
          "accent": "使い続けたら変わる！"
        },
        {
          "slideNumber": 5,
          "tag": "\\ 総評 /",
          "headline": "こんな人に絶対おすすめ",
          "bullets": ["◎ 毛穴・ざらつきが気になる", "◎ 敏感肌でコスメ難民", "◎ スキンケアを時短したい"],
          "accent": "保存して後で買って♡"
        }
      ]
    },
    {
      "angle": "成分・効果",
      "colorPalette": "blue",
      "overallTitle": "成分オタクが認めた神コスメ",
      "slides": [
        {
          "slideNumber": 1,
          "tag": "✨ 成分オタク監修 ✨",
          "headline": "皮膚科でも話題になったあの成分配合",
          "accent": "知識ある人ほど買う"
        },
        {
          "slideNumber": 2,
          "tag": "\\ 価格破壊 /",
          "headline": "この品質でこの値段はおかしい",
          "bullets": ["✔ デパコス成分をプチプラで", "✔ 1本2ヶ月以上もつ", "✔ 継続しやすい価格帯"],
          "price": "¥2,200",
          "accent": "コスパ最強認定！"
        },
        {
          "slideNumber": 3,
          "tag": "\\ 成分解説 /",
          "headline": "この3成分が肌を変える",
          "bullets": ["✔ サリチル酸が毛穴を溶かす", "✔ ナイアシンアミドで透明感", "✔ ヒアルロン酸でぷるぷる"],
          "accent": "成分の相乗効果が鍵◎"
        },
        {
          "slideNumber": 4,
          "tag": "\\ 体感レポ /",
          "headline": "2週間で肌の変化を実感した",
          "bullets": ["→ 1週間目：毛穴が締まった", "→ 2週間目：くすみが取れた", "→ 1ヶ月後：周りに言われた"],
          "accent": "継続が一番の美容♡"
        },
        {
          "slideNumber": 5,
          "tag": "\\ 結論 /",
          "headline": "成分から選ぶなら絶対これ",
          "bullets": ["◎ 成分にこだわる人", "◎ 毛穴・くすみが悩み", "◎ 効果を実感したい人"],
          "accent": "今すぐチェックして！"
        }
      ]
    },
    {
      "angle": "ライフスタイル",
      "colorPalette": "pink",
      "overallTitle": "この1本でスキンケアが変わった",
      "slides": [
        {
          "slideNumber": 1,
          "tag": "\\ 朝晩ルーティン /",
          "headline": "洗顔後これ1本だけで肌が完成した",
          "accent": "ズボラさんに刺さる♡"
        },
        {
          "slideNumber": 2,
          "tag": "\\ まず詳細 /",
          "headline": "時短スキンケアの答えがここにあった",
          "bullets": ["✔ 化粧水＋美容液の2役", "✔ 1分で完了するケア", "✔ 翌朝のメイクのりが変わる"],
          "price": "¥2,200",
          "accent": "時短最強コスメ！"
        },
        {
          "slideNumber": 3,
          "tag": "\\ なぜ時短できる？/",
          "headline": "多機能だから1本で完結する",
          "bullets": ["✔ 保湿・毛穴・美白を同時ケア", "✔ 重ね塗り不要のオールインワン", "✔ 肌に素早くなじむ処方"],
          "accent": "朝の5分が変わる◎"
        },
        {
          "slideNumber": 4,
          "tag": "\\ 私のルーティン /",
          "headline": "毎晩これだけで十分だった",
          "bullets": ["→ 洗顔後すぐコットンで拭く", "→ 気になる部分は重ねづけ", "→ あとは寝るだけでOK"],
          "accent": "ズボラでも続く♡"
        },
        {
          "slideNumber": 5,
          "tag": "\\ まとめ /",
          "headline": "スキンケアをシンプルにしたい人に届け",
          "bullets": ["◎ 時短スキンケアしたい", "◎ 色々買いすぎてる人", "◎ 継続できなかった人"],
          "accent": "まずは1本試してみて♡"
        }
      ]
    }
  ]
}`

  const res = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.productImageMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: params.productImageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : ""

  // JSON オブジェクトの開始・終了位置を確実に特定
  const jsonStart = text.indexOf("{")
  const jsonEnd = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("記事生成に失敗しました")
  const raw = text.slice(jsonStart, jsonEnd + 1)

  // \X ペアを単位として処理：有効なJSONエスケープはそのまま、無効なものはバックスラッシュを除去
  const sanitized = raw
    .replace(/\\([\s\S])/g, (_, char) =>
      '"\\/bfnrtu'.includes(char) ? `\\${char}` : char
    )
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")

  const content = JSON.parse(sanitized) as ArticleContent

  if (!content.articles || content.articles.length < 3) {
    throw new Error("3パターンの生成に失敗しました")
  }
  return {
    content,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}

/**
 * 生成画像を Claude Vision でQCスコアリング
 * @returns score 0〜100、comment 改善コメント
 */
export async function qcScore(imageBase64: string): Promise<{ score: number; comment: string; inputTokens: number; outputTokens: number }> {
  const res = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
        },
        {
          type: "text",
          text: `この画像はInstagram投稿用のUGC風コンテンツです。以下の基準で100点満点で採点してください。
採点基準:
1. UGCらしさ（本物のユーザー投稿に見えるか）
2. 視覚的クオリティ（ボケ・歪み・不自然さがないか）
3. テキストの可読性（文字が読みやすく、日本語として正しいか）
4. SNS映え（スクロールが止まるビジュアルか）
5. ブランド安全性（不適切な要素がないか）

JSON形式のみで返してください: {"score": 85, "comment": "改善点や良い点を1〜2文で"}`,
        },
      ],
    }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1) {
    return { score: 0, comment: "QC解析失敗", inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as { score: number; comment: string }
  return { ...parsed, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
}
