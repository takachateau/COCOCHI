/**
 * Supabase クライアント — v2
 */
import { createClient } from "@supabase/supabase-js"
import type { PostGroup } from "@/types"
import type { Persona, BenchmarkPost, ContentPlan, CompetitorProduct, GeneratedPost, GeneratedSlide, HookType, StructureType, CompositionType, PostType, GenerationJob, JobStatus, GeneratedPostText } from "@/types/v2"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── v1: PostGroup CRUD（変更なし）────────────────────────────

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

// ─── v2: Persona CRUD ─────────────────────────────────────────

// V2 Legacy ペルソナ ID — UIには表示しない（過去データの保持専用）
// このペルソナを削除すると generated_posts が CASCADE で全消えするため除外している
const V2_LEGACY_PERSONA_ID = "00000000-0000-0000-0000-000000000002"

export async function dbLoadPersonas(): Promise<Persona[]> {
  const { data, error } = await supabase
    .from("personas")
    .select("*")
    .neq("id", V2_LEGACY_PERSONA_ID)  // V2 Legacy ペルソナは管理UIに表示しない（誤削除防止）
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Personas load error: ${error.message}`)

  return (data ?? []).map(row => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    characterText: row.character_text,
    themeTags: row.theme_tags ?? [],
    contentThemeTags: (row.content_theme_tags as string[] | null) ?? null,
    typeRatios: row.type_ratios,
    avatarUrl: row.avatar_url ?? null,
    benchmarkAccount: row.benchmark_account ?? null,
    typeEmphasis: (row.type_emphasis as Persona["typeEmphasis"]) ?? null,
    visualProfile: (row.visual_profile as Persona["visualProfile"]) ?? null,
    profile: (row.profile as Persona["profile"]) ?? null,
  }))
}

export async function dbSavePersona(persona: Omit<Persona, "id" | "createdAt">): Promise<Persona> {
  const { data, error } = await supabase
    .from("personas")
    .insert({
      name: persona.name,
      character_text: persona.characterText,
      theme_tags: persona.themeTags,
      content_theme_tags: persona.contentThemeTags ?? null,
      type_ratios: persona.typeRatios,
      avatar_url: persona.avatarUrl,
      benchmark_account: persona.benchmarkAccount,
      type_emphasis: persona.typeEmphasis ?? null,
      visual_profile: persona.visualProfile ?? null,
      profile: persona.profile ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Persona save error: ${error.message}`)

  return {
    id: data.id,
    createdAt: data.created_at,
    name: data.name,
    characterText: data.character_text,
    themeTags: data.theme_tags ?? [],
    contentThemeTags: (data.content_theme_tags as string[] | null) ?? null,
    typeRatios: data.type_ratios,
    avatarUrl: data.avatar_url ?? null,
    benchmarkAccount: data.benchmark_account ?? null,
    typeEmphasis: (data.type_emphasis as Persona["typeEmphasis"]) ?? null,
    visualProfile: (data.visual_profile as Persona["visualProfile"]) ?? null,
    profile: (data.profile as Persona["profile"]) ?? null,
  }
}

