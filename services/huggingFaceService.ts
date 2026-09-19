import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a URL for the worker asset; pdf.js needs a dedicated
// worker script to parse PDFs off the main thread.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ParsedStatementTransaction } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Any instruction-tuned model hosted on Hugging Face's Inference Providers works here;
// Qwen2.5-7B-Instruct is a solid free-tier default for structured JSON extraction.
// Pinned to a specific provider ("featherless-ai") rather than letting the router
// auto-pick one: Hugging Face's own "hf-inference" serverless no longer hosts modern
// chat models at all, and most other providers (Together, Novita, Fireworks, ...) are
// opt-in per account, so an unpinned or hf-inference request 400s with "not supported
// by any provider you have enabled". featherless-ai broadly mirrors open models for free.
// Check what's currently live for a model via:
//   https://huggingface.co/api/models/<model-id>?expand[]=inferenceProviderMapping
const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct:featherless-ai';
// Same-origin proxy (server/index.ts), not Hugging Face's endpoint directly - calling their
// router straight from the browser depended on their CORS response being reliable, which
// wasn't the case in production (a preflight failed there despite the exact same request
// succeeding moments later from curl). Routing through our own Worker sidesteps browser CORS
// entirely and keeps the API token server-side instead of bundled into public client JS.
const HF_CHAT_ENDPOINT = '/api/hf/chat';

// Bank e-statement PDFs are digitally generated (not scanned images), so pdf.js can
// read the selectable text directly - no OCR or ML needed for this step. Returns one
// string per page so callers can chunk a long statement across multiple model calls
// instead of risking a single response getting cut off at the output token limit.
export const extractPdfPages = async (blob: Blob): Promise<string[]> => {
  const buffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Some PDF generators (seen on real Citibank statements) emit one text item PER
    // GLYPH rather than per word. pdf.js already returns real spaces as their own items
    // where the source text actually has them, so joining every item with an extra ' '
    // double-spaces real word breaks AND inserts spaces *inside* words that were split
    // into per-character items (turning "Citibank" into "C i t i b a n k"). Concatenate
    // items with no separator instead, and reconstruct line breaks from each item's
    // vertical position so the transaction table's row structure survives.
    let pageText = '';
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 1) {
        pageText += '\n';
      }
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      lastY = y;
    }

    pageTexts.push(pageText);
  }

  return pageTexts;
};

export const extractPdfText = async (blob: Blob): Promise<string> => (await extractPdfPages(blob)).join('\n\n');

// Groups whole pages into chunks up to maxChars each (never splits a page in half, so a
// transaction table row is never cut mid-line) - keeps each model call's input, and
// therefore its output, small enough to reliably stay under the response token limit.
const chunkPages = (pages: string[], maxChars: number): string[] => {
  const chunks: string[] = [];
  let current = '';

  for (const page of pages) {
    const candidate = current ? `${current}\n\n${page}` : page;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = page;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks.length > 0 ? chunks : [''];
};

interface StatementPeriod {
  year: number;
  month: number; // 1-12, the month the statement closes in
}

const clampToValidDate = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1) return null;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfMonth);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
};

