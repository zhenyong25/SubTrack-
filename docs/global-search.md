# Global search and tags

Open search with the header magnifying glass or Ctrl+K / Command+K. Search works across the signed-in user's loaded expenses, subscriptions, and investment transactions, including past subscriptions. It does not search unimported statement lines or card-points activity.

Search names, notes, categories, amounts, currencies, payment cards, tickers, and brokerage accounts. Words combine with AND. Quoted text matches a phrase. `#travel` matches an exact tag; `#"work expenses"` matches a tag with spaces. Additional filters cover record type, inclusive dates, currency, and sorting. Subscription dates mean the next renewal or cancellation/end date. Values stay in their original currencies; trade values exclude fees except fee entries.

Select a result to view details and manage tags. Type a tag and press Enter or +, then choose **Save tags**. Tags are lowercase, deduplicated, limited to ten per record and 32 characters each. Suggested tags come from existing records. The tag filters match all selected tags. Editing a record through its normal form preserves its tags.

## Database setup

Run [supabase_global_search_tags.sql](../supabase_global_search_tags.sql) in the project's Supabase SQL editor before using tags with a signed-in account. This adds a `tags text[]` column to the three existing tables without changing records, financial values, or RLS policies. Reload the app afterward so the existing records include the new fields.

Without this migration, search and ordinary untagged saves continue to work. Attempting to save tags reports an error and does not claim success. The migration has been prepared locally; it has not been applied to a live database by this change.

Local-only installations store tags with the existing records in localStorage and need no database update. Cloud tag updates only change the `tags` field, require a session, constrain writes by user ID and record ID, and never replay transactions or recalculate holdings.

## Checks

Run `npm run test:search` for search matching, tag normalization, filters, local persistence, cloud update scoping, failure handling, metadata-only updates, and ordinary-save compatibility with older schemas. `npx tsc --noEmit` checks types.

Browser verification covered desktop and mobile search, editing and reloading tags, exact tag filters, brokerage lookup, transaction values, keyboard focus trapping, Escape/focus restoration, the keyboard shortcut, and opening the expense editor. The browser test used synthetic local fixtures; cloud behavior was tested with an isolated database mock.