export async function dbUpdatePersonaFields(
  id: string,
  fields: {
    contentThemeTags?: string[]
    characterText?: string
    avatarUrl?: string | null
    visualProfile?: Persona["visualProfile"]
    profile?: Persona["profile"]
    name?: string
    typeRatios?: Persona["typeRatios"]
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (fields.contentThemeTags !== undefined) update.content_theme_tags = fields.contentThemeTags
  if (fields.characterText    !== undefined) update.character_text     = fields.characterText
  if (fields.avatarUrl        !== undefined) update.avatar_url         = fields.avatarUrl
  if (fields.visualProfile    !== undefined) update.visual_profile     = fields.visualProfile
  if (fields.profile          !== undefined) update.profile            = fields.profile
  if (fields.name             !== undefined) update.name               = fields.name
  if (fields.typeRatios       !== undefined) update.type_ratios        = fields.typeRatios
  const { error } = await supabase.from("personas").update(update).eq("id", id)
  if (error) throw new Error(`Persona update error: ${error.message}`)
}

export async function dbDeletePersona(id: string): Promise<void> {
  const { error } = await supabase.from("personas").delete().eq("id", id)
  if (error) throw new Error(`Persona delete error: ${error.message}`)
}

// ─── v2: BenchmarkPost CRUD ───────────────────────────────────

export async function dbLoadBenchmarkPosts(accountName?: string): Promise<BenchmarkPost[]> {
  let query = supabase.from("benchmark_posts").select("*").order("created_at", { ascending: false })
  if (accountName) query = query.eq("account_name", accountName)

  const { data, error } = await query
  if (error) throw new Error(`BenchmarkPosts load error: ${error.message}`)

  return (data ?? []).map(rowToBenchmarkPost)
}

// 投稿種別とテーマタグで最適なベンチマーク投稿を検索
export async function dbFindBenchmarkPost(
  postType: BenchmarkPost["postType"],
  themeTags: string[],
  excludeIds: Set<string> = new Set(),
): Promise<BenchmarkPost | null> {
  // テーマタグが重なるものを優先、なければ同種別から任意
  const { data, error } = await supabase
    .from("benchmark_posts")
    .select("*")
    .eq("post_type", postType)
    .overlaps("theme_tags", themeTags)
    .limit(20)

  const pickFrom = (rows: Record<string, unknown>[]) => {
    const available = rows.filter(r => !excludeIds.has(r.id as string))
    // すべて除外済みなら重複を許容して全件から選ぶ
    const pool = available.length > 0 ? available : rows
    return rowToBenchmarkPost(pool[Math.floor(Math.random() * pool.length)])
  }

  if (error || !data || data.length === 0) {
    // フォールバック：種別一致のみで探す
    const { data: fallback } = await supabase
      .from("benchmark_posts")
      .select("*")
      .eq("post_type", postType)
      .limit(20)

    if (!fallback || fallback.length === 0) return null
    return pickFrom(fallback)
  }

  return pickFrom(data)
}

export async function dbSaveBenchmarkPost(
  post: Omit<BenchmarkPost, "id" | "createdAt">,
): Promise<BenchmarkPost> {
  const { data, error } = await supabase
    .from("benchmark_posts")
    .upsert(
      {
        account_name:     post.accountName,
        folder_path:      post.folderPath,
        slide_urls:       post.slideUrls,
        slide_count:      post.slideCount,
        slide_structure:  post.slideStructure,
        post_type:        post.postType,
        theme_tags:       post.themeTags,
        tone:             post.tone,
        caption:          post.caption,
        hook_main:        post.hookMain,
        hook_subs:        post.hookSubs,
        structure_type:   post.structureType,
        composition_type: post.compositionType,
        pattern_notes:    post.patternNotes,
      },
      { onConflict: "folder_path" }, // 同じフォルダは上書き
    )
    .select()
    .single()

  if (error) throw new Error(`BenchmarkPost save error: ${error.message}`)
  return rowToBenchmarkPost(data)
}

// 既存レコードの分析結果（種別・タグ・3つの型 etc）を上書き更新する。
// 再分析スクリプトから呼ぶ用。slideUrls / accountName / folderPath は変更しない。
export async function dbUpdateBenchmarkPostAnalysis(
  id: string,
  patch: {
    postType:        BenchmarkPost["postType"]
    tone:            BenchmarkPost["tone"]
    themeTags:       string[]
    slideStructure:  BenchmarkPost["slideStructure"]
    hookMain:        BenchmarkPost["hookMain"]
    hookSubs:        BenchmarkPost["hookSubs"]
    structureType:   BenchmarkPost["structureType"]
    compositionType: BenchmarkPost["compositionType"]
    patternNotes:    BenchmarkPost["patternNotes"]
  },
): Promise<void> {
  const { error } = await supabase
    .from("benchmark_posts")
    .update({
      post_type:        patch.postType,
      tone:             patch.tone,
      theme_tags:       patch.themeTags,
      slide_structure:  patch.slideStructure,
      hook_main:        patch.hookMain,
      hook_subs:        patch.hookSubs,
      structure_type:   patch.structureType,
      composition_type: patch.compositionType,
      pattern_notes:    patch.patternNotes,
    })
    .eq("id", id)

  if (error) throw new Error(`BenchmarkPost update error: ${error.message}`)
}

export async function dbDeleteBenchmarkPost(id: string): Promise<void> {
  const { error } = await supabase.from("benchmark_posts").delete().eq("id", id)
  if (error) throw new Error(`BenchmarkPost delete error: ${error.message}`)
}

// スライドスタイル説明をマージ保存（既存キャッシュを上書きせず追記）
export async function dbUpdateBenchmarkSlideStyleDescs(
  id: string,
  newDescs: Record<string, string>,
): Promise<void> {
  // 既存キャッシュを取得してマージ（他のURLのキャッシュを消さないため）
  const { data: existing } = await supabase
    .from("benchmark_posts")
    .select("slide_style_descs")
    .eq("id", id)
    .single()

  const merged = { ...(existing?.slide_style_descs as Record<string, string> | null ?? {}), ...newDescs }

  const { error } = await supabase
    .from("benchmark_posts")
    .update({ slide_style_descs: merged })
    .eq("id", id)

  if (error) throw new Error(`BenchmarkPost slideStyleDescs update error: ${error.message}`)
}

export async function dbUpdateBackgroundGroups(id: string, groups: number[][] | null): Promise<void> {
  const { error } = await supabase
    .from("benchmark_posts")
    .update({ background_groups: groups })
    .eq("id", id)
  if (error) throw new Error(`BackgroundGroups update error: ${error.message}`)
}

export async function dbRenameAccount(oldName: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from("benchmark_posts")
    .update({ account_name: newName })
    .eq("account_name", oldName)
  if (error) throw new Error(`Account rename error: ${error.message}`)
}

export async function dbLoadAccountBio(accountName: string): Promise<string> {
  const { data } = await supabase
    .from("benchmark_account_bios")
    .select("bio")
    .eq("account_name", accountName)
    .maybeSingle()
  return (data as { bio: string } | null)?.bio ?? ""
}

export async function dbSaveAccountBio(accountName: string, bio: string): Promise<void> {
  const { error } = await supabase
    .from("benchmark_account_bios")
    .upsert({ account_name: accountName, bio }, { onConflict: "account_name" })
  if (error) throw new Error(`Account bio save error: ${error.message}`)
}

export async function dbLoadAccountReport(accountName: string): Promise<string | null> {
  const { data } = await supabase
    .from("benchmark_account_bios")
    .select("ai_report")
    .eq("account_name", accountName)
    .maybeSingle()
  return (data as { ai_report: string | null } | null)?.ai_report ?? null
}

export async function dbSaveAccountReport(accountName: string, report: string): Promise<void> {
  const { error } = await supabase
    .from("benchmark_account_bios")
    .upsert({ account_name: accountName, ai_report: report }, { onConflict: "account_name" })
  if (error) throw new Error(`Account report save error: ${error.message}`)
}

function rowToBenchmarkPost(row: Record<string, unknown>): BenchmarkPost {
  return {
    id:              row.id as string,
    createdAt:       row.created_at as string,
    accountName:     row.account_name as string,
    folderPath:      row.folder_path as string,
    slideUrls:       (row.slide_urls as string[]) ?? [],
    slideCount:      row.slide_count as number,
    slideStructure:  row.slide_structure as BenchmarkPost["slideStructure"],
    postType:        (row.post_type === "daily" ? "tips" : row.post_type ?? "tips") as BenchmarkPost["postType"],
    themeTags:       (row.theme_tags as string[]) ?? [],
    tone:            row.tone as BenchmarkPost["tone"],
    caption:         (row.caption as string | null) ?? null,
    slideStyleDescs: (row.slide_style_descs as Record<string, string> | null) ?? null,
    hookMain:        (row.hook_main        as BenchmarkPost["hookMain"])        ?? null,
    hookSubs:        (row.hook_subs        as BenchmarkPost["hookSubs"])        ?? [],
    structureType:   (row.structure_type   as BenchmarkPost["structureType"])   ?? null,
    compositionType: (row.composition_type as BenchmarkPost["compositionType"]) ?? null,
    patternNotes:    (row.pattern_notes    as BenchmarkPost["patternNotes"])    ?? null,
    isHidden:         (row.is_hidden as boolean) ?? false,
    backgroundGroups: (row.background_groups as number[][] | null) ?? null,
  }
}

// ─── v2: ContentPlan CRUD ─────────────────────────────────────

export async function dbLoadContentPlan(
  personaId: string,
  weekStart: string,
): Promise<ContentPlan | null> {
  const { data, error } = await supabase
    .from("content_plans")
    .select("*")
    .eq("persona_id", personaId)
    .eq("week_start", weekStart)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    createdAt: data.created_at,
    personaId: data.persona_id,
    productId: data.product_id ?? null,
    weekStart: data.week_start,
    posts: data.posts,
  }
}

