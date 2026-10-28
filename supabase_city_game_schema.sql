-- My City (the Finance World city builder) - saves each player's city so it follows them
-- between devices. Run this in the Supabase SQL editor. Safe to rerun, including after an
-- earlier version of this file (it updates the save-format check for the 100×100 map).
-- Until it's run, the city is saved on each device only.

create table if not exists public.city_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.city_saves drop constraint if exists city_saves_state_check;
alter table public.city_saves add constraint city_saves_state_check
  check (jsonb_typeof(state) = 'object' and (state ->> 'version') in ('1', '2'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.city_saves to authenticated;

alter table public.city_saves enable row level security;

drop policy if exists "Own city save" on public.city_saves;
create policy "Own city save" on public.city_saves for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
