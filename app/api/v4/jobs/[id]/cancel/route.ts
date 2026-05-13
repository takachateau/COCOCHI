import { NextRequest, NextResponse } from "next/server"
import { dbUpdateJob } from "@/lib/supabase"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  try {
    await dbUpdateJob(id, {
      status: "cancelled",
      errorMessage: "ユーザーによってキャンセルされました",
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
