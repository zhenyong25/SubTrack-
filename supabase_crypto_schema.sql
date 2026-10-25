-- Crypto tracking schema for SubTrack
-- Run this in the Supabase SQL editor.
--
-- crypto_sources: where crypto is held - public wallet addresses (scanned on-chain by the app)
--                 and exchange accounts. Exchange API keys are NOT stored here: they stay in the
--                 browser that added them and are only ever sent to the exchange to read balances.
--
-- Until this is run the app keeps wallets on the device only. Safe to run again.

create extension if not exists pgcrypto;

create table if not exists public.crypto_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('wallet', 'exchange')),
  label text not null,
  address text,
  chains text[],
  exchange text,
  custom_tokens jsonb,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'wallet' and address is not null) or (kind = 'exchange' and exchange is not null))
);

create index if not exists crypto_sources_user_id_idx on public.crypto_sources (user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.crypto_sources to authenticated;

create or replace function public.set_crypto_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_crypto_sources_updated_at on public.crypto_sources;
create trigger set_crypto_sources_updated_at
before update on public.crypto_sources
for each row
execute function public.set_crypto_sources_updated_at();

alter table public.crypto_sources enable row level security;

drop policy if exists "Users can read own crypto sources" on public.crypto_sources;
create policy "Users can read own crypto sources"
on public.crypto_sources
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own crypto sources" on public.crypto_sources;
create policy "Users can insert own crypto sources"
on public.crypto_sources
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own crypto sources" on public.crypto_sources;
create policy "Users can update own crypto sources"
on public.crypto_sources
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own crypto sources" on public.crypto_sources;
create policy "Users can delete own crypto sources"
on public.crypto_sources
for delete
using (auth.uid() = user_id);
