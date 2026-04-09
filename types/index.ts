// 登録商品マスタ
export interface Product {
  id: string
  createdAt: string
  name: string
  efficacy: string
  howToUse: string
  price?: string      // 例: ¥2,200
  imageUrl: string    // Vercel Blob 永続URL
  imageMime: string
}

export interface ProductInput {
  productName: string
  efficacy: string
  howToUse: string
  price?: string
  target?: string
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
  angle: string             // "感情体験" | "成分・効果" | "ライフスタイル"
  colorPalette: string      // "pink"|"blue"|"green"|"yellow"|"purple"|"orange"|"teal"|"mono"
  overallTitle: string      // 記事全体のタイトル（ダッシュボード表示用）
  slides: SlideContent[]    // 5枚分
}

// Claudeの生成結果（3パターン）
export interface ArticleContent {
  articles: ArticleVariant[]
}

// 1パターン分の生成済み投稿
export interface Post {
  id: string
  angle: string             // 切り口ラベル
  patternName: string       // "商品切り抜き型" | "手持ちUGC型" | "直置きUGC型" | "記事投稿型"
  overallTitle: string
  slides: SlideContent[]
  images: string[]          // Vercel Blob URL or data:image/jpeg;base64,...  ×5
  colorPalette?: string     // 再生成用（"pink"|"blue"|"green" etc.）
  qcScore?: number          // Claude Vision QCスコア（0〜100）
  qcComment?: string        // QCコメント
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
