-- Add card expiry tracking to payment_cards
-- Run this in the Supabase SQL editor.

alter table public.payment_cards
  add column if not exists expiry_month smallint,
  add column if not exists expiry_year smallint;

alter table public.payment_cards
  drop constraint if exists payment_cards_expiry_month_check;

alter table public.payment_cards
  add constraint payment_cards_expiry_month_check
  check (expiry_month is null or (expiry_month >= 1 and expiry_month <= 12));
