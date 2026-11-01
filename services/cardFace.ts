// Turns a comparison site's card picture into a uniform card face: the blank background around
// the card is trimmed, a vertical card is turned sideways, and the result fills a card-shaped
// (ISO ID-1, 85.6 × 54 mm) frame edge to edge. Sources pad cards differently - centred on white,
// on a dark band, or full-bleed - so the background is read from the corners.

export const CARD_RATIO = 85.6 / 54;
const FACE_WIDTH = 480;
const FACE_HEIGHT = Math.round(FACE_WIDTH / CARD_RATIO);
const OVERSCAN = 1.04; // a little extra zoom hides rounded corners and anti-aliased edges

export interface Box { x: number; y: number; width: number; height: number }

const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

// The background colour, when the four corners agree on one (transparent counts as background);
// null when they don't, which means the picture is full-bleed.
export const backgroundOf = (data: Uint8ClampedArray, width: number, height: number): number[] | 'transparent' | null => {
  const corners = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]].map(([x, y]) => pixel(data, width, x, y));
  if (corners.every(c => c[3] < 16)) return 'transparent';
  if (corners.some(c => c[3] < 240)) return null;
  const spread = [0, 1, 2].map(ch => Math.max(...corners.map(c => c[ch])) - Math.min(...corners.map(c => c[ch])));
  if (Math.max(...spread) > 24) return null;
  return [0, 1, 2].map(ch => Math.round(corners.reduce((sum, c) => sum + c[ch], 0) / 4));
};

// The card's bounding box: rows and columns where enough pixels differ from the background.
export const contentBox = (data: Uint8ClampedArray, width: number, height: number): Box => {
  const full = { x: 0, y: 0, width, height };
  const background = backgroundOf(data, width, height);
  if (!background) return full;
  const differs = (x: number, y: number) => {
    const [r, g, b, a] = pixel(data, width, x, y);
    if (background === 'transparent') return a >= 16;
    if (a < 16) return false;
    return Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > 48;
  };
  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (differs(x, y)) { rows[y] += 1; cols[x] += 1; }
  const rowMin = Math.max(2, width * 0.015);
  const colMin = Math.max(2, height * 0.015);
  const top = rows.findIndex(count => count > rowMin);
  const left = cols.findIndex(count => count > colMin);
  if (top < 0 || left < 0) return full;
  const bottom = height - 1 - [...rows].reverse().findIndex(count => count > rowMin);
  const right = width - 1 - [...cols].reverse().findIndex(count => count > colMin);
  const box = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  // Something tiny (a logo on a blank canvas) isn't a card face; keep the whole picture.
  return box.width * box.height < width * height * 0.08 ? full : box;
};

export interface FacePlan { crop: Box; rotate: boolean; scale: number }

// How to draw the crop into the frame: turned sideways when it's taller than wide, and scaled to
// cover the frame so there's no margin.
export const planFace = (crop: Box, frameWidth = FACE_WIDTH, frameHeight = FACE_HEIGHT): FacePlan => {
  const rotate = crop.height > crop.width * 1.1;
  const [w, h] = rotate ? [crop.height, crop.width] : [crop.width, crop.height];
  return { crop, rotate, scale: Math.max(frameWidth / w, frameHeight / h) * OVERSCAN };
};

const faces = new Map<string, Promise<string | null>>();

// The normalised face as a data URL, or null when the picture can't be read. Images come through
// the app's own /api/card-image route so the canvas may read them. Cached for the session.
export const loadCardFace = (src: string): Promise<string | null> => {
  const cached = faces.get(src);
  if (cached) return cached;
  const face = new Promise<string | null>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext || !source.width || !source.height) { resolve(null); return; }
        sourceContext.drawImage(image, 0, 0);
        const { data } = sourceContext.getImageData(0, 0, source.width, source.height);
        const background = backgroundOf(data, source.width, source.height);
        const plan = planFace(contentBox(data, source.width, source.height));
        const frame = document.createElement('canvas');
        frame.width = FACE_WIDTH;
        frame.height = FACE_HEIGHT;
        const context = frame.getContext('2d');
        if (!context) { resolve(null); return; }
        context.fillStyle = Array.isArray(background) ? `rgb(${background.join(',')})` : '#ffffff';
        context.fillRect(0, 0, FACE_WIDTH, FACE_HEIGHT);
        context.imageSmoothingQuality = 'high';
        context.translate(FACE_WIDTH / 2, FACE_HEIGHT / 2);
        if (plan.rotate) context.rotate(-Math.PI / 2);
        const { crop, scale } = plan;
        context.drawImage(source, crop.x, crop.y, crop.width, crop.height, -crop.width * scale / 2, -crop.height * scale / 2, crop.width * scale, crop.height * scale);
        resolve(frame.toDataURL('image/jpeg', 0.9));
      } catch {
        resolve(null);
      }
    };
    image.src = `/api/card-image?src=${encodeURIComponent(src)}`;
  });
  faces.set(src, face);
  return face;
};
