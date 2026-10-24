-- Global search runs over the user's loaded data. Tags are stored with each record.
-- Run in the Supabase SQL editor. Safe to rerun; existing data and RLS policies are preserved.
begin;
alter table public.expenses add column if not exists tags text[] not null default '{}';
alter table public.subscriptions add column if not exists tags text[] not null default '{}';
alter table public.investment_transactions add column if not exists tags text[] not null default '{}';
comment on column public.expenses.tags is 'User-defined tags for global search';
comment on column public.subscriptions.tags is 'User-defined tags for global search';
comment on column public.investment_transactions.tags is 'User-defined tags for global search';
notify pgrst, 'reload schema';
commit;
