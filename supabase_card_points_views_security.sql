-- Fix Security Advisor's SECURITY DEFINER warnings for the points summary views.
-- Run in the Supabase SQL Editor. Requires PostgreSQL 15 or newer.
-- Preserves the existing view definitions and card-points records.
begin;

do $$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'security_invoker views require PostgreSQL 15+. Upgrade before applying this migration.';
  end if;
end $$;

alter view public.card_points_monthly set (security_invoker = true);
alter view public.card_points_yearly set (security_invoker = true);

commit;

-- Both rows should include security_invoker=true.
select n.nspname as schema_name, c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('card_points_monthly', 'card_points_yearly')
  and c.relkind = 'v';

-- Inspect definitions and the base tables' RLS/policies separately if needed.
-- Invoker views enforce the caller's underlying-table permissions and RLS;
-- they do not add missing RLS policies or protect an underlying definer view.
