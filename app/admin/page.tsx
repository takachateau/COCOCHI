"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Eye, EyeOff, ArrowLeft, Package, Save, Check } from "lucide-react"
import type { PostGroup } from "@/types"

export default function AdminPage() {
  const [groups, setGroups]         = useState<PostGroup[]>([])
  const [hiddenMap, setHiddenMap]   = useState<Record<string, boolean>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  useEffect(() => {
    fetch("/api/groups?admin=true")
      .then(r => r.json())
      .then((data: PostGroup[]) => {
        setGroups(data)
        const map: Record<string, boolean> = {}
        data.forEach((g: PostGroup) => { map[g.id] = !!g.hidden })
        setHiddenMap(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setHiddenMap(prev => ({ ...prev, [id]: !prev[id] }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const updates = Object.entries(hiddenMap).map(([id, hidden]) => ({ id, hidden }))
      const res = await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error("保存失敗")
      setSaved(true)
    } catch {
      alert("保存に失敗しました。もう一度お試しください。")
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = groups.some(g => !!g.hidden !== !!hiddenMap[g.id])
  const visibleCount = Object.values(hiddenMap).filter(h => !h).length
  const hiddenCount  = Object.values(hiddenMap).filter(h => h).length

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
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>管理画面</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              表示: {visibleCount} / 非表示: {hiddenCount}
            </span>
            <button
              onClick={save}
              disabled={saving || (!hasChanges && !saved)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
              style={{ background: saved && !hasChanges ? "#4caf82" : "var(--accent)" }}
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : saved && !hasChanges ? (
                <><Check className="w-4 h-4" />保存済み</>
              ) : (
                <><Save className="w-4 h-4" />保存する</>
              )}
            </button>
          </div>
        </div>

        {hasChanges && (
          <p className="text-sm text-center py-2 rounded-xl" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            変更があります。「保存する」を押して反映してください。
          </p>
        )}

        {loading ? (
          <p className="text-center py-20" style={{ color: "var(--muted)" }}>読み込み中...</p>
        ) : groups.length === 0 ? (
          <p className="text-center py-20" style={{ color: "var(--muted)" }}>履歴がありません</p>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const isHidden = !!hiddenMap[group.id]
              return (
                <div
                  key={group.id}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-opacity"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    opacity: isHidden ? 0.45 : 1,
                  }}
                >
                  {/* 商品画像 */}
                  <div
                    className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: "var(--accent-light)" }}
                  >
                    {group.productImageUrl ? (
                      <img src={group.productImageUrl} alt={group.productName} className="w-full h-full object-cover" />
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

                  {/* トグルボタン */}
                  <button
                    onClick={() => toggle(group.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={
                      isHidden
                        ? { background: "var(--accent-light)", color: "var(--accent)" }
                        : { background: "var(--border)", color: "var(--muted)" }
                    }
                  >
                    {isHidden
                      ? <><EyeOff className="w-4 h-4" />非表示</>
                      : <><Eye className="w-4 h-4" />表示中</>
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
