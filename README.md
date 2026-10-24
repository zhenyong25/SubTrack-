<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1VKaTbQT_UmpdEQmMiwATE11URb_QKo6B

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cloudflare Pages

This app is ready to deploy to Cloudflare Pages.

Build settings:

- Build command: `npm run build`
- Output directory: `dist`

If you use the included GitHub Actions workflow, add these repository secrets later:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GEMINI_API_KEY`

Add this repository variable too:

- `CLOUDFLARE_PAGES_PROJECT_NAME`

If you prefer Cloudflare Pages Git integration instead of GitHub Actions, connect the GitHub repo in the Cloudflare dashboard, use the same build command and output directory, and add `GEMINI_API_KEY` as a Pages environment variable there.

## Supabase

For searchable subscription names, automatic logos, and the ready-to-run catalog SQL, see [Subscription service catalog setup](docs/subscription-service-catalog.md).

To connect the app to your Supabase database later, add these Vite environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

For sign-up confirmation emails to work on other devices, also set `VITE_APP_URL` to your deployed URL, and in the Supabase dashboard (Authentication > URL Configuration) set **Site URL** to that URL and add it under **Redirect URLs**. Otherwise the confirmation link points at `localhost`, which a phone can't reach.

The app will use Supabase when those values are present and fall back to localStorage if they are missing. Because your tables are tied to `auth.users.id`, real database writes still require a signed-in Supabase user session.

## Global search and tags

Use the header search button or Ctrl+K / Command+K to search expenses, subscriptions, and investment transactions. Select a result to edit its tags; use `#travel` or the tag filters to find related records.

For cloud tag storage, run [supabase_global_search_tags.sql](supabase_global_search_tags.sql) in Supabase and reload the app. Local-only storage works immediately. See [Global search setup and behavior](docs/global-search.md).

Run `npm run test:search` to check search matching and tag persistence.

## Savings goals and sinking funds

The **Goals** tab tracks savings targets, monthly funding plans, contributions, withdrawals, and recurring sinking funds. Local storage works immediately. For cloud storage, run [supabase_savings_goals_schema.sql](supabase_savings_goals_schema.sql) in Supabase and reload the app.

See [Savings goals setup and behavior](docs/savings-goals.md). Run `npm run test:goals` to check calculations and persistence.

## Cash-flow forecasting

Open **Net worth** for a 30-, 60-, or 90-day cash forecast, savings allocations, shortfall warnings, and temporary spending/savings scenarios. No additional migration is needed. See [forecast behavior and the ordered finance roadmap](docs/finance-roadmap.md). Run `npm run test:planning` to verify forecast calculations.

The **Safe to spend** panel reserves upcoming commitments and savings from selected accounts' current cash, with an optional buffer and daily allowance. Future income and forecast scenarios do not inflate this balance. Expand the account selector and commitment breakdown to review the calculation.

## Financial review

Open **Net worth → Financial review** for monthly spending comparisons, income and savings-rate estimates, debt reduction, and recorded net-worth changes. Review category changes, six-month charts, and opening/closing snapshot coverage. No additional SQL is required.

See [Financial review calculations and limits](docs/financial-review.md). Run `npm run test:review` to verify the report calculations.
