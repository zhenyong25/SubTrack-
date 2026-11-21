-- Run in the Supabase SQL editor to enable tax record sync. Safe to rerun.
-- Notice of Assessment files use the existing private account-statements bucket under <user_id>/tax/.
begin;
create table if not exists public.tax_years (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists tax_years_user_idx on public.tax_years(user_id, id);
alter table public.tax_years enable row level security;
revoke all on public.tax_years from anon, authenticated;
grant select, insert, update, delete on public.tax_years to authenticated;
grant all on public.tax_years to service_role;
drop policy if exists "Own tax years" on public.tax_years;
create policy "Own tax years" on public.tax_years for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';
commit;
