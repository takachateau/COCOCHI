// COCOCHI v2 専用の型定義

// ─── ペルソナ ───────────────────────────────────────────────────

export interface TypeRatios {
  tips: number    // 美容tipsの割合（%）
  product: number // 商品訴求の割合（%）
  mixed?: number  // tips+商品スポット混合型の割合（%）
}

// v3: ペルソナごとの「型の好み」差分（派生バリエーションを表現する）
// 数値はベンチマーク由来の型分布に対する倍率（>1=多用 / <1=抑える / 未指定=ベース通り）
// null = 派生差分なし（ベンチマークの分布そのまま使う基本型）
export interface TypeEmphasis {
  hooks?:        Partial<Record<"F1"|"F2"|"F3"|"F4"|"F5", number>>
  structures?:   Partial<Record<"S1"|"S2"|"S3"|"S4"|"S5", number>>
  compositions?: Partial<Record<"C1"|"C2"|"C3"|"C4"|"C5", number>>
}

// v3: ペルソナの「見た目の固定プロフィール」
// 毎回の画像生成でこの人物の外見を一貫させるための具体的な指定（英語・FALに直接渡す）
export interface VisualProfile {
  hair: string        // 髪色・長さ・スタイル (例: "dark brown, medium length, soft wave, no bangs")
  fashion: string     // ファッション系統と代表的な服装 (例: "Korean soft casual — feminine tops, wide-leg pants")
  setting: string     // 典型的な背景・撮影環境 (例: "cozy Japanese apartment, warm lighting, bookshelves")
  photoStyle: string  // 撮影スタイル・色調 (例: "iPhone selfie quality, warm tones, soft focus")
}

// v3: 人物プロフィール（UIに表示・手動編集可能）
// ベンチマーク分析 + Claude自動補完で生成。画像生成には直接使わず、人物の実在感を高めるための情報。
export interface RichPersonaProfile {
  // アイデンティティ
  displayName: string      // 表示名（例: "みほ"）
  handle: string           // アカウントハンドル（例: "@miho_beaute"）
  age: number              // 年齢
  occupation: string       // 職業（例: "会社員（事務職）"）
  location: string         // 居住地（例: "東京都"）

  // パーソナリティ
  personality: string[]    // 性格・人柄（例: ["几帳面", "研究熱心"]）
  hobbies: string[]        // 趣味（例: ["カフェ巡り", "コスメショッピング"]）

  // 美容・スキンケア
  skinType: string         // 肌タイプ（例: "混合肌（Tゾーン脂性・頬乾燥）"）
  skinConcerns: string[]   // 肌悩み（例: ["毛穴の開き", "くすみ"]）
  beautyPhilosophy: string // 美容哲学（例: "続けられるシンプルなケアが一番"）
  beautyJourney: string    // 美容との出会い・変化のストーリー（1〜2文）

  // ナラティブ（ベンチマークデータから帰納的に抽出・推測補完禁止）
  narrativeHook?: string      // フォローする決め手（1文）
  narrativeIdentity?: string  // この人物の立ち位置・発信の理由（2〜3文）
}

export interface Persona {
  id: string
  createdAt: string
  name: string             // 管理用の表示名
  characterText: string    // プロフィール文（3行程度）
  themeTags: string[]      // ベンチマーク由来タグ（投稿マッチングに使う）
  contentThemeTags: string[] | null // 生成方向タグ（nullのときはthemeTagsで代替）
  typeRatios: TypeRatios   // 投稿種別の割合
  avatarUrl: string | null // アバター顔画像URL
  benchmarkAccount: string | null // 参照元アカウント（ペルソナの源泉・性格や作り方を真似る）
  typeEmphasis: TypeEmphasis | null // v3: 派生バリエーションの差分（null=基本型）
  visualProfile: VisualProfile | null // v3: 画像生成用ビジュアル固定プロフィール
  profile: RichPersonaProfile | null  // v3: 人物プロフィール（UI表示・手動編集用）
}

// ─── ベンチマーク投稿 ───────────────────────────────────────────

export interface SlideRole {
  slide: number       // スライド番号（1〜）
  role: string        // 役割（例: "フック" / "詳細" / "転機" / "CTA"）
  description: string // 具体的な内容の説明
}

export type PostType = "tips" | "product" | "mixed"
export type Tone = "emotional" | "informative" | "review" | "entertainment"

// ─── v3: 3つの型（自己同一化フック原理に基づく汎用パターン）──
export type HookType = "F1" | "F2" | "F3" | "F4" | "F5"
export type StructureType = "S1" | "S2" | "S3" | "S4" | "S5"
export type CompositionType = "C1" | "C2" | "C3" | "C4" | "C5"

export interface PatternNotes {
  hookReason: string         // メインフックの判定理由
  structureReason: string    // 構造型の判定理由
  compositionReason: string  // 構図型の判定理由
  abstractionCheck: string   // 自己同一化フック原理セルフチェック（肌・モテで言い換え可能か）
}

