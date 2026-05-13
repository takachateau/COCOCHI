import { createClient } from "@supabase/supabase-js"

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// 削除前の確認
const { data: before, error: e1 } = await sb.from("personas").select("id, name").order("created_at")
if (e1) { console.error(e1); process.exit(1) }
console.log(`削除前: personas = ${before.length}件`)
for (const p of before) console.log(`  - ${p.name} (${p.id})`)

const { count: planCountBefore } = await sb.from("content_plans").select("*", { count: "exact", head: true })
console.log(`削除前: content_plans = ${planCountBefore}件`)

// 全 personas 削除（content_plans は ON DELETE CASCADE で自動削除）
console.log("")
console.log("削除中...")
const { error: e2 } = await sb.from("personas").delete().not("id", "is", null)
if (e2) { console.error("削除エラー:", e2); process.exit(1) }

// 削除後の確認
const { data: after } = await sb.from("personas").select("id, name")
const { count: planCountAfter } = await sb.from("content_plans").select("*", { count: "exact", head: true })
console.log(`削除後: personas = ${after?.length ?? 0}件`)
console.log(`削除後: content_plans = ${planCountAfter}件 (cascade削除)`)
