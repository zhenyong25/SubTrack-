-- Optional account numbers for existing cash accounts.
-- Run once in the Supabase SQL editor. Existing accounts remain unchanged.
alter table public.cash_accounts
  add column if not exists account_number text;
