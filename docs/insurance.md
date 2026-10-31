# Insurance

Open Insurance in the navigation to add personal or travel policies. Policies support insured people, insurer and policy number, premiums and frequency, currency, main coverage limit, deductible, coverage dates, next premium/renewal date, emergency contact and notes. Travel policies additionally require a destination and coverage dates. Archive cancelled policies to retain their history.

## Storage setup

With Supabase configured, run `supabase_insurance_schema.sql` in the same project's SQL editor. The table uses row-level security so each signed-in user can access only their own records. The UI reports missing setup and offers Retry; it does not silently fall back to local storage. Without Supabase, records persist in browser local storage.

## Metrics

Metrics use all policies, independently of the list's search and Personal/Travel filters. Select a currency to view its metrics; amounts are never summed across currencies. Archived and expired policies are excluded. Annual premiums annualize monthly, quarterly and yearly payments for current and upcoming policies. One-time premiums are excluded. Travel premiums show one-time premiums for current and upcoming travel cover. Due counts include overdue recorded renewal dates and dates through the next 30 days. Renewal dates are maintained manually.

Coverage totals group main limits by type for active policies only. These are recorded limits, not a calculation of claim entitlement or whether protection is adequate. Additional benefits and exclusions can be recorded in notes. Policies do not create expense entries automatically.

Run `npm run test:insurance` to check premium calculations, status boundaries, currency separation, validation and local persistence.
