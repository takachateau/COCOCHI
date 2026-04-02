-- COCOCHI — Supabase スキーマ定義
-- Phase 2 で storage.ts のローカルJSONをこのDBに移行する
--
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor → このファイルの内容を貼り付けて実行

-- ─── 生成グループ（1商品 = 1グループ）────────────────────────────
create table if not exists post_groups (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  product_name text not null,
  product_image_mime text,
  -- posts は JSON で保持（画像URLはVercel Blob）
  posts        jsonb not null default '[]'::jsonb
);

-- 作成日の降順で取得するためのインデックス
create index if not exists post_groups_created_at_idx
  on post_groups (created_at desc);

-- RLS: 認証ユーザーのみアクセス可（必要に応じてポリシーを追加）
alter table post_groups enable row level security;

-- 開発中は全許可ポリシー（本番前に絞ること）
create policy "dev_allow_all" on post_groups
  for all using (true) with check (true);