export async function dbSaveContentPlan(
  plan: Omit<ContentPlan, "id" | "createdAt">,
): Promise<ContentPlan> {
  const { data, error } = await supabase
    .from("content_plans")
    .insert({
      persona_id: plan.personaId,
      product_id: plan.productId,
      week_start: plan.weekStart,
      posts: plan.posts,
    })
    .select()
    .single()

  if (error) throw new Error(`ContentPlan save error: ${error.message}`)

  return {
    id: data.id,
    createdAt: data.created_at,
    personaId: data.persona_id,
    productId: data.product_id ?? null,
    weekStart: data.week_start,
    posts: data.posts,
  }
}

export async function dbUpdateContentPlanPosts(
  planId: string,
  posts: ContentPlan["posts"],
): Promise<void> {
  const { error } = await supabase
    .from("content_plans")
    .update({ posts })
    .eq("id", planId)

  if (error) throw new Error(`ContentPlan update error: ${error.message}`)
}

// ─── v2: CompetitorProduct CRUD ───────────────────────────────

export async function dbLoadCompetitorProducts(productId?: string): Promise<CompetitorProduct[]> {
  let query = supabase.from("competitor_products").select("*").order("created_at", { ascending: false })
  if (productId) query = query.eq("product_id", productId)

  const { data, error } = await query
  if (error) throw new Error(`CompetitorProducts load error: ${error.message}`)

  return (data ?? []).map(rowToCompetitorProduct)
}

