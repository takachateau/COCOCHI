/**
 * GET  /api/benchmark/accounts              — アカウント一覧 + bio
 * PATCH /api/benchmark/accounts             — アカウント bio を保存 { accountName, bio }
 */
import { NextRequest, NextResponse } from "next/server"
import { dbLoadBenchmarkPosts, dbLoadAccountBio, dbSaveAccountBio } from "@/lib/supabase"

export async function GET() {
  try {
    const posts = await dbLoadBenchmarkPosts()
    const accountMap = new Map<string, number>()
    for (const p of posts) {
      accountMap.set(p.accountName, (accountMap.get(p.accountName) ?? 0) + 1)
    }
    const accounts = Array.from(accountMap.entries()).map(([accountName, count]) => ({
      accountName,
      analyzedCount: count,
    }))
    return NextResponse.json({ accounts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { accountName?: string; bio?: string }
    const { accountName, bio } = body
    if (!accountName?.trim()) return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })
    await dbSaveAccountBio(accountName.trim(), bio ?? "")
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { accountName?: string }
    const { accountName } = body
    if (!accountName?.trim()) return NextResponse.json({ error: "accountName は必須です" }, { status: 400 })
    const bio = await dbLoadAccountBio(accountName.trim())
    return NextResponse.json({ bio })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
