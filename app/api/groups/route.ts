import { NextResponse } from "next/server"
import { loadGroups } from "@/lib/storage"

export const runtime = "nodejs"

export function GET() {
  const groups = loadGroups()
  return NextResponse.json(groups)
}
