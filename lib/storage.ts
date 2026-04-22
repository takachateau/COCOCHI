/**
 * ストレージ層
 * - 画像: Vercel Blob（公開URL）
 * - メタデータ: Vercel Blob（groups.json）— ファイルシステム非依存
 */
import { put, list, del } from "@vercel/blob"
import type { PostGroup } from "@/types"

const GROUPS_BLOB_PATH = "cocochi/db/groups.json"

// ─── 内部ユーティリティ ───────────────────────────────────────────

async function loadGroupsFromBlob(): Promise<PostGroup[]> {
  try {
    const { blobs } = await list({ prefix: GROUPS_BLOB_PATH })
    const blob = blobs.find(b => b.pathname === GROUPS_BLOB_PATH)
    if (!blob) return []
    // ?t= でVercel BlobのCDNキャッシュをバイパス（saveGroup直後の読み取りで古い内容が返るのを防ぐ）
    const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return []
    return await res.json() as PostGroup[]
  } catch {
    return []
  }
}

async function saveGroupsToBlob(groups: PostGroup[]): Promise<void> {
  await put(GROUPS_BLOB_PATH, JSON.stringify(groups, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  })
}

// ─── 公開API ─────────────────────────────────────────────────────

export async function loadGroups(): Promise<PostGroup[]> {
  return loadGroupsFromBlob()
}

export async function updateGroup(id: string, updated: PostGroup): Promise<void> {
  const groups = await loadGroupsFromBlob()
  const idx = groups.findIndex(g => g.id === id)
  if (idx === -1) return
  groups[idx] = updated
  await saveGroupsToBlob(groups)
}

export async function saveGroup(group: PostGroup): Promise<PostGroup> {
  // 商品画像を永続BlobにアップロードしてURLを保存（再生成用）
  let productImageUrl = group.productImageUrl
  if (!productImageUrl && group.productImageBase64) {
    try {
      const buf = Buffer.from(group.productImageBase64, "base64")
      const ext = (group.productImageMime || "image/jpeg").split("/")[1] || "jpg"
      const blob = await put(`cocochi/${group.id}/product.${ext}`, buf, {
        access: "public",
        contentType: group.productImageMime || "image/jpeg",
        allowOverwrite: true,
      })
      productImageUrl = blob.url
    } catch (err) {
      console.warn("[storage] 商品画像のBlob保存に失敗:", err)
    }
  }

  const saved: PostGroup = {
    ...group,
    productImageBase64: "",  // 大きすぎるので保存しない
    productImageUrl,
    posts: await Promise.all(group.posts.map(async post => ({
      ...post,
      images: await Promise.all(post.images.map(async (dataUrl, i) => {
        if (!dataUrl || dataUrl.startsWith("https://") || dataUrl.startsWith("/api/media/")) {
          return dataUrl
        }
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
        const buffer = Buffer.from(base64, "base64")
        const filename = `cocochi/${group.id}/${post.id}_${i}.jpg`
        const blob = await put(filename, buffer, {
          access: "public",
          contentType: "image/jpeg",
        })
        return blob.url
      })),
    }))),
  }

  const groups = await loadGroupsFromBlob()
  groups.unshift(saved)
  await saveGroupsToBlob(groups)

  return saved
}

export async function toggleGroupVisibility(id: string, hidden: boolean): Promise<void> {
  const groups = await loadGroupsFromBlob()
  const idx = groups.findIndex(g => g.id === id)
  if (idx === -1) return
  groups[idx] = { ...groups[idx], hidden }
  await saveGroupsToBlob(groups)
}

export async function deleteGroup(id: string): Promise<void> {
  const groups = await loadGroupsFromBlob()
  const target = groups.find(g => g.id === id)

  if (target) {
    const blobUrls = target.posts.flatMap(p =>
      p.images.filter(url => url && url.startsWith("https://"))
    )
    if (blobUrls.length > 0) {
      await del(blobUrls)
    }
  }

  const updated = groups.filter(g => g.id !== id)
  await saveGroupsToBlob(updated)
}
