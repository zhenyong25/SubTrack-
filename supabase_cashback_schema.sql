-- Cashback credit card support for SubTrack.
-- Run this in the Supabase SQL editor (after supabase_payment_cards_schema.sql and supabase_expenses_schema.sql).
--
-- Model (mirrors how the RHB Shell Visa sheet is laid out):
--   payment_cards.reward_type / statement_day   which cards earn cashback + the user's statement day
--   cashback_programs                            one rule set per card per period (criteria change yearly)
--   cashback_categories                          the spend buckets: min spend + monthly cap (+ optional shared cap)
--   cashback_tiers                               total-monthly-spend bands that unlock higher rates
--   cashback_tier_rates                          rate (%) per tier per category
--   expenses.cashback_category_id                the bucket a transaction is tagged under
--
-- A rule set applies to a statement cycle when the cycle's statement (end) date falls between
-- effective_from and effective_to (effective_to null = still current).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- payment_cards: reward type + statement day
-- ---------------------------------------------------------------------------
alter table public.payment_cards
  add column if not exists reward_type text not null default 'Miles',
  add column if not exists statement_day smallint;

alter table public.payment_cards
  drop constraint if exists payment_cards_reward_type_check;

alter table public.payment_cards
  add constraint payment_cards_reward_type_check
  check (reward_type in ('Miles', 'Cashback'));

alter table public.payment_cards
  drop constraint if exists payment_cards_statement_day_check;

alter table public.payment_cards
  add constraint payment_cards_statement_day_check
  check (statement_day is null or (statement_day >= 1 and statement_day <= 31));

-- ---------------------------------------------------------------------------
-- cashback_programs: one rule set per card per period
-- ---------------------------------------------------------------------------
create table if not exists public.cashback_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.payment_cards(id) on delete cascade,
  name text not null,
  currency text not null default 'MYR',
  effective_from date not null,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashback_programs_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists cashback_programs_user_id_idx on public.cashback_programs (user_id);
create index if not exists cashback_programs_card_effective_idx on public.cashback_programs (card_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- cashback_categories: spend buckets with a minimum spend and a monthly cap
--   monthly_cap null            -> unlimited
--   cap_group + group_monthly_cap -> several categories share one combined cap
--                                    (the old RHB sheet: RM50 across groceries/online/e-wallet/utilities)
--   is_default                  -> where untagged transactions on this card fall (e.g. "Other Spending")
-- ---------------------------------------------------------------------------
create table if not exists public.cashback_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.cashback_programs(id) on delete cascade,
  name text not null,
  min_spend numeric not null default 0 check (min_spend >= 0),
  monthly_cap numeric check (monthly_cap is null or monthly_cap >= 0),
  cap_group text,
  group_monthly_cap numeric check (group_monthly_cap is null or group_monthly_cap >= 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashback_categories_program_name_key unique (program_id, name)
);

create index if not exists cashback_categories_user_id_idx on public.cashback_categories (user_id);
create index if not exists cashback_categories_program_idx on public.cashback_categories (program_id, sort_order);
create unique index if not exists cashback_categories_one_default_idx
  on public.cashback_categories (program_id) where is_default;

-- ---------------------------------------------------------------------------
-- cashback_tiers: total monthly spend bands (max null = no upper bound)
-- ---------------------------------------------------------------------------
create table if not exists public.cashback_tiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.cashback_programs(id) on delete cascade,
  tier_no integer not null check (tier_no >= 1),
  min_total_spend numeric not null check (min_total_spend >= 0),
  max_total_spend numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashback_tiers_program_tier_key unique (program_id, tier_no),
  constraint cashback_tiers_range_check check (max_total_spend is null or max_total_spend > min_total_spend)
);

create index if not exists cashback_tiers_user_id_idx on public.cashback_tiers (user_id);
create index if not exists cashback_tiers_program_idx on public.cashback_tiers (program_id, min_total_spend);

-- ---------------------------------------------------------------------------
-- cashback_tier_rates: cashback rate (%) for a category at a given tier
-- ---------------------------------------------------------------------------
create table if not exists public.cashback_tier_rates (
  tier_id uuid not null references public.cashback_tiers(id) on delete cascade,
  category_id uuid not null references public.cashback_categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rate_pct numeric not null check (rate_pct >= 0 and rate_pct <= 100),
  primary key (tier_id, category_id)
);

create index if not exists cashback_tier_rates_user_id_idx on public.cashback_tier_rates (user_id);
create index if not exists cashback_tier_rates_category_idx on public.cashback_tier_rates (category_id);

-- ---------------------------------------------------------------------------
-- expenses: tag a transaction with the cashback bucket it counts toward
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists cashback_category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_cashback_category_id_fkey'
  ) then
    alter table public.expenses
      add constraint expenses_cashback_category_id_fkey
      foreign key (cashback_category_id) references public.cashback_categories(id) on delete set null;
  end if;
