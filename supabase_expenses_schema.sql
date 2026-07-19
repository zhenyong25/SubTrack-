-- Expense tracking schema for SubTrack
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  currency varchar not null default 'SGD',
  expense_date date not null default current_date,
  category text not null default 'General',
  color text not null default '#ef4444',
  notes text,
  linked_card_id uuid references public.payment_cards(id) on delete set null,
  linked_card_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.expenses
  add column if not exists expense_date date;
alter table if exists public.expenses
  add column if not exists linked_card_id uuid;
alter table if exists public.expenses
  add column if not exists linked_card_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_linked_card_id_fkey'
  ) then
    alter table public.expenses
      add constraint expenses_linked_card_id_fkey
      foreign key (linked_card_id) references public.payment_cards(id) on delete set null;
  end if;
end $$;

alter table public.expenses
  drop column if exists linked_subscription_id,
  drop column if exists linked_subscription_name,
  drop column if exists first_expense_date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'first_expense_date'
  ) then
    execute '
      update public.expenses
      set expense_date = coalesce(expense_date, first_expense_date, created_at::date)
      where expense_date is null
    ';
  end if;
end $$;

update public.expenses
set expense_date = coalesce(expense_date, created_at::date)
where expense_date is null;

alter table public.expenses
  alter column expense_date set not null;

create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category);
create index if not exists expenses_user_linked_card_idx on public.expenses (user_id, linked_card_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

create or replace function public.set_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_expenses_updated_at();

alter table public.expenses enable row level security;

drop policy if exists "Users can read own expenses" on public.expenses;
create policy "Users can read own expenses"
on public.expenses
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own expenses" on public.expenses;
create policy "Users can insert own expenses"
on public.expenses
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own expenses" on public.expenses;
create policy "Users can update own expenses"
on public.expenses
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own expenses" on public.expenses;
create policy "Users can delete own expenses"
on public.expenses
for delete
using (auth.uid() = user_id);
