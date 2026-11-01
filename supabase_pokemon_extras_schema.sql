-- Run in the Supabase SQL editor to sync the Pokémon Cards tab's extra records (your own events,
-- grading & repair submissions, flagged sellers) to your account. Without it they stay on the device.
create table if not exists public.pokemon_card_extras (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.pokemon_card_extras enable row level security;
revoke all on public.pokemon_card_extras from anon;
grant select, insert, update, delete on public.pokemon_card_extras to authenticated;
drop policy if exists pokemon_extras_owner on public.pokemon_card_extras;
create policy pokemon_extras_owner on public.pokemon_card_extras
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
