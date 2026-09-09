# Subscription service catalog

The app includes over 1,000 service and recurring-provider entries across 17 categories. Typing in **Service Name** searches names, aliases, domains, and categories locally. **Browse all** adds category filtering and loads results in groups of 40. Selecting a service sets its name, category, and logo identity, without changing the amount, currency, or billing cycle. Custom service names remain supported.

## Setup

1. Run [supabase_subscription_services_schema.sql](../supabase_subscription_services_schema.sql) in the Supabase SQL editor. It creates and seeds the shared catalog, enables read-only access for app users, and adds an optional `service_id` to the existing `subscriptions` table. It does not create your base subscription tables or modify their access policies.
2. Create a [Logo.dev account](https://www.logo.dev/signup) and copy its **publishable** key (`pk_...`) into `.env.local`:

   ```dotenv
   VITE_LOGO_DEV_PUBLISHABLE_KEY=pk_your_publishable_key
   ```

   Restart Vite after changing this value. Do not use a secret (`sk_...`) key in any Vite variable. This implementation does not need the paid brand search API or a server-side key.
3. For Cloudflare Pages Git integration, set the same build-time environment variable in Pages. For the included GitHub Actions deployment, set the repository **variable** `VITE_LOGO_DEV_PUBLISHABLE_KEY`. Rebuild and deploy to apply it.
4. When restricting the Logo.dev key to domains, allow your deployed hostname and `localhost` for development. Image requests send only the page origin as their referrer.

Without a key, searches and selections work and logos show colored initials. Without the SQL migration, the bundled catalog works; the existing `logo_url` column stores a `catalog:<service-id>` reference for backward-compatible persistence. After the migration, the app also writes `service_id`. Logo URLs with API tokens are generated at render time, not saved in subscriptions.

## Logo behavior

- A subscription's saved custom HTTPS image takes precedence.
- A selected catalog ID resolves to an administrator-supplied `logo_url`, or to a Logo.dev image using the catalog domain.
- Older subscriptions without an ID get a logo only when their full name or alias has a unique catalog match. Partial names and ambiguous brands are not guessed.
- Failed images fall back to local initials. Only visible images are loaded; logo files are delivered by the provider using its normal browser/CDN caching.
- Several services from one company can share the corporate logo. Set a service-specific HTTPS `logo_url` in the catalog when a product needs its own artwork.

Attribution links are included on the app's public page and service browser. Check [Logo.dev attribution requirements](https://www.logo.dev/docs/platform/attribution) for your plan and production hostname. See the [image API reference](https://www.logo.dev/docs/logo-images/get) and [key documentation](https://www.logo.dev/docs/platform/api-keys). Self-hosting provider images is not part of this implementation.

## Catalog maintenance

The seed is an editorial starter list, not a verified global top-1,000 ranking. It spans consumer subscriptions, SaaS, memberships, and recurring providers. Regional availability, current plan offerings, rebrands, domains, and provider logo coverage require ongoing review; the seed does not claim every entry currently offers a subscription in every country. No prices are included.

Supabase becomes the source of truth once the table contains rows. Reads use 500-row pages to avoid the default 1,000-row limit. A validated browser cache lasts 24 hours and is scoped to the Supabase project. A failed refresh retains the cache or bundled catalog. Updates are fetched on component mount, throttled to once a minute per tab; reload the app after administrative changes.

Use the SQL editor for catalog changes. App users have SELECT access only. Keep IDs stable after release. To retire an entry without breaking existing subscriptions:

```sql
update public.subscription_services
set is_active = false, updated_at = now()
where id = 'example--example-com';
```

Inactive entries disappear from search but remain available for resolving existing subscriptions. Prefer retirement to deletion. Add aliases to help users find plan names or old brand names. Set `sort_order` to choose the default display order; it is not a measured popularity score.

To update the bundled seed, edit `data/subscription-services.txt` (`Name|domain|comma-separated aliases`, under `# Category` headings), then run:

```sh
npm run catalog:build
npm run catalog:check
npm run test:catalog
npx tsc --noEmit
npm run build
```

The generator validates domains and unique IDs and writes both the bundled TypeScript data and the complete SQL migration. SQL reruns insert new IDs and preserve existing admin edits (`ON CONFLICT DO NOTHING`); update existing database rows explicitly when changing a seed record. The domain-based ID suffix distinguishes unrelated services with the same name. Do not regenerate a new ID for a rebrand already in use without planning the corresponding data migration.

For an isolated mobile browser check, run `npm run test:catalog:browser` after a build. It uses an installed Chrome/Chromium/Edge browser (override its executable with `CHROME_PATH`), a temporary profile, and a local fixture with database access disabled. App type checking excludes `worker/`, which has its own TypeScript configuration and dependencies.
