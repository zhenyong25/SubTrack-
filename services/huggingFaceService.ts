import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a URL for the worker asset; pdf.js needs a dedicated
// worker script to parse PDFs off the main thread.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ParsedStatementTransaction } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Any instruction-tuned model hosted on Hugging Face's Inference Providers works here;
// Qwen2.5-7B-Instruct is a solid default for structured JSON extraction. Each entry is
// pinned to a specific provider rather than letting the router auto-pick one: Hugging
// Face's own "hf-inference" serverless no longer hosts modern chat models at all, and an
// unpinned request 400s with "not supported by any provider you have enabled" unless that
// provider is switched on at huggingface.co/settings/inference-providers.
//
// Tried in order: a single provider can go down for a while (seen in practice: featherless-ai
// was paused by Hugging Face's circuit breaker with a 503), so a failed request moves on to
// the next entry instead of failing the whole scan. Check what's currently live via:
//   https://huggingface.co/api/models/<model-id>?expand[]=inferenceProviderMapping
//
// Ordered by how each did on the real sample statements: the featherless-ai Qwen 72B and the
// scaleway Llama 70B reconciled a 114-line statement exactly. deepinfra and nscale answer short
// chunks fine but returned a 504/500 on a full 6000-character chunk (they can't finish that
// much output inside the router's ~120s limit), so they sit last - the chunk still falls
// through to the next model, it just costs a wait. Llama-3.1-8B was dropped (it read "CCY
// CONVERSION FEE SGD 42.73 0.42" as a 42.73 fee) and Together 402s ("Pay-as-you go is not
// enabled").
const HF_MODELS = [
  'Qwen/Qwen2.5-7B-Instruct:featherless-ai',
  'Qwen/Qwen2.5-72B-Instruct:featherless-ai',
  'meta-llama/Llama-3.3-70B-Instruct:scaleway',
  'meta-llama/Llama-3.3-70B-Instruct:novita',
  'Qwen/Qwen2.5-72B-Instruct:deepinfra',
  'Qwen/Qwen3-235B-A22B-Instruct-2507:deepinfra',
  'Qwen/Qwen3-235B-A22B-Instruct-2507:nscale',
];
// Same-origin proxy (server/index.ts), not Hugging Face's endpoint directly - calling their
// router straight from the browser depended on their CORS response being reliable, which
// wasn't the case in production (a preflight failed there despite the exact same request
// succeeding moments later from curl). Routing through our own Worker sidesteps browser CORS
// entirely and keeps the API token server-side instead of bundled into public client JS.
const HF_CHAT_ENDPOINT = '/api/hf/chat';

// Index into HF_MODELS of the last model that answered successfully. Once one works, later
// calls (the remaining chunks of the same statement, the next scan) start there instead of
// re-trying a provider that's already known to be down - and every chunk of one statement
// then tends to be read by the same model, which keeps its output consistent.
let activeModelIndex = 0;

// Backstop for a provider that stalls without ever answering. Hugging Face's router already
// returns a 504 after ~120s when a provider doesn't respond (which falls through to the next
// model like any other error), but some providers send headers straight away and then stream
// the body, so this limit also covers reading the body. It's deliberately generous: a full
// 6000-character chunk legitimately takes 50-90s on the larger models, and a lower limit was
// observed killing requests that would have succeeded.
const MODEL_REQUEST_TIMEOUT_MS = 180_000;

interface ChatCompletionRequest {
  messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>;
  temperature: number;
  max_tokens: number;
}

