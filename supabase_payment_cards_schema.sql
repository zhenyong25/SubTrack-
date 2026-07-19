-- Payment card schema upgrade for SubTrack
-- Run this in the Supabase SQL editor after the income migration.

do $$
begin
  create type public.payment_card_kind as enum ('Credit', 'Debit', 'MultiCurrency');
exception
  when duplicate_object then null;
end $$;

alter table public.payment_cards
  add column if not exists kind public.payment_card_kind,
  add column if not exists credit_limit numeric,
  add column if not exists current_debt numeric,
  add column if not exists current_balance numeric;

-- Keep legacy budget in sync for now so older code/data still works.
update public.payment_cards
set
  kind = coalesce(
    kind,
    case
      when budget is not null then 'Credit'::public.payment_card_kind
      else 'Debit'::public.payment_card_kind
    end
  ),
  credit_limit = coalesce(credit_limit, budget),
  current_debt = coalesce(current_debt, 0),
  current_balance = coalesce(current_balance, 0)
where kind is null
   or credit_limit is null
   or current_debt is null
   or current_balance is null;

alter table public.payment_cards
  alter column kind set default 'Credit',
  alter column kind set not null;

create index if not exists payment_cards_user_id_idx on public.payment_cards (user_id);
create index if not exists payment_cards_user_kind_idx on public.payment_cards (user_id, kind);

alter table public.payment_cards enable row level security;

drop policy if exists "Users can read own cards" on public.payment_cards;
create policy "Users can read own cards"
on public.payment_cards
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cards" on public.payment_cards;
create policy "Users can insert own cards"
on public.payment_cards
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own cards" on public.payment_cards;
create policy "Users can update own cards"
on public.payment_cards
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cards" on public.payment_cards;
create policy "Users can delete own cards"
on public.payment_cards
for delete
using (auth.uid() = user_id);
