# Statement Reconciliation

Reconcile an uploaded card e-statement against recorded expenses, side by side,
and add whatever is missing without a full manual entry — you only pick a category.

## Why

Statements were previously just opaque PDFs you could upload/download/delete
(`StatementsList.tsx`), with no link back to the expenses you'd logged. This
feature closes that loop: it reads the statement's line items and diffs them
against `Expense` records for the same card, git-style — matched lines,
lines only on the statement ("missing" — add them), and lines only recorded
locally ("extra" — nothing on the statement to match, useful for spotting
duplicates or stray manual entries).

## Scope of this iteration

- **Card statements only.** `Expense.linkedCardId` is the only per-transaction
  link that exists today; cash accounts only have point-in-time balance
  snapshots (`CashBalanceEntry`), not per-transaction records, so there's
  nothing to diff against yet. `StatementsList` still renders for cash
  accounts, just without the new "Reconcile" button (the prop is optional).
- **Read-only parsing.** The statement PDF itself is never modified or
  re-uploaded; parsing only produces a cached list of line items.
- **Matching is a diff, not a ledger.** Nothing here changes account
  balances or credit-limit math — it's purely about noticing which spends
  are already logged as expenses.

## Data flow

```
                 ┌──────────────────────────┐
  Upload PDF ──► │ account_statements       │  (existing; Supabase Storage)
                 └────────────┬─────────────┘
                               │ user clicks "Scan statement"
                               ▼
                 ┌──────────────────────────┐
                 │ pdf.js (in-browser)       │  services/huggingFaceService.ts
                 │ extracts selectable text  │  extractPdfText()
                 └────────────┬─────────────┘
                               │ raw statement text
                               ▼
                 ┌──────────────────────────┐
                 │ Hugging Face Inference    │  services/huggingFaceService.ts
                 │ API - Qwen2.5-7B-Instruct │  parseStatementTransactions()
                 └────────────┬─────────────┘
                               │ JSON array of line items
                               ▼
                 ┌──────────────────────────┐
                 │ account_statement_        │  new table, cached so re-opening
                 │ transactions              │  the panel doesn't re-parse
                 └────────────┬─────────────┘
                               │ diffed client-side against
                               ▼
                 ┌──────────────────────────┐
                 │ expenses (existing)       │  filtered by linkedCardId
                 └──────────────────────────┘
```

### New table: `account_statement_transactions`

See [`supabase_statement_transactions_schema.sql`](../supabase_statement_transactions_schema.sql).
One row per parsed line item:

| column               | notes                                                            |
|----------------------|-------------------------------------------------------------------|
| `statement_id`       | FK → `account_statements`, cascades on delete                    |
| `transaction_date`   | normalized to `YYYY-MM-DD` by the model                          |
| `description`        | merchant / line text as printed                                  |
| `amount`             | always positive; sign is carried by `direction`                  |
| `direction`          | `debit` (charge) or `credit` (payment/refund/cashback)           |
| `matched_expense_id` | set once the row is imported via the "Add transaction" button    |

RLS mirrors `account_statements`: owner-only read/write via `auth.uid()`.

Run this migration in the Supabase SQL editor before using the feature
(after the existing `supabase_account_statements_schema.sql`).

### Parsing: `services/huggingFaceService.ts`

Two steps, both client-side:

1. **`extractPdfText(blob)`** — reads the statement's selectable text using
   `pdfjs-dist`. Bank e-statements are digitally generated PDFs (not
   scanned images), so this is a deterministic, ML-free step — no OCR, no
   risk of hallucinated numbers at this stage. The pdf.js worker
   (~2 MB) is a separate lazy-loaded chunk, excluded from the PWA's
   install-time precache (`vite.config.ts` → `injectManifest.globIgnores`)
   so it's only downloaded the first time someone actually scans a
   statement, not on every install.
2. **`parseStatementTransactions(text, currencyHint)`** — sends that raw
   text to an open instruction-tuned model
   (`Qwen/Qwen2.5-7B-Instruct:featherless-ai` by default) via Hugging
   Face's Inference Providers router
   (`https://router.huggingface.co/v1/chat/completions`, OpenAI-compatible),
   prompted to return **one JSON object per line** (JSON Lines), not a
   single JSON array — `{ transactionDate, description, amount, currency,
   direction }` per line. A long statement's response can get cut off at
   the model's `max_tokens` limit; a truncated array is unparseable as a
   whole, but a truncated line list only loses its last (incomplete) line,
   so every complete transaction before the cutoff is still recovered.
   `finish_reason === 'length'` on the response is used to surface a
   "results may be incomplete, try Re-scan" warning in the panel rather
   than silently under-reporting.

   The model and provider are pinned as `<model-id>:<provider>` rather
   than left to auto-routing: Hugging Face's own free `hf-inference`
   serverless no longer hosts modern chat models at all (that moved
   entirely to third-party providers — Together, Novita, Featherless,
   DeepInfra, ...), and most of those are opt-in per account, so an
   unpinned request 400s with "not supported by any provider you have
   enabled." Check what's currently live for a given model via:
   `https://huggingface.co/api/models/<model-id>?expand[]=inferenceProviderMapping`.

