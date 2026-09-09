-- Multi-user RLS hardening for SubTrack
-- Run this in the Supabase SQL editor BEFORE inviting a second account.
-- Safe to re-run: policies are dropped and recreated, alters are idempotent.

-- profiles (keyed by auth user id directly, no user_id column)
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- subscriptions
alter table public.subscriptions enable row level security;

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own subscriptions" on public.subscriptions;
create policy "Users can insert own subscriptions"
on public.subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own subscriptions" on public.subscriptions;
create policy "Users can update own subscriptions"
on public.subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own subscriptions" on public.subscriptions;
create policy "Users can delete own subscriptions"
on public.subscriptions
for delete
using (auth.uid() = user_id);

-- friendships
alter table public.friendships enable row level security;

drop policy if exists "Users can read own friendships" on public.friendships;
create policy "Users can read own friendships"
on public.friendships
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own friendships" on public.friendships;
create policy "Users can insert own friendships"
on public.friendships
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own friendships" on public.friendships;
create policy "Users can update own friendships"
on public.friendships
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships"
on public.friendships
for delete
using (auth.uid() = user_id);

-- card_point_transactions
alter table public.card_point_transactions enable row level security;

drop policy if exists "Users can read own card point transactions" on public.card_point_transactions;
create policy "Users can read own card point transactions"
on public.card_point_transactions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own card point transactions" on public.card_point_transactions;
create policy "Users can insert own card point transactions"
on public.card_point_transactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own card point transactions" on public.card_point_transactions;
create policy "Users can update own card point transactions"
on public.card_point_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own card point transactions" on public.card_point_transactions;
create policy "Users can delete own card point transactions"
on public.card_point_transactions
for delete
using (auth.uid() = user_id);

-- Views built on top of RLS-protected tables run as the view owner by
-- default (typically a superuser role), which bypasses the underlying
-- policies entirely. security_invoker makes them enforce RLS as the
-- querying user instead. Requires Postgres 15+ (Supabase default).
alter view public.investment_portfolio_current set (security_invoker = true);
alter view public.investment_portfolio_positions set (security_invoker = true);
alter view public.poker_mtt_tournament_results set (security_invoker = true);
alter view public.poker_mtt_portfolio_ledger set (security_invoker = true);
alter view public.poker_mtt_portfolio_current set (security_invoker = true);
