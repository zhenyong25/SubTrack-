-- Investment tracking schema for SubTrack
-- Run this in the Supabase SQL editor.
-- This schema only creates new investment tables and does not modify existing tables.

create extension if not exists pgcrypto;

do $$
begin
  create type public.investment_kind as enum ('Crypto', 'Stocks', 'Pokemon Cards', 'Poker (MTT)', 'Cash', 'Other');
exception
  when duplicate_object then null;
end $$;

alter type public.investment_kind add value if not exists 'Poker (MTT)';

do $$
begin
  create type public.investment_transaction_type as enum ('Buy', 'Sell', 'Dividend', 'Fee', 'Transfer In', 'Transfer Out', 'Split');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.investment_kind not null default 'Other',
  symbol text,
  units numeric not null default 0,
  average_cost numeric not null default 0,
  current_price numeric not null default 0,
  currency varchar not null default 'SGD',
  color text not null default '#3b82f6',
  notes text,
  acquired_date date,
  source text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  valuation_date date not null default current_date,
  price numeric not null default 0,
  market_value numeric not null default 0,
  currency varchar not null default 'SGD',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  transaction_type public.investment_transaction_type not null default 'Buy',
  trade_date date not null default current_date,
  units numeric not null default 0,
  price numeric not null default 0,
  fees numeric not null default 0,
  currency varchar not null default 'SGD',
  notes text,
  source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investments_user_id_idx on public.investments (user_id);
create index if not exists investments_user_kind_idx on public.investments (user_id, kind);
create index if not exists investments_user_active_idx on public.investments (user_id, is_active);
create index if not exists investment_valuations_user_id_idx on public.investment_valuations (user_id);
create index if not exists investment_valuations_investment_id_idx on public.investment_valuations (investment_id);
create index if not exists investment_valuations_user_date_idx on public.investment_valuations (user_id, valuation_date);
create index if not exists investment_transactions_user_id_idx on public.investment_transactions (user_id);
create index if not exists investment_transactions_investment_id_idx on public.investment_transactions (investment_id);
create index if not exists investment_transactions_user_date_idx on public.investment_transactions (user_id, trade_date);

create or replace function public.set_investments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_investments_updated_at on public.investments;
create trigger set_investments_updated_at
before update on public.investments
for each row
execute function public.set_investments_updated_at();

create or replace function public.set_investment_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_investment_transactions_updated_at on public.investment_transactions;
create trigger set_investment_transactions_updated_at
before update on public.investment_transactions
for each row
execute function public.set_investment_transactions_updated_at();

alter table public.investments enable row level security;
alter table public.investment_valuations enable row level security;
alter table public.investment_transactions enable row level security;

drop policy if exists "Users can read own investments" on public.investments;
create policy "Users can read own investments"
on public.investments
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own investments" on public.investments;
create policy "Users can insert own investments"
on public.investments
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own investments" on public.investments;
create policy "Users can update own investments"
on public.investments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own investments" on public.investments;
create policy "Users can delete own investments"
on public.investments
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own investment valuations" on public.investment_valuations;
create policy "Users can read own investment valuations"
on public.investment_valuations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own investment valuations" on public.investment_valuations;
create policy "Users can insert own investment valuations"
on public.investment_valuations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own investment valuations" on public.investment_valuations;
create policy "Users can update own investment valuations"
on public.investment_valuations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own investment valuations" on public.investment_valuations;
create policy "Users can delete own investment valuations"
on public.investment_valuations
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own investment transactions" on public.investment_transactions;
create policy "Users can read own investment transactions"
on public.investment_transactions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own investment transactions" on public.investment_transactions;
create policy "Users can insert own investment transactions"
on public.investment_transactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own investment transactions" on public.investment_transactions;
create policy "Users can update own investment transactions"
on public.investment_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own investment transactions" on public.investment_transactions;
create policy "Users can delete own investment transactions"
on public.investment_transactions
for delete
using (auth.uid() = user_id);

