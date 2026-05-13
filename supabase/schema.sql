-- COCOCHI v2 — Supabase スキーマ定義
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor → このファイルの内容を貼り付けて実行
--
-- ※ v1の post_groups テーブルはそのまま残す（v1と共存）

-- ─── v1: 生成グループ（変更なし・v1との共存用）─────────────────────
create table if not exists post_groups (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  product_name text not null,
  product_image_mime text,
  posts        jsonb not null default '[]'::jsonb
);

create index if not exists post_groups_created_at_idx
  on post_groups (created_at desc);

alter table post_groups enable row level security;
create policy "dev_allow_all" on post_groups
  for all using (true) with check (true);


-- ─── v2-1. ペルソナ（架空人物像）────────────────────────────────────
create table if not exists personas (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- 管理用
  name              text not null,         -- 管理画面での表示名（例: 「美容OL Remi」）

  -- プロフィール文（そのままLemon8のbioに使える形）
  character_text    text not null,         -- 例: 「10年以上肌と戦ってきた美容オタクOL...」

  -- 投稿テーマの軸（的外れ防止）
  theme_tags        text[] not null default '{}',  -- 例: ['ニキビ', '敏感肌', 'プチプラ']

  -- 投稿種別の割合（週7投稿の内訳を決める）
  -- 例: {"daily": 40, "tips": 30, "product": 30}
  type_ratios       jsonb not null default '{"daily": 40, "tips": 30, "product": 30}'::jsonb,

  -- アバター顔画像（FAL.aiで生成）
  avatar_url        text,

  -- このペルソナのベースとなったベンチマークアカウント（性格・作り方の源泉）
  benchmark_account text,

  -- v3: 派生バリエーションの「型の好み」差分（null=基本型）
  -- 例: {"hooks": {"F5": 1.5, "F4": 0.3}}（誇張系強調・危機煽り抑制）
  type_emphasis     jsonb
);

create index if not exists personas_created_at_idx on personas (created_at desc);

alter table personas enable row level security;
create policy "dev_allow_all" on personas for all using (true) with check (true);


-- ─── v2-2. ベンチマーク投稿の分析結果キャッシュ ──────────────────────
-- 登録時に1回だけ分析 → ここに保存 → 生成時はここを検索するだけ
create table if not exists benchmark_posts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- どのアカウントのどの投稿か
  account_name    text not null,        -- 例: 'accountA'
  folder_path     text not null unique, -- 例: 'accountA/post_001'

  -- スライド構成（型紙として使う）
  slide_count     int not null,         -- 実際の枚数（3〜6）
  -- 例: [{"slide": 1, "role": "フック",   "description": "悩みの告白から入る"},
  --      {"slide": 2, "role": "詳細",     "description": "失敗談を具体的に"},
  --      {"slide": 3, "role": "転機",     "description": "解決策の発見"},
  --      {"slide": 4, "role": "CTA",      "description": "保存・フォロー誘導"}]
  slide_structure jsonb not null default '[]'::jsonb,

  -- 検索用タグ（生成時にここで絞り込む）
  post_type       text not null check (post_type in ('daily', 'tips', 'product')),
  theme_tags      text[] not null default '{}',  -- 例: ['ニキビ', '日常', '朝ルーティン']
  tone            text not null check (tone in ('emotional', 'informative', 'review', 'entertainment')),

  -- 元投稿のキャプション原文（運用者が手入力。caption が空なら画像内テキストから補完）
  caption         text,

  -- ─── 3つの型（v3: Claude Vision で自動分類・自己同一化フック原理に基づく汎用パターン）────
  -- 心理フック型: F1=証拠付き自己同一化 / F2=数字n選 / F3=逆張り常識破壊 / F4=危機煽りNG / F5=即効誇張ベネフィット
  hook_main          text check (hook_main in ('F1','F2','F3','F4','F5')),
  hook_subs          text[] not null default '{}',

  -- 投稿構造型: S1=フル装備 / S2=最短 / S3=共感型 / S4=カタログ型 / S5=証拠先導
  structure_type     text check (structure_type in ('S1','S2','S3','S4','S5')),

  -- 構図/レイアウト型: C1=テキスト主体 / C2=写真メイン / C3=表リスト / C4=ビフォーアフター / C5=ムード重視
  composition_type   text check (composition_type in ('C1','C2','C3','C4','C5')),

  -- 各型の判定理由 + 自己同一化フック原理セルフチェック
  pattern_notes      jsonb
);

create index if not exists benchmark_posts_account_idx on benchmark_posts (account_name);
create index if not exists benchmark_posts_type_idx on benchmark_posts (post_type);

alter table benchmark_posts enable row level security;
create policy "dev_allow_all" on benchmark_posts for all using (true) with check (true);


-- ─── v2-3. 週次コンテンツプラン ───────────────────────────────────
-- 「このペルソナがこの週に投稿する7本の内容一覧」
create table if not exists content_plans (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  persona_id  uuid not null references personas(id) on delete cascade,
  product_id  text,          -- 商品投稿がある場合の商品ID（なければnull）
  week_start  date not null, -- 週の月曜日の日付（例: 2026-04-28）

  -- 7投稿分のプラン
  -- 例: [
  --   {
  --     "day": 1,                       // 1=月〜7=日
  --     "post_type": "daily",
  --     "benchmark_post_id": "uuid",    // 型紙にするベンチマーク投稿
  --     "generated_text": {             // テキスト生成後に入る
  --       "overall_title": "...",
  --       "slides": [...]
  --     },
  --     "generated_images": [...],      // 画像生成後に入る
  --     "status": "planned"             // planned / text_done / image_done
  --   }
  -- ]
  posts       jsonb not null default '[]'::jsonb
);

