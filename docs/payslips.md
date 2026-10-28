Payslips are available under Income. Choose a pay month, then upload a PDF, JPEG, PNG or WebP file (up to 10 MB). Files can be filtered by month, previewed, downloaded and deleted.

Storage uses the existing private `account-statements` Supabase bucket and its owner-only policies, with paths `<auth-user-id>/payslips/<YYYY-MM>_<uuid>_<filename>`. No new table or migration is needed for installations with statement storage. For installations without it, apply `supabase_account_statements_schema.sql` after its prerequisite cash-account and payment-card schemas. Users must be signed in. File listings are loaded from storage on each visit; files are not placed in localStorage or app-data exports. Deleting an income source does not delete stored payslips.

History is organised by the selected pay month, independent of income totals. Uploading a payslip does not create or change income entries. Preview/download uses authenticated blob downloads; no public URLs are created.

Run `node scripts/test-payslips.mjs` for validation and storage lifecycle regression tests.
