# Financial review

Open **Net worth → Financial review**. The existing **Overview & forecast** view remains available. Review data is computed from existing records; no database migration, API key, or background write is required.

Choose a month and display currency. The current month stops at today and compares spending with the same elapsed portion of the previous month, capped at its last day. Earlier months compare complete calendar months. Future months are blocked. The dashboard includes:

- Income estimate, spending, estimated savings rate, and surplus.
- Debt-balance reduction and net-worth movement from the day before the month to the review endpoint.
- Up to six months of income/spending and recorded net worth.
- Category comparisons, opening/closing balance coverage, and missing/stale-data notices.

## Income, spending, and savings

Income combines dated one-time income records and occurrences of recurring income schedules. The two portions are displayed separately. Scheduled receipts are estimates, not verified bank deposits. Scheduling uses the first date, cycle, current amount, and cancellation date; it does not reuse the next due date as historical proof of receipt. Past recurring entries without an end date are excluded and flagged.

Spending combines dated expenses and subscription occurrences. Annual bills count on their scheduled charge date rather than being divided over twelve months. Monthly schedules clamp to short months without permanently changing the original day. Historical subscriptions are included through their cancellation date. Free-trial renewals with no known paid schedule are excluded and flagged. Earlier price and salary changes cannot be reconstructed from the current rate.

Estimated savings rate is `(income − spending) / income`. It is unavailable without positive income and may be negative when spending exceeds income. Surplus is income less spending. Neither metric proves that money was saved in a bank account. Savings-goal allocations, investments, transfers, and debt repayments are not automatically counted as expenses. Repayments separately logged as expenses already count in spending. Avoid recording a subscription charge twice as a subscription and expense.

## Balances and comparability

Historical cash uses the latest recorded account balance on or before the endpoint. Investments use recorded valuation `marketValue` and its currency; today's prices are never backfilled. Retirement funds use the latest recorded balance for each sub-account. Entries dated after the endpoint are ignored. Older known snapshots carry forward, with their dates visible in balance coverage and notices explaining the limitation.

The tracked universe is the currently unarchived cash accounts, retirement funds, and loans, plus active non-poker investments. Archived or closed sources are not reconstructed because their closing dates are unavailable. Newly tracked assets with no opening snapshot do not imply a zero prior balance: they block net-worth comparisons until comparable history exists.

Liabilities use the loan service's recorded statement/opening balances and logged payments through the endpoint. Future statements and payments cannot change earlier balances. Opening balances dated after the comparison point block inferred debt reductions unless an earlier dated statement exists. New borrowing increases debt rather than being mistaken for a repayment. Flat balances include fixed remaining interest; unlogged accrued interest is not added.

Credit cards linked to a tracked loan count through that loan once. Unlinked credit-card debt has no date history, so its current balance is usable only at today's endpoint, in the profile currency. Earlier card balances remain unknown. Record dated statements under Debts to establish comparable history.

Known assets minus known liabilities form the endpoint total. Incomplete totals are labelled **Known balances only**. Net-worth change requires complete tracked coverage at both endpoints; incomplete chart points are gaps. Debt reduction also requires debt coverage at both endpoints. A recorded zero is a valid balance; a missing balance is not zero.

All conversions use the app's current configured exchange rates, including historical views. Net-worth movement can include deposits, borrowing, and valuation changes; it is not an investment return. Changes between stale snapshots are recorded differences rather than verified changes within that month.

## Verification

Run `npm run test:review` for period comparisons, schedule boundaries, savings-rate edge cases, category totals, dated snapshots, future-entry exclusion, credit-card deduplication, and missing-history behavior. Browser verification uses isolated sample data and covers month/currency controls, overview switching, missing history, and layouts from 320px through 1920px.