// 比較投稿用にランダムでN件取得（productIdに紐づく競合から選ぶ）
export async function dbPickCompetitors(
  count: number,
  productId: string,
): Promise<CompetitorProduct[]> {
  const { data, error } = await supabase
    .from("competitor_products")
    .select("*")
    .eq("product_id", productId)
    .limit(50)

  if (error || !data || data.length === 0) return []

  const shuffled = [...data].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map(rowToCompetitorProduct)
}

export async function dbSaveCompetitorProduct(
  product: Omit<CompetitorProduct, "id" | "createdAt">,
): Promise<CompetitorProduct> {
  const { data, error } = await supabase
    .from("competitor_products")
    .insert({
      product_id:   product.productId,
      brand_name:   product.brandName,
      product_name: product.productName,
      price:        product.price,
      features:     product.features,
      pros:         product.pros,
      cons:         product.cons,
      image_url:    product.imageUrl,
      image_mime:   product.imageMime,
      category:     product.category,
      tags:         product.tags,
    })
    .select()
    .single()

  if (error) throw new Error(`CompetitorProduct save error: ${error.message}`)
  return rowToCompetitorProduct(data)
}

export async function dbDeleteCompetitorProduct(id: string): Promise<void> {
  const { error } = await supabase.from("competitor_products").delete().eq("id", id)
  if (error) throw new Error(`CompetitorProduct delete error: ${error.message}`)
}

