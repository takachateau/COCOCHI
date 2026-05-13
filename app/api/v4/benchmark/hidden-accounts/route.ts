/**
 * GET /api/v4/benchmark/hidden-accounts
 * 非表示になっているベンチマークアカウント名のリストを返す。
 * ベンチマークページのアカウントカード表示用。
 */
import { NextResponse } from "next/server"
import { dbLoadAllAccountHiddenMap } from "@/lib/supabase"

export async function GET() {
  try {
    const map = await dbLoadAllAccountHiddenMap()
    // { accountName: isHidden } オブジェクトに変換
    const result: Record<string, boolean> = {}
    for (const [name, hidden] of map) result[name] = hidden
    return NextResponse.json({ accountHiddenMap: result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[v4/benchmark/hidden-accounts]", e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
