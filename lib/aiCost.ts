/**
 * AI コスト計算モジュール
 * 各 AI モデルの利用コストを USD / JPY / CNY で計算する
 */

// ─── 価格定数（USD） ─────────────────────────────────────────────────
const PRICING = {
  // Claude（Anthropic）
  claudeSonnet46: { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  claudeHaiku45:  { inputPerMTok: 0.8, outputPerMTok: 4.0  },

  // FAL.ai — gpt-image-2（中品質 768×1024）
  falGptImage2Edit: 0.06,   // openai/gpt-image-2/edit（参照画像あり）
  falGptImage2Text: 0.04,   // openai/gpt-image-2（テキストのみ）

  // FAL.ai — nano-banana
  falNanaBananaPro: 0.013,  // fal-ai/nano-banana-pro/edit
  falNanaBanana2:   0.008,  // fal-ai/nano-banana-2
} as const

// 為替レート
const USD_TO_JPY = 155
const USD_TO_CNY = 7.3

// ─── 型定義 ─────────────────────────────────────────────────────────
export interface AiCost {
  usd: number
  jpy: number
  cny: number
}

export interface ClaudeUsageEntry {
  inputTokens:  number
  outputTokens: number
  model: "sonnet" | "haiku"
}

// ─── 計算関数 ─────────────────────────────────────────────────────
export function calcClaudeCost(entries: ClaudeUsageEntry[]): AiCost {
  let usd = 0
  for (const e of entries) {
    const p = e.model === "haiku" ? PRICING.claudeHaiku45 : PRICING.claudeSonnet46
    usd += (e.inputTokens  / 1_000_000) * p.inputPerMTok
    usd += (e.outputTokens / 1_000_000) * p.outputPerMTok
  }
  return { usd, jpy: usd * USD_TO_JPY, cny: usd * USD_TO_CNY }
}

/**
 * FAL 画像生成コスト計算
 * @param calls  FAL を何回呼んだか（ポリシーエラー再生成は +1）
 * @param hasImages  参照画像ありの edit モードか
 * @param model  使用モデル
 */
export function calcFalCost(
  calls: number,
  hasImages: boolean,
  model: "gpt-image-2" | "nano-banana" = "gpt-image-2",
): AiCost {
  let perCall: number
  if (model === "gpt-image-2") {
    perCall = hasImages ? PRICING.falGptImage2Edit : PRICING.falGptImage2Text
  } else {
    perCall = hasImages ? PRICING.falNanaBananaPro : PRICING.falNanaBanana2
  }
  const usd = perCall * calls
  return { usd, jpy: usd * USD_TO_JPY, cny: usd * USD_TO_CNY }
}

export function sumCosts(costs: AiCost[]): AiCost {
  const usd = costs.reduce((s, c) => s + c.usd, 0)
  return { usd, jpy: usd * USD_TO_JPY, cny: usd * USD_TO_CNY }
}

// ─── フォーマット ─────────────────────────────────────────────────
export function formatCost(cost: AiCost) {
  const fmtJpy = `¥${Math.round(cost.jpy).toLocaleString("ja-JP")}`
  const fmtCny = `¥${cost.cny.toFixed(2)}`
  const fmtUsd = `$${cost.usd.toFixed(4)}`
  return { jpy: fmtJpy, cny: fmtCny, usd: fmtUsd }
}