create index if not exists content_plans_persona_idx on content_plans (persona_id, week_start desc);

alter table content_plans enable row level security;
create policy "dev_allow_all" on content_plans for all using (true) with check (true);


-- ─── v2-4. 競合商品DB（比較レビュー「〇〇選」投稿用）────────────
create table if not exists competitor_products (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  brand_name   text not null,       -- ブランド名（例: ORBIS）
  product_name text not null,       -- 商品名（例: クリアフルローション）
  price        text,                -- 価格表示（例: 190ml / 1,650円）
  features     text not null,       -- 主な成分・特徴（自由記述）
  pros         text not null,       -- メリット（正直コメント）
  cons         text not null,       -- デメリット（正直コメント・信頼感のため必須）
  image_url    text not null,       -- 商品画像URL（Vercel Blob）
  image_mime   text not null default 'image/jpeg',

  -- 検索・絞り込み用
  category     text,                -- 例: 化粧水 / 美容液 / 洗顔
  tags         text[] not null default '{}'  -- 例: ['ニキビ', '皮脂ケア', 'プチプラ']
);

create index if not exists competitor_products_category_idx on competitor_products (category);

alter table competitor_products enable row level security;
create policy "dev_allow_all" on competitor_products for all using (true) with check (true);


-- ─── v3-5. 生成済み投稿（被り防止＋納品用の永続保存）────────────────
-- ペルソナごとに過去N件を読み出してAI被り判定に使う。
-- ペルソナ削除時は CASCADE で関連投稿も自動削除。
create table if not exists generated_posts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  persona_id       uuid not null references personas(id) on delete cascade,
  post_type        text not null check (post_type in ('daily', 'tips', 'product', 'mixed')),
  product_id       text,                                  -- product 投稿のみ

  -- 生成されたテキストコンテンツ
  overall_title    text not null,
  slides           jsonb not null default '[]'::jsonb,    -- GeneratedSlide[]
  caption          text,

  -- v3 3つの型（生成時のパラメータを保持）
  hook_type        text check (hook_type in ('F1','F2','F3','F4','F5')),
  structure_type   text check (structure_type in ('S1','S2','S3','S4','S5')),
  composition_type text check (composition_type in ('C1','C2','C3','C4','C5')),

  -- 画像生成・参照情報
  ref_benchmark    text,                                  -- 参照ベンチマークの folder_path
  image_urls       jsonb not null default '[]'::jsonb     -- 生成画像URLの配列
);

-- 「特定ペルソナの直近N件」を高速取得するための複合インデックス
create index if not exists generated_posts_persona_created_idx
  on generated_posts (persona_id, created_at desc);

alter table generated_posts enable row level security;
create policy "dev_allow_all" on generated_posts for all using (true) with check (true);


-- ─── v4-6. 生成キュー（ジョブ管理）────────────────────────────────
-- enqueue → process の fire-and-forget パターンで非同期生成を管理する。
-- jobType が 'post_gen'（全スライド生成）か 'slide_regen'（1枚再生成）かを区別する。
create table if not exists generation_jobs (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- 基本パラメータ
  persona_id            uuid not null references personas(id) on delete cascade,
  post_type             text not null check (post_type in ('tips', 'product', 'mixed')),
  product_id            text,
  benchmark_folder_path text,

  -- ジョブ状態
  status                text not null default 'pending'
                          check (status in ('pending','text_generating','image_generating','done','error')),

  -- v4: ジョブ種別（デフォルト post_gen）
  job_type              text not null default 'post_gen'
                          check (job_type in ('post_gen', 'slide_regen')),

  -- v4: 1枚再生成パラメータ（job_type=slide_regen のみ使用）
  slide_regen_params    jsonb,

  -- 結果
  text_result           jsonb,
  image_urls            jsonb,
  ref_benchmark         text,
  policy_fallback_slides jsonb,
  failed_slides         jsonb,
  error_message         text
);

create index if not exists generation_jobs_created_idx on generation_jobs (created_at desc);
create index if not exists generation_jobs_status_idx  on generation_jobs (status);

alter table generation_jobs enable row level security;
create policy "dev_allow_all" on generation_jobs for all using (true) with check (true);

-- ─── v4 マイグレーション（既存テーブルに追記）──────────────────────
-- ※ 既に generation_jobs テーブルが存在する場合は下記 ALTER を実行すること。
--   CREATE TABLE 実行環境では不要（新規カラムが含まれているため）。
--
-- ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'post_gen';
-- ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS slide_regen_params jsonb;

-- ─── ゴミ箱（ソフトデリート）対応 ──────────────────────────────────
-- Supabase Dashboard → SQL Editor で以下を実行すること。
--
-- ALTER TABLE generated_posts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- CREATE INDEX IF NOT EXISTS generated_posts_deleted_at_idx ON generated_posts (deleted_at);
-- CREATE INDEX IF NOT EXISTS generation_jobs_deleted_at_idx ON generation_jobs (deleted_at);
