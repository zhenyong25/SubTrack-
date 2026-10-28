import * as THREE from 'three';

// Procedural textures for the city, drawn on canvases at start-up - no image files to load.
// Surfaces are mostly drawn in light greys and tinted by their material's colour, so one
// texture serves every colour of wall or roof.

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const canvas = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) => {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  draw(element.getContext('2d')!, size);
  return element;
};

const toTexture = (source: HTMLCanvasElement, repeat = 1, color = true) => {
  const texture = new THREE.CanvasTexture(source);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const speckle = (ctx: CanvasRenderingContext2D, size: number, base: string, dots: Array<[string, number]>, seed: number, radius = 1.6) => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const random = rand(seed);
  dots.forEach(([color, count]) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i += 1) {
      ctx.globalAlpha = 0.25 + random() * 0.5;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, radius * (0.4 + random()), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
};

export interface CityTextures {
  grass: THREE.Texture;
  asphalt: THREE.Texture;
  pavement: THREE.Texture;
  roof: THREE.Texture;
  brick: THREE.Texture;
  waterNormal: THREE.Texture;
  glow: THREE.Texture; // soft radial light, for lamp pools on the ground
  facade: (style: FacadeStyle) => { map: THREE.Texture; emissiveMap: THREE.Texture };
  label: (text: string, color?: string) => THREE.Texture;
  dispose: () => void;
}

export interface FacadeStyle {
  wall: string;
  window: string;
  frame: string;
  cols: number;
  rows: number;
  glass?: boolean; // curtain wall instead of punched windows
  door?: boolean;
  seed?: number;
}

export const createTextures = (): CityTextures => {
  const owned: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(texture: T) => { owned.push(texture); return texture; };

  const grass = keep(toTexture(canvas(512, (ctx, size) => speckle(ctx, size, '#d9dcd2', [['#ffffff', 2200], ['#9aa596', 3200], ['#c6cfbd', 2400]], 7, 1.4)), 1));
  const asphalt = keep(toTexture(canvas(256, (ctx, size) => speckle(ctx, size, '#5d6166', [['#7a7e83', 1800], ['#3f4246', 1600], ['#8d9195', 400]], 11, 0.9)), 1));
  const pavement = keep(toTexture(canvas(256, (ctx, size) => {
    speckle(ctx, size, '#d2d0ca', [['#e7e5df', 900], ['#b4b1aa', 900]], 13, 0.9);
    ctx.strokeStyle = 'rgba(120,115,105,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(0, (i * size) / 4); ctx.lineTo(size, (i * size) / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((i * size) / 4, 0); ctx.lineTo((i * size) / 4, size); ctx.stroke();
    }
  }), 1));
  const roof = keep(toTexture(canvas(256, (ctx, size) => {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, size, size);
    const random = rand(5);
    const rows = 12, cols = 10;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const x = ((col + (row % 2) * 0.5) * size) / cols, y = (row * size) / rows;
        const shade = 190 + Math.floor(random() * 50);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.beginPath();
        ctx.roundRect(x - size / cols / 2 + 1, y + 1, size / cols - 2, size / rows + 2, [0, 0, 6, 6]);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x - size / cols / 2 + 1, y + size / rows - 1, size / cols - 2, 2);
      }
    }
  }), 2));
  const brick = keep(toTexture(canvas(256, (ctx, size) => {
    ctx.fillStyle = '#cfc8c0';
    ctx.fillRect(0, 0, size, size);
    const random = rand(17);
    const rows = 16, cols = 8;
    for (let row = 0; row < rows; row += 1) {
      for (let col = -1; col <= cols; col += 1) {
        const x = ((col + (row % 2) * 0.5) * size) / cols, y = (row * size) / rows;
        const shade = 205 + Math.floor(random() * 45);
        ctx.fillStyle = `rgb(${shade},${shade - 8},${shade - 14})`;
        ctx.fillRect(x + 1.5, y + 1.5, size / cols - 3, size / rows - 3);
      }
    }
  }), 1));

  // Seamless ripples: a height field from sine waves with whole-number frequencies, turned
  // into a normal map.
  const waterNormal = keep((() => {
    const size = 256;
    const heights = new Float32Array(size * size);
    const waves = [[3, 1, 0.5], [1, 4, 0.35], [5, 3, 0.2], [7, -2, 0.12], [-4, 6, 0.15]];
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      let h = 0;
      for (const [fx, fy, amp] of waves) h += Math.sin(((x * fx + y * fy) / size) * Math.PI * 2) * amp;
      heights[y * size + x] = h;
    }
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const h = (dx: number, dy: number) => heights[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const nx = (h(-1, 0) - h(1, 0)) * 2.5, ny = (h(0, -1) - h(0, 1)) * 2.5;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = ((nx / length) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 24);
    texture.needsUpdate = true;
    return texture;
  })());

  // Facades: walls with framed windows, plus a night map where some windows glow.
  const facades = new Map<string, { map: THREE.Texture; emissiveMap: THREE.Texture }>();
  const facade = (style: FacadeStyle) => {
    const key = JSON.stringify(style);
    const cached = facades.get(key);
    if (cached) return cached;
    const size = 512;
    const random = rand(style.seed ?? 3);
    const lit = new Set<number>();
    for (let i = 0; i < style.cols * style.rows; i += 1) if (random() < 0.55) lit.add(i);
    const cellW = size / style.cols, cellH = size / style.rows;
    const drawWindows = (ctx: CanvasRenderingContext2D, night: boolean) => {
      for (let row = 0; row < style.rows; row += 1) {
        for (let col = 0; col < style.cols; col += 1) {
          const isDoor = style.door && row === style.rows - 1 && col === Math.floor(style.cols / 2);
          const w = style.glass ? cellW - 4 : cellW * 0.56, h = isDoor ? cellH * 0.86 : style.glass ? cellH - 4 : cellH * 0.6;
          const x = col * cellW + (cellW - w) / 2, y = row * cellH + (isDoor ? cellH - h : (cellH - h) / 2);
          if (night) {
            ctx.fillStyle = isDoor ? '#000' : lit.has(row * style.cols + col) ? `hsl(${38 + random() * 12}, 90%, ${55 + random() * 15}%)` : '#000';
            ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
            continue;
          }
          ctx.fillStyle = style.frame;
          ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
          const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
          gradient.addColorStop(0, isDoor ? '#5b4636' : style.window);
          gradient.addColorStop(1, isDoor ? '#3e2f24' : '#e9f6ff');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, w, h);
          if (!style.glass && !isDoor) {
            ctx.fillStyle = style.frame;
            ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
            ctx.fillRect(x, y + h * 0.45 - 1.5, w, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(x - 4, y + h + 3, w + 8, 4); // sill shadow
          }
        }
      }
    };
    const map = keep(toTexture(canvas(size, ctx => {
      ctx.fillStyle = style.wall;
      ctx.fillRect(0, 0, size, size);
      if (!style.glass) {
        const grain = rand(9);
        for (let i = 0; i < 2500; i += 1) { ctx.fillStyle = `rgba(0,0,0,${grain() * 0.05})`; ctx.fillRect(grain() * size, grain() * size, 2, 2); }
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let row = 1; row < style.rows; row += 1) ctx.fillRect(0, row * cellH - 2, size, 3); // floor lines
      }
      drawWindows(ctx, false);
    })));
    const emissiveMap = keep(toTexture(canvas(size, ctx => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      drawWindows(ctx, true);
    })));
    const result = { map, emissiveMap };
    facades.set(key, result);
    return result;
  };

  const label = (text: string, color = '#1d3b4d') => keep(toTexture(canvas(256, ctx => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(8, 88, 240, 80, 24);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 129);
  }), 1));

  const glow = keep(toTexture(canvas(128, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,214,140,1)');
    gradient.addColorStop(0.35, 'rgba(255,196,110,0.55)');
    gradient.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }), 1));

  return { grass, asphalt, pavement, roof, brick, waterNormal, glow, facade, label, dispose: () => owned.forEach(texture => texture.dispose()) };
};