// 401 means HF_TOKEN itself is bad - every other model would fail the same way, so surface it
// straight away. Anything else (provider paused/overloaded, model not enabled for this account,
// rate limited, network error) is worth trying the next model for.
// Other callers can pass their own model order (tried from the top every time); the sticky
// activeModelIndex only applies to the statement list above.
export const requestChatCompletion = async (request: ChatCompletionRequest, purpose = 'Statement parsing', models: string[] = HF_MODELS): Promise<any> => {
  let lastError = '';
  const sticky = models === HF_MODELS;

  for (let attempt = 0; attempt < models.length; attempt++) {
    const modelIndex = ((sticky ? activeModelIndex : 0) + attempt) % models.length;
    const model = models[modelIndex];

    try {
      const response = await fetch(HF_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, model }),
        signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = await response.json();
        if (sticky) activeModelIndex = modelIndex;
        return data;
      }

      const errorText = await response.text().catch(() => '');
      lastError = `(${response.status}) ${model}: ${errorText || response.statusText}`;
      if (response.status === 401) break;
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      lastError = `${model}: ${timedOut ? 'timed out' : error instanceof Error ? error.message : 'network error'}`;
    }
    console.error(`${purpose} model request failed, trying next model`, lastError);
  }

  throw new Error(`${purpose} request failed ${lastError}`);
};

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
    //
    // Some bank ACCOUNT statements (seen on a real OCBC statement) lay out a row as
    // right-aligned numeric columns (amount, running balance) immediately followed by
    // a second date + description that starts a hair below the numbers row - too small
    // a Y gap to trigger a line break above, so the balance figure and the next row's
    // date/description would otherwise be glued together with no separator at all
    // (e.g. "...14,532.6605 JAN FUND TRANSFER..."), which is unreadable even for the
    // model reading this text afterward. That handoff point is reliably marked by a
    // large *backward* jump in X (from the far-right balance column back to the
    // far-left date column) despite the near-identical Y, whereas ordinary left-to-right
    // columns on one real line never jump backward like that - so treat a big backward
    // X jump as its own line-break signal alongside the Y-based one.
    let pageText = '';
    let lastY: number | null = null;
    let lastX: number | null = null;
    const X_BACKWARD_JUMP_THRESHOLD = 100;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const sameLine = lastY !== null && Math.abs(y - lastY) <= 1;
      const bigBackwardXJump = sameLine && lastX !== null && lastX - x > X_BACKWARD_JUMP_THRESHOLD;
      if (lastY !== null && (!sameLine || bigBackwardXJump)) {
        pageText += '\n';
      }
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      lastY = y;
      lastX = x + (item.width || 0);
    }

    pageTexts.push(pageText);
  }

  return restructureBankAccountRows(pageTexts);
};

export const extractPdfText = async (blob: Blob): Promise<string> => (await extractPdfPages(blob)).join('\n\n');

