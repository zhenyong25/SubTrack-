-- Realized profit/loss tracking for investments (longs and shorts)
-- Run this in the Supabase SQL editor. Safe to re-run.

-- 1) Each transaction stores the profit or loss it locked in (in the transaction's own currency):
--    a Sell on a long, a Buy (cover) on a short, dividends, and a short's fees.
alter table public.investment_transactions
  add column if not exists realized_pnl numeric;

-- 2) The holdings table is the source of truth for units and average cost - the app updates it on
--    every trade. The old view recomputed both from transactions alone (buys minus sells), which
--    ignores the position you opened with and is backwards for shorts, so after a reload a
--    holding could show the wrong units. Same columns in the same order as before.
create or replace view public.investment_portfolio_positions as
with transaction_totals as (
  select
    it.investment_id,
    it.user_id,
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
  i.units,
  i.average_cost,
  coalesce(i.current_price, 0) as current_price,
  i.units * i.average_cost as invested_cost,
  i.units * coalesce(i.current_price, 0) as market_value,
  case when i.position_side = 'Short'
    then (i.average_cost - coalesce(i.current_price, 0)) * i.units
    else (coalesce(i.current_price, 0) - i.average_cost) * i.units
  end as unrealized_pnl,
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

-- CREATE OR REPLACE VIEW resets the view options, so re-apply security_invoker or the view
-- bypasses row-level security and anyone with the public anon key can read every user's holdings.
alter view public.investment_portfolio_positions set (security_invoker = true);
