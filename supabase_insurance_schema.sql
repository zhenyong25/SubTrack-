-- Run in the Supabase SQL editor to enable insurance sync. Safe to rerun.
begin;
create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists insurance_policies_user_idx on public.insurance_policies(user_id, id);
alter table public.insurance_policies enable row level security;
revoke all on public.insurance_policies from anon, authenticated;
grant select, insert, update, delete on public.insurance_policies to authenticated;
grant all on public.insurance_policies to service_role;
drop policy if exists "Own insurance policies" on public.insurance_policies;
create policy "Own insurance policies" on public.insurance_policies for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';
commit;
