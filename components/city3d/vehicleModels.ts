import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The vehicles on the city's roads. Sizes are real-world at ~10 m a tile, facing +z. Each model
// is two merged meshes: its paintwork (coloured per vehicle) and fixed details (glass, bumpers,
// lamps, signs) coloured per vertex, so every model costs two draw calls however many there are.
// Half a vehicle's length and width. Cars are 4.5 m by 1.8 m; buses and trams are longer.
export interface VehicleSize { half: number; side: number }
export const CAR_SIZE: VehicleSize = { half: 0.225, side: 0.09 };
export type VehicleModel = 'sedan' | 'hatchback' | 'suv' | 'pickup' | 'van' | 'taxi' | 'bus' | 'tram' | 'garbage' | 'police' | 'tow';
export interface VehicleSpec {
  length: number; width: number; speed: number; // speed relative to a car
  wheels: Array<[number, number]>; wheelRadius: number;
  lamp: { y: number; width: number }; // headlights across the front
  colors: string[];
}
const carWheels = (length: number, width: number): Array<[number, number]> => [[-width * 0.47, length * 0.32], [width * 0.47, length * 0.32], [-width * 0.47, -length * 0.32], [width * 0.47, -length * 0.32]];
export const VEHICLES: Record<VehicleModel, VehicleSpec> = {
  sedan: { length: 0.45, width: 0.18, speed: 1, wheels: carWheels(0.45, 0.18), wheelRadius: 0.034, lamp: { y: 0.075, width: 0.14 }, colors: ['#d62828', '#f7f7f2', '#1d3557', '#2a9d8f', '#6c757d', '#111111', '#8ecae6', '#9b2226'] },
  hatchback: { length: 0.38, width: 0.17, speed: 1, wheels: carWheels(0.38, 0.17), wheelRadius: 0.032, lamp: { y: 0.075, width: 0.13 }, colors: ['#e76f51', '#f4d35e', '#90be6d', '#43aa8b', '#f7f7f2', '#577590', '#c44569'] },
  suv: { length: 0.47, width: 0.19, speed: 0.95, wheels: carWheels(0.47, 0.19), wheelRadius: 0.04, lamp: { y: 0.09, width: 0.15 }, colors: ['#264653', '#111111', '#f7f7f2', '#6b705c', '#7f5539', '#adb5bd'] },
  pickup: { length: 0.5, width: 0.19, speed: 0.9, wheels: carWheels(0.5, 0.19), wheelRadius: 0.04, lamp: { y: 0.085, width: 0.15 }, colors: ['#bc4749', '#386641', '#f2e8cf', '#1d3557', '#6c757d'] },
  van: { length: 0.5, width: 0.19, speed: 0.85, wheels: carWheels(0.5, 0.19), wheelRadius: 0.036, lamp: { y: 0.08, width: 0.15 }, colors: ['#f7f7f2', '#e9ecef', '#ffb703', '#219ebc'] },
  taxi: { length: 0.45, width: 0.18, speed: 1.05, wheels: carWheels(0.45, 0.18), wheelRadius: 0.034, lamp: { y: 0.075, width: 0.14 }, colors: ['#f2c230'] },
  bus: { length: 0.8, width: 0.22, speed: 0.75, wheels: [[-0.1, 0.27], [0.1, 0.27], [-0.1, -0.24], [0.1, -0.24]], wheelRadius: 0.045, lamp: { y: 0.07, width: 0.17 }, colors: ['#d62828', '#2a9d8f', '#1d6fb8', '#e07a1f'] },
  garbage: { length: 0.65, width: 0.23, speed: 0.65, wheels: [[-0.105, 0.22], [0.105, 0.22], [-0.105, -0.1], [0.105, -0.1], [-0.105, -0.23], [0.105, -0.23]], wheelRadius: 0.045, lamp: { y: 0.08, width: 0.18 }, colors: ['#3b8652'] },
  police: { length: 0.45, width: 0.18, speed: 1, wheels: carWheels(0.45, 0.18), wheelRadius: 0.034, lamp: { y: 0.075, width: 0.14 }, colors: ['#f3f5f5'] },
  tow: { length: 0.72, width: 0.25, speed: 0.7, wheels: [[-0.105, 0.23], [0.105, 0.23], [-0.105, -0.14], [0.105, -0.14], [-0.105, -0.27], [0.105, -0.27]], wheelRadius: 0.045, lamp: { y: 0.08, width: 0.18 }, colors: ['#e5a13a'] },
  // One section of an articulated tram; a tram is two, coupled 0.36 apart.
  tram: { length: 0.34, width: 0.2, speed: 0.8, wheels: [], wheelRadius: 0.03, lamp: { y: 0.075, width: 0.15 }, colors: ['#1f8a8a', '#c0392b', '#2e5e9e'] },
};
export const TRAM_SECTION = 0.36; // distance between the two section centres
export const TRAM_LENGTH = TRAM_SECTION + VEHICLES.tram.length;

