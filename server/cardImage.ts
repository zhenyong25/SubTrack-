// Card face images for the Cards tab's market lists, passed through from the comparison sites so
// they're same-origin: the browser only lets a canvas read a picture's pixels when it is, and the
// app trims margins and turns vertical cards sideways that way (services/cardFace.ts). Only image
// hosts the market lists use are allowed, so this can't be used to fetch anything else.

const ALLOWED_HOSTS = new Set(['ringgitplus.com', 'photos.cdn-moneysmart.com']);
const MAX_BYTES = 2_000_000;

export const isAllowedCardImage = (src: string) => {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

export async function handleCardImage(request: Request): Promise<Response> {
  const src = new URL(request.url).searchParams.get('src') || '';
  if (!isAllowedCardImage(src)) return new Response('Image host not allowed', { status: 400 });
  let upstream: Response;
  try {
    upstream = await fetch(src, { headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' }, signal: AbortSignal.timeout(15000) });
  } catch {
    return new Response('Image could not be fetched', { status: 502 });
  }
  const type = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || !type.startsWith('image/')) return new Response('Image unavailable', { status: 502 });
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response('Image too large', { status: 502 });
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, immutable' } });
}
