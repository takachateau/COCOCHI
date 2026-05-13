import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data, error } = await sb
  .from("benchmark_posts")
  .select("id, folder_path, hook_main, structure_type, composition_type")
  .order("created_at", { ascending: true })

if (error) { console.error("Error:", error); process.exit(1) }

const allOk     = data.filter(p => p.hook_main && p.structure_type && p.composition_type)
const partial   = data.filter(p => (p.hook_main || p.structure_type || p.composition_type) && !(p.hook_main && p.structure_type && p.composition_type))
const allEmpty  = data.filter(p => !p.hook_main && !p.structure_type && !p.composition_type)

console.log(`==== 全 ${data.length} 件 ====`)
console.log(`  完全OK (F+S+C 全部あり): ${allOk.length}`)
console.log(`  部分失敗 (どれか欠け):    ${partial.length}`)
console.log(`  完全空:                   ${allEmpty.length}`)
console.log("")

if (partial.length > 0) {
  console.log("==== 部分失敗の投稿 ====")
  for (const p of partial) {
    console.log(`  ${p.folder_path}: hook=${p.hook_main || "(空)"} / struct=${p.structure_type || "(空)"} / comp=${p.composition_type || "(空)"}`)
  }
}
if (allEmpty.length > 0) {
  console.log("")
  console.log("==== 完全空の投稿 ====")
  for (const p of allEmpty) {
    console.log(`  ${p.folder_path}`)
  }
}
