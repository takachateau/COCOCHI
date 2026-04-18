import { NextResponse } from "next/server"
import { loadGroups } from "@/lib/storage"

export const runtime = "nodejs"

export async function GET() {
  const groups = await loadGroups()
  return NextResponse.json(groups)
}
