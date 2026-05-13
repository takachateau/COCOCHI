import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    hasKey: !!key,
    keyType: typeof key,
    keyPrefix: key ? key.substring(0, 12) + "..." : null,
    keyLength: key?.length ?? 0,
  })
}
