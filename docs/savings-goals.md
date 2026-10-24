# Savings goals and sinking funds

Open **Goals** to create a savings milestone or a recurring sinking fund. Each goal has its own currency, target, optional starting balance, notes, and contribution/withdrawal history.

Savings goals can have an optional deadline. Sinking funds require a due date and repeat every 1, 3, 6, or 12 months. When using a fund, select **Start the next funding cycle** to advance its deadline and retain any unspent money. Overdue cycles advance to the next future date, with month-end dates preserved.

The monthly plan divides the remaining target by the months until its deadline and rounds up to the nearest cent. Undated goals have no monthly recommendation. Summary totals convert goal amounts into the profile currency using the app's existing exchange rates; individual goals retain their original currency.

Contributions earmark money you already own. They do not create income, move bank balances, add expenses, or increase net worth. Record an actual expense separately when spending the money.

Currency and starting balance are fixed after creation; use contributions and withdrawals to adjust the balance. Removing a history entry is blocked if it would leave a negative balance. Removing a withdrawal does not undo an advanced deadline; edit the goal's due date when correcting that cycle.

## Storage setup

Without Supabase configuration, goals and their history persist locally in this browser. Clearing app data also clears goals.

For signed-in cloud storage, run [supabase_savings_goals_schema.sql](../supabase_savings_goals_schema.sql) in the Supabase SQL editor, then reload the app. This migration has been prepared but is not automatically applied. It adds owner-scoped tables, row-level security, and database functions that validate withdrawals and update funding cycles atomically. Cloud errors are shown in the tab; they do not silently save to local storage.

## Verification

Run `npm run test:goals` for goal planning, date rollover, validation, local persistence, and mocked cloud RPC contract checks. These checks do not execute the migration against a live Supabase database.
