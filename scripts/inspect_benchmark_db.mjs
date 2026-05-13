import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data, error } = await sb
  .from("benchmark_posts")
  .select("*")
  .order("created_at", { ascending: true })

if (error) { console.error("Error:", error); process.exit(1) }

console.log(`==== 総投稿数: ${data.length} ====\n`)

// アカウント別集計
const byAccount = {}
for (const p of data) {
  ;(byAccount[p.account_name] ??= []).push(p)
}

for (const [account, posts] of Object.entries(byAccount)) {
  console.log(`---- ${account} (${posts.length}投稿) ----`)

  // postType
  const byType = {}
  for (const p of posts) byType[p.post_type] = (byType[p.post_type] ?? 0) + 1
  console.log("  postType:", JSON.stringify(byType))

  // tone
  const byTone = {}
  for (const p of posts) byTone[p.tone] = (byTone[p.tone] ?? 0) + 1
  console.log("  tone    :", JSON.stringify(byTone))

  // theme_tags top10
  const tagCount = {}
  for (const p of posts) for (const t of (p.theme_tags ?? [])) tagCount[t] = (tagCount[t] ?? 0) + 1
  const sortedTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log("  topTags :", sortedTags.map(([t, n]) => `${t}(${n})`).join(", "))

  // caption 有無
  const withCaption = posts.filter(p => p.caption && p.caption.length > 0).length
  console.log(`  caption : ${withCaption}/${posts.length}投稿`)

  // slide_count 分布
  const slideCounts = posts.map(p => p.slide_count).sort((a,b) => a-b)
  console.log(`  slides  : 平均 ${(slideCounts.reduce((s,n)=>s+n,0)/slideCounts.length).toFixed(1)}枚 / 最小 ${slideCounts[0]} / 最大 ${slideCounts[slideCounts.length-1]}`)

  console.log("")
}
