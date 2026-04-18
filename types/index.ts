// 登録商品マスタ
export interface Product {
  id: string
  createdAt: string
  name: string
  ingredients: string   // 成分表とその効能
  howToUse: string
  price?: string        // 例: ¥2,200
  appealPoints?: string // アピールポイント
  forbiddenWords?: string // 禁止用語
  pdfText?: string      // PDFから抽出したテキスト
  imageUrl: string      // Vercel Blob 永続URL
  imageMime: string
  // backward compat
  efficacy?: string
}

export interface ProductInput {
  productName: string
  ingredients: string   // 成分表とその効能
  howToUse: string
  price?: string
  appealPoints?: string
  forbiddenWords?: string
  pdfText?: string
  target?: string
  /**
   * パターン順のアピール角度（省略時はサーバー側でランダム選択）
   * 順序: [エンタメ導入型, 手持ちUGC型, 直置きUGC型, 記事投稿型]
   * 空文字のスロットはそのパターンのプールからランダム選択
   */
  appealAngles?: string[]
  productImageBase64: string
  productImageMime: string
}

// Claudeが生成する1枚分のスライドコンテンツ
export interface SlideContent {
  slideNumber: number       // 1〜5
  tag: string               // 上部の小タグ
  headline: string          // メインタイトル (改行は \n)
  body?: string             // 本文（2〜4枚目）
  bullets?: string[]        // 箇条書き（2〜4枚目）
  price?: string            // 価格（2枚目のみ）
  accent?: string           // 下部バナーのキャッチ
}

// 1パターン分の投稿記事（切り口）
export interface ArticleVariant {
  angle: string             // "感情体験" | "成分・効果" | "ライフスタイル" | "ビフォーアフター"
  suggestedPattern: string  // AIが判断した最適なパターン型
  colorPalette: string      // "pink"|"blue"|"green"|"yellow"|"purple"|"orange"|"teal"|"mono"
  overallTitle: string      // 記事全体のタイトル（ダッシュボード表示用）
  slides: SlideContent[]    // 5枚分
  // エンタメ導入型専用フィールド
  hookTheme?: string        // フックテーマカテゴリ（例: "恋愛・感情体験"）
  hookTitle?: string        // 1枚目のキャッチコピー（商品と無関係）
  hookStructure?: string    // 構造タイプ（例: "感情ストーリー型"）
}

// Claudeの生成結果（4パターン）
export interface ArticleContent {
  articles: ArticleVariant[]
}

// 1パターン分の生成済み投稿
export interface Post {
  id: string
  angle: string             // 切り口ラベル
  patternName: string       // "エンタメ導入型" | "手持ちUGC型" | "直置きUGC型" | "記事投稿型"
  overallTitle: string
  slides: SlideContent[]
  images: string[]          // Vercel Blob URL or data:image/jpeg;base64,...  ×5
  colorPalette?: string     // 再生成用（"pink"|"blue"|"green" etc.）
  styleDescription?: string // 初回生成時のFALスタイル説明（再生成でスタイル維持に使用）
  refImageUrl?: string      // 初回生成時の参照画像URL（再生成でスタイル維持に使用）
  hookTheme?: string        // エンタメ導入型専用: フックテーマ
  hookTitle?: string        // エンタメ導入型専用: フックキャッチコピー
  hookStructure?: string    // エンタメ導入型専用: 構造タイプ
  qcScore?: number          // Claude Vision QCスコア（0〜100）
  qcComment?: string        // QCコメント
  caption?: string          // Instagram投稿用キャプション
}

// 1商品の生成セッション（4パターンをまとめる）
export interface PostGroup {
  id: string
  createdAt: string
  productName: string
  productImageBase64: string
  productImageMime: string
  productImageUrl?: string  // 永続Blob URL（再生成用）
  posts: Post[]             // 4パターン
  costSummary?: CostSummary
}

export interface CostSummary {
  falImages: number           // FAL生成枚数
  falUsd: number              // FAL合計 USD
  claudeInputTokens: number
  claudeOutputTokens: number
  claudeUsd: number           // Claude合計 USD
  removeBgJpy: number         // remove.bg 合計 JPY
  totalUsd: number
  totalJpy: number            // 合計 円
  totalCny: number            // 合計 元
}

// 1商品の生成セッション（4パターンをまとめる）— costSummary追加
export interface GenerateResponse {
  group: PostGroup
  error?: string
}
