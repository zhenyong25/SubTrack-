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

## Costs, learning and policy tools

Insurance now has Overview, Policies, Costs, Learn, Compare, Simulator, People, Claims and Review sections.

- **Costs** records premiums by effective date, payment frequency, insurer-stated reason and an optional linked renewal letter. Changes compare annual equivalents so different payment frequencies remain comparable. A zero baseline has no percentage change; one-time payments have no annual comparison. Entries do not automatically change the current premium: use **Apply to current premium** for an entry effective today or earlier. Attach renewal letters in the policy editor before linking them.
- **Payments and reminders** use separate next-payment and policy-renewal dates. Existing combined renewal dates remain payment-date fallbacks until explicitly replaced or cleared. Configure a lead time from 0 to 365 days. In-app reminders include overdue dates and exclude paid due dates, quotations, expired and archived policies. The overview counts policies with a payment or renewal due within 30 days, independently of configured reminder lead times. Marking the next due payment paid advances one period, retaining the original day across short months; one-time payments clear the date. Historic payments do not advance the schedule. Removing a payment does not rewind the schedule. Payment records do not create expenses.
- **Calendar export** downloads separate all-day payment and renewal events with reminder alarms. Import the `.ics` file into a calendar app for alerts outside SubTrack. Export again after changing dates; this is a snapshot rather than a live calendar subscription. Delivery depends on calendar settings.
- **Learn** provides eight short sourced lessons on premiums, pricing, repricing, deductibles, contract terms, riders and investment-linked policy charges. Contextual help is also available inside the policy editor without losing the draft. The price explorer uses an explicitly arbitrary teaching formula; it does not estimate actual insurer rates.
- **Compare** places two to four policies or quotations side by side, including itemised benefits and structured exclusions, waiting periods, riders, co-payment and limit basis. Amounts remain in their original currencies. Missing terms are highlighted. Choose **Quotation** in the policy editor to keep an imported proposal out of policy metrics, payment reminders, claims and insured-person coverage. Travel quotations can omit actual trip dates and destination.
- **Simulator** illustrates reimbursement-style claims: bill minus excluded costs, remaining deductible, percentage co-payment, then a remaining insurer payout limit. The result conserves the original bill. It does not implement product-specific sub-limits, co-payment caps, eligibility, claim coordination or annual deductible tracking. Prefilled headline limits must be checked against the actual benefit. Unknown co-payment prefills as zero for the example and must be verified.
- **People** groups current policies by explicitly entered individual names. Older records use the existing insured-person label until split into individual names. Same-type policies prompt an overlap review without assuming duplicate entitlement or judging coverage adequacy. Missing exclusions, waiting periods and limit basis prompt a documentation review.
- **Claims** stores requested and approved amounts separately, incident/submission dates, status, follow-up dates, tasks and notes. Link existing documents or upload PDF/images when saving. Files use the existing private policy storage and share its 10-document/15 MB per-file limits. Uploads require cloud sync. Removing a claim retains its documents; removing a policy document clears references from claims and premium history.
- **Review** keeps checklists and notes per policy and year. Current annual commitments use today's current/upcoming recurring policies. Actual annual spending uses recorded payment dates, including archived/expired policies with historical payments. Premium changes and payment/renewal reminders are listed in the export. Review metrics and text exports use the selected currency without currency conversion.

All additional data is optional and stored in the existing policy `details` JSON. No additional database migration is required. Existing policy records remain readable. Structured comparison terms can also be prefilled by the existing document importer; review them before saving.

Run `node scripts/test-insurance-browser.mjs` after `npm run build` for desktop workflows, downloads, reload persistence and mobile layout checks. It uses an isolated Chromium profile and local fixture data; it does not call cloud storage or the extraction model. Live cloud uploads and AI extraction still depend on the existing configured services.
