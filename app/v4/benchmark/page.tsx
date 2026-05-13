"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, ChevronDown, ChevronUp, Image, X, ChevronLeft, ChevronRight, Plus, CheckCircle2, AlertCircle, BarChart2, Sparkles, Pencil, Check, EyeOff, Eye } from "lucide-react"
import type { BenchmarkPost, HookType, StructureType, CompositionType } from "@/types/v2"
import { useLanguage } from "@/context/language"
import { useT } from "@/lib/i18n"

const POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  tips:    { bg: "#2563eb33", text: "#93c5fd" },
  product: { bg: "#f59e0b33", text: "#fcd34d" },
  mixed:   { bg: "#10b98133", text: "#6ee7b7" },
}

type BulkPostStatus = "idle" | "uploading" | "done" | "error"

interface BulkPost {
  id: string
  folderName: string
  caption: string
  files: File[]
  status: BulkPostStatus
  errorMsg?: string
}

function newBulkPost(): BulkPost {
  return {
    id: crypto.randomUUID(),
    folderName: "",
    caption: "",
    files: [],
    status: "idle",
  }
}

export default function BenchmarkPage() {
  const { lang } = useLanguage()
  const t = useT(lang)
  const bm = t.benchmark
  const POST_TYPE_LABELS: Record<string, string> = bm.postType
  const POST_TYPE_DESCRIPTIONS: Record<string, string> = bm.postTypeDesc
  const TONE_LABELS: Record<string, string> = bm.tone
  const HOOK_LABELS: Record<HookType, string> = bm.hook
  const STRUCTURE_LABELS: Record<StructureType, string> = bm.structure
  const COMPOSITION_LABELS: Record<CompositionType, string> = bm.composition
  const [accountName, setAccountName]     = useState("")
  const [folderName, setFolderName]       = useState("")
  const [caption, setCaption]             = useState("")
  const [files, setFiles]                 = useState<File[]>([])
  const [dragging, setDragging]           = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [result, setResult]               = useState<BenchmarkPost | null>(null)
  const [uploadCompleted, setUploadCompleted] = useState<{ accountName: string; count: number } | null>(null)
  const [error, setError]                 = useState("")
  const [posts, setPosts]                 = useState<BenchmarkPost[]>([])
  const [preview, setPreview]             = useState<{ post: BenchmarkPost; slideIndex: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── 画面切替 ───
  const [view, setView]                   = useState<"upload" | "list">("list")
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)

  // ─── 一括登録モード ───
  const [mode, setMode]                   = useState<"single" | "bulk">("single")
  const [bulkPosts, setBulkPosts]         = useState<BulkPost[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)

  // ─── 全件再分析 ───
  const [reanalyzing, setReanalyzing]         = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ current: number; total: number; folder: string } | null>(null)

  // ─── アカウント名編集 ───
  const [editingAccountName, setEditingAccountName] = useState(false)
  const [accountNameInput, setAccountNameInput]     = useState("")
  const [renamingAccount, setRenamingAccount]       = useState(false)

  // ─── アカウントbio ───
  const [accountBio, setAccountBio]         = useState("")
  const [bioInput, setBioInput]             = useState("")
  const [editingBio, setEditingBio]         = useState(false)
  const [savingBio, setSavingBio]           = useState(false)
  const [loadingBio, setLoadingBio]         = useState(false)

  // ─── アカウントレベル非表示 ───
  const [accountHiddenMap, setAccountHiddenMap] = useState<Record<string, boolean>>({})

  // ─── 背景グループ設定 ───
  const [bgGroupState, setBgGroupState] = useState<{ postId: string; slideUrls: string[]; groups: number[][] } | null>(null)
  const [bgGroupDetecting, setBgGroupDetecting] = useState<string | null>(null)
  const [bgGroupSaving, setBgGroupSaving] = useState(false)
  const [bulkBgDetecting, setBulkBgDetecting] = useState(false)
  const [bulkBgProgress, setBulkBgProgress] = useState<{ current: number; total: number } | null>(null)

  const BG_GROUP_COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#f43f5e","#0891b2"]

  const CAPTION_MAX_LENGTH = 5000

  useEffect(() => {
    loadPosts()
    loadAccountHiddenMap()
  }, [])

  useEffect(() => {
    if (selectedAccount) {
      setEditingBio(false)
      loadBioForAccount(selectedAccount)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount])

  async function loadPosts() {
    const r = await fetch("/api/benchmark/posts")
    const d = await r.json() as { posts: BenchmarkPost[] }
    if (d.posts) setPosts(d.posts)
  }

  async function loadAccountHiddenMap() {
    try {
      const r = await fetch("/api/v4/benchmark/hidden-accounts")
      const d = await r.json() as { accountHiddenMap?: Record<string, boolean> }
      if (d.accountHiddenMap) setAccountHiddenMap(d.accountHiddenMap)
    } catch { /* 無視 */ }
  }

  async function handleToggleAccountHidden(accountName: string) {
    const currentHidden = accountHiddenMap[accountName] ?? false
    const newHidden = !currentHidden
    // 即時反映
    setAccountHiddenMap(prev => ({ ...prev, [accountName]: newHidden }))
    try {
      const r = await fetch("/api/v4/benchmark/toggle-account-hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, isHidden: newHidden }),
      })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? "更新失敗")
    } catch (e) {
      // 失敗したら元に戻す
      setAccountHiddenMap(prev => ({ ...prev, [accountName]: currentHidden }))
      alert(e instanceof Error ? e.message : "アカウント非表示設定に失敗しました")
    }
  }

  async function handleDeletePost(id: string, folderName: string) {
    if (!confirm(`「${folderName}」を完全に削除します。よろしいですか？\n（この操作は取り消せません）`)) return
    try {
      const r = await fetch(`/api/benchmark/posts?id=${id}`, { method: "DELETE" })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? "削除に失敗しました")
      await loadPosts()
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました")
    }
  }

  async function handleToggleHidden(id: string, currentHidden: boolean) {
    try {
      const r = await fetch("/api/v4/benchmark/toggle-hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isHidden: !currentHidden }),
      })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? "更新失敗")
      // ローカル状態を即時更新（再フェッチ不要）
      setPosts(prev => prev.map(p => p.id === id ? { ...p, isHidden: !currentHidden } : p))
    } catch (e) {
      alert(e instanceof Error ? e.message : "非表示設定に失敗しました")
    }
  }

  async function handleDetectBgGroups(post: BenchmarkPost) {
    // 設定済みならAPIコールなしでモーダルを開く（確認・修正用）
    if (post.backgroundGroups) {
      setBgGroupState({ postId: post.id, slideUrls: post.slideUrls, groups: post.backgroundGroups })
      return
    }
    setBgGroupDetecting(post.id)
    try {
      const r = await fetch("/api/v4/benchmark/detect-bg-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkPostId: post.id }),
      })
      const d = await r.json() as { groups?: number[][]; error?: string }
      if (d.error) throw new Error(d.error)
      setBgGroupState({ postId: post.id, slideUrls: post.slideUrls, groups: d.groups! })
    } catch (e) {
      alert(e instanceof Error ? e.message : "背景グループ検出に失敗しました")
    } finally {
      setBgGroupDetecting(null)
    }
  }

  // 全件一括BG検出（検出のみ自動保存、確認は後でBGボタンから）
  async function handleBulkDetectBgGroups(accountPosts: BenchmarkPost[]) {
    if (!confirm(`${accountPosts.length}件の投稿を一括でBG検出します。Claude Vision APIが各投稿に呼ばれます（数十秒かかります）。よろしいですか？`)) return
    setBulkBgDetecting(true)
    setBulkBgProgress({ current: 0, total: accountPosts.length })
    let successCount = 0
    for (let i = 0; i < accountPosts.length; i++) {
      const post = accountPosts[i]
      setBulkBgProgress({ current: i + 1, total: accountPosts.length })
      try {
        const r = await fetch("/api/v4/benchmark/detect-bg-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benchmarkPostId: post.id }),
        })
        const d = await r.json() as { groups?: number[][]; error?: string }
        if (d.error || !d.groups) continue
        // 自動保存
        await fetch("/api/v4/benchmark/save-bg-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benchmarkPostId: post.id, groups: d.groups }),
        })
        // ローカル状態も更新
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, backgroundGroups: d.groups! } : p))
        successCount++
      } catch { /* 1件失敗しても続行 */ }
    }
    setBulkBgDetecting(false)
    setBulkBgProgress(null)
    alert(`BG検出完了: ${successCount}/${accountPosts.length}件成功。各投稿の「✓BG」ボタンで確認・修正できます。`)
  }

  function cycleSlideGroup(slideIndex: number) {
    if (!bgGroupState) return

    const originalGroup = bgGroupState.groups.findIndex(g => g.includes(slideIndex))
    const wasAlone = bgGroupState.groups[originalGroup]?.length === 1

    // このスライドを取り除いた後のグループ配列（空グループは削除・先頭インデックス順に整列）
    const filtered = bgGroupState.groups
      .map(g => g.filter(i => i !== slideIndex))
      .filter(g => g.length > 0)
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))

    // filtered内での現グループ位置を特定
    // ソログループだった場合はそのグループ自体が消えているので末尾扱い（→次は0番に戻る）
    let posInFiltered: number
    if (wasAlone) {
      posInFiltered = filtered.length - 1
    } else {
      const sibling = bgGroupState.groups[originalGroup].find(i => i !== slideIndex)!
      posInFiltered = filtered.findIndex(g => g.includes(sibling))
    }

    // ソログループだったときは新規グループを作らず0番に戻す（1周してきた）
    const canCreateNew = !wasAlone && filtered.length < 6
    const cycleLen = canCreateNew ? filtered.length + 1 : filtered.length
    const nextGroup = (posInFiltered + 1) % cycleLen

    if (nextGroup < filtered.length) {
      filtered[nextGroup] = [...filtered[nextGroup], slideIndex].sort((a, b) => a - b)
    } else {
      filtered.push([slideIndex])
    }
    setBgGroupState(prev => prev ? { ...prev, groups: filtered } : null)
  }

  async function saveBgGroups() {
    if (!bgGroupState) return
    setBgGroupSaving(true)
    try {
      await fetch("/api/v4/benchmark/save-bg-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkPostId: bgGroupState.postId, groups: bgGroupState.groups }),
      })
      setPosts(prev => prev.map(p =>
        p.id === bgGroupState.postId ? { ...p, backgroundGroups: bgGroupState.groups } : p
      ))
      setBgGroupState(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました")
    } finally {
      setBgGroupSaving(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))
    setFiles(prev => [...prev, ...dropped].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    setFiles(prev => [...prev, ...picked].sort((a, b) => a.name.localeCompare(b.name)))
    e.target.value = ""
  }

  async function handleUpload() {
    if (!accountName.trim()) { setError("アカウント名を入力してください"); return }
    if (files.length === 0) { setError("スライド画像を選択してください"); return }
    if (caption.length > CAPTION_MAX_LENGTH) {
      setError(`キャプションは${CAPTION_MAX_LENGTH}文字以内にしてください`); return
    }
    setError("")
    setUploading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append("accountName", accountName.trim())
      if (folderName.trim()) form.append("postFolderName", folderName.trim())
      if (caption.trim()) form.append("caption", caption.trim())
      files.forEach(f => form.append("slides", f))

      const r = await fetch("/api/benchmark/upload", { method: "POST", body: form })
      const d = await r.json() as { result?: BenchmarkPost; error?: string }
      if (d.error) throw new Error(d.error)
      setResult(d.result!)
      setFiles([])
      setFolderName("")
      setCaption("")
      await loadPosts()
      setUploadCompleted({ accountName: d.result!.accountName, count: 1 })
      // AIレポートをバックグラウンドで自動生成（結果は次回アカウント詳細を開いたとき表示）
      void fetch("/api/benchmark/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: d.result!.accountName }),
      }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました")
    } finally {
      setUploading(false)
    }
  }

  // ─── 一括登録: ハンドラー群 ───

  function addBulkPost() {
    setBulkPosts(prev => [...prev, newBulkPost()])
  }

  function removeBulkPost(id: string) {
    setBulkPosts(prev => prev.filter(p => p.id !== id))
  }

  function updateBulkPost(id: string, patch: Partial<BulkPost>) {
    setBulkPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function addFilesToBulkPost(id: string, newFiles: File[]) {
    setBulkPosts(prev => prev.map(p => {
      if (p.id !== id) return p
      const merged = [...p.files, ...newFiles].sort((a, b) => a.name.localeCompare(b.name))
      return { ...p, files: merged }
    }))
  }

  function removeFileFromBulkPost(id: string, fileIdx: number) {
    setBulkPosts(prev => prev.map(p => {
      if (p.id !== id) return p
      return { ...p, files: p.files.filter((_, i) => i !== fileIdx) }
    }))
  }

  // 1投稿だけアップロードする内部関数
  async function uploadOneBulkPost(account: string, post: BulkPost): Promise<void> {
    setBulkPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: "uploading", errorMsg: undefined } : p))
    try {
      const form = new FormData()
      form.append("accountName", account)
      if (post.folderName.trim()) form.append("postFolderName", post.folderName.trim())
      if (post.caption.trim()) form.append("caption", post.caption.trim())
      post.files.forEach(f => form.append("slides", f))

      const r = await fetch("/api/benchmark/upload", { method: "POST", body: form })
      const d = await r.json() as { result?: BenchmarkPost; error?: string }
      if (d.error) throw new Error(d.error)
      setBulkPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: "done" } : p))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "アップロード失敗"
      setBulkPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: "error", errorMsg: msg } : p))
    }
  }

  // 共通の並列再分析ロジック
  async function reanalyzeBatch(targets: BenchmarkPost[]) {
    const CONCURRENCY = 5
    setReanalyzing(true)
    const total = targets.length
    let completed = 0
    setReanalyzeProgress({ current: 0, total, folder: "..." })
    for (let i = 0; i < total; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(async (p) => {
        try {
          await fetch("/api/benchmark/reanalyze-one", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id }),
          })
        } catch (e) {
          console.error(`failed for ${p.folderPath}`, e)
        }
        completed++
        setReanalyzeProgress({ current: completed, total, folder: p.folderPath })
      }))
    }
    setReanalyzing(false)
    setReanalyzeProgress(null)
    await loadPosts()
  }

  // 全件再分析（3つの型を含めて Claude Vision で再分類）
  async function handleReanalyzeAll() {
    if (posts.length === 0) return
    const CONCURRENCY = 5
    const estMin = Math.ceil(posts.length / CONCURRENCY * 0.5)
    const estMax = Math.ceil(posts.length / CONCURRENCY * 1.0)
    const ok = confirm(`登録済み ${posts.length} 件を Claude Vision で再分析します。\n並列度 ${CONCURRENCY} で実行 → 合計 ${estMin}〜${estMax} 分の目安。\n進めますか？`)
    if (!ok) return
    await reanalyzeBatch(posts)
  }

  // 未分類（F/S/C のいずれか欠けてる）のみ再分析
  async function handleReanalyzeIncomplete() {
    const incomplete = posts.filter(p => !p.hookMain || !p.structureType || !p.compositionType)
    if (incomplete.length === 0) return
    const ok = confirm(`未分類または部分失敗の ${incomplete.length} 件のみ再分析します。\n約 ${Math.max(1, Math.ceil(incomplete.length / 5 * 1))} 分。\n進めますか？`)
    if (!ok) return
    await reanalyzeBatch(incomplete)
  }

  // 全投稿を順次アップロード（並行だと Claude API レート制限に当たる可能性）
  async function handleBulkUploadAll() {
    if (!accountName.trim()) { setError("アカウント名を入力してください"); return }
    const target = bulkPosts.filter(p => p.files.length > 0 && p.status !== "done")
    if (target.length === 0) { setError("アップロード対象の投稿がありません（既に完了 or スライド未選択）"); return }
    if (target.some(p => p.caption.length > CAPTION_MAX_LENGTH)) {
      setError(`キャプションは${CAPTION_MAX_LENGTH}文字以内にしてください`); return
    }
    setError("")
    setBulkUploading(true)
    try {
      for (const post of target) {
        await uploadOneBulkPost(accountName.trim(), post)
      }
      await loadPosts()
      setUploadCompleted({ accountName: accountName.trim(), count: target.length })
      // AIレポートをバックグラウンドで自動生成
      void fetch("/api/benchmark/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: accountName.trim() }),
      }).catch(() => {})
    } finally {
      setBulkUploading(false)
    }
  }

  async function loadBioForAccount(name: string) {
    setLoadingBio(true)
    try {
      const r = await fetch("/api/benchmark/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: name }),
      })
      const d = await r.json() as { bio?: string }
      const bio = d.bio ?? ""
      setAccountBio(bio)
      setBioInput(bio)
    } finally { setLoadingBio(false) }
  }

  async function handleSaveBio() {
    if (!selectedAccount) return
    setSavingBio(true)
    try {
      await fetch("/api/benchmark/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: selectedAccount, bio: bioInput }),
      })
      setAccountBio(bioInput)
      setEditingBio(false)
    } finally { setSavingBio(false) }
  }

  async function handleRenameAccount() {
    if (!selectedAccount || !accountNameInput.trim()) return
    const newName = accountNameInput.trim()
    if (newName === selectedAccount) { setEditingAccountName(false); return }
    setRenamingAccount(true)
    try {
      const r = await fetch("/api/benchmark/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: selectedAccount, newName }),
      })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (d.error) throw new Error(d.error)
      setPosts(prev => prev.map(p => p.accountName === selectedAccount ? { ...p, accountName: newName } : p))
      setSelectedAccount(newName)
      setEditingAccountName(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : "リネームに失敗しました")
    } finally {
      setRenamingAccount(false)
    }
  }

  // group posts by accountName
  const grouped = posts.reduce<Record<string, BenchmarkPost[]>>((acc, p) => {
    ;(acc[p.accountName] ??= []).push(p)
    return acc
  }, {})

  const bulkSummary = {
    total: bulkPosts.length,
    ready: bulkPosts.filter(p => p.files.length > 0 && p.status !== "done").length,
    done:  bulkPosts.filter(p => p.status === "done").length,
    error: bulkPosts.filter(p => p.status === "error").length,
  }

  return (
    <div className="space-y-8">

      {/* ─── スライドプレビューモーダル（2カラム） ─── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.90)" }}
          onClick={() => setPreview(null)}
        >
          <div
            className="relative w-full flex flex-col md:flex-row rounded-2xl overflow-hidden"
            style={{ maxWidth: 900, maxHeight: "92vh", background: "#18181b" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 閉じるボタン */}
            <button
              onClick={() => setPreview(null)}
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
            >
              <X className="w-4 h-4" />
            </button>

            {/* ── 左: 画像パネル ── */}
            <div className="relative flex-shrink-0 flex items-center justify-center"
              style={{ width: "min(100%, 400px)", background: "#0f0f10" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.post.slideUrls[preview.slideIndex]}
                alt={`slide ${preview.slideIndex + 1}`}
                className="w-full object-contain"
                style={{ maxHeight: "92vh" }}
              />
              {/* 左右ナビ */}
              {preview.post.slideUrls.length > 1 && (
                <>
                  <button
                    onClick={() => setPreview(p => p ? { ...p, slideIndex: Math.max(0, p.slideIndex - 1) } : null)}
                    disabled={preview.slideIndex === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPreview(p => p ? { ...p, slideIndex: Math.min(p.post.slideUrls.length - 1, p.slideIndex + 1) } : null)}
                    disabled={preview.slideIndex === preview.post.slideUrls.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-20 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  {/* スライドカウンター */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
                    {preview.slideIndex + 1} / {preview.post.slideUrls.length}
                  </div>
                </>
              )}
            </div>

            {/* ── 右: 分析パネル ── */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ color: "white" }}>

              {/* フォルダパス */}
              <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {preview.post.folderPath}
              </p>

              {/* サムネイル行 */}
              <div className="flex gap-1.5 flex-wrap">
                {preview.post.slideUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt=""
                    onClick={() => setPreview(p => p ? { ...p, slideIndex: i } : null)}
                    className="w-11 h-11 object-cover rounded-lg cursor-pointer transition-all"
                    style={{
                      border: i === preview.slideIndex ? "2px solid #c4956a" : "2px solid rgba(255,255,255,0.1)",
                      opacity: i === preview.slideIndex ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>

              {/* 投稿種別 + トーン */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>投稿種別</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1.5 rounded-lg text-sm font-bold"
                    style={{
                      background: POST_TYPE_COLORS[preview.post.postType]?.bg ?? "rgba(196,149,106,0.25)",
                      color:      POST_TYPE_COLORS[preview.post.postType]?.text ?? "#c4956a",
                    }}>
                    {POST_TYPE_LABELS[preview.post.postType] ?? preview.post.postType}
                  </span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {POST_TYPE_DESCRIPTIONS[preview.post.postType] ?? ""}
                  </span>
                </div>
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                  {TONE_LABELS[preview.post.tone] ?? preview.post.tone}
                </span>
              </div>

              {/* 3つの型バッジ */}
              {(preview.post.hookMain || preview.post.structureType || preview.post.compositionType) && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>分析結果</p>
                  <div className="flex gap-2 flex-wrap">
                    {preview.post.hookMain && (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: "#7c3aed", color: "white" }}>
                        {HOOK_LABELS[preview.post.hookMain]}
                      </span>
                    )}
                    {preview.post.hookSubs.map(h => (
                      <span key={h} className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: "rgba(124,58,237,0.35)", color: "#c4b5fd" }}>
                        +{HOOK_LABELS[h]}
                      </span>
                    ))}
                    {preview.post.structureType && (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: "#0e7490", color: "white" }}>
                        {STRUCTURE_LABELS[preview.post.structureType]}
                      </span>
                    )}
                    {preview.post.compositionType && (
                      <span className="px-3 py-1 rounded-lg text-xs font-bold" style={{ background: "#92400e", color: "white" }}>
                        {COMPOSITION_LABELS[preview.post.compositionType]}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 判定理由 */}
              {preview.post.patternNotes && (
                <div className="space-y-3 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>判定理由</p>
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-[10px] font-bold block mb-0.5" style={{ color: "#a78bfa" }}>フック</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>{preview.post.patternNotes.hookReason}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold block mb-0.5" style={{ color: "#67e8f9" }}>構造</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>{preview.post.patternNotes.structureReason}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold block mb-0.5" style={{ color: "#fde047" }}>構図</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>{preview.post.patternNotes.compositionReason}</p>
                    </div>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                      <span className="text-[10px] font-bold block mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>抽象化チェック</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{preview.post.patternNotes.abstractionCheck}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* テーマタグ */}
              {preview.post.themeTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.post.themeTags.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* キャプション */}
              {preview.post.caption && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>キャプション</p>
                  <div className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)" }}>
                    {preview.post.caption}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ページヘッダー + トップタブ ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>ベンチマーク</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            Lemon8の参考投稿を登録・分析します
          </p>
        </div>
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <button
            onClick={() => setView("list")}
            className="px-4 py-2 text-sm font-bold transition-opacity hover:opacity-85"
            style={{
              background: view === "list" ? "var(--accent)" : "var(--card)",
              color: view === "list" ? "white" : "var(--text)",
            }}
          >
            アカウント一覧
            {posts.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: view === "list" ? "rgba(255,255,255,0.25)" : "var(--accent-light)", color: view === "list" ? "white" : "var(--accent)" }}>
                {Object.keys(grouped).length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setView("upload"); setSelectedAccount(null) }}
            className="px-4 py-2 text-sm font-bold transition-opacity hover:opacity-85 flex items-center gap-1.5"
            style={{
              background: view === "upload" ? "var(--accent)" : "var(--card)",
              color: view === "upload" ? "white" : "var(--text)",
              borderLeft: "1px solid var(--border)",
            }}
          >
            <Plus className="w-3.5 h-3.5" /> 新規登録
          </button>
        </div>
      </div>

      {/* ─── 登録ビュー ─── */}
      {view === "upload" && (
        <div className="space-y-6">

          {/* ── アップロード完了画面 ── */}
          {uploadCompleted ? (
            <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-light)" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "var(--accent)" }} />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold" style={{ color: "var(--text)" }}>
                  {uploadCompleted.count}件の登録が完了しました
                </p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  アカウント: {uploadCompleted.accountName}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setView("list")
                    setSelectedAccount(uploadCompleted.accountName)
                    setUploadCompleted(null)
                    setResult(null)
                    setBulkPosts([])
                  }}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85"
                  style={{ background: "var(--accent)" }}
                >
                  アカウント一覧を見る
                </button>
                <button
                  onClick={() => {
                    setUploadCompleted(null)
                    setResult(null)
                    setBulkPosts([])
                    setAccountName("")
                  }}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-75"
                  style={{ background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  続けて登録する
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* 単発/一括切替 */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", maxWidth: 260 }}>
            <button onClick={() => setMode("single")} className="flex-1 px-4 py-2 text-sm font-bold transition-opacity hover:opacity-85"
              style={{ background: mode === "single" ? "var(--accent)" : "var(--card)", color: mode === "single" ? "white" : "var(--text)" }}>
              単発登録
            </button>
            <button onClick={() => setMode("bulk")} className="flex-1 px-4 py-2 text-sm font-bold transition-opacity hover:opacity-85"
              style={{ background: mode === "bulk" ? "var(--accent)" : "var(--card)", color: mode === "bulk" ? "white" : "var(--text)", borderLeft: "1px solid var(--border)" }}>
              一括登録
            </button>
          </div>

          {/* 単発 */}
          {mode === "single" && (
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                    アカウント名 <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                    placeholder="例: accountA" className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>投稿フォルダ名（省略で自動採番）</label>
                  <input type="text" value={folderName} onChange={e => setFolderName(e.target.value)}
                    placeholder="例: post_001" className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>キャプション原文（任意）</label>
                <textarea value={caption} onChange={e => setCaption(e.target.value)}
                  placeholder="元投稿のキャプションをそのまま貼り付け" rows={3} maxLength={CAPTION_MAX_LENGTH}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
                  style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }} />
                <p className="text-[10px] mt-1 text-right" style={{ color: "var(--muted)" }}>{caption.length} / {CAPTION_MAX_LENGTH}</p>
              </div>
              <div className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
                style={{ borderColor: dragging ? "var(--accent)" : "var(--border)", background: dragging ? "var(--accent-light)" : "var(--bg)" }}
                onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
                onDrop={onDrop} onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={onFileInput} />
                <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>スライド画像をドロップ または クリックして選択</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>ファイル名順にスライド番号が決まります（複数可）</p>
              </div>
              {files.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(f)} alt={f.name} className="w-16 h-16 object-cover rounded-lg"
                        style={{ border: "1px solid var(--border)" }} />
                      <button onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)) }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-xs items-center justify-center hidden group-hover:flex"
                        style={{ background: "var(--accent)" }}>×</button>
                      <p className="text-[10px] text-center mt-0.5 truncate w-16" style={{ color: "var(--muted)" }}>{i + 1}</p>
                    </div>
                  ))}
                </div>
              )}
              {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}
              <button onClick={handleUpload} disabled={uploading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "var(--accent)" }}>
                {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />分析中（30〜60秒）...</> : <><Upload className="w-4 h-4" />アップロード・分析する</>}
              </button>
            </div>
          )}

          {/* 単発: 登録完了メッセージ */}
          {mode === "single" && result && (
            <div className="rounded-2xl p-5 space-y-3" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
              <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>✓ 登録完了 — {result.folderPath}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "var(--accent)", color: "white" }}>{POST_TYPE_LABELS[result.postType]}</span>
                {result.hookMain && <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: "#7c3aed", color: "white" }}>{HOOK_LABELS[result.hookMain]}</span>}
                {result.structureType && <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: "#0891b2", color: "white" }}>{STRUCTURE_LABELS[result.structureType]}</span>}
                {result.compositionType && <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: "#ca8a04", color: "white" }}>{COMPOSITION_LABELS[result.compositionType]}</span>}
              </div>
              <button onClick={() => { setView("list"); setSelectedAccount(result.accountName) }}
                className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: "var(--accent)", color: "white" }}>
                → 一覧で確認する
              </button>
            </div>
          )}

          {/* 一括 */}
          {mode === "bulk" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--muted)" }}>
                  アカウント名（全投稿共通） <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                  placeholder="例: mami_skincare_" className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }} />
              </div>
              {bulkPosts.length > 0 && (
                <div className="space-y-3">
                  {bulkPosts.map((bp, idx) => (
                    <BulkCard key={bp.id} index={idx} post={bp} captionMaxLength={CAPTION_MAX_LENGTH}
                      onUpdate={updateBulkPost} onAddFiles={addFilesToBulkPost}
                      onRemoveFile={removeFileFromBulkPost} onRemove={removeBulkPost} disabled={bulkUploading} />
                  ))}
                </div>
              )}
              <button onClick={addBulkPost} disabled={bulkUploading}
                className="w-full px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px dashed var(--accent)" }}>
                <Plus className="w-4 h-4" /> 投稿を追加
              </button>
              {error && <p className="text-sm" style={{ color: "#e53e3e" }}>{error}</p>}
              {bulkPosts.length > 0 && (
                <div className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-xs space-x-3" style={{ color: "var(--muted)" }}>
                    <span>合計 <strong style={{ color: "var(--text)" }}>{bulkSummary.total}</strong></span>
                    <span>準備済 <strong style={{ color: "var(--accent)" }}>{bulkSummary.ready}</strong></span>
                    <span>完了 <strong style={{ color: "var(--accent)" }}>{bulkSummary.done}</strong></span>
                    {bulkSummary.error > 0 && <span>失敗 <strong style={{ color: "#e53e3e" }}>{bulkSummary.error}</strong></span>}
                  </div>
                  <button onClick={handleBulkUploadAll} disabled={bulkUploading || bulkSummary.ready === 0}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-2"
                    style={{ background: "var(--accent)" }}>
                    {bulkUploading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />順次アップロード中...</>
                      : <><Upload className="w-4 h-4" />すべて登録（{bulkSummary.ready}件）</>}
                  </button>
                </div>
              )}
            </div>
          )}
          </>
          )} {/* /uploadCompleted ternary */}
        </div>
      )}

      {/* ─── 背景グループ確認モーダル ─── */}
      {bgGroupState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setBgGroupState(null)}
        >
          <div
            className="relative w-full rounded-2xl overflow-y-auto p-6 space-y-5"
            style={{ maxWidth: 680, maxHeight: "90vh", background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base" style={{ color: "var(--text)" }}>同背景グループの確認</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  スライドをクリックするとグループを変更できます。同じ色 = 同じ背景グループ
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* 再検出ボタン（AIでやり直す） */}
                <button
                  onClick={async () => {
                    const post = posts.find(p => p.id === bgGroupState?.postId)
                    if (!post) return
                    setBgGroupDetecting(post.id)
                    try {
                      const r = await fetch("/api/v4/benchmark/detect-bg-groups", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ benchmarkPostId: post.id }),
                      })
                      const d = await r.json() as { groups?: number[][]; error?: string }
                      if (d.error) throw new Error(d.error)
                      setBgGroupState(prev => prev ? { ...prev, groups: d.groups! } : null)
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "再検出に失敗しました")
                    } finally {
                      setBgGroupDetecting(null)
                    }
                  }}
                  disabled={bgGroupDetecting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  {bgGroupDetecting !== null
                    ? <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />再検出中...</>
                    : <>🔄 AIで再検出</>}
                </button>
                <button
                  onClick={() => setBgGroupState(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-70"
                  style={{ background: "var(--bg)", color: "var(--muted)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 凡例 */}
            <div className="flex gap-2 flex-wrap">
              {bgGroupState.groups.map((group, gi) => (
                <div key={gi} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                  style={{ background: BG_GROUP_COLORS[gi % BG_GROUP_COLORS.length] }}>
                  グループ {gi + 1}
                  <span className="opacity-75">({group.length}枚)</span>
                </div>
              ))}
            </div>

            {/* スライドグリッド */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {bgGroupState.slideUrls.map((url, si) => {
                const gi = bgGroupState.groups.findIndex(g => g.includes(si))
                const color = gi >= 0 ? BG_GROUP_COLORS[gi % BG_GROUP_COLORS.length] : "#6b7280"
                return (
                  <button
                    key={si}
                    onClick={() => cycleSlideGroup(si)}
                    className="relative rounded-xl overflow-hidden transition-all hover:scale-105"
                    style={{ border: `3px solid ${color}` }}
                    title={`スライド${si + 1} — クリックでグループ変更`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full aspect-[3/4] object-cover" />
                    {/* グループバッジ */}
                    <div
                      className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-bold text-white py-0.5"
                      style={{ background: color }}
                    >
                      {gi >= 0 ? `G${gi + 1}` : "?"}
                    </div>
                    {/* スライド番号 */}
                    <div className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: "rgba(0,0,0,0.6)" }}>
                      {si + 1}
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="text-xs" style={{ color: "var(--muted)" }}>
              ※ グループが1枚のスライドは「独立背景」として扱われます。2枚目以降の同グループスライドは最初のスライドの背景を引き継いで生成されます。
            </p>

            {/* ボタン行 */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setBgGroupState(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)", background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                キャンセル
              </button>
              <button
                onClick={saveBgGroups}
                disabled={bgGroupSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {bgGroupSaving
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />保存中...</>
                  : <><CheckCircle2 className="w-4 h-4" />確定して保存</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 一覧ビュー ─── */}
      {view === "list" && (
        <div className="space-y-5">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <p className="text-lg" style={{ color: "var(--muted)" }}>まだ登録がありません</p>
              <button onClick={() => setView("upload")} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: "var(--accent)" }}>
                <Plus className="w-4 h-4 inline mr-1" />最初の投稿を登録する
              </button>
            </div>
          ) : selectedAccount && grouped[selectedAccount] ? (
            /* ── アカウント詳細ビュー ── */
            <div className="space-y-5">
              {/* 戻るヘッダー */}
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelectedAccount(null); setEditingAccountName(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-75"
                  style={{ background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                  <ChevronLeft className="w-4 h-4" /> 一覧に戻る
                </button>

                {/* アカウント名（インライン編集） */}
                {editingAccountName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={accountNameInput}
                      onChange={e => setAccountNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRenameAccount(); if (e.key === "Escape") setEditingAccountName(false) }}
                      className="px-2.5 py-1 rounded-lg border text-sm font-bold outline-none"
                      style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)", minWidth: 160 }}
                    />
                    <button onClick={handleRenameAccount} disabled={renamingAccount}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--accent)" }}>
                      {renamingAccount ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                      保存
                    </button>
                    <button onClick={() => setEditingAccountName(false)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--muted)" }}>
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{selectedAccount}</h2>
                    <button
                      onClick={() => { setAccountNameInput(selectedAccount); setEditingAccountName(true) }}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg hover:opacity-70"
                      style={{ color: "var(--muted)" }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  {grouped[selectedAccount].length}投稿
                </span>
                {/* 再分析 + BG検出 + 投稿追加ボタン */}
                <div className="ml-auto flex gap-2 flex-wrap justify-end">
                  {(() => {
                    const inc = grouped[selectedAccount].filter(p => !p.hookMain || !p.structureType || !p.compositionType).length
                    return inc > 0 ? (
                      <button onClick={handleReanalyzeIncomplete} disabled={reanalyzing}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                        style={{ background: "#ea580c" }}>🔧 未分類のみ再分析（{inc}件）</button>
                    ) : null
                  })()}
                  <button onClick={handleReanalyzeAll} disabled={reanalyzing}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ background: "#7c3aed" }}>
                    {reanalyzing
                      ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{reanalyzeProgress ? `${reanalyzeProgress.current}/${reanalyzeProgress.total}` : "..."}</>
                      : <>🔄 全件再分析</>}
                  </button>
                  {/* 全件BG一括検出 */}
                  <button
                    onClick={() => handleBulkDetectBgGroups(grouped[selectedAccount])}
                    disabled={bulkBgDetecting || bgGroupDetecting !== null}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ background: "#0891b2" }}
                    title="全投稿の同背景グループをまとめて検出・保存します"
                  >
                    {bulkBgDetecting
                      ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {bulkBgProgress ? `BG検出中 ${bulkBgProgress.current}/${bulkBgProgress.total}` : "BG検出中..."}</>
                      : <>🔗 全件BG一括検出</>}
                  </button>
                  <button
                    onClick={() => {
                      setAccountName(selectedAccount)
                      setUploadCompleted(null)
                      setResult(null)
                      setBulkPosts([])
                      setView("upload")
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85"
                    style={{ background: "var(--accent)" }}
                  >
                    <Plus className="w-3.5 h-3.5" /> 投稿を追加
                  </button>
                </div>
              </div>

              {/* ── アカウントBio ── */}
              <div className="rounded-2xl p-5 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>アカウントBio・自己紹介</p>
                  {!editingBio ? (
                    <button onClick={() => { setBioInput(accountBio); setEditingBio(true) }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg hover:opacity-70"
                      style={{ color: "var(--accent)" }}>
                      <Pencil className="w-3 h-3" /> {accountBio ? "編集" : "追加"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingBio(false)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--muted)" }}>キャンセル</button>
                      <button onClick={handleSaveBio} disabled={savingBio}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-bold text-white disabled:opacity-50"
                        style={{ background: "var(--accent)" }}>
                        {savingBio ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                        保存
                      </button>
                    </div>
                  )}
                </div>
                {loadingBio ? (
                  <div className="h-8 flex items-center"><div className="w-4 h-4 rounded-full animate-spin" style={{ border: "2px solid var(--accent)", borderTopColor: "transparent" }} /></div>
                ) : editingBio ? (
                  <>
                    <textarea
                      value={bioInput}
                      onChange={e => setBioInput(e.target.value)}
                      rows={5}
                      placeholder="アカウントのプロフィール文・自己紹介・投稿コンセプトなどを貼り付けてください。ペルソナ生成時に分析に使われます。"
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none leading-relaxed"
                      style={{ borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }}
                    />
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      ペルソナ生成時にClaudeへ渡される情報です。Lemon8プロフィールや投稿コンセプトを貼り付けると精度が上がります。
                    </p>
                  </>
                ) : accountBio ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>{accountBio}</p>
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>未設定。追加するとペルソナ生成の精度が上がります。</p>
                )}
              </div>

              {/* アカウント分析 */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <AccountAnalysis posts={grouped[selectedAccount]} />
              </div>

              {/* 投稿一覧グリッド */}
              <div>
                <h3 className="text-sm font-bold mb-3" style={{ color: "var(--muted)" }}>
                  投稿一覧 ({grouped[selectedAccount].length}件)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {grouped[selectedAccount].map(p => (
                    <div key={p.id} className="relative group rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        border: `1px solid ${p.isHidden ? "#ef444466" : "var(--border)"}`,
                        background: p.isHidden ? "#1a1a1a" : "var(--card)",
                        opacity: p.isHidden ? 0.6 : 1,
                      }}
                      onClick={() => setPreview({ post: p, slideIndex: 0 })}>
                      {/* 操作ボタン（ホバー時表示） */}
                      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* 非表示トグル */}
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleHidden(p.id, p.isHidden) }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg shadow-md"
                          style={{ background: "rgba(255,255,255,0.95)", color: p.isHidden ? "#16a34a" : "#6b7280" }}
                          title={p.isHidden ? "表示に戻す" : "非表示にする（ペルソナ生成から除外）"}
                        >
                          {p.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        {/* 背景グループ検出ボタン */}
                        <button
                          onClick={e => { e.stopPropagation(); handleDetectBgGroups(p) }}
                          disabled={bgGroupDetecting === p.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg shadow-md text-xs font-bold"
                          style={{ background: "rgba(255,255,255,0.95)", color: p.backgroundGroups ? "#10b981" : "#6b7280" }}
                          title={p.backgroundGroups ? "同背景グループ（設定済み）- クリックで再検出" : "同背景グループを検出"}
                        >
                          {bgGroupDetecting === p.id ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span style={{ fontSize: 11 }}>{p.backgroundGroups ? "✓BG" : "BG"}</span>
                          )}
                        </button>
                        {/* 削除ボタン */}
                        <button
                          onClick={e => { e.stopPropagation(); handleDeletePost(p.id, p.folderPath.split("/").pop() ?? p.id) }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg shadow-md"
                          style={{ background: "rgba(255,255,255,0.95)", color: "#ef4444" }}
                          title="この投稿を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* 非表示バッジ */}
                      {p.isHidden && (
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                          style={{ background: "rgba(239,68,68,0.85)", fontSize: 9, color: "#fff", lineHeight: 1.4 }}>
                          <EyeOff className="w-2.5 h-2.5" />
                          非表示
                        </div>
                      )}
                      {/* サムネイル */}
                      {p.slideUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.slideUrls[0]} alt="" className="w-full aspect-[3/4] object-cover" />
                      ) : (
                        <div className="w-full aspect-[3/4] flex items-center justify-center" style={{ background: "var(--border)" }}>
                          <Image className="w-6 h-6" style={{ color: "var(--muted)" }} />
                        </div>
                      )}
                      {/* メタ情報 */}
                      <div className="p-2 space-y-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                            {POST_TYPE_LABELS[p.postType] ?? p.postType}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--muted)" }}>{p.slideCount}枚</span>
                        </div>
                        {(p.hookMain || p.structureType || p.compositionType) && (
                          <div className="flex gap-1 flex-wrap">
                            {p.hookMain && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "#7c3aed22", color: "#7c3aed" }}>{p.hookMain}</span>}
                            {p.structureType && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "#0891b222", color: "#0891b2" }}>{p.structureType}</span>}
                            {p.compositionType && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "#ca8a0422", color: "#ca8a04" }}>{p.compositionType}</span>}
                          </div>
                        )}
                        <p className="text-[9px] truncate" style={{ color: "var(--muted)" }}>{p.folderPath.split("/").pop()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── アカウントカードグリッド ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {Object.keys(grouped).length}アカウント / {posts.length}投稿
                </p>
                <div className="flex gap-2">
                  {(() => {
                    const inc = posts.filter(p => !p.hookMain || !p.structureType || !p.compositionType).length
                    return inc > 0 ? (
                      <button onClick={handleReanalyzeIncomplete} disabled={reanalyzing}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                        style={{ background: "#ea580c" }}>🔧 未分類のみ再分析（{inc}件）</button>
                    ) : null
                  })()}
                  <button onClick={handleReanalyzeAll} disabled={reanalyzing}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ background: "#7c3aed" }}>
                    {reanalyzing
                      ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />{reanalyzeProgress ? `${reanalyzeProgress.current}/${reanalyzeProgress.total}` : "..."}</>
                      : <>🔄 全件再分析（{posts.length}件）</>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(grouped).map(([account, accountPosts]) => {
                  const st = computeAccountStats(accountPosts)
                  const topHook   = Object.entries(st.hookCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
                  const topStruct = Object.entries(st.structCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
                  const topComp   = Object.entries(st.compCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
                  // サムネイル: 各投稿の1枚目を最大4枚
                  const thumbs = accountPosts.slice(0, 4).map(p => p.slideUrls[0]).filter(Boolean)
                  const isAccountHidden = accountHiddenMap[account] ?? false

                  return (
                    <div key={account} className="relative group rounded-2xl overflow-hidden transition-all hover:shadow-lg"
                      style={{
                        background: "var(--card)",
                        border: isAccountHidden ? "1px solid #ef444466" : "1px solid var(--border)",
                        opacity: isAccountHidden ? 0.65 : 1,
                      }}>
                      {/* アカウント非表示トグル（ホバー時表示） */}
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleAccountHidden(account) }}
                        className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(255,255,255,0.92)", color: isAccountHidden ? "#16a34a" : "#6b7280" }}
                        title={isAccountHidden ? "アカウントを表示に戻す" : "アカウントを非表示にする（生成から除外）"}
                      >
                        {isAccountHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      {/* 非表示バッジ */}
                      {isAccountHidden && (
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                          style={{ background: "rgba(239,68,68,0.85)", fontSize: 9, color: "#fff", lineHeight: 1.4 }}>
                          <EyeOff className="w-2.5 h-2.5" />
                          非表示
                        </div>
                      )}

                      {/* クリックでアカウント詳細へ */}
                      <button className="w-full text-left" onClick={() => setSelectedAccount(account)}>
                        {/* サムネイルグリッド */}
                        <div className="grid grid-cols-4 gap-0.5" style={{ background: "var(--border)" }}>
                          {Array.from({ length: 4 }).map((_, i) => (
                            thumbs[i] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={thumbs[i]} alt="" className="aspect-[3/4] w-full object-cover" />
                            ) : (
                              <div key={i} className="aspect-[3/4] w-full" style={{ background: "var(--bg)" }} />
                            )
                          ))}
                        </div>
                        {/* アカウント情報 */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{account}</p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                                {accountPosts.length}投稿 · 平均{st.avgSlides}枚
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--muted)" }} />
                          </div>

                          {/* 型バッジ */}
                          {(topHook || topStruct || topComp) && (
                            <div className="flex gap-1.5 flex-wrap">
                              {topHook && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: "#7c3aed22", color: "#7c3aed" }}>{HOOK_LABELS[topHook as HookType]}</span>}
                              {topStruct && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: "#0891b222", color: "#0891b2" }}>{STRUCTURE_LABELS[topStruct as StructureType]}</span>}
                              {topComp && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: "#ca8a0422", color: "#ca8a04" }}>{COMPOSITION_LABELS[topComp as CompositionType]}</span>}
                            </div>
                          )}

                          {/* テーマタグ */}
                          <div className="flex gap-1 flex-wrap">
                            {st.topTags.slice(0, 4).map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--muted)" }}>#{t}</span>
                            ))}
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── アカウント分析 ───────────────────────────────────

