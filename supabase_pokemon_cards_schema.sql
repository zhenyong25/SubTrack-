-- Run in the Supabase SQL editor to enable account sync for the card tracker.
create table if not exists public.pokemon_card_watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.pokemon_card_watchlists enable row level security;
revoke all on public.pokemon_card_watchlists from anon;
grant select, insert, update, delete on public.pokemon_card_watchlists to authenticated;
drop policy if exists pokemon_watchlist_owner on public.pokemon_card_watchlists;
create policy pokemon_watchlist_owner on public.pokemon_card_watchlists
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
