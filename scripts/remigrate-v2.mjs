/**
 * V2 legacy データ再移行スクリプト
 * Vercel Blob の groups.json → Supabase generated_posts
 * ペルソナ削除による CASCADE DELETE 後の復旧用
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL  = "https://kaqxqdnvaczikwqazldq.supabase.co"
const SUPABASE_KEY  = "sb_publishable_fz3Ed2Y47xlZ7d-Mez-UDA_UPVh1244"
const BLOB_URL      = "https://nhrmha2spl8dgl9d.public.blob.vercel-storage.com/cocochi/db/groups.json"
const V2_PERSONA_ID = "00000000-0000-0000-0000-000000000002"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  // ① V2 Legacy ペルソナを upsert（存在しなければ作成、あれば上書き）
  console.log("V2 Legacy ペルソナを作成中...")
  const { error: personaErr } = await supabase
    .from("personas")
    .upsert({
      id:               V2_PERSONA_ID,
      name:             "V2 Legacy（過去データ）",
      character_text:   "V2時代に生成されたコンテンツ",
      theme_tags:       ["美容", "スキンケア"],
      type_ratios:      { tips: 60, product: 40 },
      benchmark_account: null,
    }, { onConflict: "id" })

  if (personaErr) {
    console.error("ペルソナ作成エラー:", personaErr.message)
    process.exit(1)
  }
  console.log("✓ ペルソナ作成完了")

  // ② groups.json を取得
  console.log("Blob からデータ取得中...")
  const res = await fetch(BLOB_URL)
  const groups = await res.json()
  const totalPosts = groups.reduce((s, g) => s + (g.posts?.length ?? 0), 0)
  console.log(`✓ ${groups.length} グループ / ${totalPosts} 件`)

  // ③ 既存データを確認（重複を防ぐ）
  const { data: existing } = await supabase
    .from("generated_posts")
    .select("overall_title")
    .eq("persona_id", V2_PERSONA_ID)
  const existingTitles = new Set((existing ?? []).map(r => r.overall_title))
  console.log(`既存 V2 データ: ${existingTitles.size} 件`)

  // ④ 移行
  let ok = 0, skip = 0, fail = 0

  for (const group of groups) {
    for (const post of (group.posts ?? [])) {
      // 重複スキップ
      if (existingTitles.has(post.overallTitle)) { skip++; continue }

      // V2 slides → GeneratedSlide 形式にマッピング
      const slides = (post.slides ?? []).map((s, i) => ({
        slideNumber: s.slideNumber ?? (i + 1),
        tag:         s.tag      ?? "",
        headline:    s.headline ?? "",
        bullets:     s.bullets  ?? undefined,
        accent:      s.accent   ?? undefined,
      }))

      const imageUrls = (post.images ?? []).filter(u => typeof u === "string" && u.startsWith("http"))

      const { error } = await supabase
        .from("generated_posts")
        .insert({
          persona_id:    V2_PERSONA_ID,
          post_type:     "tips",          // V2 は大半が tips
          product_id:    null,
          overall_title: post.overallTitle ?? "（タイトルなし）",
          slides,
          caption:       post.caption     ?? null,
          hook_type:     null,
          structure_type: null,
          composition_type: null,
          ref_benchmark: null,
          image_urls:    imageUrls,
        })

      if (error) {
        console.error("  ERROR:", post.overallTitle?.slice(0, 30), "→", error.message)
        fail++
      } else {
        ok++
      }
    }
  }

  console.log(`\n完了: ${ok} 件移行 / ${skip} 件スキップ（重複） / ${fail} 件失敗`)
}

main().catch(console.error)
