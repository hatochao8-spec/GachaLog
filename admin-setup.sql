-- GachaLog 管理者用RLS設定
-- 先に Supabase Dashboard > Authentication > Users で管理者ユーザーを作成してください。
-- そのユーザーの UUID を下の REPLACE_WITH_ADMIN_USER_UUID に置き換えて実行してください。
-- このSQLにService Role Keyなどの秘密情報を記載しないでください。

create policy "Admins can read all products"
on public.products
for select
to authenticated
using (auth.uid() = 'REPLACE_WITH_ADMIN_USER_UUID'::uuid);

create policy "Admins can update product review status"
on public.products
for update
to authenticated
using (auth.uid() = 'REPLACE_WITH_ADMIN_USER_UUID'::uuid)
with check (auth.uid() = 'REPLACE_WITH_ADMIN_USER_UUID'::uuid);
