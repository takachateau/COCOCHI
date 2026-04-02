/**
 * ストレージ層
 * - 画像: Vercel Blob（公開URL）
 * - メタデータ: ローカル data/groups.json（Phase 2 で Supabase に移行予定）
 */
import { put, del } from "@vercel/blob"
import fs from "fs"
import path from "path"
import type { PostGroup } from "@/types"

const DATA_DIR    = path.join(process.cwd(), "data")
const GROUPS_FILE = path.join(DATA_DIR, "groups.json")

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadGroups(): PostGroup[] {
  ensureDirs()
  if (!fs.existsSync(GROUPS_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(GROUPS_FILE, "utf-8")) as PostGroup[]
  } catch { return [] }
}

/**
 * グループを保存する
 * - base64 dataURL → Vercel Blob にアップロード → 公開URLに差し替え
 * - メタデータは groups.json に書き込む
 */
export async function updateGroup(id: string, updated: PostGroup): Promise<void> {
  ensureDirs()
  const groups = loadGroups()
  const idx = groups.findIndex(g => g.id === id)
  if (idx === -1) return
  groups[idx] = updated
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), "utf-8")
}

export async function saveGroup(group: PostGroup): Promise<PostGroup> {
  ensureDirs()

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
        // すでにURLなら再アップロード不要
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

  const groups = loadGroups()
  groups.unshift(saved)
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), "utf-8")

  return saved
}

/**
 * グループを削除する
 * - Vercel Blob の画像を一括削除
 * - groups.json からも削除
 */
export async function deleteGroup(id: string): Promise<void> {
  ensureDirs()
  const groups = loadGroups()
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
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(updated, null, 2), "utf-8")
}

/** ローカルファイルパスを返す（/api/media/ URLの後方互換用） */
export function getImagePath(groupId: string, filename: string): string | null {
  const p = path.join(DATA_DIR, "images", groupId, filename)
  return fs.existsSync(p) ? p : null
}
