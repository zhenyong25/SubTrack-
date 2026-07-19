-- Public reward/benefits catalog for cards.
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.card_benefits (
  id uuid primary key default gen_random_uuid(),
  card_name text not null,
  issuer text,
  category text not null,
  title text not null,
  description text not null,
  earn_rate_mpd numeric,
  krisflyer_transfer_ratio numeric,
  sort_order int not null default 0,
  is_highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.card_benefits
  add column if not exists earn_rate_mpd numeric,
  add column if not exists krisflyer_transfer_ratio numeric;

create index if not exists card_benefits_card_name_idx on public.card_benefits (card_name);
create index if not exists card_benefits_card_name_sort_idx on public.card_benefits (card_name, sort_order);

create or replace function public.set_card_benefits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_card_benefits_updated_at on public.card_benefits;
create trigger set_card_benefits_updated_at
before update on public.card_benefits
for each row
execute function public.set_card_benefits_updated_at();

alter table public.card_benefits enable row level security;

drop policy if exists "Anyone can read card benefits" on public.card_benefits;
create policy "Anyone can read card benefits"
on public.card_benefits
for select
using (true);

-- Starter rows. Replace with the issuer's current official product-page wording if needed.
insert into public.card_benefits (card_name, issuer, category, title, description, earn_rate_mpd, krisflyer_transfer_ratio, sort_order, is_highlighted)
values
  ('UOB PRVI Miles', 'UOB', 'Shopping', 'Retail spend', 'Useful for everyday shopping categories that you want to funnel into miles.', 1.4, 1, 1, true),
  ('UOB PRVI Miles', 'UOB', 'Hotel', 'Hotel bookings', 'Track travel and hotel spend in a dedicated miles-friendly bucket.', 2.4, 1, 2, true),
  ('UOB PRVI Miles', 'UOB', 'Travel', 'Flights and travel', 'Great for trip-related purchases and broader travel expenses.', 2.4, 1, 3, false),
  ('Citibank PremierMiles', 'Citibank', 'Shopping', 'Retail spend', 'A clean category for miles-oriented shopping purchases.', 1.2, 1, 1, true),
  ('Citibank PremierMiles', 'Citibank', 'Hotel', 'Hotel bookings', 'Use this for hotel stays and accommodation spend you want to optimize.', 2.2, 1, 2, true),
  ('Citibank PremierMiles', 'Citibank', 'Travel', 'Flights and travel', 'Handy for flight bookings and travel purchases.', 2.2, 1, 3, false)
on conflict do nothing;
