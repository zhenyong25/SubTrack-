Trade > Options supports manually entered buy-to-open calls and puts, an expiration payoff chart, and a separate options journal. Enter the underlying ticker, contract type, strike, entry date, expiry, premium per share, contracts, contract multiplier, currency and total entry/exit fees. The multiplier defaults to 100 but can be changed for the actual contract specification.

Cost and maximum option loss are premium × contracts × multiplier + fees. Break-even includes fees per underlying share. Realized P/L uses (exit premium − entry premium) × contracts × multiplier − fees. Closing a trade requires an exit date and premium; use zero premium for worthless expiration. Expired trades remain open until reviewed. Exercise-created stock positions are outside this calculator.

Prices are manual, not live options quotes. There are no broker orders, short options, spreads, Greeks, automatic exercise or stock-journal totals. The full-premium-risk warning compares the per-trade rule only when currencies match.

Apply `supabase_options_schema.sql` in Supabase to enable the owner-protected `option_trades` table. Signed-in saves go to that table; cloud failures retain the draft and show an error. Signed-out use is saved on the current device. Local cache keys are separated by authenticated user or guest. Guest trades are not automatically uploaded on sign-in.

Run `node scripts/test-options.mjs` to check payoff arithmetic, realized P/L, adjusted multipliers and input validation.

Formula references: https://www.optionseducation.org/strategies/all-strategies/long-call and https://www.optionseducation.org/strategies/all-strategies/long-put .