function rowToCompetitorProduct(row: Record<string, unknown>): CompetitorProduct {
  return {
    id:          row.id as string,
    createdAt:   row.created_at as string,
    productId:   (row.product_id as string) ?? "",
    brandName:   row.brand_name as string,
    productName: row.product_name as string,
    price:       (row.price as string) ?? null,
    features:    row.features as string,
    pros:        row.pros as string,
    cons:        row.cons as string,
    imageUrl:    row.image_url as string,
    imageMime:   row.image_mime as string,
    category:    (row.category as string) ?? null,
    tags:        (row.tags as string[]) ?? [],
  }
}

// ─── v3: GeneratedPost CRUD ───────────────────────────────────────

export async function dbSaveGeneratedPost(post: {
  personaId: string
  postType: PostType
  productId?: string | null
  overallTitle: string
  slides: GeneratedSlide[]
  caption?: string | null
  hookType?: HookType | null
  structureType?: StructureType | null
  compositionType?: CompositionType | null
  refBenchmark?: string | null
  imageUrls: string[]
  imageCost?: { jpy: string; cny: string; usd: string } | null
}): Promise<GeneratedPost> {
  const { data, error } = await supabase
    .from("generated_posts")
    .insert({
      persona_id:       post.personaId,
      post_type:        post.postType,
      product_id:       post.productId ?? null,
      overall_title:    post.overallTitle,
      slides:           post.slides,
      caption:          post.caption ?? null,
      hook_type:        post.hookType ?? null,
      structure_type:   post.structureType ?? null,
      composition_type: post.compositionType ?? null,
      ref_benchmark:    post.refBenchmark ?? null,
      image_urls:       post.imageUrls,
    })
    .select("*")
    .single()

  if (error) throw new Error(`GeneratedPost save error: ${error.message}`)

  // image_cost は別途 UPDATE（カラムが未追加の環境でも安全に動作させるため）
  if (post.imageCost && data?.id) {
    void supabase
      .from("generated_posts")
      .update({ image_cost: post.imageCost })
      .eq("id", data.id as string)
  }

  // ペルソナ名を別途取得
  let personaName: string | undefined
  if (data?.persona_id) {
    const { data: p } = await supabase.from("personas").select("name").eq("id", data.persona_id).single()
    personaName = (p as { name: string } | null)?.name
  }
  return rowToGeneratedPost(data, personaName)
}

