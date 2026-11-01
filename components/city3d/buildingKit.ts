import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ModelContext } from './models';

// Shared construction primitives, in a one-tile coordinate system. Building recipes
// choose their own massing and features; there is no generic building-body fallback.

// Larger parts get softly rounded edges; slats, rails and trim stay crisp (and cheap).
const softBox = (w: number, h: number, d: number) => {
  const least = Math.min(w, h, d);
  return least >= 0.04 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.012, least / 5)) : new THREE.BoxGeometry(w, h, d);
};
// A lighter (amount > 0) or darker (amount < 0) version of a colour, for trim.
const shade = (color: string, amount: number) => `#${new THREE.Color(color).lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#1d2528'), Math.abs(amount)).getHexString()}`;

export class BuildingKit {
  group = new THREE.Group();
  constructor(public c: ModelContext, public level: number) {}
  mat(color: string, extra?: THREE.MeshStandardMaterialParameters) { return this.c.std(color, extra); }
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, name = '') {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh;
  }
  box(w: number, h: number, d: number, x = 0, y = 0.035, z = 0, color = '#e5dfcf', name = '') {
    return this.mesh(softBox(w, h, d), this.mat(color), x, y + h / 2, z, name);
  }
  cyl(r: number, h: number, x = 0, y = 0.035, z = 0, color = '#bac3c5', top = r, name = '') {
    return this.mesh(new THREE.CylinderGeometry(top, r, h, 16), this.mat(color), x, y + h / 2, z, name);
  }
  ball(r: number, x: number, y: number, z: number, color = '#6b9b62', name = '') {
    return this.mesh(new THREE.IcosahedronGeometry(r, 1), this.mat(color), x, y, z, name);
  }
  dome(r: number, x: number, y: number, z: number, color = '#7ba8af') {
    return this.mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(color), x, y, z);
  }
  ring(r: number, tube: number, x: number, y: number, z: number, color = '#eef0df', horizontal = false) {
    const mesh = this.mesh(new THREE.TorusGeometry(r, tube, 6, 24), this.mat(color), x, y, z);
    if (horizontal) mesh.rotation.x = Math.PI / 2; return mesh;
  }
  annulus(outer: number, inner: number, height: number, y: number, color: string) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 }); geometry.rotateX(-Math.PI / 2);
    return this.mesh(geometry, this.mat(color), 0, y, 0, 'seating-tier');
  }
  domeSlit(r: number, x: number, y: number, z: number) {
    const mesh = this.mesh(new THREE.TorusGeometry(r, 0.014, 4, 24, Math.PI), this.mat('#586f77'), x, y, z, 'telescope-dome-slit'); mesh.rotation.y = Math.PI / 2; return mesh;
  }
  beam(a: number[], b: number[], radius = 0.008, color = '#64777d') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = this.mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), this.mat(color));
    mesh.position.copy(start.add(end).multiplyScalar(0.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  // Pitched roof along x with eaves that overhang the walls and a darker ridge cap.
  roof(w: number, d: number, h: number, x: number, y: number, z: number, color = '#975e4e', eave = 0.018) {
    const half = w / 2 + eave;
    const shape = new THREE.Shape(); shape.moveTo(-half, -0.004); shape.lineTo(0, h); shape.lineTo(half, -0.004); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d + eave * 2, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
    geometry.translate(0, 0, -(d + eave * 2) / 2);
    const roof = this.mesh(geometry, this.mat(color), x, y, z, 'pitched-roof');
    this.box(0.018, 0.012, d + eave * 2 + 0.01, x, y + h - 0.006, z, shade(color, -0.25), 'roof-ridge');
    return roof;
  }
  arch(w: number, d: number, h: number, x: number, y: number, z: number, color = '#9bbcc1') {
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0);
    for (let i = 0; i <= 16; i++) { const t = Math.PI - i * Math.PI / 16; shape.lineTo(Math.cos(t) * w / 2, Math.sin(t) * h); }
    shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); geometry.translate(0, 0, -d / 2);
    return this.mesh(geometry, this.mat(color), x, y, z, 'vaulted-roof');
  }
  block(w: number, h: number, d: number, x = 0, z = 0, wall = '#ddd8c9', floors = 2, y = 0.04, glass = false) {
    const material = this.c.facade({ wall, window: glass ? '#7aafc8' : '#7795a7', frame: glass ? '#dce7ec' : '#f3ead9', cols: Math.max(2, Math.round(w * 8)), rows: floors, door: true, glass, seed: Math.round((w + h + d) * 100) });
    const body = this.mesh(softBox(w, h, d), material, x, y + h / 2, z, 'occupied-building');
    // A darker plinth and a light cornice give every building a base and a finished top.
    if (h >= 0.12 && Math.min(w, d) >= 0.12) {
      this.box(w + 0.014, 0.014, d + 0.014, x, y, z, shade(wall, -0.3), 'plinth');
      this.box(w + 0.02, 0.014, d + 0.02, x, y + h - 0.007, z, shade(wall, 0.35), 'cornice');
    }
    return body;
  }
  plot(color = '#c9c5b9') { this.box(0.94, 0.035, 0.94, 0, 0, 0, color, 'plot'); }
  path(x: number, z: number, w: number, d: number, color = '#d6cbb5') { this.box(w, 0.012, d, x, 0.036, z, color); }
  shed(x: number, z: number, w = 0.26, d = 0.23, wall = '#b47955', height = 0.2) {
    this.block(w, height, d, x, z, wall, 1); this.roof(w + 0.025, d + 0.025, 0.1, x, height + 0.04, z, '#74594a');
  }
  fence(x: number, z: number, width: number, depth: number, color = '#dbd4bd') {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        this.box(0.014, 0.13, 0.014, x - width / 2 + width * i / 4, 0.04, z + side * depth / 2, color);
        this.box(0.014, 0.13, 0.014, x + side * width / 2, 0.04, z - depth / 2 + depth * i / 4, color);
      }
      this.box(width, 0.016, 0.012, x, 0.12, z + side * depth / 2, color);
      this.box(0.012, 0.016, depth, x + side * width / 2, 0.12, z, color);
    }
  }
  tree(x: number, z: number, height = 0.4, kind: 'round' | 'pine' | 'palm' = 'round', color = '#628d57') {
    this.cyl(0.018, height * 0.65, x, 0.04, z, '#896744');
    if (kind === 'pine') { for (let i = 0; i < 3; i++) this.cyl(height * (0.28 - i * 0.05), height * 0.45, x, 0.12 + i * height * 0.18, z, color, 0); }
    else if (kind === 'palm') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const leaf = this.box(height * 0.6, 0.014, 0.045, x + Math.cos(a) * height * 0.18, height * 0.8, z + Math.sin(a) * height * 0.18, color); leaf.rotation.y = -a; leaf.rotation.z = 0.2; } }
    else { this.ball(height * 0.23, x, height * 0.75, z, color); this.ball(height * 0.17, x + 0.04, height * 0.6, z, color); }
  }
  bench(x: number, z: number, rotation = 0) {
    const seat = this.box(0.16, 0.022, 0.055, x, 0.095, z, '#98774f'); seat.rotation.y = rotation;
    this.box(0.012, 0.07, 0.04, x - 0.055, 0.035, z, '#62716d'); this.box(0.012, 0.07, 0.04, x + 0.055, 0.035, z, '#62716d');
  }
  table(x: number, z: number, parasol = false, color = '#c07762') {
    this.cyl(0.012, 0.13, x, 0.04, z, '#63696a'); this.cyl(0.07, 0.015, x, 0.17, z, '#c8a779');
    if (parasol) { this.cyl(0.007, 0.2, x, 0.18, z, '#d2b98f'); this.cyl(0.105, 0.045, x, 0.35, z, color, 0); }
  }
  sign(x: number, y: number, z: number, w: number, color: string) { this.box(w, 0.07, 0.018, x, y, z, color, 'shop-sign'); }
  canopy(x: number, z: number, w: number, d: number, y: number, color = '#8ea4aa') {
    this.box(w, 0.025, d, x, y, z, color);
    for (const side of [-1, 1]) this.cyl(0.008, y - 0.04, x + side * (w / 2 - 0.02), 0.04, z, '#b3babe');
  }
  awning(x: number, y: number, z: number, w: number, color: string) {
    for (let i = 0; i < 6; i++) { const strip = this.box(w / 6, 0.018, 0.13, x - w / 2 + w * (i + 0.5) / 6, y, z, i % 2 ? '#f4ead5' : color); strip.rotation.x = 0.16; }
  }
  greenhouse(x: number, z: number, w: number, d: number, height = 0.2) {
    const glass = this.mat('#a6cbbd', { transparent: true, opacity: 0.72, roughness: 0.2 });
    this.mesh(new THREE.BoxGeometry(w, height, d), glass, x, 0.04 + height / 2, z);
    this.roof(w, d, 0.08, x, height + 0.04, z, '#b6d8ca');
    for (let i = 0; i < 5; i++) { const zz = z - d / 2 + i * d / 4; for (const side of [-1, 1]) this.beam([x + side * w / 2, 0.04, zz], [x + side * w / 2, height + 0.04, zz], 0.005, '#e2e7d9'); this.beam([x - w / 2, height + 0.04, zz], [x, height + 0.12, zz], 0.005, '#e2e7d9'); this.beam([x, height + 0.12, zz], [x + w / 2, height + 0.04, zz], 0.005, '#e2e7d9'); }
  }
  tank(x: number, z: number, radius: number, h = 0.12, water = '#5a9eae') {
    this.cyl(radius, h, x, 0.04, z, '#aebfc1'); this.cyl(radius * 0.88, 0.008, x, h + 0.04, z, water);
    this.ring(radius * 0.95, 0.008, x, h + 0.05, z, '#d8e3da', true);
  }
  boat(x: number, z: number, length = 0.42, color = '#8a453e', cabin = true) {
    const shape = new THREE.Shape(); shape.moveTo(-length * 0.24, -length * 0.22); shape.lineTo(length * 0.24, -length * 0.22); shape.lineTo(length * 0.2, length * 0.24); shape.lineTo(0, length * 0.5); shape.lineTo(-length * 0.2, length * 0.24); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.008, bevelSegments: 1 });
    geometry.rotateX(Math.PI / 2); this.mesh(geometry, this.mat(color), x, 0.18, z, 'boat-hull');
    this.box(length * 0.33, 0.012, length * 0.55, x, 0.185, z, '#d9cba4');
    if (cabin) this.block(length * 0.28, 0.09, length * 0.22, x, z - length * 0.08, '#f2eddc', 1, 0.2);
  }
  // A car facing +z: body, a set-back glass cabin, lights and four wheels.
  vehicle(x: number, z: number, color: string, length = 0.26) {
    const w = length * 0.46;
    this.wheels(x, z, w, length * 0.62, 0.024);
    this.box(w, 0.06, length, x, 0.052, z, color, 'vehicle');
    this.box(w * 0.86, 0.05, length * 0.52, x, 0.112, z - length * 0.06, color);
    this.box(w * 0.9, 0.038, length * 0.46, x, 0.116, z - length * 0.06, '#5d7f92');
    this.box(w * 0.82, 0.008, length * 0.5, x, 0.162, z - length * 0.06, shade(color, 0.25));
    this.lights(x, z, w, length, 0.075);
  }
  // A bus facing +z; `tram` adds a pantograph and `cars` splits it into a train.
  coach(x: number, z: number, color: string, length = 0.4, options: { tram?: boolean; cars?: number } = {}) {
    const w = 0.13, h = 0.125, base = 0.058;
    const cars = options.cars || 1, carLength = (length - (cars - 1) * 0.012) / cars;
    for (let n = 0; n < cars; n += 1) {
      const cz = z - length / 2 + carLength / 2 + n * (carLength + 0.012);
      const last = n === cars - 1;
      this.wheels(x, cz, w, carLength * 0.66, 0.026);
      this.box(w, h, carLength, x, base, cz, color, 'coach');
      this.box(w + 0.003, 0.042, carLength * (last ? 0.78 : 0.9), x, base + 0.056, cz - (last ? carLength * 0.06 : 0), '#2e4651');
      this.box(w + 0.003, 0.014, carLength * 0.96, x, base + 0.012, cz, shade(color, -0.3));
      this.box(w * 0.9, 0.012, carLength * 0.92, x, base + h, cz, '#e9ece6');
    }
    const front = z + length / 2;
    this.box(w - 0.02, 0.06, 0.006, x, base + 0.048, front + 0.001, '#2e4651');
    this.box(w - 0.04, 0.016, 0.007, x, base + h - 0.026, front + 0.002, '#f2b440', 'destination-sign');
    this.lights(x, z, w, length, base + 0.024);
    if (options.tram) {
      this.beam([x, base + h + 0.012, z], [x + 0.03, base + h + 0.07, z + 0.03], 0.004, '#4b5a5e');
      this.beam([x + 0.03, base + h + 0.07, z + 0.03], [x, base + h + 0.11, z], 0.004, '#4b5a5e');
      this.box(0.08, 0.006, 0.012, x, base + h + 0.11, z, '#4b5a5e');
    }
  }
  // A box truck facing +z; `ladder` makes it a fire engine.
  truck(x: number, z: number, color: string, length = 0.32, cargo = '#d6d4c2', ladder = false) {
    const w = 0.12, cab = length * 0.3;
    this.wheels(x, z, w, length * 0.64, 0.026);
    this.box(w, 0.09, cab, x, 0.056, z + length / 2 - cab / 2, color);
    this.box(w * 0.9, 0.036, 0.006, x, 0.1, z + length / 2 + 0.001, '#2e4651');
    this.box(w, 0.018, length, x, 0.05, z, shade(color, -0.35));
    if (ladder) {
      this.box(w * 0.9, 0.06, length - cab - 0.01, x, 0.066, z - cab / 2, color);
      for (const side of [-1, 1]) this.box(0.006, 0.006, length * 0.78, x + side * 0.03, 0.142, z - 0.02, '#d8d9d0');
      for (let i = 0; i < 7; i++) this.box(0.06, 0.005, 0.005, x, 0.142, z - length * 0.4 + i * length * 0.1, '#d8d9d0');
      this.box(0.03, 0.014, 0.03, x, 0.15, z + length / 2 - cab / 2, '#3d7bd1');
    } else this.box(w + 0.01, 0.13, length - cab - 0.01, x, 0.066, z - cab / 2, cargo, 'cargo-box');
    this.lights(x, z, w, length, 0.074);
  }
  wheels(x: number, z: number, w: number, base: number, r: number) {
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const wheel = this.cyl(r, 0.02, x + side * (w / 2 - 0.006), 0, z + end * base / 2, '#3a4043');
      wheel.rotation.z = Math.PI / 2; wheel.position.y = r + 0.012;
    }
  }
  lights(x: number, z: number, w: number, length: number, y: number) {
    for (const side of [-1, 1]) {
      this.box(0.016, 0.01, 0.005, x + side * (w / 2 - 0.016), y, z + length / 2 + 0.002, '#fff3c9');
      this.box(0.016, 0.01, 0.005, x + side * (w / 2 - 0.016), y, z - length / 2 - 0.002, '#c9453a');
    }
  }
  stairs(x: number, z: number, width: number, steps = 3) {
    for (let i = 0; i < steps; i++) this.box(width, 0.025 * (i + 1), 0.035, x, 0.035, z - i * 0.03, '#dbd6c5');
  }
  cross(x: number, y: number, z: number, color = '#c75e52', size = 0.12) {
    this.box(size, size * 0.3, 0.012, x, y + size * 0.35, z, color); this.box(size * 0.3, size, 0.012, x, y, z, color);
  }
}
export type BuildingRecipe = (kit: BuildingKit) => void;
