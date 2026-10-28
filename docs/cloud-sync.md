Settings > Cloud sync observes database writes sent through the app's shared Supabase client. It includes core records, Trade, Options and other features using that client. It reports saves in progress, failed requests and the last successful cloud save. It does not compare the entire local dataset against Supabase or watch changes made by other devices. File storage uploads are outside this status.

Only the last-success timestamp is retained in localStorage, scoped to the authenticated user. Failed request bodies and credentials stay in memory and are discarded on reload or account changes. This is a current-tab activity monitor, not a durable offline queue. A successful connection check is displayed separately and never advances the last-save timestamp.

Retry failed saves replays eligible failed upserts/updates/deletes using the current account's refreshed session token. Plain inserts and upserts without stable identifiers require manual saving again, because replaying them could duplicate data. A newer write to the same table disables the older failed request's retry. New writes wait for an active retry to finish. A successful repeat write for the same request identity clears its earlier failure, including schema-compatibility fallbacks that remove optional columns.

Some app operations span several requests; this monitor retries individual eligible database writes, not the entire original operation. Failures that need a schema migration, permission change or manual review remain visible. No new database schema is required for this feature.

Run `node scripts/test-cloud-sync.mjs` for transport, failure, account isolation, retry and stale-write regression coverage.