end $$;

create index if not exists expenses_user_cashback_category_idx
  on public.expenses (user_id, cashback_category_id)
  where cashback_category_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared by programs, categories and tiers)
-- ---------------------------------------------------------------------------
create or replace function public.set_cashback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cashback_programs_updated_at on public.cashback_programs;
create trigger set_cashback_programs_updated_at
before update on public.cashback_programs
for each row
execute function public.set_cashback_updated_at();

drop trigger if exists set_cashback_categories_updated_at on public.cashback_categories;
create trigger set_cashback_categories_updated_at
before update on public.cashback_categories
for each row
execute function public.set_cashback_updated_at();

drop trigger if exists set_cashback_tiers_updated_at on public.cashback_tiers;
create trigger set_cashback_tiers_updated_at
before update on public.cashback_tiers
for each row
execute function public.set_cashback_updated_at();

-- ---------------------------------------------------------------------------
-- Permissions + row level security (each user only sees / edits their own rows).
-- Child rows must also point at a parent the same user owns.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cashback_programs to authenticated;
grant select, insert, update, delete on public.cashback_categories to authenticated;
grant select, insert, update, delete on public.cashback_tiers to authenticated;
grant select, insert, update, delete on public.cashback_tier_rates to authenticated;

alter table public.cashback_programs enable row level security;
alter table public.cashback_categories enable row level security;
alter table public.cashback_tiers enable row level security;
alter table public.cashback_tier_rates enable row level security;

-- cashback_programs
drop policy if exists "Users can read own cashback programs" on public.cashback_programs;
create policy "Users can read own cashback programs"
on public.cashback_programs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cashback programs" on public.cashback_programs;
create policy "Users can insert own cashback programs"
on public.cashback_programs
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.payment_cards c where c.id = card_id and c.user_id = auth.uid())
);

drop policy if exists "Users can update own cashback programs" on public.cashback_programs;
create policy "Users can update own cashback programs"
on public.cashback_programs
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.payment_cards c where c.id = card_id and c.user_id = auth.uid())
);

drop policy if exists "Users can delete own cashback programs" on public.cashback_programs;
create policy "Users can delete own cashback programs"
on public.cashback_programs
for delete
using (auth.uid() = user_id);

-- cashback_categories
drop policy if exists "Users can read own cashback categories" on public.cashback_categories;
create policy "Users can read own cashback categories"
on public.cashback_categories
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cashback categories" on public.cashback_categories;
create policy "Users can insert own cashback categories"
on public.cashback_categories
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_programs p where p.id = program_id and p.user_id = auth.uid())
);

drop policy if exists "Users can update own cashback categories" on public.cashback_categories;
create policy "Users can update own cashback categories"
on public.cashback_categories
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_programs p where p.id = program_id and p.user_id = auth.uid())
);

drop policy if exists "Users can delete own cashback categories" on public.cashback_categories;
create policy "Users can delete own cashback categories"
on public.cashback_categories
for delete
using (auth.uid() = user_id);

-- cashback_tiers
drop policy if exists "Users can read own cashback tiers" on public.cashback_tiers;
create policy "Users can read own cashback tiers"
on public.cashback_tiers
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cashback tiers" on public.cashback_tiers;
create policy "Users can insert own cashback tiers"
on public.cashback_tiers
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_programs p where p.id = program_id and p.user_id = auth.uid())
);

drop policy if exists "Users can update own cashback tiers" on public.cashback_tiers;
create policy "Users can update own cashback tiers"
on public.cashback_tiers
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_programs p where p.id = program_id and p.user_id = auth.uid())
);

drop policy if exists "Users can delete own cashback tiers" on public.cashback_tiers;
create policy "Users can delete own cashback tiers"
on public.cashback_tiers
for delete
using (auth.uid() = user_id);

-- cashback_tier_rates
drop policy if exists "Users can read own cashback tier rates" on public.cashback_tier_rates;
create policy "Users can read own cashback tier rates"
on public.cashback_tier_rates
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cashback tier rates" on public.cashback_tier_rates;
create policy "Users can insert own cashback tier rates"
on public.cashback_tier_rates
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_tiers t where t.id = tier_id and t.user_id = auth.uid())
  and exists (select 1 from public.cashback_categories c where c.id = category_id and c.user_id = auth.uid())
);

drop policy if exists "Users can update own cashback tier rates" on public.cashback_tier_rates;
create policy "Users can update own cashback tier rates"
on public.cashback_tier_rates
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.cashback_tiers t where t.id = tier_id and t.user_id = auth.uid())
  and exists (select 1 from public.cashback_categories c where c.id = category_id and c.user_id = auth.uid())
);

drop policy if exists "Users can delete own cashback tier rates" on public.cashback_tier_rates;
create policy "Users can delete own cashback tier rates"
on public.cashback_tier_rates
for delete
using (auth.uid() = user_id);