export async function dbLoadGeneratedPosts(limit = 500): Promise<GeneratedPost[]> {
  const { data, error } = await supabase
    .from("generated_posts")
    .select("*")
    .neq("persona_id", V2_LEGACY_PERSONA_ID)  // V2 Legacy は結果画面に表示しない（アーカイブ専用）
    .is("deleted_at", null)                    // ゴミ箱に入っているものは除外
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`GeneratedPosts load error: ${error.message}`)
  const rows = data ?? []

  // ペルソナ名を別途一括取得
  const personaIds = [...new Set(rows.map(r => r.persona_id as string).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (personaIds.length > 0) {
    const { data: personas } = await supabase.from("personas").select("id, name").in("id", personaIds)
    for (const p of personas ?? []) nameMap.set(p.id as string, p.name as string)
  }
  return rows.map(r => rowToGeneratedPost(r, nameMap.get(r.persona_id as string)))
}

export async function dbLoadRecentPostsByPersona(personaId: string, limit = 30): Promise<GeneratedPost[]> {
  const { data, error } = await supabase
    .from("generated_posts")
    .select("*")
    .eq("persona_id", personaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`GeneratedPosts load error: ${error.message}`)
  const rows = data ?? []

  // ペルソナ名を別途取得
  let personaName: string | undefined
  if (personaId) {
    const { data: p } = await supabase.from("personas").select("name").eq("id", personaId).single()
    personaName = (p as { name: string } | null)?.name
  }
  return rows.map(r => rowToGeneratedPost(r, personaName))
}

// ─── ゴミ箱（ソフトデリート）─────────────────────────────────────
// dbDeleteGeneratedPost / dbDeleteJob は実際には削除せず deleted_at をセットする。
// 完全削除は dbPurge* を呼び出す。

export async function dbDeleteGeneratedPost(id: string): Promise<void> {
  const { error } = await supabase
    .from("generated_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(`GeneratedPost soft-delete error: ${error.message}`)
}

export async function dbDeleteJob(id: string): Promise<void> {
  const { error } = await supabase
    .from("generation_jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(`Job soft-delete error: ${error.message}`)
}

/** ゴミ箱から元に戻す（generated_posts） */
export async function dbRestoreGeneratedPost(id: string): Promise<void> {
  const { error } = await supabase
    .from("generated_posts")
    .update({ deleted_at: null })
    .eq("id", id)
  if (error) throw new Error(`GeneratedPost restore error: ${error.message}`)
}

/** ゴミ箱から元に戻す（generation_jobs） */
export async function dbRestoreJob(id: string): Promise<void> {
  const { error } = await supabase
    .from("generation_jobs")
    .update({ deleted_at: null })
    .eq("id", id)
  if (error) throw new Error(`Job restore error: ${error.message}`)
}

/** 完全削除（generated_posts） */
export async function dbPurgeGeneratedPost(id: string): Promise<void> {
  const { error } = await supabase.from("generated_posts").delete().eq("id", id)
  if (error) throw new Error(`GeneratedPost purge error: ${error.message}`)
}

/** 完全削除（generation_jobs） */
export async function dbPurgeJob(id: string): Promise<void> {
  const { error } = await supabase.from("generation_jobs").delete().eq("id", id)
  if (error) throw new Error(`Job purge error: ${error.message}`)
}

/** ゴミ箱に入っている投稿を取得 */
export async function dbLoadTrashedPosts(limit = 500): Promise<GeneratedPost[]> {
  const { data, error } = await supabase
    .from("generated_posts")
    .select("*")
    .neq("persona_id", V2_LEGACY_PERSONA_ID)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Trashed posts load error: ${error.message}`)
  const rows = data ?? []
  const personaIds = [...new Set(rows.map(r => r.persona_id as string).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (personaIds.length > 0) {
    const { data: personas } = await supabase.from("personas").select("id, name").in("id", personaIds)
    for (const p of personas ?? []) nameMap.set(p.id as string, p.name as string)
  }
  return rows.map(r => rowToGeneratedPost(r, nameMap.get(r.persona_id as string)))
}

/** ゴミ箱に入っている完了済みジョブを取得 */
export async function dbLoadTrashedJobs(limit = 500): Promise<GenerationJob[]> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("status", "done")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Trashed jobs load error: ${error.message}`)
  const rows = data ?? []
  const personaIds = [...new Set(rows.map(r => r.persona_id as string).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (personaIds.length > 0) {
    const { data: personas } = await supabase.from("personas").select("id, name").in("id", personaIds)
    for (const p of personas ?? []) nameMap.set(p.id as string, p.name as string)
  }
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id as string)))
}

export async function dbUpdateGeneratedPostImages(id: string, imageUrls: string[]): Promise<void> {
  const { error } = await supabase
    .from("generated_posts")
    .update({ image_urls: imageUrls })
    .eq("id", id)
  if (error) throw new Error(`GeneratedPost image update error: ${error.message}`)
}

function rowToGeneratedPost(row: Record<string, unknown>, personaName?: string): GeneratedPost {
  return {
    id:              row.id as string,
    createdAt:       row.created_at as string,
    personaId:       row.persona_id as string,
    personaName:     personaName ?? "",
    postType:        (row.post_type === "daily" ? "tips" : row.post_type) as PostType,
    productId:       (row.product_id as string | null) ?? null,
    overallTitle:    row.overall_title as string,
    slides:          (row.slides as GeneratedSlide[]) ?? [],
    caption:         (row.caption as string | null) ?? null,
    hookType:        (row.hook_type as HookType | null) ?? null,
    structureType:   (row.structure_type as StructureType | null) ?? null,
    compositionType: (row.composition_type as CompositionType | null) ?? null,
    refBenchmark:    (row.ref_benchmark as string | null) ?? null,
    imageUrls:       (row.image_urls as string[]) ?? [],
    imageCost:       (row.image_cost as { jpy: string; cny: string; usd: string } | null) ?? undefined,
  }
}

// ─── v4: ベンチマーク非表示トグル（投稿レベル）──────────────────

export async function dbToggleBenchmarkHidden(id: string, isHidden: boolean): Promise<void> {
  const { error } = await supabase
    .from("benchmark_posts")
    .update({ is_hidden: isHidden })
    .eq("id", id)
  if (error) throw new Error(`BenchmarkPost toggle hidden error: ${error.message}`)
}

// ─── v4: ベンチマーク非表示トグル（アカウントレベル）────────────

export async function dbToggleAccountHidden(accountName: string, isHidden: boolean): Promise<void> {
  const { error } = await supabase
    .from("benchmark_account_bios")
    .upsert({ account_name: accountName, is_hidden: isHidden }, { onConflict: "account_name" })
  if (error) throw new Error(`Account hidden toggle error: ${error.message}`)
}

// 非表示アカウント名の Set を返す（生成ルートでのフィルタリング用）
export async function dbLoadHiddenAccountNames(): Promise<Set<string>> {
  const { data } = await supabase
    .from("benchmark_account_bios")
    .select("account_name")
    .eq("is_hidden", true)
  return new Set((data ?? []).map(r => r.account_name as string))
}

// アカウント名 → isHidden のマップを返す（ベンチマークページ表示用）
export async function dbLoadAllAccountHiddenMap(): Promise<Map<string, boolean>> {
  const { data } = await supabase
    .from("benchmark_account_bios")
    .select("account_name, is_hidden")
  const map = new Map<string, boolean>()
  for (const row of data ?? []) {
    map.set(row.account_name as string, (row.is_hidden as boolean) ?? false)
  }
  return map
}

// ─── v4: 生成キュー CRUD ─────────────────────────────────────────

function rowToJob(row: Record<string, unknown>, personaName?: string): GenerationJob {
  // slide_regen かどうかの判定:
  // ① text_result に __slideRegen マーカーがある（新方式・DB列不要）
  // ② job_type 列が存在して "slide_regen" になっている（旧方式・マイグレーション済み環境）
  const rawText = row.text_result as (Record<string, unknown> & { __slideRegen?: boolean; slideRegenParams?: unknown }) | null
  const isSlideRegen =
    rawText?.__slideRegen === true ||
    (row.job_type as string | undefined) === "slide_regen"

  return {
    id:                   row.id as string,
    personaId:            row.persona_id as string,
    postType:             row.post_type as PostType,
    productId:            (row.product_id as string | undefined) ?? undefined,
    benchmarkFolderPath:  (row.benchmark_folder_path as string | undefined) ?? undefined,
    status:               row.status as JobStatus,
    jobType:              isSlideRegen ? "slide_regen" : "post_gen",
    // slide_regen の場合: __slideRegen マーカー付き text_result or slide_regen_params 列から取得
    slideRegenParams:     isSlideRegen
      ? ((rawText?.slideRegenParams ?? (row.slide_regen_params)) as GenerationJob["slideRegenParams"]) ?? undefined
      : undefined,
    // post_gen の場合のみ textResult として扱う（slide_regen の text_result はマーカー用途）
    textResult:           !isSlideRegen ? (row.text_result as GenerationJob["textResult"]) ?? undefined : undefined,
    imageUrls:            (row.image_urls as (string | null)[] | undefined) ?? undefined,
    refBenchmark:         (row.ref_benchmark as string | undefined) ?? undefined,
    policyFallbackSlides: (row.policy_fallback_slides as number[] | undefined) ?? undefined,
    failedSlides:         (row.failed_slides as number[] | undefined) ?? undefined,
    errorMessage:         (row.error_message as string | undefined) ?? undefined,
    imageCost:            (row.image_cost as { jpy: string; cny: string; usd: string } | undefined) ?? undefined,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
    personaName:          personaName ?? undefined,
  }
}

export async function dbCreateJob(params: {
  personaId: string
  postType: PostType
  productId?: string
  benchmarkFolderPath?: string
}): Promise<GenerationJob> {
  // job_type 列はオプション（マイグレーション未実行環境でも動くよう含めない）
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      persona_id:            params.personaId,
      post_type:             params.postType,
      product_id:            params.productId ?? null,
      benchmark_folder_path: params.benchmarkFolderPath ?? null,
      status:                "pending",
    })
    .select("*")
    .single()
  if (error) throw new Error(`Job create error: ${error.message}`)
  return rowToJob(data)
}

