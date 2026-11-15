# Insurance

Open Insurance in the navigation to add personal or travel policies. Policies support insured people, insurer and policy number, premiums and frequency, currency, main coverage limit, deductible, coverage dates, next premium/renewal date, emergency contact and notes. Travel policies additionally require a destination and coverage dates. Archive cancelled policies to retain their history.

## Importing benefits from a link or document

Use **Import from link or PDF** (or **Fill in from a link or document** inside the policy form) to avoid typing a benefits schedule by hand. Three sources are supported:

- **Link**: a public `https://` policy page or PDF. The Worker route `/api/insurance/page` fetches it server-side (insurer sites block browser requests), reduces HTML to text and passes PDFs through for pdf.js. It refuses non-https links, IP addresses, localhost and internal hostnames, and caps size (8 MB) and time (20 s).
- **PDF / file**: a certificate of insurance or policy wording (text PDF, .html or .txt). Scanned images aren't read; paste their text instead.
- **Paste text**: for anything else.

The text (first 24,000 characters) goes to Hugging Face through the existing `/api/hf/chat` proxy, so it uses the same `HF_TOKEN`; no other key is needed. The model returns the plan details and an itemised list of benefits with limits, limit wording (for example "200 per every 6 hours, up to 800"), conditions such as age bands, and sub-limits. The result only pre-fills the form: fields you've already typed are kept, the benefits list is replaced (after confirmation if one exists), and nothing saves until you press Save. Brochure pages don't carry your policy number, travel dates or premium, so fill those in or import your certificate.

Benefits are stored in each policy's `details` JSON, so no database change is required. They appear under **Coverage details** on the policy card and are searchable.

## Storage setup

With Supabase configured, run `supabase_insurance_schema.sql` in the same project's SQL editor. The table uses row-level security so each signed-in user can access only their own records. The UI reports missing setup and offers Retry; it does not silently fall back to local storage. Without Supabase, records persist in browser local storage.

## Metrics

Metrics use all policies, independently of the list's search and Personal/Travel filters. Select a currency to view its metrics; amounts are never summed across currencies. Archived and expired policies are excluded. Annual premiums annualize monthly, quarterly and yearly payments for current and upcoming policies. One-time premiums are excluded. Travel premiums show one-time premiums for current and upcoming travel cover. Due counts include overdue recorded renewal dates and dates through the next 30 days. Renewal dates are maintained manually.

Coverage totals group main limits by type for active policies only. These are recorded limits, not a calculation of claim entitlement or whether protection is adequate. Itemised benefits are listed separately and don't change these totals. Policies do not create expense entries automatically.

Run `npm run test:insurance` to check premium calculations, status boundaries, currency separation, validation and local persistence.
