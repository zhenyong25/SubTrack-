# CSV statement import and reconciliation

Open **Expenses → Import statement CSV**. This complements the existing PDF scanner on card detail pages; it does not replace it. CSV parsing runs in the browser and needs no AI key or new database migration.

## Import a statement

1. Choose the cash account or payment card the statement belongs to.
2. Choose a UTF-8 CSV with column headers. Files may contain up to 500 transactions and must be smaller than 2 MB. Comma, semicolon, and tab delimiters are supported.
3. Map the date, description, and amount columns. Use either a signed amount column or separate positive debit and credit columns. Currency and bank reference columns are optional. A blank currency uses the selected default.
4. Explicitly choose the date format, decimal separator, and expense sign. Bank exports usually use negative expenses; card exports may use positive charges. Dates support YYYY-MM-DD, DD/MM/YYYY, and MM/DD/YYYY. Amounts support grouping separators, up to two decimal places, and parentheses for negatives; remove currency symbols from amount cells.
5. Preview the rows. Review match suggestions, repeated rows, errors, actions, and categories. A bulk category selector applies to selected expenses; individual categories remain editable. Invalid rows cannot be imported.
6. Review the per-currency totals, check the confirmation box, and confirm the import. Only rows selected as new expenses or one-time income are saved. Skipped and matched rows leave existing records unchanged.

[Example CSV](../samples/statement-import-example.csv) contains fictional transactions using separate debit/credit columns.

## Matching

Exact matches require the same date, normalized description, amount, and currency. These default to **Already recorded**, with one existing expense/income claimed at most once automatically. Amount/currency matches within three days are suggestions that default to **Skip**. Linked records from other cards or previously imported sources are excluded. One-time income can match credits; recurring income is not treated as a recorded receipt.

Subscriptions can be suggested when their name, exact price/currency, and billing schedule fit. Past subscriptions are eligible only before their recorded cancellation date. These suggestions also default to Skip, preventing an automatically duplicated expense. Review the suggestion and choose **Already recorded** when appropriate.

Repeated transactions within a file default to Skip. Distinct transactions with identical dates, names, amounts, and currencies are inherently difficult to distinguish; map a unique bank reference when available. If a repeated row is a separate real transaction, select it explicitly and review the duplicate warning before confirmation.

The preview also shows source-linked recorded expenses without a candidate match between the file's first and last valid transaction dates. This can help identify missing statement rows or duplicate manual records. It does not delete or modify those expenses. The file's transaction span is not assumed to be a full statement period.

Matching is a review of existing data, not a permanent statement attachment or separate reconciliation ledger. CSV files themselves are not uploaded or retained. New records retain the source and filename/reference in their notes. Card expenses receive the existing card link. Cash imports retain their source account in notes because expenses currently have no cash-account foreign key.

## Credits and balances

Credits always default to Skip unless they exactly match an existing one-time income. Explicitly select **Add one-time income** only for actual income. Transfers, refunds, reimbursements, and card payments do not become income automatically. This iteration does not create transfer or refund records.

Imports add expense/income records. They do not adjust cash balance snapshots, pay debts, or change subscriptions. Review amounts and account context before confirming. Preview choices are temporary and are discarded when leaving the page.

## Persistence and retries

Local-only mode writes the existing expense and income ledgers. Configured Supabase mode requires a signed-in session and writes only to that user's existing expense/income tables; cloud errors never fall back to local storage.

Imported IDs are derived from the owner, source, normalized transaction details, bank reference, and repeated-row occurrence. The filename and category are excluded. Reimporting a renamed file or retrying a failed write does not create the same imported row again or overwrite later edits.

Expense and income saves are separate, and cloud writes use chunks of up to 100 records. A partial failure reports the rows verified as saved and leaves remaining rows available for retry. Cloud writes are read back with an owner filter before reporting success. An interrupted response may leave a saved row not yet shown locally; retrying verifies it without duplicating it.

Run `npm run test:import` for parsing, mapping, matching, idempotency, local storage failures, and mocked cloud persistence checks. These tests do not write to a live Supabase account.