// On a bank ACCOUNT statement (Withdrawal/Deposit/Balance columns), each transaction row ends up
// as two adjacent lines after extraction above: a numbers-only line (Value Date, amount, running
// Balance after this transaction), then a line starting with the Transaction Date and description.
// Asking the model to pair those two lines back together itself proved unreliable in testing - it
// would occasionally attach a row's amount to the WRONG neighbouring description (e.g. swapping a
// $100 purchase and a $4,469 salary credit that happened to sit next to each other). Since the
// pairing and the running balance are both mechanically present in the text, do both jobs in code
// instead: merge each pair into one unambiguous tagged line, and - whenever an opening "BALANCE
// B/F" figure can be found - compute debit/credit by comparing the balance before and after each
// row, rather than asking the model to guess it from keywords.
const BANK_ACCOUNT_NUMBERS_LINE = /^(\d{1,2}\s+[A-Za-z]{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;
const BANK_ACCOUNT_DATE_LINE = /^(\d{1,2}\s+[A-Za-z]{3})\s+(.+)$/;
const BANK_ACCOUNT_BALANCE_ONLY_LINE = /^([\d,]+\.\d{2})$/;
const BANK_ACCOUNT_BALANCE_BF_LABEL = /BALANCE\s+B\/F/i;
const PAGE_BREAK_MARKER = ' PAGE ';

const restructureBankAccountRows = (pages: string[]): string[] => {
  const lines = pages.join(PAGE_BREAK_MARKER).split('\n');

  let runningBalance: number | null = null;
  for (let i = 0; i < lines.length - 1; i++) {
    const balanceMatch = lines[i].trim().match(BANK_ACCOUNT_BALANCE_ONLY_LINE);
    if (balanceMatch && BANK_ACCOUNT_BALANCE_BF_LABEL.test(lines[i + 1])) {
      runningBalance = Number(balanceMatch[1].replace(/,/g, ''));
      break;
    }
  }

  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const numbersMatch = lines[i].trim().match(BANK_ACCOUNT_NUMBERS_LINE);
    const dateMatch = numbersMatch ? (lines[i + 1] ?? '').trim().match(BANK_ACCOUNT_DATE_LINE) : null;
    if (numbersMatch && dateMatch) {
      const amount = numbersMatch[2];
      let directionTag = '';
      if (runningBalance !== null) {
        const balanceAfter = Number(numbersMatch[3].replace(/,/g, ''));
        directionTag = ` | DIRECTION: ${balanceAfter > runningBalance ? 'credit' : 'debit'}`;
        runningBalance = balanceAfter;
      }
      output.push(`TRANSACTION DATE: ${dateMatch[1]} | AMOUNT: ${amount}${directionTag} | DESCRIPTION: ${dateMatch[2]}`);
      i++; // this line's date+description were already folded into the tagged line above
      continue;
    }
    output.push(lines[i]);
  }

  return output.join('\n').split(PAGE_BREAK_MARKER);
};

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

const parseBareDayMonth = (rawDate: string, period?: StatementPeriod): string | null => {
  const match = rawDate.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})$/);
  if (!match) return null;
  const month = MONTH_ABBREVIATIONS[match[2].toLowerCase()];
  if (!month) return null;
  const fallbackYear = period?.year ?? new Date().getFullYear();
  return clampToValidDate(resolveYear(month, fallbackYear, period), month, Number(match[1]));
};

const TAGGED_ROW_LINE = /^TRANSACTION DATE: (\d{1,2} [A-Za-z]{3}) \| AMOUNT: ([\d,]+\.\d{2})(?: \| DIRECTION: (credit|debit))? \| DESCRIPTION: (.*)$/;
const BANK_ACCOUNT_SECTION_END_LINE = /BALANCE\s+C\/F|Total\s+Withdrawals|Total\s+Deposits/i;

// The tagged lines restructureBankAccountRows() produces already carry a deterministically
// computed amount and, when an opening balance was found, direction - both proved unreliable to
// have the model read back faithfully (it would occasionally attach one row's amount to a
// different, neighbouring row's description). When every tagged row got a DIRECTION, this
// statement's opening balance was resolved, so bypass the model for the transaction data itself
// entirely and parse the tags directly - nothing a model call adds here can beat text already
// known to be correct.
const extractDeterministicBankTransactions = (
  pages: string[],
  currencyHint?: string,
  period?: StatementPeriod,
): ParsedStatementTransaction[] | null => {
  const lines = pages.join('\n').split('\n');
  const taggedIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (TAGGED_ROW_LINE.test(line.trim())) taggedIndices.push(idx);
  });
  if (taggedIndices.length === 0) return null;

  const transactions: ParsedStatementTransaction[] = [];
  for (let t = 0; t < taggedIndices.length; t++) {
    const idx = taggedIndices[t];
    const match = lines[idx].trim().match(TAGGED_ROW_LINE);
    if (!match) return null;
    const [, rawDate, amountStr, direction, firstDescLine] = match;
    if (!direction) return null; // opening balance wasn't found - let the model handle this statement instead

    const transactionDate = parseBareDayMonth(rawDate, period);
    if (!transactionDate) return null;

    const descParts = [firstDescLine.trim()].filter(Boolean);
    const nextTaggedIdx = taggedIndices[t + 1] ?? lines.length;
    for (let i = idx + 1; i < nextTaggedIdx; i++) {
      const text = lines[i].trim();
      if (!text) continue;
      if (BANK_ACCOUNT_SECTION_END_LINE.test(text)) break;
      descParts.push(text);
    }

    transactions.push({
      transactionDate,
      description: descParts.join(' ').replace(/\s+/g, ' ').trim() || 'Unlabelled transaction',
      amount: Number(amountStr.replace(/,/g, '')),
      currency: (currencyHint || '').toUpperCase(),
      direction: direction === 'credit' ? 'credit' : 'debit',
    });
  }

  return transactions;
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

