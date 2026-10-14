-- Brokerage / margin accounts for investments
-- Run this in the Supabase SQL editor AFTER supabase_investment_realized_pnl.sql. Safe to re-run.
--
-- Each holding can be tagged to one account (e.g. "IBKR Margin", "Moomoo Cash"). The same ticker
-- held in two accounts is two separate holdings, so each account keeps its own units and cost.

create extension if not exists pgcrypto;

create table if not exists public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  account_type text not null default 'Margin' check (account_type in ('Cash', 'Margin')),
  currency varchar not null default 'USD',
  color text not null default '#06b6d4',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_accounts_user_id_idx on public.investment_accounts (user_id);

grant select, insert, update, delete on public.investment_accounts to authenticated;

create or replace function public.set_investment_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_investment_accounts_updated_at on public.investment_accounts;
create trigger set_investment_accounts_updated_at
before update on public.investment_accounts
for each row
execute function public.set_investment_accounts_updated_at();

alter table public.investment_accounts enable row level security;

drop policy if exists "Users can read own investment accounts" on public.investment_accounts;
create policy "Users can read own investment accounts"
on public.investment_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own investment accounts" on public.investment_accounts;
create policy "Users can insert own investment accounts"
on public.investment_accounts
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own investment accounts" on public.investment_accounts;
create policy "Users can update own investment accounts"
on public.investment_accounts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own investment accounts" on public.investment_accounts;
create policy "Users can delete own investment accounts"
on public.investment_accounts
for delete
using (auth.uid() = user_id);

-- Deleting an account keeps its holdings - they just become unassigned.
alter table public.investments
  add column if not exists account_id uuid references public.investment_accounts(id) on delete set null;

create index if not exists investments_account_id_idx on public.investments (account_id);

-- investment_portfolio_positions (what the app reads) has an explicit column list, so account_id
-- has to be added here too or it never reaches the client. Same definition as
-- supabase_investment_realized_pnl.sql with account_id appended at the end - `create or replace
-- view` can add columns that way but not reorder them.
create or replace view public.investment_portfolio_positions as
with transaction_totals as (
  select
    it.investment_id,
    it.user_id,
    max(it.trade_date) as last_trade_date
  from public.investment_transactions it
  group by it.investment_id, it.user_id
)
select
  i.id,
  i.user_id,
  i.name,
  i.kind,
  i.symbol,
  i.units,
  i.average_cost,
  coalesce(i.current_price, 0) as current_price,
  i.units * i.average_cost as invested_cost,
  i.units * coalesce(i.current_price, 0) as market_value,
  case when i.position_side = 'Short'
    then (i.average_cost - coalesce(i.current_price, 0)) * i.units
    else (coalesce(i.current_price, 0) - i.average_cost) * i.units
  end as unrealized_pnl,
  i.currency,
  i.color,
  i.notes,
  i.acquired_date,
  i.source,
  i.is_active,
  i.created_at,
  i.updated_at,
  tt.last_trade_date,
  i.position_side,
  i.account_id
from public.investments i
left join transaction_totals tt
  on tt.investment_id = i.id
 and tt.user_id = i.user_id;

-- CREATE OR REPLACE VIEW resets the view options, so re-apply security_invoker or the view
-- bypasses row-level security and anyone with the public anon key can read every user's holdings.
alter view public.investment_portfolio_positions set (security_invoker = true);
