-- Notification types, price alerts and a send log for SubTrack push notifications.
-- Run this in the Supabase SQL editor (after supabase_push_subscriptions_schema.sql). Safe to rerun.
--
-- notification_preferences: which notifications a user wants. No row = everything on, which is
--                           what the daily reminder did before this table existed.
-- price_alerts:             one-shot alerts, e.g. "tell me when FUTU gets back to 122.75".
-- notification_log:         what has been sent, so the reminder worker sends each thing once.
--                           Written by the worker with the service role key; users can only read it.

create extension if not exists pgcrypto;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  log_reminder boolean not null default true,
  bills boolean not null default true,
  debts boolean not null default true,
  earnings boolean not null default true,
  price_alerts boolean not null default true,
  lead_days integer not null default 3 check (lead_days between 0 and 14),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-^=]{1,20}$'),
  direction text not null check (direction in ('above', 'below')),
  target numeric not null check (target > 0),
  label text check (label is null or length(label) <= 80),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price numeric
);

create index if not exists price_alerts_user_id_idx on public.price_alerts (user_id);
create index if not exists price_alerts_pending_idx on public.price_alerts (symbol) where triggered_at is null;

create table if not exists public.notification_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.price_alerts to authenticated;
grant select on public.notification_log to authenticated;

alter table public.notification_preferences enable row level security;
alter table public.price_alerts enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "Own notification preferences" on public.notification_preferences;
create policy "Own notification preferences" on public.notification_preferences for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Own price alerts" on public.price_alerts;
create policy "Own price alerts" on public.price_alerts for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Read own notification log" on public.notification_log;
create policy "Read own notification log" on public.notification_log for select to authenticated
using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
