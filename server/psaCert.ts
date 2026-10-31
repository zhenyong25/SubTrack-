// Looks up a PSA slab by certificate number through PSA's public API
// (https://www.psacard.com/publicapi). The cert page itself sits behind a bot challenge, so the
// API is the only reliable source. Without a token PSA shares one small daily quota between all
// anonymous callers; a free token from a PSA account gives 100 lookups a day of your own - set it
// with: wrangler secret put PSA_API_TOKEN (and PSA_API_TOKEN in .env for local dev).

const PSA_ENDPOINT = 'https://api.psacard.com/publicapi/cert/GetByCertNumber';

export interface PsaCertResult {
  certificate: string;
  name: string;
  set: string;
  number: string;
  year: string;
  language: string; // one of the tracker's language names
  grade: number | null; // whole PSA grade, e.g. 10
  gradeLabel: string; // as printed on the label, e.g. GEM MT 10
  variety: string;
  population: number | null;
  url: string;
}

interface PsaCert {
  CertNumber?: string; Year?: string; Brand?: string; Subject?: string; CardNumber?: string;
  CardGrade?: string; GradeDescription?: string; Variety?: string; TotalPopulation?: number;
}

// Longest names first so "SIMPLIFIED CHINESE" wins over "CHINESE".
const LANGUAGES: Array<[string, string]> = [
  ['SIMPLIFIED CHINESE', 'Simplified Chinese'], ['TRADITIONAL CHINESE', 'Traditional Chinese'], ['CHINESE', 'Traditional Chinese'],
  ['JAPANESE', 'Japanese'], ['KOREAN', 'Korean'], ['FRENCH', 'French'], ['GERMAN', 'German'], ['SPANISH', 'Spanish'],
  ['ITALIAN', 'Italian'], ['PORTUGUESE', 'Portuguese (Brazilian)'], ['INDONESIAN', 'Indonesian'], ['THAI', 'Thai'],
];
const KEEP_UPPER = new Set(['EX', 'GX', 'V', 'VMAX', 'VSTAR', 'TCG', 'SV', 'SWSH', 'SM', 'XY', 'BW', 'DP', 'HGSS', 'II', 'III', 'IV', 'SAR', 'SR', 'AR', 'UR', 'CHR', 'CSR', 'HR', 'PSA']);

// PSA labels are upper case; "CHARIZARD EX" reads better as "Charizard EX".
// Each part between hyphens or slashes is cased on its own; set codes like SWSH284 stay as printed.
export const titleCase = (text: string) => text.trim().toUpperCase().replace(/\s+/g, ' ').replace(/[\p{L}\p{N}]+/gu, part =>
  KEEP_UPPER.has(part) || (/\d/.test(part) && part.length <= 7) ? part : part.charAt(0) + part.slice(1).toLowerCase());

export const parsePsaCert = (cert: PsaCert, certificate: string): PsaCertResult => {
  let brand = (cert.Brand || '').toUpperCase().replace(/^POKEMON\s+/, '').trim();
  const language = LANGUAGES.find(([word]) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(brand));
  if (language) brand = brand.replace(language[0], ' ').replace(/\s+/g, ' ').trim();
  const gradeLabel = (cert.CardGrade || cert.GradeDescription || '').trim();
  const gradeNumber = Number(gradeLabel.match(/(\d+(?:\.\d+)?)\s*$/)?.[1]);
  return {
    certificate,
    name: titleCase(cert.Subject || ''),
    set: titleCase(brand || cert.Brand || ''),
    number: (cert.CardNumber || '').trim(),
    year: (cert.Year || '').trim(),
    language: language?.[1] || 'English',
    grade: Number.isFinite(gradeNumber) && gradeNumber >= 1 && gradeNumber <= 10 ? Math.floor(gradeNumber) : null,
    gradeLabel,
    variety: titleCase(cert.Variety || ''),
    population: typeof cert.TotalPopulation === 'number' ? cert.TotalPopulation : null,
    url: `https://www.psacard.com/cert/${certificate}`,
  };
};

const cache = new Map<string, PsaCertResult>();
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function handlePsaCert(request: Request, rawToken?: string): Promise<Response> {
  const token = rawToken?.trim().replace(/^bearer\s+/i, '');
  const certificate = (new URL(request.url).searchParams.get('cert') || '').trim();
  if (!/^\d{5,12}$/.test(certificate)) return fail('Enter the number printed on the PSA label (digits only).', 400);
  const cached = cache.get(certificate);
  if (cached) return Response.json(cached);
  let upstream: Response;
  try {
    upstream = await fetch(`${PSA_ENDPOINT}/${certificate}`, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return fail('PSA could not be reached. Try again shortly, or enter the card by hand.', 502);
  }
  if (upstream.status === 429) return fail(token ? 'Your PSA lookups for today are used up (100 a day). Enter the card by hand, or try tomorrow.' : 'PSA\'s shared lookup limit is used up for today. Add a free PSA API token (PSA_API_TOKEN) for your own 100 a day, or enter the card by hand.', 429);
  if (upstream.status === 401 || upstream.status === 403) {
    // PSA recognises the token but only serves accounts it has approved for API access.
    const reason = String((await upstream.json().catch(() => null) as { Message?: string } | null)?.Message || '');
    return fail(/approved/i.test(reason)
      ? 'PSA hasn\'t approved this account for API lookups yet. Enter the card by hand until it does.'
      : 'PSA refused the lookup - the PSA API token is invalid or expired.', 502);
  }
  if (!upstream.ok) return fail(`PSA answered ${upstream.status}. Enter the card by hand for now.`, 502);
  const data = await upstream.json().catch(() => null) as { PSACert?: PsaCert; IsValidRequest?: boolean; ServerMessage?: string } | null;
  if (!data?.PSACert?.Subject) return fail(`PSA has no certificate ${certificate}. Check the number on the label.`, 404);
  const result = parsePsaCert(data.PSACert, certificate);
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(certificate, result);
  return Response.json(result);
}
