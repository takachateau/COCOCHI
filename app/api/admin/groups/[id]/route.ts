import { NextRequest, NextResponse } from "next/server"
import { toggleGroupVisibility } from "@/lib/storage"

export const runtime = "nodejs"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { hidden } = await req.json() as { hidden: boolean }
  await toggleGroupVisibility(id, hidden)
  return NextResponse.json({ ok: true })
}
