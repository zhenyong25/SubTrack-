-- Cached line items parsed from an uploaded bank/card statement, used to
-- reconcile the statement against recorded expenses.
-- Run this in the Supabase SQL editor (after supabase_account_statements_schema.sql).

create extension if not exists pgcrypto;

do $$
begin
  create type public.statement_transaction_direction as enum ('debit', 'credit');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.account_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid not null references public.account_statements(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  amount numeric not null,
  currency text not null,
  direction public.statement_transaction_direction not null,
  matched_expense_id uuid references public.expenses(id) on delete set null,
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-running this file on a database that already has the table (before `dismissed`
-- existed) picks up the new column without touching anything else.
alter table public.account_statement_transactions add column if not exists dismissed boolean not null default false;

create index if not exists account_statement_transactions_user_id_idx on public.account_statement_transactions (user_id);
create index if not exists account_statement_transactions_statement_idx on public.account_statement_transactions (statement_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.account_statement_transactions to authenticated;

alter table public.account_statement_transactions enable row level security;

drop policy if exists "Users can read own statement transactions" on public.account_statement_transactions;
create policy "Users can read own statement transactions"
on public.account_statement_transactions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own statement transactions" on public.account_statement_transactions;
create policy "Users can insert own statement transactions"
on public.account_statement_transactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own statement transactions" on public.account_statement_transactions;
create policy "Users can update own statement transactions"
on public.account_statement_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own statement transactions" on public.account_statement_transactions;
create policy "Users can delete own statement transactions"
on public.account_statement_transactions
for delete
using (auth.uid() = user_id);
