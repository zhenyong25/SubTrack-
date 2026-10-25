# Poker dashboard layout and filters

Open **Investments → Poker**. Overview, Tournaments, Cash games, and Bankroll share a date-range selection. The title's bankroll stays an all-time total, while result statistics follow the selected range.

At desktop widths of 1024px and above, analytics and logs occupy two equal columns. Long logs scroll inside their column. Smaller screens stack the same panels vertically, with tables scrolling horizontally when needed. Additional statistics and period breakdowns are expandable to keep the initial view compact.

## Tournament and cash results

Tournament filters include search, winning/losing/break-even results, ITM/no end reward, bounty/regular format, buy-in bands, and sorting. Buy-in bands use the cost per entry, including re-entries. Cash-game filters include search, result, game, venue, and sorting. Search matches all entered words across names, dates, and notes (and venue/game for cash sessions).

These filters update the selected view's log, statistics, and results chart together. Switching back to Overview uses all results in the selected date range rather than retaining tournament/cash-specific restrictions. Reset filters clears the selected view's search and selectors but preserves the date range. Existing logging, editing, and deletion controls remain available.

Results charts toggle between cumulative profit and weekly/monthly/yearly period bars. Profit is after buy-ins. Bounties count as winnings/profit; only an end reward counts as ITM, so a cashing tournament can still be a losing result. Period charts show the most recent 24 active periods in the selection; cumulative charts use every selected result. A single day's results can appear as a point instead of requiring multiple days.

## Bankroll

Bankroll charts toggle between a dated balance and cash-flow bars. Cash flows distinguish deposits, withdrawals, and results (including adjustments). Period grouping and an expandable table are available. Flow charts show the latest 12 active periods in the date range.

The opening balance includes all logged activity before the selected range. Closing balance includes that opening balance plus deposits, minus withdrawals, plus tournament/cash results and adjustments in the range. Changing the range never resets the balance to zero. The balance uses recorded ledger movements and ignores future-dated activity. Flat segments between entries mean no further logged movement, not market-price history.

Bankroll search, transaction type, and sort narrow the transaction log only. They do not remove movements from balance calculations, statistics, or charts. Original deposit currencies remain available alongside the USD credited amounts. This layout/filter update uses existing poker records and does not require additional schema changes.

Run `npm run test:poker` to check statistics, filters, sorting, and balance continuity. Browser checks cover all three detailed views at 320, 390, 1024, 1440, and 1920px, plus chart toggles, filters, and retained edit controls.
