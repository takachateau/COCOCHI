/**
 * POST /api/v4/benchmark/toggle-account-hidden
 * ベンチマークアカウント全体の非表示フラグを切り替える。
 * 非表示にしたアカウントの投稿は生成キューの自動選択から除外される。
 */
import { NextRequest, NextResponse } from "next/server"
import { dbToggleAccountHidden } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { accountName?: string; isHidden?: boolean }
    const { accountName, isHidden } = body

    if (!accountName || typeof isHidden !== "boolean") {
      return NextResponse.json({ error: "accountName, isHidden は必須" }, { status: 400 })
    }

    await dbToggleAccountHidden(accountName, isHidden)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/benchmark/toggle-account-hidden]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
