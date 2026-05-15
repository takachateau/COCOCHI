/**
 * GET    /api/benchmark/posts              — 登録済みベンチマーク投稿一覧
 * PATCH  /api/benchmark/posts              — アカウント名を一括リネーム { oldName, newName }
 * DELETE /api/benchmark/posts?id=xxx       — ベンチマーク投稿を削除
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadBenchmarkPosts, dbDeleteBenchmarkPost, dbRenameAccount } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // accountName が指定された場合は DB クエリレベルでフィルタ（全件取得を避ける）
    const accountName = searchParams.get("accountName") ?? undefined
    const posts = await dbLoadBenchmarkPosts(accountName)
    return NextResponse.json({ posts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { oldName?: string; newName?: string }
    const { oldName, newName } = body
    if (!oldName?.trim() || !newName?.trim()) {
      return NextResponse.json({ error: "oldName と newName は必須です" }, { status: 400 })
    }
    if (oldName === newName) return NextResponse.json({ ok: true })
    await dbRenameAccount(oldName.trim(), newName.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })
    await dbDeleteBenchmarkPost(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
