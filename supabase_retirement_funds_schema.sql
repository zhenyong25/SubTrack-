-- Retirement funds (EPF / CPF) tracking schema for SubTrack
-- Run this in the Supabase SQL editor.
--
-- retirement_funds:            one row per EPF/CPF pot (e.g. "My EPF").
-- retirement_balance_entries:  dated balance per sub-account of that pot
--                              (EPF: persaraan / sejahtera / fleksibel, CPF: oa / sa / ma / ra).
--                              The newest date per sub-account is the current balance.

create extension if not exists pgcrypto;

do $$
begin
  create type public.retirement_scheme as enum ('EPF', 'CPF');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.retirement_funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheme public.retirement_scheme not null,
  name text not null,
  currency varchar not null default 'MYR',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retirement_balance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_id uuid not null references public.retirement_funds(id) on delete cascade,
  sub_account text not null,
  balance_date date not null default current_date,
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  -- Re-logging the same day replaces that day's figure instead of stacking a duplicate.
  unique (fund_id, sub_account, balance_date)
);

create index if not exists retirement_funds_user_id_idx on public.retirement_funds (user_id);
create index if not exists retirement_balance_entries_user_id_idx on public.retirement_balance_entries (user_id);
create index if not exists retirement_balance_entries_fund_date_idx on public.retirement_balance_entries (fund_id, balance_date);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.retirement_funds to authenticated;
grant select, insert, update, delete on public.retirement_balance_entries to authenticated;

create or replace function public.set_retirement_funds_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_retirement_funds_updated_at on public.retirement_funds;
create trigger set_retirement_funds_updated_at
before update on public.retirement_funds
for each row
execute function public.set_retirement_funds_updated_at();

alter table public.retirement_funds enable row level security;

drop policy if exists "Users can read own retirement funds" on public.retirement_funds;
create policy "Users can read own retirement funds"
on public.retirement_funds
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own retirement funds" on public.retirement_funds;
create policy "Users can insert own retirement funds"
on public.retirement_funds
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own retirement funds" on public.retirement_funds;
create policy "Users can update own retirement funds"
on public.retirement_funds
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own retirement funds" on public.retirement_funds;
create policy "Users can delete own retirement funds"
on public.retirement_funds
for delete
using (auth.uid() = user_id);

alter table public.retirement_balance_entries enable row level security;

drop policy if exists "Users can read own retirement balance entries" on public.retirement_balance_entries;
create policy "Users can read own retirement balance entries"
on public.retirement_balance_entries
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own retirement balance entries" on public.retirement_balance_entries;
create policy "Users can insert own retirement balance entries"
on public.retirement_balance_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own retirement balance entries" on public.retirement_balance_entries;
create policy "Users can update own retirement balance entries"
on public.retirement_balance_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own retirement balance entries" on public.retirement_balance_entries;
create policy "Users can delete own retirement balance entries"
on public.retirement_balance_entries
for delete
using (auth.uid() = user_id);
