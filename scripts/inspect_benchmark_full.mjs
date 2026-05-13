import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data, error } = await sb
  .from("benchmark_posts")
  .select("*")
  .order("created_at", { ascending: true })

if (error) { console.error("Error:", error); process.exit(1) }

console.log(`==== 総投稿数: ${data.length} ====\n`)

for (const p of data) {
  console.log(`---- ${p.account_name} / ${p.folder_path} ----`)
  console.log(`  postType=${p.post_type} tone=${p.tone} slides=${p.slide_count}`)
  console.log(`  themeTags: ${(p.theme_tags ?? []).join(", ")}`)
  if (p.caption) {
    const c = p.caption.replace(/\n/g, " ").slice(0, 200)
    console.log(`  caption  : ${c}${p.caption.length > 200 ? "..." : ""}`)
  } else {
    console.log(`  caption  : (なし)`)
  }
  for (const s of (p.slide_structure ?? [])) {
    console.log(`    ${s.slide}. [${s.role}] ${s.description}`)
  }
  console.log("")
}
