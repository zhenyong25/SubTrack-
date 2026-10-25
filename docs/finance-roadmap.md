# Finance features

Implement in order, one feature at a time:

1. Cash-flow forecast — implemented on the Net worth page.
2. Safe-to-spend balance — implemented above the forecast on the Net worth page.
3. Statement import and reconciliation — implemented under Expenses, alongside existing card PDF reconciliation.
4. Financial review dashboard — implemented in Net worth → Financial review.
5. Smart reminders — implemented in the header bell, with type filters, snooze/dismiss, and record navigation.
6. Shared expenses and reimbursements — next: balances owed by person and repayments that are not salary.

## Cash-flow forecast

The Net worth page includes 30-, 60-, and 90-day forecasts, projected total cash, money available after savings allocations, a shortfall warning, and a daily breakdown. Additional monthly savings and extra daily spending are temporary scenarios; they never write balances or transactions. Opening cash can be overridden for the scenario.

Opening cash uses each active cash account's latest recorded snapshot on or before today. Investments, retirement funds, archived accounts, and future snapshots are excluded. Snapshot dates and missing data appear in the assumptions section. Opening cash is assumed to reflect today's completed activity; forecast movements start tomorrow. Stale snapshots are not silently rolled forward with historical spending.

The forecast expands active recurring and one-time income, subscriptions, future-dated expenses, and estimated debt repayments. Monthly dates clamp to the last day of short months. Free-trial renewals with an unknown paid schedule are excluded and flagged. Credit card debts include the recorded statement still owed, not unknown future statements. Card purchases use purchase/renewal dates, so this is a commitment estimate rather than a bank settlement forecast. Avoid recording one commitment in multiple sources.

Savings already earmarked reduce available money, not total cash. Dated goals reserve their monthly funding plan on the first of each month, or by their deadline if earlier. Reservations are capped at the remaining target. Overdue targets reserve the remaining money tomorrow. Undated goals have no automatic monthly funding. Future sinking-fund withdrawals and renewed cycles are not assumed without a recorded use. If goals cannot load, available-money estimates are marked incomplete and their chart line is hidden. Users can explicitly exclude goals from a scenario.

The feature reads existing records and requires no additional database migration. Savings integration requires the existing savings-goals schema. Refresh goals after changes made in another window. Currency conversions use the app's existing configured rates. Loan interest is an estimate based on the recorded rate, with unpaid due instalments reserved tomorrow; verify actual lender schedules separately.

Run `npm run test:planning` for deterministic date, cash, allocation, scenario, and debt checks.

## Safe-to-spend balance

The Net worth page shows current spendable cash for the shared 30-, 60-, or 90-day reserve period. It deducts scheduled subscriptions, future expenses, estimated debt repayments, existing earmarked savings, planned goal funding, and an optional cash buffer from selected accounts' recorded cash. Future income never increases this amount. A daily allowance rounds down to the nearest cent; a shortfall shows zero spendable and the amount missing.

Use **Choose cash accounts** to include only accounts available for spending, and **Show reserved commitments** to inspect dates and amounts. Archived accounts and future balance snapshots are excluded. All recorded savings and commitments are reserved against the selected accounts. Since goals are not linked to accounts, selecting a smaller set can produce a conservative result.

This panel uses actual balance snapshots and always includes goals. Opening-cash overrides, additional savings, daily-spending scenarios, and the forecast's goal checkbox do not change its calculation. Account selection and cash buffer are temporary view controls; they do not write balances or transactions. Changing display currency clears the buffer.

If a selected account has no balance, no accounts are selected, or goals cannot be loaded, the spendable headline is unavailable. A recorded zero balance remains a valid balance. Stale snapshots, unknown trial renewals, and debts without schedules are flagged; results with these warnings are explicitly labelled estimates. Commitments begin tomorrow because opening balances are assumed to reflect today's activity. The same forecast assumptions about card timing, exchange rates, and duplicate records apply.

No new database tables or migration are required. `npm run test:planning` includes safe-to-spend calculation, account selection, precision, missing data, and scenario-isolation checks.
