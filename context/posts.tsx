"use client"

import { createContext, useContext, useState, useEffect } from "react"
import type { PostGroup } from "@/types"

interface PostsCtx {
  groups: PostGroup[]
  loading: boolean
  addGroup: (g: PostGroup) => void
  removeGroup: (id: string) => Promise<void>
  updateGroup: (g: PostGroup) => void
}

const Ctx = createContext<PostsCtx>({
  groups: [],
  loading: true,
  addGroup: () => {},
  removeGroup: async () => {},
  updateGroup: () => {},
})

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<PostGroup[]>([])
  const [loading, setLoading] = useState(true)

  // 起動時にディスクから読み込む
  useEffect(() => {
    fetch("/api/groups")
      .then(r => r.json())
      .then((data: PostGroup[]) => setGroups(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function addGroup(g: PostGroup) {
    setGroups(prev => [g, ...prev])
  }

  async function removeGroup(id: string) {
    await fetch(`/api/groups/${id}`, { method: "DELETE" })
    setGroups(prev => prev.filter(x => x.id !== id))
  }

  function updateGroup(g: PostGroup) {
    setGroups(prev => prev.map(x => x.id === g.id ? g : x))
  }

  return (
    <Ctx.Provider value={{ groups, loading, addGroup, removeGroup, updateGroup }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePosts = () => useContext(Ctx)