export interface BenchmarkPost {
  id: string
  createdAt: string
  accountName: string       // ベンチマークアカウント名
  folderPath: string        // 管理用の識別子（例: 'accountA/post_001'）
  slideUrls: string[]       // 各スライドのVercel Blob URL（順番通り）
  slideCount: number        // 実際のスライド枚数
  slideStructure: SlideRole[] // 各スライドの役割
  postType: PostType
  themeTags: string[]
  tone: Tone
  caption: string | null    // 元投稿のキャプション原文（運用者が手入力）

  // スライドごとのスタイル説明キャッシュ（URL → 英語説明文）
  // 画像生成時に describeV3SlideStyle の結果をDBに保存したもの。null は未分析。
  slideStyleDescs: Record<string, string> | null

  // 3つの型（Claude Vision 自動分類・null は未分析）
  hookMain:        HookType | null
  hookSubs:        HookType[]
  structureType:   StructureType | null
  compositionType: CompositionType | null
  patternNotes:    PatternNotes | null

  // v4: 非表示フラグ（ペルソナ生成や参照候補から除外する）
  isHidden: boolean
}

// ─── コンテンツプラン ────────────────────────────────────────────

export type PlanPostStatus = "planned" | "text_done" | "image_done"

export interface PlanPost {
  day: number              // 1=月〜7=日
  postType: PostType
  benchmarkPostId: string  // 型紙にするベンチマーク投稿のID
  generatedText: GeneratedPostText | null  // テキスト生成後に入る
  generatedImages: string[] | null         // 画像URL一覧（画像生成後に入る）
  status: PlanPostStatus
}

export interface GeneratedPostText {
  overallTitle: string
  slides: GeneratedSlide[]
  caption: string
  claudeUsage?: Array<{ inputTokens: number; outputTokens: number; model: "sonnet" | "haiku" }>
}

export interface GeneratedSlide {
  slideNumber: number
  tag: string
  headline: string
  bullets?: string[]
  accent?: string
}

export interface ContentPlan {
  id: string
  createdAt: string
  personaId: string
  productId: string | null
  weekStart: string  // ISO date（例: '2026-04-28'）
  posts: PlanPost[]
}

// ─── 競合商品 ───────────────────────────────────────────────────

export interface CompetitorProduct {
  id: string
  createdAt: string
  productId: string     // 紐づく自社商品のID
  brandName: string
  productName: string
  price: string | null
  features: string      // 主な成分・特徴
  pros: string          // メリット
  cons: string          // デメリット
  imageUrl: string      // Vercel Blob URL
  imageMime: string
  category: string | null
  tags: string[]
}

// ─── v3: 生成済み投稿（Supabase generated_posts テーブルの型）──

export interface GeneratedPost {
  id: string
  createdAt: string
  personaId: string
  personaName: string          // personas テーブルから JOIN して取得
  postType: PostType
  productId: string | null
  overallTitle: string
  slides: GeneratedSlide[]
  caption: string | null
  hookType: HookType | null
  structureType: StructureType | null
  compositionType: CompositionType | null
  refBenchmark: string | null
  imageUrls: string[]
}

// ─── v4: 生成キュー ──────────────────────────────────────────────

export type JobStatus = "pending" | "text_generating" | "image_generating" | "done" | "error"

export interface SlideRegenParams {
  generatedPostId: string   // 更新対象の generated_posts.id
  slideIndex:      number   // 0-based
  slide:           GeneratedSlide
  types:           { hookType: HookType; structureType: StructureType; compositionType: CompositionType } | null
  refBenchmark?:   string   // 使用するベンチマークの folder_path
}

export interface GenerationJob {
  id: string
  personaId: string
  postType: PostType
  productId?: string
  benchmarkFolderPath?: string
  status: JobStatus
  jobType?: "post_gen" | "slide_regen"        // デフォルト post_gen
  slideRegenParams?: SlideRegenParams          // jobType=slide_regen のみ
  textResult?: { types: { hookType: HookType; structureType: StructureType; compositionType: CompositionType }; generated: GeneratedPostText }
  imageUrls?: (string | null)[]
  refBenchmark?: string
  policyFallbackSlides?: number[]
  failedSlides?: number[]
  errorMessage?: string
  createdAt: string
  updatedAt: string
  // 表示用に JOIN
  personaName?: string
}

// ─── ベンチマーク登録時の分析結果（API内部用）──────────────────

export interface BenchmarkAnalysisResult {
  folderPath: string
  slideUrls: string[]
  slideCount: number
  slideStructure: SlideRole[]
  postType: PostType
  themeTags: string[]
  tone: Tone
  caption: string | null
  hookMain:        HookType | null
  hookSubs:        HookType[]
  structureType:   StructureType | null
  compositionType: CompositionType | null
  patternNotes:    PatternNotes | null
}
