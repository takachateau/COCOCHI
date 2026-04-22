import { NextRequest, NextResponse } from "next/server"
import { put, list } from "@vercel/blob"

export const runtime = "nodejs"

const GROUPS_BLOB_PATH = "cocochi/db/groups.json"

/**
 * 一括で hidden フラグを更新する。
 * 1回のread-modify-writeにまとめることでCDNキャッシュ競合を回避。
 */
export async function PATCH(req: NextRequest) {
  const { updates } = await req.json() as { updates: { id: string; hidden: boolean }[] }

  // 最新のBlobを読む
  const { blobs } = await list({ prefix: GROUPS_BLOB_PATH })
  const blob = blobs.find(b => b.pathname === GROUPS_BLOB_PATH)
  if (!blob) return NextResponse.json({ error: "groups not found" }, { status: 404 })

  const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" })
  const groups = await res.json()

  // 一括で hidden を更新
  const updateMap = new Map(updates.map(u => [u.id, u.hidden]))
  const updated = groups.map((g: { id: string }) =>
    updateMap.has(g.id) ? { ...g, hidden: updateMap.get(g.id) } : g
  )

  // 1回だけ書き込む
  await put(GROUPS_BLOB_PATH, JSON.stringify(updated, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  })

  return NextResponse.json({ ok: true })
}