// The model reads day/month off a statement line reliably, but reasoning about which YEAR a
// bare day/month date belongs to - especially near a Dec/Jan cycle boundary - is not reliable
// even with an explicit hint in the prompt (observed in practice: identical input, same
// temperature-0 request, produced 20 correct 2026 dates and 20 incorrectly bumped to 2027 in
// one run, all correct in the next). Rather than trust the model's year arithmetic at all,
// recompute it deterministically here from the statement's known closing month: a transaction
// dated later in the calendar than the closing month is from the tail end of the previous
// cycle. This only overrides the year - day and month still come from what the model read.
const resolveYear = (month: number, modelYear: number, period?: StatementPeriod): number => {
  if (!period) return modelYear;
  return month > period.month ? period.year - 1 : period.year;
};

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// The model can also hallucinate a calendar-invalid date (e.g. "2026-09-31" - September only
// has 30 days), which Postgres' `date` column rejects outright and fails the whole insert. It's
// asked for ISO (YYYY-MM-DD) but sometimes drifts to whatever format the source statement
// itself uses instead (seen in practice: "27-08-2026", "27 AUG 2026") - recovering those is
// worth more than strict compliance, since silently dropping every transaction that doesn't
// come back in exact ISO has turned out to be the more common failure in testing.
// Clamps an out-of-range day to the last real day of that month rather than dropping the
// transaction outright, and returns null only when the string isn't a plausible date at all.
const normalizeTransactionDate = (value: string, period?: StatementPeriod): string | null => {
  const trimmed = value.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    return clampToValidDate(resolveYear(month, Number(isoMatch[1]), period), month, Number(isoMatch[3]));
  }

  // Numeric day-first: "27-08-2026" or "27/08/2026". Day-first (not month-first) because
  // every drift observed in practice has echoed the source statement's own day-first format.
  const numericDmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (numericDmyMatch) {
    const month = Number(numericDmyMatch[2]);
    return clampToValidDate(resolveYear(month, Number(numericDmyMatch[3]), period), month, Number(numericDmyMatch[1]));
  }

  // "27 AUG 2026" / "27-Aug-2026" / "27 Aug, 2026"
  const dayMonthNameMatch = trimmed.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})/);
  if (dayMonthNameMatch) {
    const month = MONTH_ABBREVIATIONS[dayMonthNameMatch[2].slice(0, 3).toLowerCase()];
    if (month) return clampToValidDate(resolveYear(month, Number(dayMonthNameMatch[3]), period), month, Number(dayMonthNameMatch[1]));
  }

  // "Aug 27, 2026" / "Aug 27 2026"
  const monthNameDayMatch = trimmed.match(/^([A-Za-z]{3,9})\.?[\s-]+(\d{1,2}),?[\s-]+(\d{4})/);
  if (monthNameDayMatch) {
    const month = MONTH_ABBREVIATIONS[monthNameDayMatch[1].slice(0, 3).toLowerCase()];
    if (month) return clampToValidDate(resolveYear(month, Number(monthNameDayMatch[3]), period), month, Number(monthNameDayMatch[2]));
  }

  return null;
};

const stripCodeFence = (text: string) =>
  text.trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim();

// Scans for balanced top-level {...} objects rather than relying on the model's chosen
// whitespace (it's asked for one compact object per line, but instruction-tuned models
// often pretty-print each object across several lines anyway, or wrap everything in an
// array). This works regardless of that formatting choice, and a response cut off at the
// token limit mid-object simply never closes its brace, so it's dropped rather than
// corrupting the whole parse - only the last, incomplete transaction is lost.
const extractJsonObjects = (text: string): Array<Record<string, unknown>> => {
  const cleaned = stripCodeFence(text);
  const rows: Array<Record<string, unknown>> = [];

  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        try {
          rows.push(JSON.parse(cleaned.slice(start, i + 1)));
        } catch {
          // Malformed object - skip it rather than failing the whole batch.
        }
        start = -1;
      }
    }
  }

  return rows;
};

export interface StatementParseResult {
  transactions: ParsedStatementTransaction[];
  truncated: boolean;
}

// "FOREIGN AMOUNT <currency name> <amount>" disclosure lines (seen on real Citibank
// statements) always directly follow the transaction they describe. The model is asked
// not to emit these as their own transaction, but a 7B instruct model doesn't reliably
// honor that on a statement with 100+ lines - fold them in deterministically instead of
// depending on it, so a phantom "transaction" with the wrong currency doesn't slip through.
const FOREIGN_AMOUNT_DISCLOSURE = /^foreign amount\b/i;

// The prompt tells the model not to extract these account-summary fields as transactions,
// but on a chunk that's mostly boilerplate (e.g. just the trailing "Payment Summary" section)
// it can still fabricate one anyway - a denylist doesn't depend on the model reliably
// following that instruction, the same reasoning as the FOREIGN AMOUNT merge above.
const SUMMARY_FIELD_LABEL = /^(payment due|amount to pay|minimum payment|total credit limit|available credit|previous balance|current balance|new balance|total amount due|statement date|credit limit)\b/i;

const mergeForeignAmountDisclosures = (
  transactions: ParsedStatementTransaction[],
): ParsedStatementTransaction[] => {
  const merged: ParsedStatementTransaction[] = [];
  for (const txn of transactions) {
    if (FOREIGN_AMOUNT_DISCLOSURE.test(txn.description) && merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.description = `${previous.description} (${txn.description})`;
      continue;
    }
    merged.push(txn);
  }
  return merged;
};

