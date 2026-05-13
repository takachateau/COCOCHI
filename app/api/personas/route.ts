/**
 * GET  /api/personas       — ペルソナ一覧を取得
 * GET  /api/personas?id=xx — 単一ペルソナを取得
 * POST /api/personas       — ペルソナを直接保存（生成済みデータを登録する場合）
 * DELETE /api/personas?id=xxx — ペルソナを削除
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadPersonas, dbSavePersona, dbDeletePersona, dbUpdatePersonaFields } from "@/lib/supabase"
import type { Persona } from "@/types/v2"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const personas = await dbLoadPersonas()
    if (id) {
      const persona = personas.find(p => p.id === id) ?? null
      return NextResponse.json({ persona })
    }
    return NextResponse.json({ personas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<Persona, "id" | "createdAt">
    const persona = await dbSavePersona(body)
    return NextResponse.json({ persona })
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
    const body = await req.json() as {
      contentThemeTags?: string[]
      characterText?: string
      avatarUrl?: string | null
      visualProfile?: Persona["visualProfile"]
      profile?: Persona["profile"]
      name?: string
      typeRatios?: Persona["typeRatios"]
    }
    if (body.contentThemeTags !== undefined && !Array.isArray(body.contentThemeTags)) {
      return NextResponse.json({ error: "contentThemeTags は配列です" }, { status: 400 })
    }
    await dbUpdatePersonaFields(id, body)
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
    await dbDeletePersona(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
