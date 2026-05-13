import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data, error } = await sb
  .from("benchmark_posts")
  .select("id, account_name, folder_path, hook_main, hook_subs, structure_type, composition_type, pattern_notes")
  .order("created_at", { ascending: true })

if (error) {
  console.error("Error:", error)
  console.error("→ ALTER TABLE が未実行で 5列が存在しない可能性があります")
  process.exit(1)
}

let withTypes = 0
let withoutTypes = 0
const hookCount = {}, structureCount = {}, compositionCount = {}

for (const p of data) {
  if (p.hook_main || p.structure_type || p.composition_type) withTypes++
  else withoutTypes++

  if (p.hook_main)        hookCount[p.hook_main] = (hookCount[p.hook_main] ?? 0) + 1
  if (p.structure_type)   structureCount[p.structure_type] = (structureCount[p.structure_type] ?? 0) + 1
  if (p.composition_type) compositionCount[p.composition_type] = (compositionCount[p.composition_type] ?? 0) + 1
}

console.log(`==== 全 ${data.length} 件 ====`)
console.log(`  3つの型あり: ${withTypes}件`)
console.log(`  3つの型なし: ${withoutTypes}件`)
console.log("")
console.log("hookMain 分布:", hookCount)
console.log("structureType 分布:", structureCount)
console.log("compositionType 分布:", compositionCount)
console.log("")

// 最初の3件をサンプルとして詳細表示
console.log("==== サンプル（最初3件）====")
for (const p of data.slice(0, 3)) {
  console.log(`${p.folder_path}`)
  console.log(`  hook_main: ${p.hook_main} / subs: ${JSON.stringify(p.hook_subs)}`)
  console.log(`  structure_type: ${p.structure_type}`)
  console.log(`  composition_type: ${p.composition_type}`)
  console.log(`  pattern_notes: ${JSON.stringify(p.pattern_notes)}`)
  console.log("")
}