export async function dbCreateSlideRegenJob(params: {
  personaId:        string
  postType:         PostType
  productId?:       string
  slideRegenParams: import("@/types/v2").SlideRegenParams
}): Promise<GenerationJob> {
  // slide_regen 判定は text_result の __slideRegen マーカーで行う。
  // job_type / slide_regen_params 列は不要（DB マイグレーション不要）
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      persona_id:  params.personaId,
      post_type:   params.postType,
      product_id:  params.productId ?? null,
      status:      "pending",
      text_result: { __slideRegen: true, slideRegenParams: params.slideRegenParams },
    })
    .select("*")
    .single()
  if (error) throw new Error(`SlideRegenJob create error: ${error.message}`)
  return rowToJob(data)
}

export async function dbUpdateJob(id: string, update: {
  status?: JobStatus
  textResult?: GenerationJob["textResult"]
  imageUrls?: (string | null)[]
  refBenchmark?: string
  policyFallbackSlides?: number[]
  failedSlides?: number[]
  errorMessage?: string
  imageCost?: GenerationJob["imageCost"]
}): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (update.status             !== undefined) patch.status                 = update.status
  if (update.textResult         !== undefined) patch.text_result            = update.textResult
  if (update.imageUrls          !== undefined) patch.image_urls             = update.imageUrls
  if (update.refBenchmark       !== undefined) patch.ref_benchmark          = update.refBenchmark
  if (update.policyFallbackSlides !== undefined) patch.policy_fallback_slides = update.policyFallbackSlides
  if (update.failedSlides       !== undefined) patch.failed_slides          = update.failedSlides
  if (update.errorMessage       !== undefined) patch.error_message          = update.errorMessage
  if (update.imageCost          !== undefined) patch.image_cost             = update.imageCost
  const { error } = await supabase.from("generation_jobs").update(patch).eq("id", id)
  if (error) throw new Error(`Job update error: ${error.message}`)
}

