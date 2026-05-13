/**
 * POST /api/personas/generate
 * ベンチマークアカウントの投稿群を深く分析し、5次元ペルソナを生成してDBに保存する
 *
 * リクエスト: { accountName: string, personaName: string }
 * レスポンス: { persona }
 */
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { dbLoadBenchmarkPosts, dbSavePersona, dbLoadAccountBio, dbLoadPersonas } from "@/lib/supabase"
import type { TypeRatios } from "@/types/v2"

export const maxDuration = 60

function claude() {
  return new Anthropic({ apiKey: process.env.COCOCHI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json() as { accountName?: string }
  const { accountName } = body

  if (!accountName) {
    return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })
  }

  const [posts, accountBio, existingPersonas] = await Promise.all([
    dbLoadBenchmarkPosts(accountName),
    dbLoadAccountBio(accountName).catch(() => ""),
    dbLoadPersonas().catch(() => [] as Awaited<ReturnType<typeof dbLoadPersonas>>),
  ])
  if (posts.length === 0) {
    return NextResponse.json(
      { error: `${accountName} の分析結果がありません。先にベンチマーク分析を実行してください` },
      { status: 400 },
    )
  }

  // 投稿種別の割合を集計
  const typeCounts = posts.reduce(
    (acc, p) => { acc[p.postType] = (acc[p.postType] ?? 0) + 1; return acc },
    {} as Record<string, number>,
  )
  const total = posts.length
  const typeRatios: TypeRatios = {
    tips:    Math.round(((typeCounts.tips    ?? 0) / total) * 100),
    product: Math.round(((typeCounts.product ?? 0) / total) * 100),
    mixed:   Math.round(((typeCounts.mixed   ?? 0) / total) * 100),
  }

  // テーマタグの頻出Top5
  const tagCounts = posts.flatMap(p => p.themeTags).reduce((acc, tag) => {
    acc[tag] = (acc[tag] ?? 0) + 1; return acc
  }, {} as Record<string, number>)
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag)

  // トーン分布
  const toneDistribution = posts.reduce((acc, p) => {
    acc[p.tone] = (acc[p.tone] ?? 0) + 1; return acc
  }, {} as Record<string, number>)
  const dominantTone = Object.entries(toneDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "emotional"

  // 実際の投稿スライド構成サンプル（最大5投稿・postTypeごとに分散）
  const samplesByType = ["tips", "product", "mixed"].flatMap(type =>
    posts.filter(p => p.postType === type).slice(0, 2)
  ).slice(0, 5)

  const sampleStructures = samplesByType.map((p, i) => {
    const structure = p.slideStructure
      .map(s => `    スライド${s.slide}「${s.role}」: ${s.description}`)
      .join("\n")
    return `投稿${i + 1}（${p.postType} / ${p.tone} / テーマ:${p.themeTags.slice(0, 2).join("・")}）:\n${structure}`
  }).join("\n\n")

  // visual_profile 推定用: 投稿ごとに最大4枚 × 最大3投稿 = 最大12枚
  // 1枚目はテキスト主体のフック画像が多いため、複数枚渡して人物・背景・ファッションを見せる
  const visualRefPosts = samplesByType.slice(0, 3)
  const visualRefUrls = [...new Set(
    visualRefPosts.flatMap(p => p.slideUrls.slice(0, 4).filter(Boolean))
  )].slice(0, 12)

  // DBキャッシュのスタイル分析テキストをプロンプトに追加（visual_profile 精度向上）
  const styleDescLines = visualRefPosts.flatMap(p => {
    const descs = p.slideStyleDescs ?? {}
    return p.slideUrls.slice(0, 4)
      .filter(url => url && descs[url])
      .map((url, i) => `  - ${p.folderPath} スライド${i + 1}: ${descs[url]}`)
  }).slice(0, 15)
  const styleDescContext = styleDescLines.length > 0
    ? `\n【各スライドの視覚スタイル事前分析（これを最優先で参考にすること）】\n${styleDescLines.join("\n")}\n`
    : ""

  // 既存ペルソナのサマリー（被り防止）
  const existingSummary = existingPersonas.length > 0
    ? existingPersonas.map(p => {
        const profile = (p as typeof p & { profile?: { age?: number; occupation?: string; location?: string; personality?: string[] } }).profile
        const sameAccount = p.benchmarkAccount === accountName ? "（同じベンチマーク）" : ""
        const profileLine = profile
          ? `${profile.age ?? "?"}歳・${profile.occupation ?? ""}・${profile.location ?? ""}・[${(profile.personality ?? []).join("/")}]`
          : p.characterText.split("\n")[1]?.slice(0, 40) ?? ""
        return `・${p.name}${sameAccount} — ${profileLine}`
      }).join("\n")
    : null

  const prompt = `あなたはSNSアカウントのプロデューサーです。
以下のベンチマーク分析データをもとに、Lemon8で活動するリアルな人物のペルソナを生成してください。
架空の人物ですが、実在しそうなくらい具体的・詳細に仕上げることが目標です。
${existingSummary ? `
【既存ペルソナ一覧（必ず全員と差別化すること）】
以下はすでに存在するペルソナです。年齢・職業・居住地・性格・肌悩みのいずれかが被らないよう、明確に異なる人物像を作ってください。
特に「（同じベンチマーク）」と書かれたペルソナとは、職業・居住地・年齢帯・性格が全員と異なるようにしてください。
${existingSummary}
` : ""}
【ベンチマーク分析データ】
アカウント: ${accountName}
${accountBio ? `アカウントbio・自己紹介:\n${accountBio}\n` : ""}投稿数: ${total}件
投稿種別割合: tips${typeRatios.tips}% / 商品訴求${typeRatios.product}% / 混合(Tips+商品スポット)${typeRatios.mixed ?? 0}%
主要テーマ: ${topTags.join(" / ")}
主なトーン: ${dominantTone}

【実際の投稿スライド構成サンプル】
${sampleStructures}
${styleDescContext}
【キャラクター生成の厳守ルール】
- 悩み・変化のストーリーは「肌・外見・美容」の言葉で語ること
  ✓ 「ニキビ跡に悩んでいた」「くすみが気になっていた」「毛穴が目立って自信がなかった」
  ✗ 「体重58kg→47kg」「○kgの減量」など体重・ダイエット数値は一切使わない
- ベンチマークの主要テーマ（${topTags.slice(0, 3).join("・")}）をこの人物のキャラクターに自然に反映させること

【生成する項目】

■ アカウント運営の5次元（テキスト生成で使う骨格）
1. character: 誰か。年齢・職業・肌悩みの歴史・スキンケアとの出会い・美容への思い（具体的なエピソードを使う）
2. mission: このアカウントで何を届けるか（1文）
3. value: フォロワーが得られるもの・解決される悩み
4. hook: 他アカウントとの違い・フォローボタンを押す決め手
5. voice: 言葉遣い・文体・よく使う表現・使わない表現

■ ビジュアルプロフィール（画像生成AIに直接渡す — すべて英語で記述すること）
6. visual_profile:
   ★ 重要: 上に添付したベンチマーク画像から **スタイル・雰囲気・美的感覚** を読み取り、
     それを参考にした **架空の人物の** ビジュアルプロフィールを設定すること。
   ★ 禁止: 画像に映っている実際の人物の顔・肌色・目の形・輪郭などの身体的特徴をそのままコピーしない。
     あくまで「同じ世界観・美的感覚を持つ別の架空の人物」として設定すること。
   - hair: ベンチマーク画像のスタイル世界観に合う架空の人物の髪型（例: "jet black, shoulder length, straight with see-through bangs"）
   - fashion: 画像から読み取れるファッション系統・文化的固有性を反映した架空の服装。韓国系・フレンチ・ストリート・Y2Kなど積極的に反映する。
     （例Korean: "Korean feminine casual — wide-leg trousers, fitted knit crop top, oversized blazer, minimal gold jewelry"）
     （例gyaru: "Japanese gyaru — layered outfits, platform shoes, oversized accessories, bold color mixing"）
     （例natural: "Japanese natural — linen blend tops, wide-leg pants, earth tones, minimal accessories"）
   - setting: 画像から読み取れる空間・背景の世界観を反映した架空の撮影場所。文化的固有性も反映する。
     （例Korean: "bright modern Korean apartment, large windows, minimal furniture, city view backdrop"）
     （例cafe: "trendy Seoul-style cafe, geometric tiles, neon signage, concrete walls"）
     （例cozy: "cozy Japanese room, tatami or wood floor, warm side lighting, plants visible"）
   - photo_style: 画像から読み取れる色調・撮影スタイル・フィルター感
     （例: "high-contrast Korean beauty filter, cool-toned, sharp focus, studio-quality selfie"）
     （例: "warm soft film grain, overexposed highlights, candid daily-life feel"）

■ 人物プロフィール（UIに表示・本物らしさを高める詳細情報）
7. profile:
   - display_name: 下の名前またはニックネーム＋フック文言（全角スペース区切り）。形式: "名前　フック"。フックは10文字前後・端的に。例: "まみ　肌管理アドバイザー" / "ゆき　敏感肌の救世主" / "れな　成分オタク" / "さき　ズボラ美容家"。フックは職業名ではなく発信の価値やキャラクターを表すこと。「垢抜け」を必ずしも使わなくてよい。ベンチマークとは無関係な新しい人物の名前をつけること
   - handle: Lemon8風のアカウントハンドル（@始まり・英数字・アンダースコア）
   - age: 年齢（整数。18〜35歳の範囲で設定すること。既存ペルソナと年齢帯が被らないよう【20歳前後 / 23〜25歳 / 27〜29歳 / 31〜35歳】の4帯を意識して選ぶ。スキンケア専門家っぽいトーンでも若年層を積極的に選んでよい）
   - occupation: 職業（具体的に、例: "会社員（マーケティング職）" "大学院生（理系）" "フリーランスデザイナー"）
   - location: 居住地（都道府県レベル。東京以外も積極的に選ぶ）
   - personality: 性格・人柄を表すキーワード3〜4個（配列）
   - hobbies: 趣味・好きなこと3〜4個（配列。美容以外も含む。特定国のコンテンツに偏らず、その人物らしい多様な趣味をつける）
   - skin_type: 肌タイプ（具体的に）
   - skin_concerns: 肌悩みを具体的に2〜4個（配列）
   - beauty_philosophy: 美容に対する考え方・信念（1〜2文）
   - beauty_journey: 美容との出会い・変化のストーリー（1〜2文、具体的なエピソードで）

■ ナラティブ（ベンチマークデータから帰納的に読み取ること。カテゴリへの当てはめ・推測・補完は禁止）
8. narrative_hook: このアカウントをフォローする決め手（1文）。投稿スタイル・テーマ・トーン・スライド構造のデータから読み取れる「この人だけが持つ発信の価値」を書く。
9. narrative_identity: この人物の立ち位置・発信の理由（2〜3文）。ベンチマーク投稿の構造・テーマ・トーン・口調から帰納的に読み取れる事実のみを書く。データが示す以上のことは書かない。

【全体ルール】
- 実在しそうなくらい具体的・細かくする。曖昧・抽象的な表現はNG
- character〜voice は各1〜3文で書く
- visual_profile の4フィールドは必ず英語・具体的な形容詞・名詞を使う
- profile の各フィールドは日本語（handle と personality/hobbies/skin_concerns は上記に従う）
- ベンチマークアカウント名とは全く関係ない、新しい独立した人物像を作ること
- ファッション・趣味はベンチマークのトーンから推定し、毎回バリエーションをつける（全員が同じタイプにならないこと）

JSONのみ返してください（コードブロック不要）:
{
  "character": "キャラクター設定（年齢・職業・悩みの歴史など）",
  "mission": "このアカウントで届けるもの",
  "value": "フォロワーが得られるもの・解決される悩み",
  "hook": "フォローされる理由・他との差別化",
  "voice": "口調・スタイル・使いがちな表現・使わない表現",
  "visual_profile": {
    "hair": "具体的な髪型（英語）",
    "fashion": "ファッション系統と服装（英語・Korean固定NG）",
    "setting": "典型的な撮影背景（英語）",
    "photo_style": "撮影スタイル・色調（英語）"
  },
  "profile": {
    "display_name": "ベンチマークと無関係な新しい名前",
    "handle": "@オリジナルなハンドル名",
    "age": 25,
    "occupation": "具体的な職業",
    "location": "都道府県",
    "personality": ["キーワード1", "キーワード2", "キーワード3"],
    "hobbies": ["趣味1", "趣味2", "趣味3"],
    "skin_type": "肌タイプ",
    "skin_concerns": ["悩み1", "悩み2"],
    "beauty_philosophy": "美容哲学（1〜2文）",
    "beauty_journey": "美容との出会い（1〜2文）"
  },
  "narrative_hook": "フォローする決め手（1文・ベンチマークデータ由来のみ）",
  "narrative_identity": "この人物の立ち位置・発信の理由（2〜3文・ベンチマークデータ由来のみ）"
}`

  // ベンチマーク画像をVisionで渡す（visual_profile の精度向上）
  // 画像URLが取得できない場合はテキストのみにフォールバック
  type ContentBlock =
    | { type: "image"; source: { type: "url"; url: string } }
    | { type: "text"; text: string }

  const imageBlocks: ContentBlock[] = visualRefUrls.map(url => ({
    type: "image",
    source: { type: "url", url },
  }))

  const imagePrefix = imageBlocks.length > 0
    ? `以下はベンチマークアカウント「${accountName}」の実際の投稿画像（${imageBlocks.length}枚・複数投稿から抽出）です。` +
      `ファッション・背景・色調・撮影スタイルを細かく観察し、visual_profile に反映してください。\n\n`
    : ""

  const messageContent: ContentBlock[] = [
    ...imageBlocks,
    { type: "text", text: imagePrefix + prompt },
  ]

  const res = await claude().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: messageContent }],
  })

  const text = res.content[0].type === "text" ? res.content[0].text : "{}"
  const jsonStart = text.indexOf("{")
  const jsonEnd = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd === -1) {
    return NextResponse.json({ error: "キャラクター生成に失敗しました" }, { status: 500 })
  }

  const raw = text.slice(jsonStart, jsonEnd + 1).replace(/[\r\n\t]/g, " ")
  const dims = JSON.parse(raw) as {
    character: string; mission: string; value: string; hook: string; voice: string
    visual_profile?: { hair: string; fashion: string; setting: string; photo_style: string }
    profile?: {
      display_name: string; handle: string; age: number; occupation: string; location: string
      personality: string[]; hobbies: string[]
      skin_type: string; skin_concerns: string[]
      beauty_philosophy: string; beauty_journey: string
    }
    narrative_hook?: string
    narrative_identity?: string
  }

  // 5次元を構造化テキストとして結合（テキスト生成プロンプトで各セクションを参照できる）
  const characterText = `【キャラクター】\n${dims.character}\n\n【アカウントのミッション】\n${dims.mission}\n\n【フォロワーへの価値】\n${dims.value}\n\n【フォローされる理由】\n${dims.hook}\n\n【口調・スタイル】\n${dims.voice}`

  const visualProfile = dims.visual_profile
    ? {
        hair:       dims.visual_profile.hair,
        fashion:    dims.visual_profile.fashion,
        setting:    dims.visual_profile.setting,
        photoStyle: dims.visual_profile.photo_style,
      }
    : null

  const richProfile = dims.profile
    ? {
        displayName:       dims.profile.display_name,
        handle:            dims.profile.handle,
        age:               dims.profile.age,
        occupation:        dims.profile.occupation,
        location:          dims.profile.location,
        personality:       dims.profile.personality ?? [],
        hobbies:           dims.profile.hobbies ?? [],
        skinType:          dims.profile.skin_type,
        skinConcerns:      dims.profile.skin_concerns ?? [],
        beautyPhilosophy:  dims.profile.beauty_philosophy,
        beautyJourney:     dims.profile.beauty_journey,
        narrativeHook:     dims.narrative_hook ?? undefined,
        narrativeIdentity: dims.narrative_identity ?? undefined,
      }
    : null

  // displayName をペルソナ名として使用（生成できなかった場合は汎用名でフォールバック）
  const generatedName = richProfile?.displayName || "新しいペルソナ"

  // プレースホルダーアバター（DiceBear lorelei — AIアバター実装後に上書き予定）
  // ランダムUUIDをシードにして毎回異なる顔を生成、背景色も固定6色から選択
  const BG_COLORS = ["b45309","7c3aed","0369a1","047857","be185d","c2410c"]
  const avatarSeed = crypto.randomUUID()
  const avatarBg = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)]
  const avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${avatarSeed}&sex[]=female&backgroundColor=${avatarBg}&radius=50`

  const persona = await dbSavePersona({
    name: generatedName,
    characterText,
    themeTags: topTags,
    contentThemeTags: null,
    typeRatios,
    avatarUrl,
    benchmarkAccount: accountName,
    typeEmphasis: null,  // AI生成時は基本型（派生差分なし）
    visualProfile,
    profile: richProfile,
  })

  return NextResponse.json({ persona })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[personas/generate]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
