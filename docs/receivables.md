# Money owed to me

Debts now has three views: **I owe**, **Owed to me**, and **All**. Personal loans and credit cards keep their existing calculations. Receivables use separate tables so they never enter debt-payment projections or outgoing-payment reminders.

Add a borrower, description, amount/currency and date lent. A final due date, contact, notes, fixed agreed total interest and instalment reference amount are optional. Interest is an agreed total, not a rate, and never accrues automatically. Instalments are informational; due-soon and overdue status use the final due date.

Log partial repayments with separate principal and interest amounts. A write-off reduces collectible money and stays in history with a required reason; it is excluded from collected totals. Entries can be removed after confirmation to correct mistakes, restoring the outstanding balance. Currency and lent date cannot change once entries exist, and totals cannot be reduced below repayments/write-offs already recorded.

Summary tiles show outstanding, collected this month, overdue and due within seven days in the profile currency, using the app's conversion rates. Borrower cards group names after trimming and case normalization. Search and status filters only affect the record list. Closed records remain under Closed / settled or All records.

## Setup and persistence

For Supabase-backed accounts, run **supabase_receivables_schema.sql** in the same project as the app, then retry loading Owed to me. It creates owner-protected receivables and entry tables; existing loans are not migrated or changed. Parent-locking triggers reject simultaneous overcollection and edits that contradict history. Database date validation uses Asia/Kuala_Lumpur, matching the current app owner. Cloud schema execution requires the project owner's access and is not performed by the frontend.

Without Supabase configuration, records persist in localStorage at `subtrack_receivables_v1`. Failed saves keep the form and its values visible. Clear app data removes the local records and cloud records (entries cascade).

This first version does not automatically update cash accounts, income, Net worth or reminders. Returning lent principal is not new income. Record any corresponding cash-account balance separately; do not count it twice. Automated reminders and receivable asset integration can be added separately.

My World is hidden from navigation, with its implementation and saved progress preserved.

Validation: `npm run test:receivables`, existing loan regression tests, TypeScript, build, and browser checks with synthetic local data. Supabase triggers require execution in the configured Supabase project before cloud use.
