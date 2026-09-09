-- Monthly budget plans for SubTrack.
-- Run this once in the Supabase SQL editor to enable cross-device budget sync.

create table if not exists public.budget_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  total_limit numeric not null check (total_limit > 0),
  category_limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month),
  constraint budget_month_is_first_day check (extract(day from month) = 1)
);

create index if not exists budget_plans_user_month_idx
  on public.budget_plans (user_id, month desc);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.budget_plans to authenticated;

alter table public.budget_plans enable row level security;

drop policy if exists "Users can read own budget plans" on public.budget_plans;
create policy "Users can read own budget plans"
on public.budget_plans for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own budget plans" on public.budget_plans;
create policy "Users can insert own budget plans"
on public.budget_plans for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own budget plans" on public.budget_plans;
create policy "Users can update own budget plans"
on public.budget_plans for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own budget plans" on public.budget_plans;
create policy "Users can delete own budget plans"
on public.budget_plans for delete
using (auth.uid() = user_id);