function computeAccountStats(posts: BenchmarkPost[]) {
  const postTypeCounts: Record<string, number> = {}
  const hookCounts:      Record<string, number> = {}
  const structCounts:    Record<string, number> = {}
  const compCounts:      Record<string, number> = {}
  const tagCounts:       Record<string, number> = {}
  let totalSlides = 0
  let analyzed = 0

  for (const p of posts) {
    postTypeCounts[p.postType] = (postTypeCounts[p.postType] ?? 0) + 1
    totalSlides += p.slideCount
    if (p.hookMain) { hookCounts[p.hookMain] = (hookCounts[p.hookMain] ?? 0) + 1; analyzed++ }
    if (p.structureType) structCounts[p.structureType] = (structCounts[p.structureType] ?? 0) + 1
    if (p.compositionType) compCounts[p.compositionType] = (compCounts[p.compositionType] ?? 0) + 1
    for (const t of p.themeTags) tagCounts[t] = (tagCounts[t] ?? 0) + 1
  }

  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  const avgSlides = posts.length > 0 ? (totalSlides / posts.length).toFixed(1) : "—"

  return { total: posts.length, analyzed, postTypeCounts, hookCounts, structCounts, compCounts, topTags, avgSlides }
}

function MiniBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold w-24 flex-shrink-0" style={{ color: "var(--text)" }}>{label}</span>
      <div className="flex-1 rounded-full h-2.5" style={{ background: "var(--border)" }}>
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] w-8 text-right flex-shrink-0" style={{ color: "var(--muted)" }}>{count}</span>
      <span className="text-[10px] w-7 flex-shrink-0" style={{ color: "var(--muted)" }}>{pct}%</span>
    </div>
  )
}

