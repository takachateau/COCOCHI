import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data, error } = await sb
  .from("benchmark_posts")
  .select("*")
  .eq("folder_path", "ゆうこ肌管理情報/post_011")
  .single()

if (error) { console.error("Error:", error); process.exit(1) }

console.log("==== post_011 詳細 ====")
console.log(`id: ${data.id}`)
console.log(`folder_path: ${data.folder_path}`)
console.log(`slide_count: ${data.slide_count}`)
console.log(`caption length: ${data.caption ? data.caption.length : 0} 文字`)
console.log(`caption preview: ${data.caption ? data.caption.slice(0, 200) : "(なし)"}`)
console.log(`hook_main: ${data.hook_main}, structure_type: ${data.structure_type}, composition_type: ${data.composition_type}`)
console.log("")
console.log("==== slide_urls アクセスチェック ====")
const urls = data.slide_urls ?? []
for (let i = 0; i < urls.length; i++) {
  const u = urls[i]
  try {
    const r = await fetch(u, { method: "HEAD" })
    console.log(`  ${i + 1}. ${r.status} ${r.statusText} - ${u.slice(0, 80)}...`)
  } catch (e) {
    console.log(`  ${i + 1}. FETCH FAILED: ${e.message} - ${u.slice(0, 80)}...`)
  }
}
