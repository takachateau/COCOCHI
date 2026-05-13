/**
 * GET    /api/v3/generated-posts        — 生成済み投稿一覧（最新100件）
 * POST   /api/v3/generated-posts        — 生成済み投稿を保存
 * DELETE /api/v3/generated-posts?id=xxx — 生成済み投稿を削除
 */
import { NextRequest, NextResponse } from "next/server"
import { dbSaveGeneratedPost, dbLoadGeneratedPosts, dbLoadRecentPostsByPersona, dbDeleteGeneratedPost, dbUpdateGeneratedPostImages } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId")
    const posts = personaId
      ? await dbLoadRecentPostsByPersona(personaId, 50)
      : await dbLoadGeneratedPosts()
    return NextResponse.json({ posts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Parameters<typeof dbSaveGeneratedPost>[0]
    const post = await dbSaveGeneratedPost(body)
    return NextResponse.json({ post })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })
    const body = await req.json() as { imageUrls?: string[] }
    if (!Array.isArray(body.imageUrls)) return NextResponse.json({ error: "imageUrls は必須です" }, { status: 400 })
    await dbUpdateGeneratedPostImages(id, body.imageUrls)
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
    await dbDeleteGeneratedPost(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
