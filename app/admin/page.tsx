"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Eye, EyeOff, ArrowLeft, Package } from "lucide-react"
import type { PostGroup } from "@/types"

export default function AdminPage() {
  const [groups, setGroups] = useState<PostGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/groups?admin=true")
      .then(r => r.json())
      .then((data: PostGroup[]) => setGroups(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggleVisibility(id: string, currentHidden: boolean) {
    setToggling(id)
    try {
      await fetch(`/api/admin/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !currentHidden }),
      })
      setGroups(prev =>
        prev.map(g => g.id === id ? { ...g, hidden: !currentHidden } : g)
      )
    } catch {
      // silent
    } finally {
      setToggling(null)
    }
  }

  const visible = groups.filter(g => !g.hidden)
  const hidden  = groups.filter(g => g.hidden)

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm hover:opacity-70 transition-opacity"
              style={{ color: "var(--muted)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              戻る
            </Link>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
              管理画面
            </h1>
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            表示: {visible.length} / 非表示: {hidden.length}
          </div>
        </div>

        {loading ? (
          <p className="text-center py-20" style={{ color: "var(--muted)" }}>読み込み中...</p>
        ) : groups.length === 0 ? (
          <p className="text-center py-20" style={{ color: "var(--muted)" }}>履歴がありません</p>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <div
                key={group.id}
                className="flex items-center gap-4 rounded-2xl p-4 transition-opacity"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  opacity: group.hidden ? 0.5 : 1,
                }}
              >
                {/* 商品画像 */}
                <div
                  className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ background: "var(--accent-light)" }}
                >
                  {group.productImageUrl ? (
                    <img
                      src={group.productImageUrl}
                      alt={group.productName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6" style={{ color: "var(--accent)" }} />
                  )}
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate" style={{ color: "var(--text)" }}>
                    {group.productName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {new Date(group.createdAt).toLocaleString("ja-JP", {
                      month: "numeric", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                    　{group.posts.length}パターン
                    {group.costSummary && `　¥${group.costSummary.totalJpy.toLocaleString()}`}
                  </p>
                </div>

                {/* 表示/非表示トグル */}
                <button
                  onClick={() => toggleVisibility(group.id, !!group.hidden)}
                  disabled={toggling === group.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={
                    group.hidden
                      ? { background: "var(--accent-light)", color: "var(--accent)" }
                      : { background: "var(--border)", color: "var(--muted)" }
                  }
                >
                  {toggling === group.id ? (
                    <span className="w-4 h-4 border-2 rounded-full animate-spin inline-block"
                      style={{ borderColor: "var(--muted)", borderTopColor: "transparent" }} />
                  ) : group.hidden ? (
                    <><EyeOff className="w-4 h-4" />非表示</>
                  ) : (
                    <><Eye className="w-4 h-4" />表示中</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
