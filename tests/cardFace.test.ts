import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_RATIO, backgroundOf, contentBox, planFace } from '../services/cardFace';
import { handleCardImage, isAllowedCardImage } from '../server/cardImage';

// An RGBA picture filled with `background`, with a `card` rectangle painted in `color`.
const picture = (width: number, height: number, background: number[], card?: { x: number; y: number; width: number; height: number }, color = [20, 60, 160, 255]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const inside = card && x >= card.x && x < card.x + card.width && y >= card.y && y < card.y + card.height;
    data.set(inside ? color : background, (y * width + x) * 4);
  }
  return data;
};

test('finds a vertical card centred on white and turns it sideways', () => {
  // Like RinggitPlus: 400x250 canvas, a 158x250 portrait card in the middle.
  const data = picture(400, 250, [255, 255, 255, 255], { x: 121, y: 0, width: 158, height: 250 });
  assert.deepEqual(backgroundOf(data, 400, 250), [255, 255, 255]);
  const box = contentBox(data, 400, 250);
  assert.deepEqual(box, { x: 121, y: 0, width: 158, height: 250 });
  const plan = planFace(box, 480, 303);
  assert.equal(plan.rotate, true);
  // Turned sideways the card is 250 wide and 158 tall, scaled to cover 480x303 with no margin.
  assert.ok(250 * plan.scale >= 480 && 158 * plan.scale >= 303);
});

test('trims a horizontal card on a dark band without rotating it', () => {
  const data = picture(400, 250, [12, 12, 12, 255], { x: 30, y: 20, width: 340, height: 214 }, [200, 30, 40, 255]);
  const box = contentBox(data, 400, 250);
  assert.deepEqual(box, { x: 30, y: 20, width: 340, height: 214 });
  const plan = planFace(box, 480, 303);
  assert.equal(plan.rotate, false);
  assert.ok(340 * plan.scale >= 480 && 214 * plan.scale >= 303);
});

test('keeps full-bleed pictures whole', () => {
  // Corners that disagree mean the card fills the picture.
  const data = picture(400, 250, [0, 0, 0, 255]);
  data.set([250, 250, 250, 255], (1 * 400 + 398) * 4);
  assert.equal(backgroundOf(data, 400, 250), null);
  assert.deepEqual(contentBox(data, 400, 250), { x: 0, y: 0, width: 400, height: 250 });
});

test('treats transparent padding as background', () => {
  const data = picture(300, 300, [0, 0, 0, 0], { x: 20, y: 80, width: 260, height: 164 });
  assert.equal(backgroundOf(data, 300, 300), 'transparent');
  assert.deepEqual(contentBox(data, 300, 300), { x: 20, y: 80, width: 260, height: 164 });
});

test('ignores JPEG speckle and tiny marks', () => {
  const data = picture(400, 250, [255, 255, 255, 255], { x: 50, y: 30, width: 300, height: 190 });
  data.set([0, 0, 0, 255], (5 * 400 + 5) * 4); // a stray dark pixel in the margin
  assert.deepEqual(contentBox(data, 400, 250), { x: 50, y: 30, width: 300, height: 190 });
  const logo = picture(400, 250, [255, 255, 255, 255], { x: 190, y: 115, width: 20, height: 20 });
  assert.deepEqual(contentBox(logo, 400, 250), { x: 0, y: 0, width: 400, height: 250 });
});

test('the frame is an ID-1 card shape', () => {
  assert.ok(Math.abs(CARD_RATIO - 1.585) < 0.01);
});

test('only proxies images from the market sites', async () => {
  assert.equal(isAllowedCardImage('https://ringgitplus.com/img-v5/card-400/x.jpg'), true);
  assert.equal(isAllowedCardImage('http://ringgitplus.com/img-v5/card-400/x.jpg'), false);
  assert.equal(isAllowedCardImage('https://evil.example/x.jpg'), false);
  assert.equal(isAllowedCardImage('https://ringgitplus.com.evil.example/x.jpg'), false);
  assert.equal(isAllowedCardImage('not a url'), false);
  assert.equal((await handleCardImage(new Request('http://x/api/card-image?src=https%3A%2F%2Fevil.example%2Fa.png'))).status, 400);
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })) as unknown as typeof fetch;
    assert.equal((await handleCardImage(new Request('http://x/?src=https%3A%2F%2Fringgitplus.com%2Fa.jpg'))).status, 502); // not an image
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } })) as unknown as typeof fetch;
    const ok = await handleCardImage(new Request('http://x/?src=https%3A%2F%2Fringgitplus.com%2Fa.jpg'));
    assert.equal(ok.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [1, 2, 3]);
  } finally { globalThis.fetch = realFetch; }
});
