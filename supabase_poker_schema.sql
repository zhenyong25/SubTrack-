-- Poker schema update for SubTrack
-- Run this in the Supabase SQL editor after supabase_investments_schema.sql.
--
-- poker_mtt_tournaments.is_bounty:  marks a bounty (knockout) event, so bounty winnings are
--                                   logged separately from the end reward.
-- poker_cash_sessions:              one row per cash-game session: what was bought in for in
--                                   total and what was left at the end.
-- poker_mtt_bankroll_transactions.currency / amount:
--                                   what a deposit or withdrawal was sent in (e.g. SGD 500),
--                                   next to amount_usd, the USD it credited.
--
-- Until this is run the app keeps cash sessions on the device only. Safe to run again.

create extension if not exists pgcrypto;

alter table public.poker_mtt_tournaments add column if not exists is_bounty boolean not null default false;

alter table public.poker_mtt_bankroll_transactions add column if not exists currency text not null default 'USD';
alter table public.poker_mtt_bankroll_transactions add column if not exists amount numeric;

create table if not exists public.poker_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  session_date date not null default current_date,
  game text,
  venue text,
  buy_in_usd numeric not null default 0 check (buy_in_usd >= 0),
  cash_out_usd numeric not null default 0 check (cash_out_usd >= 0),
  duration_hours numeric check (duration_hours is null or duration_hours >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poker_cash_sessions_user_id_idx on public.poker_cash_sessions (user_id);
create index if not exists poker_cash_sessions_investment_id_idx on public.poker_cash_sessions (investment_id);
create index if not exists poker_cash_sessions_user_date_idx on public.poker_cash_sessions (user_id, session_date);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.poker_cash_sessions to authenticated;

create or replace function public.set_poker_cash_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_poker_cash_sessions_updated_at on public.poker_cash_sessions;
create trigger set_poker_cash_sessions_updated_at
before update on public.poker_cash_sessions
for each row
execute function public.set_poker_cash_sessions_updated_at();

alter table public.poker_cash_sessions enable row level security;

drop policy if exists "Users can read own poker cash sessions" on public.poker_cash_sessions;
create policy "Users can read own poker cash sessions"
on public.poker_cash_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own poker cash sessions" on public.poker_cash_sessions;
create policy "Users can insert own poker cash sessions"
on public.poker_cash_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own poker cash sessions" on public.poker_cash_sessions;
create policy "Users can update own poker cash sessions"
on public.poker_cash_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own poker cash sessions" on public.poker_cash_sessions;
create policy "Users can delete own poker cash sessions"
on public.poker_cash_sessions
for delete
using (auth.uid() = user_id);
