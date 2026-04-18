// このルートは廃止済み（Vercel Blob移行により不要）
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export function GET() {
  return new NextResponse("Not found", { status: 404 })
}
