import { NextRequest, NextResponse } from "next/server"
import { deleteGroup } from "@/lib/storage"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteGroup(id)
  return NextResponse.json({ ok: true })
}
