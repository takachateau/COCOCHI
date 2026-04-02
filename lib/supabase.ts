/**
 * Supabase クライアント
 * Phase 2 — メタデータ（PostGroup）の永続化に使用
 */
import { createClient } from "@supabase/supabase-js"
import type { PostGroup } from "@/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── PostGroup CRUD ───────────────────────────────────────────

export async function dbLoadGroups(): Promise<PostGroup[]> {
  const { data, error } = await supabase
    .from("post_groups")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Supabase load error: ${error.message}`)

  return (data ?? []).map(row => ({
    id: row.id,
    createdAt: row.created_at,
    productName: row.product_name,
    productImageBase64: "",
    productImageMime: row.product_image_mime ?? "",
    posts: row.posts as PostGroup["posts"],
  }))
}

export async function dbSaveGroup(group: PostGroup): Promise<void> {
  const { error } = await supabase.from("post_groups").insert({
    id: group.id,
    created_at: group.createdAt,
    product_name: group.productName,
    product_image_mime: group.productImageMime,
    posts: group.posts,
  })

  if (error) throw new Error(`Supabase save error: ${error.message}`)
}

export async function dbDeleteGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from("post_groups")
    .delete()
    .eq("id", id)

  if (error) throw new Error(`Supabase delete error: ${error.message}`)
}