function AccountAnalysis({ posts }: { posts: BenchmarkPost[] }) {
  const { lang } = useLanguage()
  const t = useT(lang)
  const bm = t.benchmark
  const s = computeAccountStats(posts)
  const accountName = posts[0]?.accountName ?? ""

  const [report, setReport]         = useState<string | null>(null)
  const [loadingReport, setLoading] = useState(false)
  const [reportError, setReportError] = useState("")

  const HOOK_LABELS:        Record<string, string> = bm.hook
  const STRUCTURE_LABELS:   Record<string, string> = bm.structure
  const COMPOSITION_LABELS: Record<string, string> = bm.composition
  const HOOK_COLORS:   Record<string, string> = { F1: "#7c3aed", F2: "#9333ea", F3: "#a855f7", F4: "#c084fc", F5: "#d8b4fe" }
  const STRUCT_COLORS: Record<string, string> = { S1: "#0e7490", S2: "#0891b2", S3: "#06b6d4", S4: "#67e8f9", S5: "#a5f3fc" }
  const COMP_COLORS:   Record<string, string> = { C1: "#b45309", C2: "#ca8a04", C3: "#eab308", C4: "#fbbf24", C5: "#fde68a" }
  const TYPE_COLORS: Record<string, string>   = { tips: "#3b82f6", product: "#f59e0b", mixed: "#10b981" }
  const TYPE_LABELS: Record<string, string>   = { tips: bm.postType.tips, product: bm.postType.product, mixed: bm.postType.mixed }

  const hookTotal   = Object.values(s.hookCounts).reduce((a, b) => a + b, 0)
  const structTotal = Object.values(s.structCounts).reduce((a, b) => a + b, 0)
  const compTotal   = Object.values(s.compCounts).reduce((a, b) => a + b, 0)

  // 既存レポートをアカウント詳細表示時に読み込む
  useEffect(() => {
    setReport(null)
    setReportError("")
    if (!accountName) return
    setLoading(true)
    fetch(`/api/benchmark/report?accountName=${encodeURIComponent(accountName)}`)
      .then(r => r.json() as Promise<{ report?: string | null; error?: string }>)
      .then(d => { if (d.report) setReport(d.report) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accountName])

  async function generateReport() {
    setLoading(true)
    setReportError("")
    try {
      const r = await fetch("/api/benchmark/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName }),
      })
      const d = await r.json() as { report?: string; error?: string }
      if (d.error) throw new Error(d.error)
      setReport(d.report ?? null)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "レポート生成に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-5 space-y-5" style={{ background: "var(--accent-light)", borderBottom: "1px solid var(--border)" }}>

      {/* ヘッダー行 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>アカウント分析</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--card)", color: "var(--muted)" }}>
            {s.total}投稿 / 分析済 {s.analyzed}件 / 平均{s.avgSlides}枚
          </span>
        </div>
        {!report && (
          <button
            onClick={generateReport}
            disabled={loadingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {loadingReport ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 生成中（20秒ほど）...</>
            ) : (
              <><Sparkles className="w-3 h-3" /> AIレポートを生成</>
            )}
          </button>
        )}
      </div>

      {/* 統計グラフ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>投稿種別</p>
          {(["tips", "product", "mixed"] as const).map(t => (
            <MiniBar key={t} label={TYPE_LABELS[t]} count={s.postTypeCounts[t] ?? 0} total={s.total} color={TYPE_COLORS[t]} />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>頻出テーマタグ</p>
          <div className="flex flex-wrap gap-1.5">
            {s.topTags.length > 0
              ? s.topTags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "var(--card)", color: "var(--text)" }}>#{tag}</span>
                ))
              : <span className="text-xs" style={{ color: "var(--muted)" }}>なし</span>}
          </div>
        </div>
      </div>

      {hookTotal > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>F型（心理フック）分布</p>
          {(["F1","F2","F3","F4","F5"] as const).map(f => (
            <MiniBar key={f} label={HOOK_LABELS[f]} count={s.hookCounts[f] ?? 0} total={hookTotal} color={HOOK_COLORS[f]} />
          ))}
        </div>
      )}
      {structTotal > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>S型（投稿構造）分布</p>
          {(["S1","S2","S3","S4","S5"] as const).map(s_ => (
            <MiniBar key={s_} label={STRUCTURE_LABELS[s_]} count={s.structCounts[s_] ?? 0} total={structTotal} color={STRUCT_COLORS[s_]} />
          ))}
        </div>
      )}
      {compTotal > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>C型（構図）分布</p>
          {(["C1","C2","C3","C4","C5"] as const).map(c => (
            <MiniBar key={c} label={COMPOSITION_LABELS[c]} count={s.compCounts[c] ?? 0} total={compTotal} color={COMP_COLORS[c]} />
          ))}
        </div>
      )}
      {s.analyzed === 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>F/S/C 型が未分析です。「全件再分析」ボタンで分析してください。</p>
      )}

      {/* エラー */}
      {reportError && <p className="text-xs" style={{ color: "#ef4444" }}>{reportError}</p>}

      {/* AIレポート */}
      {report && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>AIレポート</span>
            </div>
            <button
              onClick={generateReport}
              disabled={loadingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              {loadingReport
                ? <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> 再生成中...</>
                : <><Sparkles className="w-3 h-3" /> 再生成</>}
            </button>
          </div>
          <div
            className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {report}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── 一括登録: 投稿カードコンポーネント ──────────────

function BulkCard({
  index, post, captionMaxLength, onUpdate, onAddFiles, onRemoveFile, onRemove, disabled,
}: {
  index: number
  post: BulkPost
  captionMaxLength: number
  onUpdate: (id: string, patch: Partial<BulkPost>) => void
  onAddFiles: (id: string, files: File[]) => void
  onRemoveFile: (id: string, fileIdx: number) => void
  onRemove: (id: string) => void
  disabled: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))
    if (dropped.length > 0) onAddFiles(post.id, dropped)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) onAddFiles(post.id, picked)
    e.target.value = ""
  }

  const statusBadge = (() => {
    switch (post.status) {
      case "uploading":
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            アップロード中
          </span>
        )
      case "done":
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1" style={{ background: "#22c55e22", color: "#22c55e" }}>
            <CheckCircle2 className="w-3 h-3" /> 完了
          </span>
        )
      case "error":
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1" style={{ background: "#ef444422", color: "#ef4444" }}>
            <AlertCircle className="w-3 h-3" /> 失敗
          </span>
        )
      default:
        return (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--bg)", color: "var(--muted)" }}>
            待機中
          </span>
        )
    }
  })()

  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{
        background: "var(--card)",
        border: post.status === "error" ? "1px solid #ef4444" : "1px solid var(--border)",
        opacity: post.status === "done" ? 0.7 : 1,
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>投稿 {index + 1}</span>
          {statusBadge}
        </div>
        <button
          onClick={() => onRemove(post.id)}
          disabled={disabled || post.status === "uploading"}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
          style={{ color: "var(--muted)" }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* フォルダ名（任意） */}
      <input
        type="text"
        value={post.folderName}
        onChange={e => onUpdate(post.id, { folderName: e.target.value })}
        placeholder="フォルダ名（省略で自動採番: post_001 等）"
        disabled={disabled || post.status === "uploading" || post.status === "done"}
        className="w-full px-3 py-2 rounded-lg border text-xs outline-none disabled:opacity-50"
        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
      />

      {/* キャプション */}
      <div>
        <textarea
          value={post.caption}
          onChange={e => onUpdate(post.id, { caption: e.target.value })}
          placeholder="キャプション原文（任意・元投稿の本文をコピペ）"
          rows={3}
          maxLength={captionMaxLength}
          disabled={disabled || post.status === "uploading" || post.status === "done"}
          className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-y disabled:opacity-50"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
        <p className="text-[10px] mt-0.5 text-right" style={{ color: "var(--muted)" }}>
          {post.caption.length} / {captionMaxLength}
        </p>
      </div>

      {/* スライドドロップゾーン */}
      <div
        className="rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border)",
          background: dragging ? "var(--accent-light)" : "var(--bg)",
          pointerEvents: disabled || post.status === "uploading" || post.status === "done" ? "none" : "auto",
          opacity: disabled || post.status === "uploading" || post.status === "done" ? 0.5 : 1,
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={onFileInput} />
        <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: "var(--muted)" }} />
        <p className="text-xs" style={{ color: "var(--text)" }}>
          スライド画像をドロップ または クリックして追加
        </p>
      </div>

      {/* 選択ファイルプレビュー */}
      {post.files.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {post.files.map((f, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                className="w-12 h-12 object-cover rounded-md"
                style={{ border: "1px solid var(--border)" }}
              />
              {post.status !== "uploading" && post.status !== "done" && (
                <button
                  onClick={e => { e.stopPropagation(); onRemoveFile(post.id, i) }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] items-center justify-center hidden group-hover:flex"
                  style={{ background: "var(--accent)" }}
                >×</button>
              )}
              <p className="text-[9px] text-center mt-0.5 truncate w-12" style={{ color: "var(--muted)" }}>
                {i + 1}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* エラーメッセージ */}
      {post.status === "error" && post.errorMsg && (
        <p className="text-xs" style={{ color: "#ef4444" }}>{post.errorMsg}</p>
      )}
    </div>
  )
}