This mirrors the same client-side-token pattern already used for
`GEMINI_API_KEY` (`vite.config.ts` bakes `HF_TOKEN` into the bundle at
build time) — no new backend was introduced. Get a free token at
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
(read access is enough) and set `HF_TOKEN` in `.env`.

If no token is configured, or the PDF has no extractable text (e.g. a
scanned image), the panel surfaces a clear inline error instead of
silently failing or sending anything to the model.

Swapping the model is a one-line change (`HF_MODEL` in
`huggingFaceService.ts`) — any chat-completion model available through
Hugging Face's router works, as long as it follows the "return only a JSON
array" instruction reasonably well. Free-tier Inference Providers can have
cold-start latency or rate limits; the panel's "Re-scan" button exists partly
to make retries cheap.

### Persistence: `services/appDataService.ts`

- `fetchStatementTransactions(statementId)` — load cached rows.
- `saveParsedStatementTransactions(statementId, parsed)` — bulk insert after a scan.
- `clearStatementTransactions(statementId)` — used by "Re-scan".
- `markStatementTransactionMatched(id, expenseId | null)` — called after an import.

### Diffing: `components/StatementReconcilePanel.tsx`

Runs entirely client-side, recomputed on every render via `useMemo` — no
speculative matches are persisted, only explicit ones from the Add flow:

1. **Explicit matches** — rows with a persisted `matchedExpenseId` (i.e.
   previously imported through this panel).
2. **Heuristic matches** — remaining rows are matched greedily against
   remaining card expenses with the same currency, amount within 1 cent,
   and dates within 3 days (closest date wins). This catches transactions
   you already entered manually before ever scanning the statement.
3. **Extra expenses** — card expenses inside the statement's date range
   (±3 days) that matched nothing, shown as "not on statement."

Everything else is a "missing" row: on the statement, not recorded.

### Adding a missing transaction

Clicking **Add transaction** on a missing row expands an inline picker with
just a category `<select>` (populated from the same categories used in
`AddExpense`, now shared via `storageService.getExpenseCategories()`) and a
**Confirm** button. Name, amount, currency, date, and card are already known
from the parsed line — categorizing is the only decision left, per the
original ask. Confirming:

1. Calls `onAddExpense(...)`, which in `App.tsx` is
   `handleAddExpenseFromStatement` — the same "create a new expense and
   persist" logic as the normal Add Expense flow, minus the tab navigation,
   so the user stays in the reconcile panel.
2. Calls `markStatementTransactionMatched` so the row is durably linked and
   won't be offered again after a refresh.
3. Color is auto-assigned deterministically from the category name (a small
   hash into the existing 8-color palette) so the same category always
   looks the same — no extra decision required.

## UI entry point

`StatementsList` gained an optional `onReconcile?: (statement) => void`
prop; when provided, a compare icon appears next to each statement's
download/delete actions. `CardDetail` wires this to open
`StatementReconcilePanel` as a full-screen overlay (same pattern as
`CardDetail` itself and `AddExpense`), passing the card's expenses and a
`baseCurrency` hint for lines where the statement doesn't print a currency
per row.

## Known simplifications / follow-ups

- **Cash account statements** aren't wired up yet — would need per-transaction
  cash records to diff against, not just balance snapshots.
- **Credit rows** (payments, refunds, cashback) can still be "added" as an
  expense if the user wants to log them, but there's no dedicated Income/
  refund handling — logging one just creates a regular (positive-amount)
  expense with whatever category is picked.
- **Very long statements** are truncated to the first ~45k characters of
  extracted text (`MAX_STATEMENT_CHARS`) to stay within the model's context
  window; a statement with unusually many line items may need that raised,
  or the request chunked page-by-page.
- **Scanned/image-only PDFs** have no selectable text for pdf.js to read,
  so parsing fails fast with a clear error rather than silently returning
  nothing. Handling those would need an OCR step first.
- The HF token is bundled client-side (same pre-existing pattern as
  `GEMINI_API_KEY`) — anyone with the built JS can extract it, and the raw
  statement text is sent to whichever Inference Provider serves the chosen
  model. If that's not acceptable, move this call behind the Cloudflare
  Worker (`worker/`) instead of calling Hugging Face directly from the
  browser, or switch to a fully local in-browser model (transformers.js)
  so nothing leaves the device.
