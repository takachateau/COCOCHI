import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const { pdfBase64 } = await req.json()
  if (!pdfBase64) {
    return NextResponse.json({ error: "PDFデータが必要です" }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: `このPDFから化粧品・美容製品の情報を抽出してください。
以下の情報があれば必ず含めてください：
- 成分・配合成分とその効能
- 商品の特徴・訴求ポイント
- 使用方法・使い方
- 価格・容量
- 注意事項・禁忌

箇条書きや見出しを使ってわかりやすくまとめてください。
PDFに含まれていない情報は省略してください。`,
          },
        ],
      },
    ],
  })

  const text = res.content[0].type === "text" ? res.content[0].text.trim() : ""
  return NextResponse.json({ text })
}
