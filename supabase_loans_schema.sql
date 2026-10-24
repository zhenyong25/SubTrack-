-- Debt and loan tracking schema for SubTrack
-- Run this in the Supabase SQL editor.
--
-- loans:          one row per debt (mortgage, car loan, credit card balance, money owed to family...).
--                 The balance isn't stored: the app works it out from the starting point
--                 (principal on start_date, or opening_balance on opening_balance_date) plus payments.
-- loan_payments:  each repayment made towards a loan, plus 'statement' entries that reset what's
--                 owed on a date (a credit card's monthly statement balance).
--
-- Until this is run the app keeps loans on the device only. Safe to run again after updates.

create extension if not exists pgcrypto;

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lender text,
  kind text not null default 'Personal',
  currency varchar not null default 'SGD',
  principal numeric not null check (principal >= 0),
  annual_rate numeric not null default 0 check (annual_rate >= 0),
  interest_method text not null default 'Reducing' check (interest_method in ('Reducing', 'Flat')),
  term_months integer check (term_months is null or term_months > 0),
  start_date date not null default current_date,
  instalment numeric check (instalment is null or instalment >= 0),
  payment_day smallint check (payment_day is null or payment_day between 1 and 31),
  opening_balance numeric check (opening_balance is null or opening_balance >= 0),
  opening_balance_date date,
  color varchar not null default '#ef4444',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Statement entries (added after the first version of this file, hence the alters). A payment
-- must be more than zero; a statement can be zero (nothing spent that month).
alter table public.loan_payments add column if not exists entry_type text not null default 'payment';
alter table public.loan_payments drop constraint if exists loan_payments_entry_type_check;
alter table public.loan_payments add constraint loan_payments_entry_type_check check (entry_type in ('payment', 'statement'));
alter table public.loan_payments drop constraint if exists loan_payments_amount_check;
alter table public.loan_payments add constraint loan_payments_amount_check check (amount > 0 or (entry_type = 'statement' and amount >= 0));

-- Credit card debts can be linked to the card in the Cards tab. Deleting the card just unlinks it.
alter table public.loans add column if not exists card_id uuid references public.payment_cards(id) on delete set null;

create index if not exists loans_user_id_idx on public.loans (user_id);
create index if not exists loan_payments_user_id_idx on public.loan_payments (user_id);
create index if not exists loan_payments_loan_date_idx on public.loan_payments (loan_id, payment_date);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.loans to authenticated;
grant select, insert, update, delete on public.loan_payments to authenticated;

create or replace function public.set_loans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_loans_updated_at on public.loans;
create trigger set_loans_updated_at
before update on public.loans
for each row
execute function public.set_loans_updated_at();

alter table public.loans enable row level security;

drop policy if exists "Users can read own loans" on public.loans;
create policy "Users can read own loans"
on public.loans
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own loans" on public.loans;
create policy "Users can insert own loans"
on public.loans
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own loans" on public.loans;
create policy "Users can update own loans"
on public.loans
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own loans" on public.loans;
create policy "Users can delete own loans"
on public.loans
for delete
using (auth.uid() = user_id);

alter table public.loan_payments enable row level security;

drop policy if exists "Users can read own loan payments" on public.loan_payments;
create policy "Users can read own loan payments"
on public.loan_payments
for select
using (auth.uid() = user_id);

-- A payment can only be attached to a loan the same user owns.
drop policy if exists "Users can insert own loan payments" on public.loan_payments;
create policy "Users can insert own loan payments"
on public.loan_payments
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid())
);

drop policy if exists "Users can update own loan payments" on public.loan_payments;
create policy "Users can update own loan payments"
on public.loan_payments
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid())
);

drop policy if exists "Users can delete own loan payments" on public.loan_payments;
create policy "Users can delete own loan payments"
on public.loan_payments
for delete
using (auth.uid() = user_id);
