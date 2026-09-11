-- Cash accounts / net worth tracking schema for SubTrack
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.cash_account_type as enum ('Bank', 'EWallet', 'MultiCurrencyCard', 'Cash', 'Other');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text not null default 'Other',
  account_type public.cash_account_type not null default 'Bank',
  country text not null default '',
  currency varchar not null default 'SGD',
  color text not null default '#0ea5e9',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_balance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.cash_accounts(id) on delete cascade,
  balance_date date not null default current_date,
  balance numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists cash_accounts_user_id_idx on public.cash_accounts (user_id);
create index if not exists cash_balance_entries_user_id_idx on public.cash_balance_entries (user_id);
create index if not exists cash_balance_entries_account_id_idx on public.cash_balance_entries (account_id);
create index if not exists cash_balance_entries_account_date_idx on public.cash_balance_entries (account_id, balance_date);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cash_accounts to authenticated;
grant select, insert, update, delete on public.cash_balance_entries to authenticated;

create or replace function public.set_cash_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cash_accounts_updated_at on public.cash_accounts;
create trigger set_cash_accounts_updated_at
before update on public.cash_accounts
for each row
execute function public.set_cash_accounts_updated_at();

alter table public.cash_accounts enable row level security;

drop policy if exists "Users can read own cash accounts" on public.cash_accounts;
create policy "Users can read own cash accounts"
on public.cash_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cash accounts" on public.cash_accounts;
create policy "Users can insert own cash accounts"
on public.cash_accounts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own cash accounts" on public.cash_accounts;
create policy "Users can update own cash accounts"
on public.cash_accounts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cash accounts" on public.cash_accounts;
create policy "Users can delete own cash accounts"
on public.cash_accounts
for delete
using (auth.uid() = user_id);

alter table public.cash_balance_entries enable row level security;

drop policy if exists "Users can read own cash balance entries" on public.cash_balance_entries;
create policy "Users can read own cash balance entries"
on public.cash_balance_entries
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cash balance entries" on public.cash_balance_entries;
create policy "Users can insert own cash balance entries"
on public.cash_balance_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own cash balance entries" on public.cash_balance_entries;
create policy "Users can update own cash balance entries"
on public.cash_balance_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cash balance entries" on public.cash_balance_entries;
create policy "Users can delete own cash balance entries"
on public.cash_balance_entries
for delete
using (auth.uid() = user_id);
