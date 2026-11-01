import * as THREE from 'three';
import type { ModelContext } from './models';

// Shared construction primitives, in a one-tile coordinate system. Building recipes
// choose their own massing and features; there is no generic building-body fallback.
export class BuildingKit {
  group = new THREE.Group();
  constructor(public c: ModelContext, public level: number) {}
  mat(color: string, extra?: THREE.MeshStandardMaterialParameters) { return this.c.std(color, extra); }
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, name = '') {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh;
  }
  box(w: number, h: number, d: number, x = 0, y = 0.035, z = 0, color = '#e5dfcf', name = '') {
    return this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(color), x, y + h / 2, z, name);
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
  roof(w: number, d: number, h: number, x: number, y: number, z: number, color = '#975e4e') {
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(0, h); shape.lineTo(w / 2, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); geometry.translate(0, 0, -d / 2);
    return this.mesh(geometry, this.mat(color), x, y, z, 'pitched-roof');
  }
  arch(w: number, d: number, h: number, x: number, y: number, z: number, color = '#9bbcc1') {
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0);
    for (let i = 0; i <= 16; i++) { const t = Math.PI - i * Math.PI / 16; shape.lineTo(Math.cos(t) * w / 2, Math.sin(t) * h); }
    shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); geometry.translate(0, 0, -d / 2);
    return this.mesh(geometry, this.mat(color), x, y, z, 'vaulted-roof');
  }
  block(w: number, h: number, d: number, x = 0, z = 0, wall = '#ddd8c9', floors = 2, y = 0.04, glass = false) {
    const material = this.c.facade({ wall, window: glass ? '#7aafc8' : '#7795a7', frame: glass ? '#dce7ec' : '#f3ead9', cols: Math.max(2, Math.round(w * 8)), rows: floors, door: true, glass, seed: Math.round((w + h + d) * 100) });
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, 'occupied-building');
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
  vehicle(x: number, z: number, color: string, length = 0.26) {
    this.box(length * 0.44, 0.075, length, x, 0.07, z, color, 'vehicle');
    this.box(length * 0.39, 0.04, length * 0.65, x, 0.145, z, '#8eafc3');
    for (const side of [-1, 1]) for (const end of [-1, 1]) { const wheel = this.cyl(0.025, 0.018, x + side * length * 0.23, 0.04, z + end * length * 0.3, '#41474a'); wheel.rotation.z = Math.PI / 2; }
  }
  stairs(x: number, z: number, width: number, steps = 3) {
    for (let i = 0; i < steps; i++) this.box(width, 0.025 * (i + 1), 0.035, x, 0.035, z - i * 0.03, '#dbd6c5');
  }
  cross(x: number, y: number, z: number, color = '#c75e52', size = 0.12) {
    this.box(size, size * 0.3, 0.012, x, y + size * 0.35, z, color); this.box(size * 0.3, size, 0.012, x, y, z, color);
  }
}
export type BuildingRecipe = (kit: BuildingKit) => void;