// Two statement line formats that the fallback models misread inconsistently (seen with
// Llama-3.3-70B: correct on one Citibank statement, wrong on the next), so they're checked
// against the chunk's own text instead of trusting whichever model answered:
// - "19 DEC SHOPEE SINGAPORE MP SINGAPORE SG (15.21)" - parentheses mark a refund/credit, but it
//   came back as a debit.
// - "23 DEC CCY CONVERSION FEE SGD 9.27 0.09" - 0.09 is the fee and 9.27 the purchase it was
//   charged on, but the model returned 9.27 as the fee.
const PARENTHESIZED_CREDIT_LINE = /^(\d{1,2})\s+([A-Za-z]{3})\b.*\(([\d,]+\.\d{2})\)\s*$/;
const CONVERSION_FEE_LINE = /CONVERSION FEE\s+[A-Z]{3}\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i;

const correctAgainstSourceText = (
  transactions: ParsedStatementTransaction[],
  chunkText: string,
): ParsedStatementTransaction[] => {
  // Counted, not just a set: a purchase and its same-day refund for the same amount (seen on a
  // real statement: "Klook Travel 386.62" and "Klook Travel (386.62)") share a date and amount,
  // so only as many debits get flipped as there are credit lines the model didn't already catch.
  const missingCredits = new Map<string, number>();
  const feeByBaseAmount = new Map<string, number>();
  for (const line of chunkText.split('\n')) {
    const trimmed = line.trim();
    const credit = trimmed.match(PARENTHESIZED_CREDIT_LINE);
    const creditMonth = credit && MONTH_ABBREVIATIONS[credit[2].toLowerCase()];
    if (credit && creditMonth) {
      const key = `${creditMonth}-${Number(credit[1])}-${credit[3].replace(/,/g, '')}`;
      missingCredits.set(key, (missingCredits.get(key) ?? 0) + 1);
    }
    const fee = trimmed.match(CONVERSION_FEE_LINE);
    if (fee) feeByBaseAmount.set(fee[1].replace(/,/g, ''), Number(fee[2].replace(/,/g, '')));
  }
  if (missingCredits.size === 0 && feeByBaseAmount.size === 0) return transactions;

  const creditKey = (txn: ParsedStatementTransaction) => {
    const [, month, day] = txn.transactionDate.split('-').map(Number);
    return `${month}-${day}-${txn.amount.toFixed(2)}`;
  };
  for (const txn of transactions) {
    const key = creditKey(txn);
    const missing = missingCredits.get(key);
    if (txn.direction === 'credit' && missing) missingCredits.set(key, missing - 1);
  }

  return transactions.map(txn => {
    const key = creditKey(txn);
    const missing = missingCredits.get(key);
    if (txn.direction === 'debit' && missing) {
      missingCredits.set(key, missing - 1);
      return { ...txn, direction: 'credit' };
    }
    const amountKey = txn.amount.toFixed(2);
    const fee = /conversion fee/i.test(txn.description) ? feeByBaseAmount.get(amountKey) : undefined;
    return fee !== undefined ? { ...txn, amount: fee } : txn;
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

  const data = await requestChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 100,
  }).catch(() => null);
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
- direction: "debit" for a charge, purchase, fee, or withdrawal that DECREASES the account balance / increases what is
  owed; "credit" for a payment, refund, cashback, deposit, or incoming transfer that INCREASES the balance / decreases
  what is owed. An amount printed in parentheses, e.g. "(15.21)", or with a trailing "CR" is a credit (a payment, refund,
  or reversal), even when the description looks like a normal merchant purchase.

Some statements print a foreign-currency purchase as TWO CONSECUTIVE LINES instead of one: a merchant line with the
billed amount, immediately followed by a line like "FOREIGN AMOUNT AUSTRALIAN DOLLAR 18.00" or "FOREIGN AMOUNT U.S.
DOLLAR 25.00". That second line is NOT its own transaction - it's just disclosing the original foreign amount for the
transaction directly above it. Fold it into that transaction's description (do not invent a currency code from the
spelled-out currency name) and do not emit a separate JSON object for it.