// For a foreign-currency purchase, the model is told to always report the converted/billed
// amount, never the foreign one - but sometimes it emits the SAME transaction twice: once
// correctly converted, once left in the original foreign currency (observed in practice: a
// Korean purchase came back both as "SGD 32.63" and, on the same date with the same
// description, "KRW 36000" - which downstream code would otherwise treat as a second, wildly
// larger transaction). Since a duplicate only ever shows up in a currency other than the
// statement's billing currency, dropping it can't affect two genuinely separate same-day
// purchases at the same merchant - those would both be billed in the same currency.
const dropUnconvertedForeignDuplicates = (
  transactions: ParsedStatementTransaction[],
  currencyHint?: string,
): ParsedStatementTransaction[] => {
  if (!currencyHint) return transactions;
  const billingCurrency = currencyHint.toUpperCase();

  return transactions.filter(txn => {
    if (txn.currency === billingCurrency) return true;
    const hasBillingCurrencySibling = transactions.some(
      other =>
        other !== txn &&
        other.currency === billingCurrency &&
        other.transactionDate === txn.transactionDate &&
        other.description.trim().toLowerCase() === txn.description.trim().toLowerCase(),
    );
    return !hasBillingCurrencySibling;
  });
};

const MAX_CHUNK_CHARS = 6000;