const GLASS = '#1c2833', DARK = '#2b2d30', CHROME = '#c9ced3', TAIL = '#b3131b', WHITE = '#f4f4f0';
interface Builder { paint: THREE.BufferGeometry[]; detail: THREE.BufferGeometry[] }
const prepare = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, color?: string) => {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry).translate(x, y, z);
  if (geometry.index) geometry.dispose();
  g.deleteAttribute('uv');
  if (color) { const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
};
// Boxes sit on y (their base), like the building kit.
const box = (b: Builder, w: number, h: number, d: number, x: number, y: number, z: number, color?: string, radius = 0) => {
  const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, Math.min(w, h, d) / 2.2)) : new THREE.BoxGeometry(w, h, d);
  (color ? b.detail : b.paint).push(prepare(geometry, x, y + h / 2, z, color));
};
const lamps = (b: Builder, length: number, width: number, y: number) => {
  for (const s of [-1, 1]) box(b, width * 0.2, 0.018, 0.006, s * width * 0.36, y, -length / 2 - 0.002, TAIL);
  box(b, width * 0.96, 0.022, 0.016, 0, y - 0.04, length / 2 - 0.002, DARK); box(b, width * 0.96, 0.022, 0.016, 0, y - 0.04, -length / 2 + 0.002, DARK);
};
// A cabin: glass all round with a painted roof and pillars.
const cabin = (b: Builder, w: number, h: number, d: number, y: number, z: number) => {
  box(b, w, h, d, 0, y, z, GLASS, 0.02);
  box(b, w * 1.02, 0.014, d * 0.94, 0, y + h - 0.004, z, undefined, 0.006);
  for (const s of [-1, 1]) box(b, w * 1.03, h * 0.9, 0.012, 0, y, z + s * d * 0.47);
};

