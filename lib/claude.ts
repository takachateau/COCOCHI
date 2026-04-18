import Anthropic from "@anthropic-ai/sdk"
import type { ArticleContent } from "@/types"

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// パターンの順序（route.ts の PATTERN_NAMES と必ず一致させること）
const ORDERED_PATTERNS = ["エンタメ導入型", "手持ちUGC型", "直置きUGC型", "記事投稿型"] as const

export async function generateArticle(params: {
  productName: string
  ingredients: string
  howToUse: string
  price?: string
  appealPoints?: string
  forbiddenWords?: string
  pdfText?: string
  target?: string
  patternAngles?: string[]    // パターン順に対応するアピール角度 [エンタメ, 手持ち, 直置き, 記事]
  hookTheme?: string          // エンタメ導入型のフックテーマ（外部からランダム指定）
  productImageBase64: string
  productImageMime: string
}): Promise<{ content: ArticleContent; inputTokens: number; outputTokens: number }> {
  const { productName, ingredients, howToUse, price, appealPoints, forbiddenWords, pdfText, target, patternAngles, hookTheme } = params

  const angleDescriptions: Record<string, string> = {
    // エンタメ導入型プール
    "感情体験":     "「使ってみたら人生変わった」「衝撃すぎて語らずにいられない」系の感情訴求",
    "共感・あるある": "「わかる〜これ」「あるあるすぎた」系の共感訴求",
    "ギャップ体験":  "「使う前と後のギャップが激しすぎた」「最初は半信半疑だったけど」系のギャップ訴求",
    "衝撃告白":     "「実はずっと悩んでたんだけど」「誰にも言えなかったこと言う」系の告白・暴露訴求",
    // 手持ちUGC型プール
    "ビフォーアフター": "「使う前と後でここまで変わった」「〇〇日後の肌が別人すぎた」系の変化訴求",
    "継続結果レポ":  "「〇〇日間使い続けた結果」「1ヶ月後のリアルな肌を見せる」系の継続訴求",
    "正直レビュー":  "「忖度なしで言います」「デメリットも全部話す」系のリアル・正直訴求",
    "周りの反応":    "「急に肌綺麗になったって言われた」「友達に何使ってるか聞かれた」系の反応訴求",
    // 直置きUGC型プール
    "ルーティン紹介": "「この1本で朝晩ルーティンが変わった」「毎日必ず使うものを紹介」系の習慣訴求",
    "時短・ズボラ":   "「ズボラでもできる」「これ1本で終わる時短スキンケア」系の時短訴求",
    "シーン訴求":    "「旅行に必ず持っていく」「梅雨の時期に手放せない」系のシーン・季節訴求",
    "映え・世界観":  "「棚に置くだけでサマになる」「パッケージが可愛すぎて飾ってる」系の世界観訴求",
    // 記事投稿型プール
    "成分・効果":    "「なぜこれが効くのか成分から解説」「皮膚科医も認める」系の科学的訴求",
    "皮膚科目線":    "「皮膚科で処方されるあの成分が入ってる」「医師監修レベルの処方」系の専門家訴求",
    "他社比較":     "「〇〇と比べてみた」「有名どころと成分を並べてみる」系の比較訴求",
    "ハウツー解説":  "「正しい使い方知ってる？」「この順番で使わないと効果半減」系のハウツー訴求",
  }

  const angles = (patternAngles && patternAngles.length === 4)
    ? patternAngles
    : ["感情体験", "ビフォーアフター", "ルーティン紹介", "成分・効果"]

  const patternLines = ORDERED_PATTERNS.map((pattern, i) => {
    const angle = angles[i] ?? angles[0]
    const desc = angleDescriptions[angle] ?? `「${angle}」に関連する独自の切り口で訴求`
    return `${i + 1}. ${pattern} × ${angle}: ${desc}`
  }).join("\n")

  const prompt = `あなたはInstagramでバズるUGCコンテンツを量産するプロのクリエイターです。
以下の化粧品について、4つの全く異なる切り口でInstagramカルーセル投稿（5枚1セット）を作成してください。

【商品情報】
商品名: ${productName}
成分・効能: ${ingredients}
使い方: ${howToUse}
${price ? `価格: ${price}（2枚目のpriceフィールドにこの価格をそのまま使うこと）` : ""}
${appealPoints ? `アピールポイント・差別化ポイント: ${appealPoints}` : ""}
${target ? `ターゲット: ${target}` : ""}
${pdfText ? `【PDF追加情報】\n${pdfText}` : ""}

${forbiddenWords ? `【禁止ワード（絶対に使用しないこと）】\n${forbiddenWords}\n` : ""}

【4つの投稿（パターンと訴求角度は固定・変更不可）】
${patternLines}

各投稿の "suggestedPattern" と "angle" は上記の通りに固定すること（重複なし・変更不可）。
Claudeはパターン・角度の割り当てを考えず、各投稿のコンテンツ内容の質だけに集中すること。

【エンタメ導入型専用ルール（suggestedPattern が "エンタメ導入型" の場合のみ適用）】
フックテーマは以下に固定（変更不可）: "${hookTheme ?? "恋愛・感情体験"}"
"hookTheme" フィールドにはこの値をそのまま入れること。

以下の構造タイプからこのテーマに最も合うものを1つ選び "hookStructure" に入れること:
  感情ストーリー型 / ハウツー連番型 / 炎上・問答型 / 悩み解決型 / 記録・チャレンジ型

"hookTitle" には1枚目のキャッチコピーを入れること（商品名・成分は絶対に含めない。フックテーマだけで完結すること）。

エンタメ導入型のスライド構成:
1枚目: hookTitleをheadlineに。商品は一切登場しない。フックテーマのみ。tagも商品と無関係に。
2枚目: フックテーマのストーリー/Tips展開（商品まだ出ない。体験・情報・主張のみ）
3枚目: さらなる展開（ハウツー連番型ならStep 2〜3、感情系なら転換点）
4枚目: 「実はずっと使ってたのが〇〇」「そのときケアしてたのが〇〇」など自然に商品登場。bulletPointsに商品の特徴を入れること。
5枚目: 商品訴求・保存/フォローCTA（「気になった人は保存してね♡」「プロフのリンクからチェック」等）

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
※4パターンで別々のcolorPaletteを選ぶこと

角度名は上記【4つの投稿】で指定したラベルを "angle" フィールドにそのまま使うこと。
エンタメ導入型の場合は "hookTheme", "hookTitle", "hookStructure" を必ず含めること。
以下のJSON形式のみで返してください（説明文不要）:
{
  "articles": [
    {
      "angle": "${angles[0]}",
      "hookTheme": "エンタメ導入型のみ入れる（他はフィールドごと省略）",
      "hookTitle": "エンタメ導入型のみ入れる（他はフィールドごと省略）",
      "hookStructure": "エンタメ導入型のみ入れる（他はフィールドごと省略）",
      "suggestedPattern": "手持ちUGC型",
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
      "suggestedPattern": "記事投稿型",
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
      "suggestedPattern": "直置きUGC型",
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
    },
    {
      "angle": "ビフォーアフター",
      "suggestedPattern": "手持ちUGC型",
      "colorPalette": "purple",
      "overallTitle": "使う前と後で肌が別人になった話",
      "slides": [
        {
          "slideNumber": 1,
          "tag": "\\ 衝撃の変化 /",
          "headline": "2週間後の肌、自分でも信じられなかった",
          "accent": "ビフォーアフター見て"
        },
        {
          "slideNumber": 2,
          "tag": "\\ 変化の内訳 /",
          "headline": "ここまで変わるとは思ってなかった",
          "bullets": ["✔ 毛穴の開きが目立たなくなった", "✔ くすみが消えてトーンアップ", "✔ 触り心地がツルツルに"],
          "price": "¥2,200",
          "accent": "コスパ最高◎"
        },
        {
          "slideNumber": 3,
          "tag": "\\ なぜ変わった？/",
          "headline": "この成分が肌を根本から変えた",
          "bullets": ["✔ ターンオーバーを促進", "✔ メラニン生成を抑制", "✔ バリア機能を強化"],
          "accent": "仕組みを知ると納得"
        },
        {
          "slideNumber": 4,
          "tag": "\\ 使い方のコツ /",
          "headline": "効果を最大化する使い方があった",
          "bullets": ["→ 朝晩2回が効果的", "→ コットンでなじませると◎", "→ 継続2週間で実感"],
          "accent": "継続が鍵！"
        },
        {
          "slideNumber": 5,
          "tag": "\\ こんな人に /",
          "headline": "変化を実感したい人はぜひ",
          "bullets": ["◎ 毛穴・くすみが長年の悩み", "◎ 色々試して効果なかった", "◎ 本気で肌変えたい"],
          "accent": "まず1本試してみて♡"
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

  if (!content.articles || content.articles.length < 4) {
    throw new Error("4パターンの生成に失敗しました")
  }
  return {
    content,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}

/**
 * Instagram投稿用キャプションを生成
 * caption.txt がある場合はそのトーン・構成を参考にする
 * ない場合はスライド内容からゼロで生成
 */
export async function generateCaption(params: {
  productName: string
  angle: string
  slides: import("@/types").SlideContent[]
  referenceCaption?: string
}): Promise<{ caption: string; inputTokens: number; outputTokens: number }> {
  const { productName, angle, slides, referenceCaption } = params

  const slidesSummary = slides
    .map(s => `${s.slideNumber}枚目「${s.headline}」${s.bullets ? s.bullets.join(" / ") : ""}`)
    .join("\n")

  const refSection = referenceCaption
    ? `【参考キャプション（このトーン・文体・構成・ハッシュタグを参考にすること）】\n${referenceCaption}\n\n`
    : ""

  const prompt = `あなたはInstagram投稿のキャプションを書くプロです。
${refSection}【投稿情報】
商品名: ${productName}
切り口: ${angle}
スライド構成:
${slidesSummary}

【ルール】
- 1行目は「もっと見る」の前に来るフック。思わずタップしたくなる1文
- 実際の20〜30代女性UGCクリエイター風の口語体
- 改行・空白行を活用して読みやすく
- ハッシュタグは7〜10個、末尾にまとめる
- 全体で150〜250字程度

キャプション本文のみ返してください（説明・前置き不要）:`

  const res = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  })

  const caption = res.content[0].type === "text" ? res.content[0].text.trim() : ""
  return { caption, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
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
