-- Trade tab schema for SubTrack
-- Run this in the Supabase SQL editor. Safe to run again.
--
-- trade_settings: one row per user holding their risk rules and watchlist (as JSON).
-- trade_journal:  each trade taken, with its plan (entry, stop, target, shares) and result.
--
-- Until this is run the Trade tab keeps rules and the journal on the device only.

create extension if not exists pgcrypto;

create table if not exists public.trade_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_date date not null,
  symbol text not null,
  setup text not null default 'Other',
  entry numeric not null check (entry > 0),
  stop numeric not null check (stop >= 0),
  target numeric,
  shares numeric not null check (shares > 0),
  exit_price numeric check (exit_price is null or exit_price >= 0),
  exit_date date,
  fees numeric not null default 0 check (fees >= 0),
  followed_plan boolean not null default true,
  mistakes text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- Currency of the trade's prices (added after the first version, hence the alter).
alter table public.trade_journal add column if not exists currency text;

create index if not exists trade_journal_user_date_idx on public.trade_journal (user_id, trade_date);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.trade_settings to authenticated;
grant select, insert, update, delete on public.trade_journal to authenticated;

create or replace function public.set_trade_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trade_settings_updated_at on public.trade_settings;
create trigger set_trade_settings_updated_at
before update on public.trade_settings
for each row
execute function public.set_trade_settings_updated_at();

alter table public.trade_settings enable row level security;

drop policy if exists "Users manage own trade settings" on public.trade_settings;
create policy "Users manage own trade settings"
on public.trade_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.trade_journal enable row level security;

drop policy if exists "Users manage own trade journal" on public.trade_journal;
create policy "Users manage own trade journal"
on public.trade_journal
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
