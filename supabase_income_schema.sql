-- Income tracking schema for SubTrack
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.income_kind as enum ('Active', 'Passive');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.income_cycle_type as enum ('Daily', 'Weekly', 'Monthly', 'Yearly');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  currency varchar not null default 'SGD',
  income_type public.income_kind not null default 'Active',
  income_mode text not null default 'Recurring' check (income_mode in ('Recurring', 'One-time')),
  income_cycle public.income_cycle_type,
  income_date date,
  first_income_date date not null,
  next_income_date date not null,
  cancellation_date date,
  category text not null default 'Salary',
  color text not null default '#16a34a',
  notes text,
  status text not null default 'Active' check (status in ('Active', 'Past')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.incomes
  add column if not exists income_mode text;
alter table if exists public.incomes
  add column if not exists income_cycle public.income_cycle_type;
alter table if exists public.incomes
  add column if not exists income_date date;

update public.incomes
set income_mode = coalesce(income_mode, 'Recurring');

alter table public.incomes
  alter column income_mode set default 'Recurring';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'incomes_income_mode_check'
  ) then
    alter table public.incomes
      add constraint incomes_income_mode_check
      check (income_mode in ('Recurring', 'One-time'));
  end if;
end $$;

alter table public.incomes
  alter column income_cycle drop not null;

create index if not exists incomes_user_id_idx on public.incomes (user_id);
create index if not exists incomes_user_status_idx on public.incomes (user_id, status);
create index if not exists incomes_user_category_idx on public.incomes (user_id, category);
create index if not exists incomes_user_income_mode_idx on public.incomes (user_id, income_mode);

create or replace function public.set_incomes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_incomes_updated_at on public.incomes;
create trigger set_incomes_updated_at
before update on public.incomes
for each row
execute function public.set_incomes_updated_at();

alter table public.incomes enable row level security;

drop policy if exists "Users can read own incomes" on public.incomes;
create policy "Users can read own incomes"
on public.incomes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own incomes" on public.incomes;
create policy "Users can insert own incomes"
on public.incomes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own incomes" on public.incomes;
create policy "Users can update own incomes"
on public.incomes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own incomes" on public.incomes;
create policy "Users can delete own incomes"
on public.incomes
for delete
using (auth.uid() = user_id);
