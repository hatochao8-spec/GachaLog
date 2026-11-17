-- GachaLog ユーザー商品登録申請
-- Supabase SQL Editorで一度だけ実行してください。
-- ユーザーは status='pending' の商品だけを申請でき、公開状態には変更できません。
alter table public.products
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;
create index if not exists products_submitted_by_idx on public.products (submitted_by);
alter table public.products enable row level security;
drop policy if exists "Authenticated users can submit products" on public.products;
create policy "Authenticated users can submit products"
on public.products for insert to authenticated
with check (auth.uid() = submitted_by and status = 'pending');
grant insert on public.products to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;
