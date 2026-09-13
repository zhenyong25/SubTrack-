-- Bank/card statement uploads for SubTrack
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.account_statement_kind as enum ('Cash', 'Card');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.account_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_kind public.account_statement_kind not null,
  cash_account_id uuid references public.cash_accounts(id) on delete cascade,
  card_id uuid references public.payment_cards(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  file_size bigint,
  statement_period text,
  uploaded_at timestamptz not null default now(),
  constraint account_statements_account_ref_check check (
    (account_kind = 'Cash' and cash_account_id is not null and card_id is null)
    or
    (account_kind = 'Card' and card_id is not null and cash_account_id is null)
  )
);

create index if not exists account_statements_user_id_idx on public.account_statements (user_id);
create index if not exists account_statements_cash_account_idx on public.account_statements (cash_account_id);
create index if not exists account_statements_card_idx on public.account_statements (card_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.account_statements to authenticated;

alter table public.account_statements enable row level security;

drop policy if exists "Users can read own statements" on public.account_statements;
create policy "Users can read own statements"
on public.account_statements
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own statements" on public.account_statements;
create policy "Users can insert own statements"
on public.account_statements
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own statements" on public.account_statements;
create policy "Users can update own statements"
on public.account_statements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own statements" on public.account_statements;
create policy "Users can delete own statements"
on public.account_statements
for delete
using (auth.uid() = user_id);

-- Private storage bucket for the actual PDF files.
insert into storage.buckets (id, name, public)
values ('account-statements', 'account-statements', false)
on conflict (id) do nothing;

-- Files are stored at "<user_id>/<accountKind>/<accountId>/<uuid>_<filename>",
-- so the first path segment is always the owner's auth uid.
drop policy if exists "Users can upload own statement files" on storage.objects;
create policy "Users can upload own statement files"
on storage.objects
for insert
with check (
  bucket_id = 'account-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own statement files" on storage.objects;
create policy "Users can read own statement files"
on storage.objects
for select
using (
  bucket_id = 'account-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own statement files" on storage.objects;
create policy "Users can delete own statement files"
on storage.objects
for delete
using (
  bucket_id = 'account-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
);
