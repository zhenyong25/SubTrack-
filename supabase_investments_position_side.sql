-- Add Long/Short position tracking to investments
-- Run this in the Supabase SQL editor.

do $$
begin
  create type public.investment_position_side as enum ('Long', 'Short');
exception
  when duplicate_object then null;
end $$;

alter table public.investments
  add column if not exists position_side public.investment_position_side not null default 'Long';

-- investment_portfolio_positions (what the app actually reads) selects an explicit column
-- list, so the new column has to be added here too or it never reaches the client. Appended
-- at the end - `create or replace view` allows adding columns this way, not reordering them.
create or replace view public.investment_portfolio_positions as
with transaction_totals as (
  select
    it.investment_id,
    it.user_id,
    sum(case when it.transaction_type = 'Buy' then it.units else 0 end) as buy_units,
    sum(case when it.transaction_type = 'Sell' then it.units else 0 end) as sell_units,
    sum(case when it.transaction_type = 'Buy' then (it.units * it.price) + it.fees else 0 end) as total_buy_cost,
    max(it.trade_date) as last_trade_date
  from public.investment_transactions it
  group by it.investment_id, it.user_id
)
select
  i.id,
  i.user_id,
  i.name,
  i.kind,
  i.symbol,
  coalesce(tt.buy_units - tt.sell_units, i.units) as units,
  case
    when coalesce(tt.buy_units - tt.sell_units, i.units) > 0 and tt.total_buy_cost is not null
      then tt.total_buy_cost / nullif(tt.buy_units - tt.sell_units, 0)
    else i.average_cost
  end as average_cost,
  coalesce(i.current_price, 0) as current_price,
  coalesce(tt.total_buy_cost, i.units * i.average_cost) as invested_cost,
  coalesce(coalesce(tt.buy_units - tt.sell_units, i.units) * coalesce(i.current_price, 0), 0) as market_value,
  coalesce(coalesce(tt.buy_units - tt.sell_units, i.units) * coalesce(i.current_price, 0), 0) - coalesce(tt.total_buy_cost, i.units * i.average_cost) as unrealized_pnl,
  i.currency,
  i.color,
  i.notes,
  i.acquired_date,
  i.source,
  i.is_active,
  i.created_at,
  i.updated_at,
  tt.last_trade_date,
  i.position_side
from public.investments i
left join transaction_totals tt
  on tt.investment_id = i.id
 and tt.user_id = i.user_id;

-- CREATE OR REPLACE VIEW resets the view options, which silently undoes the security_invoker
-- setting from supabase_multi_user_rls_hardening.sql and lets anyone with the public anon key read
-- every user's positions. Re-apply it after replacing the view.
alter view public.investment_portfolio_positions set (security_invoker = true);
