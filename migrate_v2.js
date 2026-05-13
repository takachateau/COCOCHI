/**
 * V2 データ（db/groups.json）を Supabase generated_posts に一括移行するスクリプト
 */
const { createClient } = require('@supabase/supabase-js');
const { list } = require('@vercel/blob');

const SUPABASE_URL = 'https://kaqxqdnvaczikwqazldq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fz3Ed2Y47xlZ7d-Mez-UDA_UPVh1244';
const BLOB_TOKEN   = 'vercel_blob_rw_nhRmha2Spl8DgL9d_E0ssSMzhc2B3YzkeXaj2ovAoVwLVID';

process.env.BLOB_READ_WRITE_TOKEN = BLOB_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// V2 Legacy ペルソナの固定UUID（何度実行しても同じIDを使う）
const LEGACY_PERSONA_ID = '00000000-0000-0000-0000-000000000002';

async function ensureLegacyPersona() {
  const { data, error } = await supabase
    .from('personas')
    .select('id')
    .eq('id', LEGACY_PERSONA_ID)
    .single();
  
  if (data) {
    console.log('✅ V2 Legacy ペルソナ 既存');
    return;
  }
  
  const { error: insertErr } = await supabase.from('personas').insert({
    id:             LEGACY_PERSONA_ID,
    name:           'V2 旧バージョン',
    character_text: '【V2移行データ】旧バージョン（V2）で生成した投稿の移行用ペルソナです。',
    theme_tags:     ['移行'],
    type_ratios:    { tips: 100 },
    benchmark_account: null,
  });
  
  if (insertErr) throw new Error(`persona insert error: ${insertErr.message}`);
  console.log('✅ V2 Legacy ペルソナ 作成');
}

async function run() {
  // 1. Blob から groups.json を取得
  let cursor;
  const allBlobs = [];
  do {
    const result = await list({ limit: 1000, cursor });
    allBlobs.push(...result.blobs);
    cursor = result.cursor;
  } while (cursor);
  
  const groupBlob = allBlobs.find(b => b.pathname === 'cocochi/db/groups.json');
  if (!groupBlob) throw new Error('groups.json not found in Blob');
  
  const res  = await fetch(groupBlob.url);
  const groups = await res.json();
  console.log(`📦 groups.json 読み込み: ${groups.length} グループ`);
  
  // 2. Legacy ペルソナを確保
  await ensureLegacyPersona();
  
  // 3. 既存の移行済みタイトルを取得（重複防止）
  const { data: existing } = await supabase
    .from('generated_posts')
    .select('overall_title')
    .eq('persona_id', LEGACY_PERSONA_ID);
  const existingTitles = new Set((existing || []).map(r => r.overall_title));
  console.log(`📋 移行済み件数: ${existingTitles.size}`);
  
  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;
  
  // 4. 各グループの各投稿を insert
  for (const group of groups) {
    for (const post of (group.posts || [])) {
      if (!post.overallTitle) { skipped++; continue; }
      if (existingTitles.has(post.overallTitle)) { skipped++; continue; }
      
      // slides を V3 フォーマットに変換（bullets がなければ空配列）
      const slides = (post.slides || []).map(s => ({
        slideNumber: s.slideNumber ?? 1,
        tag:         s.tag ?? '',
        headline:    s.headline ?? '',
        bullets:     s.bullets ?? [],
        accent:      s.accent ?? null,
      }));
      
      // imageUrls: post.images は完全 URL の配列
      const imageUrls = (post.images || []).filter(u => typeof u === 'string');
      
      const { error } = await supabase.from('generated_posts').insert({
        id:              undefined,  // auto-generate
        created_at:      group.createdAt || new Date().toISOString(),
        persona_id:      LEGACY_PERSONA_ID,
        post_type:       'tips',     // V2は型区分なし → tips として扱う
        product_id:      null,
        overall_title:   post.overallTitle,
        slides:          slides,
        caption:         post.caption ?? null,
        hook_type:       null,
        structure_type:  null,
        composition_type:null,
        ref_benchmark:   null,
        image_urls:      imageUrls,
      });
      
      if (error) {
        console.error(`  ❌ "${post.overallTitle}": ${error.message}`);
        errors++;
      } else {
        console.log(`  ✅ "${post.overallTitle}" (${imageUrls.length}枚)`);
        inserted++;
      }
    }
  }
  
  console.log('\n═══════════════');
  console.log(`✅ 移行完了: ${inserted}件追加 / ${skipped}件スキップ / ${errors}件エラー`);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