export async function dbLoadJobs(limit = 50): Promise<GenerationJob[]> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Jobs load error: ${error.message}`)
  const rows = data ?? []
  // ペルソナ名を別クエリで取得（FKなしのため join 不可）
  const personaIds = [...new Set(rows.map(r => r.persona_id as string).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (personaIds.length > 0) {
    const { data: personas } = await supabase
      .from("personas")
      .select("id, name")
      .in("id", personaIds)
    for (const p of personas ?? []) nameMap.set(p.id as string, p.name as string)
  }
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id as string)))
}

// 完了済みジョブをまとめて取得（結果ページの履歴マージ用）
export async function dbLoadDoneJobs(limit = 500): Promise<GenerationJob[]> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("status", "done")
    .is("deleted_at", null)  // ゴミ箱に入っているものは除外
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Done jobs load error: ${error.message}`)
  const rows = data ?? []
  const personaIds = [...new Set(rows.map(r => r.persona_id as string).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (personaIds.length > 0) {
    const { data: personas } = await supabase
      .from("personas")
      .select("id, name")
      .in("id", personaIds)
    for (const p of personas ?? []) nameMap.set(p.id as string, p.name as string)
  }
  return rows.map(r => rowToJob(r, nameMap.get(r.persona_id as string)))
}

export async function dbLoadJob(id: string): Promise<GenerationJob | null> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !data) return null
  // ペルソナ名を別クエリで取得
  const { data: persona } = await supabase
    .from("personas")
    .select("name")
    .eq("id", data.persona_id as string)
    .maybeSingle()
  return rowToJob(data, (persona as { name: string } | null)?.name ?? undefined)
}
