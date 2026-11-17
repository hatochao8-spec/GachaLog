-- GachaLog: 獲得日・ダブり数の記録
-- Supabase SQL Editorで一度だけ実行してください。
alter table public.user_collections
  add column if not exists acquired_at date,
  add column if not exists duplicate_count integer not null default 0;

alter table public.user_collections
  drop constraint if exists user_collections_duplicate_count_check;

alter table public.user_collections
  add constraint user_collections_duplicate_count_check
  check (duplicate_count >= 0 and duplicate_count <= 999);