create or replace view public.investment_portfolio_current as
with latest_prices as (
  select distinct on (iv.investment_id)
    iv.investment_id,
    iv.user_id,
    iv.valuation_date,
    iv.price,
    iv.market_value,
    iv.currency,
    iv.notes
  from public.investment_valuations iv
  order by iv.investment_id, iv.valuation_date desc, iv.created_at desc
)
select
  i.id,
  i.user_id,
  i.name,
  i.kind,
  i.symbol,
  i.units,
  i.average_cost,
  coalesce(lp.price, i.current_price) as current_price,
  coalesce(lp.market_value, i.units * coalesce(lp.price, i.current_price)) as market_value,
  coalesce(lp.currency, i.currency) as currency,
  i.color,
  i.notes,
  i.acquired_date,
  i.source,
  i.is_active,
  i.created_at,
  i.updated_at,
  lp.valuation_date as latest_valuation_date
from public.investments i
left join latest_prices lp
  on lp.investment_id = i.id
  and lp.user_id = i.user_id;

create or replace view public.investment_portfolio_positions as
with transaction_totals as (
  select
    it.investment_id,
    it.user_id,
    sum(case when it.transaction_type = 'Buy' then it.units else 0 end) as buy_units,
    sum(case when it.transaction_type = 'Sell' then it.units else 0 end) as sell_units,
    sum(case when it.transaction_type = 'Buy' then (it.units * it.price) + it.fees else 0 end) as total_buy_cost,
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
  coalesce(tt.buy_units - tt.sell_units, i.units) as units,
  case
    when coalesce(tt.buy_units - tt.sell_units, i.units) > 0 and tt.total_buy_cost is not null
      then tt.total_buy_cost / nullif(tt.buy_units - tt.sell_units, 0)
    else i.average_cost
  end as average_cost,
  coalesce(i.current_price, 0) as current_price,
  coalesce(tt.total_buy_cost, i.units * i.average_cost) as invested_cost,
  coalesce(coalesce(tt.buy_units - tt.sell_units, i.units) * coalesce(i.current_price, 0), 0) as market_value,
  coalesce(coalesce(tt.buy_units - tt.sell_units, i.units) * coalesce(i.current_price, 0), 0) - coalesce(tt.total_buy_cost, i.units * i.average_cost) as unrealized_pnl,
  i.currency,
  i.color,
  i.notes,
  i.acquired_date,
  i.source,
  i.is_active,
  i.created_at,
  i.updated_at,
  tt.last_trade_date
from public.investments i
left join transaction_totals tt
  on tt.investment_id = i.id
 and tt.user_id = i.user_id;

do $$
begin
  create type public.poker_mtt_bankroll_event_type as enum ('Deposit', 'Withdrawal', 'Adjustment');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.poker_mtt_tournaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  tournament_date date not null default current_date,
  tournament_name text not null,
  placement integer,
  entries integer not null default 1,
  buy_in_usd numeric not null default 0,
  cashout_usd numeric not null default 0,
  bounty_usd numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poker_mtt_bankroll_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  event_date date not null default current_date,
  event_type public.poker_mtt_bankroll_event_type not null default 'Deposit',
  amount_usd numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poker_mtt_tournaments_user_id_idx on public.poker_mtt_tournaments (user_id);
create index if not exists poker_mtt_tournaments_investment_id_idx on public.poker_mtt_tournaments (investment_id);
create index if not exists poker_mtt_tournaments_user_date_idx on public.poker_mtt_tournaments (user_id, tournament_date);
create index if not exists poker_mtt_bankroll_transactions_user_id_idx on public.poker_mtt_bankroll_transactions (user_id);
create index if not exists poker_mtt_bankroll_transactions_investment_id_idx on public.poker_mtt_bankroll_transactions (investment_id);
create index if not exists poker_mtt_bankroll_transactions_user_date_idx on public.poker_mtt_bankroll_transactions (user_id, event_date);

create or replace function public.set_poker_mtt_tournaments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_poker_mtt_tournaments_updated_at on public.poker_mtt_tournaments;
create trigger set_poker_mtt_tournaments_updated_at
before update on public.poker_mtt_tournaments
for each row
execute function public.set_poker_mtt_tournaments_updated_at();

create or replace function public.set_poker_mtt_bankroll_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_poker_mtt_bankroll_transactions_updated_at on public.poker_mtt_bankroll_transactions;
create trigger set_poker_mtt_bankroll_transactions_updated_at
before update on public.poker_mtt_bankroll_transactions
for each row
execute function public.set_poker_mtt_bankroll_transactions_updated_at();

alter table public.poker_mtt_tournaments enable row level security;
alter table public.poker_mtt_bankroll_transactions enable row level security;

drop policy if exists "Users can read own poker mtt tournaments" on public.poker_mtt_tournaments;
create policy "Users can read own poker mtt tournaments"
on public.poker_mtt_tournaments
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own poker mtt tournaments" on public.poker_mtt_tournaments;
create policy "Users can insert own poker mtt tournaments"
on public.poker_mtt_tournaments
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own poker mtt tournaments" on public.poker_mtt_tournaments;
create policy "Users can update own poker mtt tournaments"
on public.poker_mtt_tournaments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own poker mtt tournaments" on public.poker_mtt_tournaments;
create policy "Users can delete own poker mtt tournaments"
on public.poker_mtt_tournaments
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own poker mtt bankroll transactions" on public.poker_mtt_bankroll_transactions;
create policy "Users can read own poker mtt bankroll transactions"
on public.poker_mtt_bankroll_transactions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own poker mtt bankroll transactions" on public.poker_mtt_bankroll_transactions;
create policy "Users can insert own poker mtt bankroll transactions"
on public.poker_mtt_bankroll_transactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own poker mtt bankroll transactions" on public.poker_mtt_bankroll_transactions;
create policy "Users can update own poker mtt bankroll transactions"
on public.poker_mtt_bankroll_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own poker mtt bankroll transactions" on public.poker_mtt_bankroll_transactions;
create policy "Users can delete own poker mtt bankroll transactions"
on public.poker_mtt_bankroll_transactions
for delete
using (auth.uid() = user_id);

create or replace view public.poker_mtt_tournament_results as
select
  t.id,
  t.user_id,
  t.investment_id,
  t.tournament_date,
  t.tournament_name,
  t.placement,
  t.entries,
  t.buy_in_usd,
  t.cashout_usd,
  t.bounty_usd,
  t.buy_in_usd as total_cost_usd,
  (t.cashout_usd + t.bounty_usd - t.buy_in_usd) as net_profit_usd,
  t.notes,
  t.created_at,
  t.updated_at
from public.poker_mtt_tournaments t;

create or replace view public.poker_mtt_portfolio_ledger as
with events as (
  select
    t.id,
    t.user_id,
    t.investment_id,
    t.tournament_date as event_date,
    t.created_at,
    'Tournament'::text as event_kind,
    t.tournament_name as title,
    (t.cashout_usd + t.bounty_usd - t.buy_in_usd) as delta_usd,
    t.buy_in_usd as total_cost_usd,
    t.cashout_usd,
    t.bounty_usd,
    t.placement,
    t.entries,
    t.notes
  from public.poker_mtt_tournaments t

  union all

  select
    b.id,
    b.user_id,
    b.investment_id,
    b.event_date,
    b.created_at,
    b.event_type::text as event_kind,
    coalesce(b.notes, b.event_type::text) as title,
    case
      when b.event_type = 'Withdrawal' then -b.amount_usd
      else b.amount_usd
    end as delta_usd,
    0 as total_cost_usd,
    0 as cashout_usd,
    0 as bounty_usd,
    null::integer as placement,
    null::integer as entries,
    b.notes
  from public.poker_mtt_bankroll_transactions b
)
select
  events.*,
  sum(events.delta_usd) over (
    partition by events.investment_id
    order by events.event_date, events.created_at, events.id
    rows between unbounded preceding and current row
  ) as running_balance_usd
from events;

create or replace view public.poker_mtt_portfolio_current as
select distinct on (ledger.investment_id)
  ledger.id,
  ledger.user_id,
  ledger.investment_id,
  ledger.event_date,
  ledger.event_kind,
  ledger.title,
  ledger.delta_usd,
  ledger.running_balance_usd,
  ledger.created_at
from public.poker_mtt_portfolio_ledger ledger
order by ledger.investment_id, ledger.event_date desc, ledger.created_at desc, ledger.id desc;
