-- GachaLog マイコレクション・ほしい物リスト・シリーズ達成率
-- Supabase SQL Editor で一度だけ実行してください。
-- 商品ごとのシリーズ名を登録し、同じシリーズの商品を集めて達成率を計算します。

alter table public.products
  add column if not exists series_name text;

create index if not exists products_series_name_idx
  on public.products (series_name)
  where status = 'published';

create table if not exists public.user_collections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  status text not null check (status in ('owned', 'wishlist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists user_collections_product_idx
  on public.user_collections (product_id, status);
create index if not exists user_collections_user_status_idx
  on public.user_collections (user_id, status);

alter table public.user_collections enable row level security;

drop policy if exists "Collections are visible to owners and owned items are public" on public.user_collections;
create policy "Collections are visible to owners and owned items are public"
on public.user_collections for select to anon, authenticated
using (status = 'owned' or auth.uid() = user_id);

drop policy if exists "Users can add own collection items" on public.user_collections;
create policy "Users can add own collection items"
on public.user_collections for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.status = 'published'
  )
);

drop policy if exists "Users can update own collection items" on public.user_collections;
create policy "Users can update own collection items"
on public.user_collections for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and status in ('owned', 'wishlist')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.status = 'published'
  )
);

drop policy if exists "Users can remove own collection items" on public.user_collections;
create policy "Users can remove own collection items"
on public.user_collections for delete to authenticated
using (auth.uid() = user_id);

grant select on public.user_collections to anon, authenticated;
grant insert, update, delete on public.user_collections to authenticated;

drop trigger if exists user_collections_updated_at on public.user_collections;
create trigger user_collections_updated_at
before update on public.user_collections
for each row execute procedure public.set_gachalog_updated_at();