const recipes: Record<VehicleModel, (b: Builder) => void> = {
  police: b => {
    recipes.sedan(b);
    for (const side of [-1, 1]) { box(b, 0.004, 0.035, 0.35, side * 0.092, 0.065, 0, '#1f3852'); box(b, 0.025, 0.025, 0.007, side * 0.04, 0.165, -0.02, side < 0 ? '#dd3446' : '#388bf0'); }
    box(b, 0.12, 0.01, 0.04, 0, 0.158, -0.02, DARK);
  },
  tow: b => {
    box(b, 0.23, 0.055, 0.72, 0, 0.035, 0, DARK);
    box(b, 0.23, 0.16, 0.22, 0, 0.065, 0.235, undefined, 0.02);
    box(b, 0.2, 0.065, 0.006, 0, 0.14, 0.348, GLASS);
    for (const side of [-1, 1]) { box(b, 0.004, 0.06, 0.13, side * 0.116, 0.145, 0.23, GLASS); box(b, 0.03, 0.025, 0.04, side * 0.065, 0.225, 0.22, '#ffc34d'); }
    box(b, 0.24, 0.025, 0.44, 0, 0.09, -0.13, '#6e7780');
    box(b, 0.22, 0.08, 0.025, 0, 0.105, 0.08, '#d18c2f');
    for (const side of [-1, 1]) box(b, 0.015, 0.025, 0.44, side * 0.12, 0.11, -0.13, '#e8b44e');
    lamps(b, 0.72, 0.23, 0.08);
  },
  sedan: b => { box(b, 0.18, 0.07, 0.45, 0, 0.03, 0, undefined, 0.03); cabin(b, 0.155, 0.06, 0.23, 0.095, -0.025); lamps(b, 0.45, 0.18, 0.07); },
  hatchback: b => { box(b, 0.17, 0.07, 0.38, 0, 0.03, 0, undefined, 0.03); cabin(b, 0.15, 0.065, 0.24, 0.095, -0.05); lamps(b, 0.38, 0.17, 0.07); },
  suv: b => {
    box(b, 0.19, 0.09, 0.47, 0, 0.035, 0, undefined, 0.03); cabin(b, 0.17, 0.075, 0.31, 0.12, -0.04); lamps(b, 0.47, 0.19, 0.085);
    for (const s of [-1, 1]) box(b, 0.008, 0.008, 0.26, s * 0.07, 0.2, -0.04, CHROME);
    box(b, 0.07, 0.07, 0.025, 0, 0.06, -0.24, DARK, 0.02); // spare wheel
  },
  pickup: b => {
    box(b, 0.19, 0.075, 0.5, 0, 0.035, 0, undefined, 0.025); cabin(b, 0.17, 0.07, 0.17, 0.105, 0.08); lamps(b, 0.5, 0.19, 0.08);
    box(b, 0.17, 0.004, 0.22, 0, 0.111, -0.12, DARK);
    for (const s of [-1, 1]) box(b, 0.012, 0.035, 0.24, s * 0.089, 0.105, -0.12);
    box(b, 0.19, 0.035, 0.012, 0, 0.105, -0.245);
  },
  van: b => {
    box(b, 0.19, 0.17, 0.5, 0, 0.035, -0.01, undefined, 0.03);
    box(b, 0.17, 0.06, 0.012, 0, 0.13, 0.243, GLASS); for (const s of [-1, 1]) box(b, 0.004, 0.05, 0.12, s * 0.096, 0.135, 0.17, GLASS);
    lamps(b, 0.5, 0.19, 0.075); box(b, 0.004, 0.06, 0.2, 0.096, 0.08, -0.08, '#d0d4d8');
  },
  taxi: b => {
    recipes.sedan(b);
    box(b, 0.07, 0.025, 0.035, 0, 0.158, -0.025, '#fff3b0');
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) box(b, 0.003, 0.012, 0.025, s * 0.091, 0.075, -0.1 + i * 0.03, i % 2 ? DARK : WHITE);
  },
  bus: b => {
    box(b, 0.22, 0.21, 0.8, 0, 0.03, 0, undefined, 0.035);
    box(b, 0.215, 0.012, 0.76, 0, 0.24, 0, WHITE, 0.005);
    for (const s of [-1, 1]) box(b, 0.004, 0.065, 0.66, s * 0.111, 0.15, -0.04, GLASS);
    box(b, 0.19, 0.1, 0.006, 0, 0.11, 0.401, GLASS); box(b, 0.16, 0.025, 0.006, 0, 0.215, 0.403, '#ffb703');
    box(b, 0.004, 0.15, 0.08, 0.111, 0.05, 0.27, '#3d4a55'); box(b, 0.004, 0.15, 0.08, 0.111, 0.05, -0.05, '#3d4a55');
    box(b, 0.12, 0.03, 0.18, 0, 0.252, -0.2, '#9aa3ab', 0.01);
    for (const s of [-1, 1]) box(b, 0.04, 0.02, 0.006, s * 0.08, 0.07, -0.402, TAIL);
    box(b, 0.22, 0.03, 0.02, 0, 0.03, 0.395, DARK); box(b, 0.22, 0.03, 0.02, 0, 0.03, -0.395, DARK);
  },
  garbage: b => {
    box(b, 0.23, 0.055, 0.65, 0, 0.035, 0, '#344239');
    box(b, 0.23, 0.22, 0.41, 0, 0.08, -0.1, undefined, 0.03);
    box(b, 0.22, 0.17, 0.19, 0, 0.065, 0.225, '#f3f0db', 0.02);
    box(b, 0.19, 0.07, 0.005, 0, 0.14, 0.322, GLASS);
    for (const s of [-1, 1]) {
      box(b, 0.004, 0.065, 0.11, s * 0.111, 0.145, 0.225, GLASS);
      box(b, 0.005, 0.026, 0.32, s * 0.117, 0.17, -0.1, WHITE);
      box(b, 0.035, 0.022, 0.03, s * 0.065, 0.24, 0.25, '#f3a920');
      box(b, 0.025, 0.08, 0.012, s * 0.085, 0.07, -0.325, '#f1c345');
    }
    box(b, 0.19, 0.12, 0.008, 0, 0.09, -0.312, DARK);
    box(b, 0.2, 0.015, 0.08, 0, 0.075, -0.285, '#6c7d6c');
    lamps(b, 0.65, 0.23, 0.08);
  },
  tram: b => {
    box(b, 0.2, 0.19, 0.34, 0, 0.035, 0, undefined, 0.045);
    box(b, 0.19, 0.03, 0.33, 0, 0.035, 0, DARK, 0.01);
    for (const s of [-1, 1]) box(b, 0.004, 0.075, 0.28, s * 0.101, 0.13, 0, GLASS);
    box(b, 0.17, 0.08, 0.006, 0, 0.13, 0.171, GLASS); box(b, 0.17, 0.08, 0.006, 0, 0.13, -0.171, GLASS);
    box(b, 0.18, 0.012, 0.3, 0, 0.225, 0, WHITE, 0.005);
    box(b, 0.006, 0.08, 0.006, 0, 0.237, 0.04, DARK); box(b, 0.1, 0.006, 0.006, 0, 0.315, 0.04, DARK);
  },
};

export function vehicleGeometry(model: VehicleModel) {
  const b: Builder = { paint: [], detail: [] };
  recipes[model](b);
  const paint = mergeGeometries(b.paint)!, detail = mergeGeometries(b.detail)!;
  [...b.paint, ...b.detail].forEach(g => g.dispose());
  return { paint, detail };
}
