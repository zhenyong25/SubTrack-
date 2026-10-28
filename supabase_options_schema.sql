-- Run in the Supabase SQL editor to enable cloud sync for Trade > Options.
create table if not exists public.option_trades (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists option_trades_user_idx on public.option_trades(user_id);
alter table public.option_trades enable row level security;
grant select, insert, update, delete on public.option_trades to authenticated;
drop policy if exists "Users manage own option trades" on public.option_trades;
create policy "Users manage own option trades" on public.option_trades for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