Bank ACCOUNT statements (not just credit cards) sometimes contain rows that were already pre-parsed for you and
tagged in this exact format, because their original layout (separate Withdrawal/Deposit columns, a running Balance
column, two dates per row) was too ambiguous to split reliably otherwise:
"TRANSACTION DATE: 05 JAN | AMOUNT: 117.70 | DIRECTION: debit | DESCRIPTION: FUND TRANSFER via PayNow-QR Code to 1 BISHAN MEDICAL"
For a row in that tagged format:
- transactionDate, amount, and direction come directly from the TRANSACTION DATE, AMOUNT, and DIRECTION tags - use
  those values as-is rather than re-deriving them, they've already been computed from the statement's running balance.
- description is the tagged DESCRIPTION text, plus any further lines that follow immediately after it (before the
  next "TRANSACTION DATE:" tagged line or the next untagged section) - the description commonly keeps wrapping onto
  those following lines.
- A tagged line with no DIRECTION tag (only TRANSACTION DATE, AMOUNT, DESCRIPTION) means the running balance wasn't
  available - fall back to judging debit vs. credit from the description itself in that case: salary/payroll,
  incoming transfers, interest, and refunds are credits; purchases, outgoing transfers/payments, and fees are debits.

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

  const deterministicTransactions = extractDeterministicBankTransactions(nonEmptyPages, currencyHint, period);
  if (deterministicTransactions && deterministicTransactions.length > 0) {
    const merged = mergeForeignAmountDisclosures(deterministicTransactions);
    return { transactions: dropUnconvertedForeignDuplicates(merged, currencyHint), truncated: false };
  }

  const chunks = chunkPages(nonEmptyPages, MAX_CHUNK_CHARS);
  const rawTransactions: ParsedStatementTransaction[] = [];
  let truncated = false;

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ chunk: i + 1, totalChunks: chunks.length });

    const data = await requestChatCompletion({
      messages: [{ role: 'user', content: buildTransactionPrompt(chunks[i], currencyHint, period) }],
      temperature: 0,
      max_tokens: 8000,
    });
    const choice = data?.choices?.[0];
    const content: string | undefined = choice?.message?.content;
    if (choice?.finish_reason === 'length') truncated = true;
    if (!content) continue;

    const chunkTransactions: ParsedStatementTransaction[] = [];
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
        chunkTransactions.push({
          transactionDate,
          description: description || 'Unlabelled transaction',
          amount: Math.abs(Number(row.amount)),
          currency: String(row.currency || currencyHint || '').toUpperCase(),
          direction: row.direction === 'credit' ? 'credit' : 'debit',
        });
      });
    rawTransactions.push(...correctAgainstSourceText(chunkTransactions, chunks[i]));
  }

  if (rawTransactions.length === 0) {
    throw new Error('The model did not return any recognizable transaction lines.');
  }

  const merged = mergeForeignAmountDisclosures(rawTransactions);
  const transactions = dropUnconvertedForeignDuplicates(merged, currencyHint);

  return { transactions, truncated };
};

