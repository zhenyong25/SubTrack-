// Fetches an insurer's public policy page (or policy-wording PDF) for the insurance importer.
// Insurer sites don't send CORS headers, so the browser can't read them directly. HTML is
// reduced to plain text here, keeping table rows on their own lines so a benefits table like
// "Overseas Medical Expenses | 250,000" survives for the model that reads it afterwards.
// PDFs are passed through as bytes; the browser extracts their text with pdf.js.
//
// The URL comes from the user, so this only fetches public https pages: IP literals, localhost
// and internal-looking hostnames are refused, redirects are re-checked, and size and time are capped.

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 60_000;
const TIMEOUT_MS = 20_000;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function isFetchableUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  return url;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
  if (code[0] === '#') {
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  }
  return ENTITIES[code.toLowerCase()] ?? match;
});

export function htmlToText(html: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const body = html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/?(tr|p|div|li|ul|ol|h[1-6]|section|article|table|thead|tbody|header|footer|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .replace(/[-]|[\u{F0000}-\u{10FFFF}]/gu, '') // icon-font glyphs
    .split('\n')
    .map(line => line.replace(/[ \t\f\v ]+/g, ' ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim())
    .filter(Boolean)
    .join('\n');
  const pdfLinks = [...new Set([...html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)].map(m => decode(m[1])))]
    .filter(link => /^https:\/\//i.test(link)).slice(0, 5);
  return { title, text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT, pdfLinks };
}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('The page is larger than 8 MB.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export async function handleInsurancePage(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
  let url = isFetchableUrl(new URL(request.url).searchParams.get('url') || '');
  if (!url) return json({ error: 'Enter a public https:// link to the policy page or PDF.' }, 400);
  try {
    let response: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      response = await fetch(url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SubTrackPolicyImport/1.0)', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
      });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get('Location') : null;
      if (!location) break;
      const next = isFetchableUrl(new URL(location, url).toString());
      if (!next) return json({ error: 'The link redirected somewhere that can’t be fetched.' }, 400);
      url = next; response = null;
    }
    if (!response) return json({ error: 'The link redirected too many times.' }, 400);
    if (!response.ok) return json({ error: `The page answered with HTTP ${response.status}.` }, 502);
    const type = (response.headers.get('Content-Type') || '').toLowerCase();
    const bytes = await readCapped(response);
    const isPdf = type.includes('application/pdf') || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
    if (isPdf) return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
    if (!type.includes('html') && !type.startsWith('text/')) return json({ error: 'The link isn’t a web page or PDF.' }, 415);
    const page = htmlToText(new TextDecoder().decode(bytes));
    if (page.text.length < 80) return json({ error: 'The page has almost no readable text. It may need a browser to load; try downloading the PDF and uploading it instead.' }, 422);
    return json({ url: url.toString(), ...page });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return json({ error: timedOut ? 'The page took too long to respond.' : error instanceof Error ? error.message : 'The page could not be fetched.' }, 502);
  }
}