// A statement is chunked across multiple model calls (see parseStatementTransactions below),
// but "Statement Date" / the billing period only appears once, near the top of the document.
// A chunk that doesn't happen to include it has no way to correctly infer the year for dates
// that only show day/month, and reliably guesses wrong (observed in practice: a statement
// dated April 2026 came back with ~95% of its transactions dated 2023) - extracting the
// closing year/month once from the first page and passing it into every chunk's prompt fixes
// that at the source, the same way currencyHint already does for currency.
const extractStatementPeriod = async (firstPageText: string): Promise<StatementPeriod | null> => {
  const trimmedText = firstPageText.trim();
  if (!trimmedText) return null;

  const prompt = `You are reading the first page of a bank or credit card e-statement. Find the exact date this
statement closes on - look for "Statement Date", "Statement Period", or similar, near the top of the page.

Respond with ONLY this compact JSON object, no prose, no markdown fences: {"year": number, "month": number}
- year: the 4-digit year of that statement date, not the current year or a copyright year in a footer.
- month: the 1-12 month number of that statement date (e.g. January = 1, December = 12).

Statement text:
"""
${trimmedText.slice(0, 3000)}
"""`;

  const response = await fetch(HF_CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: HF_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 100,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const [row] = extractJsonObjects(content);
  const year = Number(row?.year);
  const month = Number(row?.month);
  if (!Number.isInteger(year) || year <= 1990 || year >= 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const buildTransactionPrompt = (chunkText: string, currencyHint?: string, period?: StatementPeriod) => `You are reading raw text extracted from a bank or credit card e-statement. Extract every individual
transaction line item (purchases, payments, refunds, fees, interest, cashback - everything with a date and an amount).

Do NOT extract anything from the account summary / payment summary section - things like "Statement Date", "Total
Credit Limit", "Amount to Pay", "Minimum Payment", "Due Date", "Available Credit", "Previous Balance", or "Current
Balance". These are account-level figures, not individual transactions, even though they have a date and an amount
next to them. A real transaction always has a specific merchant, description, or line-item name - "Payment Due" or
"Amount to Pay" is never a valid transaction description.

This is only part of a longer statement, split up so each request stays a manageable size - it may contain many
transactions, a few, or none at all. If this excerpt is only the cover page, account summary, contact information,
or legal notices with no real transaction lines in it, output nothing rather than inventing one.

For each transaction return:
- transactionDate: ISO date (YYYY-MM-DD).${period ? ` This statement closes in month ${period.month} of ${period.year}. For a line that only shows day/month (no year), unless it explicitly prints a different year itself: if its month number is ${period.month} or earlier, use ${period.year}; if its month number is GREATER than ${period.month} (e.g. November or December on a statement that closes in January), it's from the tail end of the previous cycle and belongs to ${period.year - 1} instead.` : ' Infer the year from the statement period if a line only shows day/month.'}
- description: the merchant or line item text, cleaned up but not summarized away. Keep any foreign-currency amount shown
  in the description text itself (e.g. "Merchant AUD 18.00") so it isn't lost, even though it isn't the returned amount.
- amount: a positive number - the amount actually billed to the account in its statement (billing) currency. Some lines
  show a foreign purchase amount AND a separate converted amount in the statement's main currency (e.g. "AUD 18.00 17.02"
  meaning 17.02 is what was actually charged) - always use the converted/billed amount and currency in that case, never
  the foreign one.
- currency: the ISO code of the amount you returned above (almost always the statement's main billing currency
  ${currencyHint ? `, which is ${currencyHint} for this statement` : ''}), not a foreign currency mentioned in passing.
- direction: "debit" for charges/purchases/fees that increase what is owed, "credit" for payments, refunds, or cashback that decrease it.

Some statements print a foreign-currency purchase as TWO CONSECUTIVE LINES instead of one: a merchant line with the
billed amount, immediately followed by a line like "FOREIGN AMOUNT AUSTRALIAN DOLLAR 18.00" or "FOREIGN AMOUNT U.S.
DOLLAR 25.00". That second line is NOT its own transaction - it's just disclosing the original foreign amount for the
transaction directly above it. Fold it into that transaction's description (do not invent a currency code from the
spelled-out currency name) and do not emit a separate JSON object for it.

Respond with ONE COMPACT JSON OBJECT PER LINE (JSON Lines format) using exactly those five keys.
Do not wrap the objects in an array, do not add commas between lines, no prose, no markdown code fences.

Statement excerpt:
"""
${chunkText}
"""`;

export interface ParseProgress {
  chunk: number;
  totalChunks: number;
}

// Sends the statement in page-grouped chunks rather than as one giant prompt: a long
// statement's transaction list can easily need more output tokens than a single response
// is allowed (max_tokens), silently dropping everything past that cutoff. Keeping each
// chunk's input small keeps its output small too, so no single call has enough content
// left to extract that it runs into the limit.
export const parseStatementTransactions = async (
  pages: string[],
  currencyHint?: string,
  onProgress?: (progress: ParseProgress) => void,
): Promise<StatementParseResult> => {
  const nonEmptyPages = pages.map(page => page.trim()).filter(Boolean);
  if (nonEmptyPages.length === 0) {
    throw new Error('Could not read any text from this PDF - it may be a scanned image without selectable text.');
  }

  const period = (await extractStatementPeriod(nonEmptyPages[0])) ?? undefined;

  const chunks = chunkPages(nonEmptyPages, MAX_CHUNK_CHARS);
  const rawTransactions: ParsedStatementTransaction[] = [];
  let truncated = false;

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ chunk: i + 1, totalChunks: chunks.length });

    const response = await fetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [{ role: 'user', content: buildTransactionPrompt(chunks[i], currencyHint, period) }],
        temperature: 0,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Statement parsing request failed (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const content: string | undefined = choice?.message?.content;
    if (choice?.finish_reason === 'length') truncated = true;
    if (!content) continue;

    const rows = extractJsonObjects(content);
    rows
      .filter(row => row && row.transactionDate && Number.isFinite(Number(row.amount)))
      .forEach(row => {
        const description = String(row.description || '').trim();
        if (SUMMARY_FIELD_LABEL.test(description)) {
          console.error('Dropping likely account-summary field misread as a transaction', row);
          return;
        }
        const transactionDate = normalizeTransactionDate(String(row.transactionDate), period);
        if (!transactionDate) {
          console.error('Dropping transaction with unparseable date', row);
          return;
        }
        rawTransactions.push({
          transactionDate,
          description: description || 'Unlabelled transaction',
          amount: Math.abs(Number(row.amount)),
          currency: String(row.currency || currencyHint || '').toUpperCase(),
          direction: row.direction === 'credit' ? 'credit' : 'debit',
        });
      });
  }

  if (rawTransactions.length === 0) {
    throw new Error('The model did not return any recognizable transaction lines.');
  }

  const merged = mergeForeignAmountDisclosures(rawTransactions);
  const transactions = dropUnconvertedForeignDuplicates(merged, currencyHint);

  return { transactions, truncated };
};

