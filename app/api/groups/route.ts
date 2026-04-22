import { NextRequest, NextResponse } from "next/server"
import { loadGroups } from "@/lib/storage"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const groups = await loadGroups()
  // admin=true の場合は全件返す（hiddenも含む）
  if (req.nextUrl.searchParams.get("admin") === "true") {
    return NextResponse.json(groups)
  }
  return NextResponse.json(groups.filter(g => !g.hidden))
}
