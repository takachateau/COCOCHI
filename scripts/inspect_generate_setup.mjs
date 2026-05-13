import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

console.log("==== personas ====")
const { data: personas, error: pe } = await sb.from("personas").select("id, name, theme_tags, type_ratios, benchmark_account, created_at").order("created_at", { ascending: false })
if (pe) console.error(pe)
else {
  console.log(`計 ${personas.length}件`)
  for (const p of personas) {
    console.log(`  - ${p.name} (benchmark=${p.benchmark_account}, tags=${(p.theme_tags ?? []).slice(0, 3).join(", ")}, ratios=${JSON.stringify(p.type_ratios)})`)
  }
}

console.log("")
console.log("==== competitor_products ====")
const { data: comp, error: ce } = await sb.from("competitor_products").select("id, brand_name, product_name, category").order("created_at", { ascending: false })
if (ce) console.error(ce)
else {
  console.log(`計 ${comp.length}件`)
  for (const c of comp.slice(0, 10)) {
    console.log(`  - [${c.category ?? "-"}] ${c.brand_name} / ${c.product_name}`)
  }
}

console.log("")
console.log("==== content_plans ====")
const { data: plans, error: ple } = await sb.from("content_plans").select("id, persona_id, week_start, posts").order("created_at", { ascending: false }).limit(5)
if (ple) console.error(ple)
else {
  console.log(`計 ${plans.length}件 (最新5件のみ)`)
  for (const p of plans) {
    const postsArr = p.posts ?? []
    console.log(`  - ${p.week_start}: ${postsArr.length}投稿 (persona=${p.persona_id?.slice(0, 8)})`)
  }
}
