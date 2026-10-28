import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityTextures, FacadeStyle } from './textures';

// Building models, built from smooth primitives (rounded boxes, lathed towers, extruded roofs)
// and textured facades. Each model faces +z, sits on y = 0 and is centred on its footprint.
// bake() merges a model into one geometry per material, so the scene can draw every copy of
// it with a handful of InstancedMeshes.

export interface ModelContext {
  std: (color: string, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  facade: (style: FacadeStyle, tint?: string) => THREE.MeshStandardMaterial;
  textures: CityTextures;
}

export interface Prefab {
  parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; anim?: { kind: 'rotor' | 'beam'; pivot: THREE.Vector3 } }>;
  height: number;
  smoke: THREE.Vector3[];
}

type Builder = (c: ModelContext, level: number, size: number) => THREE.Group;

const place = (mesh: THREE.Mesh, x: number, y: number, z: number) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };
const add = (group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => { const mesh = place(new THREE.Mesh(geometry, material), x, y, z); group.add(mesh); return mesh; };
// A rounded box standing on y.
const block = (group: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, radius = 0.015) =>
  add(group, new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)), material, x, y + h / 2, z);
const cylinder = (group: THREE.Object3D, rTop: number, rBottom: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 24) =>
  add(group, new THREE.CylinderGeometry(rTop, rBottom, h, segments), material, x, y + h / 2, z);
const lathe = (group: THREE.Object3D, profile: Array<[number, number]>, material: THREE.Material, x = 0, y = 0, z = 0, segments = 40) =>
  add(group, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments), material, x, y, z);

// A pitched roof along x, extruded through depth d.
const gable = (group: THREE.Object3D, w: number, d: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, overhang = 0.04) => {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(0, h);
  shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(-w / 2 - overhang, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
  geometry.translate(0, 0, -(d + overhang * 2) / 2);
  return add(group, geometry, material, x, y, z);
};
const hipRoof = (group: THREE.Object3D, w: number, d: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
  const roof = add(group, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), material, x, y + h / 2, z);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w + 0.06, h, d + 0.06);
  return roof;
};

const tree = (c: ModelContext, group: THREE.Object3D, x: number, z: number, scale: number, conifer: boolean, tint = '#4c9a5c') => {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  t.scale.setScalar(scale);
  group.add(t);
  cylinder(t, 0.025, 0.04, 0.3, c.std('#7a5638', { roughness: 0.9 }), 0, 0, 0, 10);
  const leaves = c.std(tint, { roughness: 0.85 });
  if (conifer) {
    [[0.2, 0.32, 0.22], [0.16, 0.28, 0.4], [0.11, 0.22, 0.56]].forEach(([r, h, y]) => add(t, new THREE.ConeGeometry(r, h, 18), leaves, 0, y + h / 2, 0));
  } else {
    [[0, 0.42, 0, 0.17], [0.09, 0.36, 0.05, 0.12], [-0.08, 0.38, -0.05, 0.13], [0.02, 0.52, -0.02, 0.12]].forEach(([dx, y, dz, r]) => add(t, new THREE.IcosahedronGeometry(r, 2), leaves, dx, y, dz));
  }
  return t;
};

const columns = (c: ModelContext, group: THREE.Object3D, count: number, width: number, height: number, y: number, z: number, radius = 0.028) => {
  const stone = c.std('#efe9dc', { roughness: 0.6 });
  for (let i = 0; i < count; i += 1) {
    const x = -width / 2 + (i * width) / (count - 1);
    cylinder(group, radius, radius * 1.1, height, stone, x, y, z, 16);
    block(group, radius * 3, 0.025, radius * 3, stone, x, y, z, 0.004);
    block(group, radius * 3, 0.025, radius * 3, stone, x, y + height - 0.025, z, 0.004);
  }
};

const WALLS = ['#f1e3c8', '#f3d2c4', '#d9e6ee', '#e8e1f0', '#f6efe0'];
const ROOFS = ['#b8553d', '#6d4e44', '#4f6f8f', '#7c5a3e'];

const MODELS: Record<string, Builder> = {
  hall: c => {
    const g = new THREE.Group();
    const stone = c.std('#d8d2c4', { roughness: 0.7 });
    block(g, 1.82, 0.06, 1.82, c.std('#b9b3a6'), 0, 0, 0);
    block(g, 1.6, 0.05, 1.5, stone, 0, 0.06, 0.05);
    block(g, 1.4, 0.62, 1.0, c.facade({ wall: '#f2ead8', window: '#7aa6c2', frame: '#ffffff', cols: 7, rows: 2, door: true, seed: 2 }), 0, 0.11, -0.15);
    columns(c, g, 6, 1.1, 0.5, 0.11, 0.48, 0.032);
    block(g, 1.26, 0.06, 0.32, stone, 0, 0.61, 0.38);
    gable(g, 1.26, 0.3, 0.2, c.std('#efe9dc', { roughness: 0.6 }), 0, 0.67, 0.38, 0.01);
    block(g, 1.46, 0.06, 1.06, stone, 0, 0.73, -0.15);
    cylinder(g, 0.26, 0.28, 0.22, c.facade({ wall: '#f2ead8', window: '#7aa6c2', frame: '#fff', cols: 8, rows: 1, seed: 4 }), 0, 0.79, -0.15, 32);
    add(g, new THREE.SphereGeometry(0.27, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), c.std('#4f86a8', { roughness: 0.3, metalness: 0.5 }), 0, 1.01, -0.15);
    cylinder(g, 0.006, 0.006, 0.4, c.std('#444'), 0, 1.26, -0.15, 8);
    block(g, 0.16, 0.1, 0.008, c.std('#e2b23d'), 0.08, 1.54, -0.15, 0.002);
    return g;
  },
  cottage: (c, level) => {
    const g = new THREE.Group();
    const height = 0.36 + (level - 1) * 0.16;
    const wall = WALLS[level % WALLS.length];
    block(g, 0.64, height, 0.52, c.facade({ wall, window: '#8db7cf', frame: '#ffffff', cols: 2, rows: level, door: true, seed: 10 + level }), 0, 0, -0.06);
    hipRoof(g, 0.64, 0.52, 0.3, c.std(ROOFS[level % ROOFS.length], { map: c.textures.roof, roughness: 0.8 }), 0, height, -0.06);
    block(g, 0.08, 0.22, 0.08, c.std('#9c8b7a'), 0.18, height + 0.08, -0.18, 0.01);
    block(g, 0.68, 0.025, 0.12, c.std('#cbc4b4'), 0, 0, 0.27, 0.005); // front path
    if (level >= 2) { block(g, 0.26, 0.26, 0.2, c.facade({ wall, window: '#8db7cf', frame: '#fff', cols: 1, rows: 1, seed: 3 }), -0.2, 0, 0.26); gable(g, 0.26, 0.2, 0.1, c.std(ROOFS[0], { map: c.textures.roof }), -0.2, 0.26, 0.26); }
    if (level >= 3) { tree(c, g, 0.3, 0.32, 0.55, false); for (let i = 0; i < 6; i += 1) block(g, 0.015, 0.07, 0.015, c.std('#ffffff'), -0.4 + i * 0.13, 0, 0.42, 0.003); }
    return g;
  },
  townhouse: (c, level) => {
    const g = new THREE.Group();
    const floors = 2 + level;
    [-0.3, 0, 0.3].forEach((x, i) => {
      const height = floors * 0.18;
      block(g, 0.29, height, 0.62, c.facade({ wall: WALLS[(i + level) % WALLS.length], window: '#86aec7', frame: '#fff', cols: 2, rows: floors, door: true, seed: 20 + i }), x, 0, -0.05);
      gable(g, 0.29, 0.62, 0.16, c.std(ROOFS[(i + 1) % ROOFS.length], { map: c.textures.roof }), x, height, -0.05, 0.02);
      block(g, 0.06, 0.16, 0.06, c.std('#8f7f70'), x + 0.08, height + 0.06, -0.2, 0.008);
    });
    return g;
  },
  apartment: (c, level) => {
    const g = new THREE.Group();
    const floors = 5 + level * 2, height = floors * 0.24;
    block(g, 1.7, 0.04, 1.4, c.std('#c9c3b8'), 0, 0, 0);
    block(g, 1.55, height, 1.15, c.facade({ wall: ['#e9e1d3', '#d7dde4', '#e4d3c6'][level - 1], window: '#7fa8c4', frame: '#f8f8f8', cols: 6, rows: floors, door: true, seed: 30 + level }), 0, 0.04, -0.05);
    const slab = c.std('#f4f4f2', { roughness: 0.6 });
    const rail = c.std('#7d8a94', { roughness: 0.4, metalness: 0.6 });
    for (let floor = 1; floor < floors; floor += 1) {
      block(g, 1.5, 0.02, 0.14, slab, 0, 0.04 + floor * 0.24, 0.58, 0.005);
      block(g, 1.5, 0.06, 0.008, rail, 0, 0.06 + floor * 0.24, 0.65, 0.002);
    }
    block(g, 1.6, 0.06, 1.2, c.std('#8c8a86'), 0, 0.04 + height, -0.05, 0.01);
    block(g, 0.3, 0.16, 0.3, c.std('#a9a7a3'), 0.4, 0.1 + height, -0.25, 0.01);
    if (level >= 3) cylinder(g, 0.12, 0.12, 0.24, c.std('#b0b6bb', { metalness: 0.5, roughness: 0.4 }), -0.45, 0.1 + height, -0.2, 20);
    return g;
  },
  tower: (c, level) => {
    const g = new THREE.Group();
    const floors = 14 + level * 5, floorH = 0.2;
    const glass = c.facade({ wall: '#2e4a63', window: '#5d8db3', frame: '#c9d3db', cols: 8, rows: Math.round(floors / 2), glass: true, seed: 40 + level }, '#ffffff');
    glass.metalness = 0.6; glass.roughness = 0.15;
    block(g, 1.8, 0.05, 1.8, c.std('#bdb8ae'), 0, 0, 0);
    block(g, 1.5, 0.5, 1.5, c.facade({ wall: '#d9d5cc', window: '#6f97b3', frame: '#efefef', cols: 6, rows: 2, door: true, seed: 41 }), 0, 0.05, 0);
    block(g, 1.15, floors * floorH, 1.15, glass, 0, 0.55, 0, 0.03);
    block(g, 1.2, 0.08, 1.2, c.std('#d8dde2', { metalness: 0.4, roughness: 0.4 }), 0, 0.55 + floors * floorH, 0, 0.01);
    block(g, 0.7, 0.5, 0.7, glass, 0, 0.63 + floors * floorH, 0, 0.02);
    cylinder(g, 0.012, 0.02, 0.7, c.std('#c8c8c8', { metalness: 0.8, roughness: 0.3 }), 0, 1.13 + floors * floorH, 0, 10);
    return g;
  },
  cafe: (c, level) => {
    const g = new THREE.Group();
    const height = 0.36 + (level - 1) * 0.18;
    block(g, 0.7, height, 0.5, c.facade({ wall: '#f7e7cf', window: '#a9cfe0', frame: '#5a3d2b', cols: 3, rows: level, door: true, seed: 50 }), 0, 0, -0.1);
    block(g, 0.74, 0.04, 0.54, c.std('#5a3d2b'), 0, height, -0.1, 0.008);
    for (let i = 0; i < 7; i += 1) {
      const stripe = block(g, 0.1, 0.012, 0.2, c.std(i % 2 ? '#fdfdfd' : '#c8423b', { roughness: 0.9 }), -0.3 + i * 0.1, 0.27, 0.24, 0.003);
      stripe.rotation.x = -0.35;
    }
    const tables = level >= 2 ? [-0.22, 0.22] : [0.2];
    tables.forEach(x => {
      cylinder(g, 0.006, 0.006, 0.2, c.std('#333'), x, 0, 0.38, 8);
      add(g, new THREE.ConeGeometry(0.13, 0.06, 24), c.std(level >= 3 ? '#e9b949' : '#e8e2d6'), x, 0.23, 0.38);
      cylinder(g, 0.05, 0.05, 0.012, c.std('#f2f2f2'), x, 0.1, 0.38, 20);
    });
    return g;
  },
  shop: (c, level) => {
    const g = new THREE.Group();
    const floors = 1 + level;
    block(g, 0.7, floors * 0.2, 0.6, c.facade({ wall: WALLS[(level + 2) % WALLS.length], window: '#90bdd6', frame: '#ffffff', cols: 3, rows: floors, door: true, seed: 60 + level }), 0, 0, -0.05);
    block(g, 0.72, 0.07, 0.04, c.std('#2f7d5b'), 0, 0.17, 0.27, 0.01); // shop sign
    block(g, 0.74, 0.04, 0.64, c.std('#7a746c'), 0, floors * 0.2, -0.05, 0.01);
    return g;
  },
  market: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.8, 0.04, 1.8, c.std('#d9d3c6', { map: c.textures.pavement }), 0, 0, 0);
    block(g, 1.5, 0.4, 1.0, c.facade({ wall: '#e3d2b8', window: '#9fc4d6', frame: '#7b4b33', cols: 6, rows: 1, door: true, seed: 70 }), 0, 0.04, -0.2);
    const vault = add(g, new THREE.CylinderGeometry(0.52, 0.52, 1.52, 40, 1, false, 0, Math.PI), c.std('#7a9a8a', { roughness: 0.4, metalness: 0.3 }), 0, 0.44, -0.2);
    vault.rotation.z = Math.PI / 2; vault.rotation.y = Math.PI / 2; vault.scale.set(1, 1, 0.55);
    const colors = ['#d9534f', '#4f8fd8', '#f0ad4e', '#5cb85c', '#9b59b6'];
    for (let i = 0; i < 2 + level; i += 1) {
      const x = -0.65 + i * (1.3 / (1 + level));
      block(g, 0.26, 0.12, 0.2, c.std('#8a6446'), x, 0.04, 0.6, 0.01);
      add(g, new THREE.ConeGeometry(0.2, 0.12, 4), c.std(colors[i % colors.length], { roughness: 0.9 }), x, 0.32, 0.6).rotation.y = Math.PI / 4;
      cylinder(g, 0.006, 0.006, 0.14, c.std('#555'), x, 0.16, 0.6, 6);
    }
    return g;
  },
  office: (c, level) => {
    const g = new THREE.Group();
    const floors = 8 + level * 4, floorH = 0.21;
    const glass = c.facade({ wall: '#3b5568', window: '#7fb0cf', frame: '#dfe6ec', cols: 10, rows: floors, glass: true, seed: 80 + level }, '#ffffff');
    glass.metalness = 0.55; glass.roughness = 0.12;
    block(g, 1.8, 0.05, 1.8, c.std('#cfc9be', { map: c.textures.pavement }), 0, 0, 0);
    block(g, 1.4, floors * floorH, 1.2, glass, 0, 0.05, -0.05, 0.02);
    const fin = c.std('#e4e8ec', { metalness: 0.5, roughness: 0.3 });
    [-0.7, 0.7].forEach(x => block(g, 0.04, floors * floorH, 1.22, fin, x, 0.05, -0.05, 0.004));
    block(g, 1.44, 0.07, 1.24, fin, 0, 0.05 + floors * floorH, -0.05, 0.01);
    block(g, 0.5, 0.2, 0.4, c.std('#9aa3aa'), 0.3, 0.12 + floors * floorH, -0.2, 0.01);
    return g;
  },
  bank: (c, level) => {
    const g = new THREE.Group();
    const stone = c.std('#ebe5d6', { roughness: 0.6 });
    const height = 0.6 + (level - 1) * 0.18;
    block(g, 1.8, 0.05, 1.6, c.std('#c2bcae'), 0, 0, 0);
    for (let i = 0; i < 3; i += 1) block(g, 1.5 - i * 0.04, 0.035, 0.4 - i * 0.06, stone, 0, 0.05 + i * 0.035, 0.6 - i * 0.03, 0.004);
    block(g, 1.4, height, 1.0, c.facade({ wall: '#efe8da', window: '#6f93ad', frame: '#d8cfbc', cols: 5, rows: level + 1, seed: 90 }), 0, 0.15, -0.15);
    columns(c, g, 8, 1.3, height, 0.15, 0.42, 0.034);
    block(g, 1.46, 0.07, 1.2, stone, 0, 0.15 + height, -0.05);
    gable(g, 1.46, 0.36, 0.22, stone, 0, 0.22 + height, 0.42, 0.01);
    const gold = c.std('#e0b34a', { metalness: 0.9, roughness: 0.25 });
    add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 32), gold, 0, 0.3 + height, 0.62).rotation.x = Math.PI / 2;
    return g;
  },
  workshop: (c, level) => {
    const g = new THREE.Group();
    const height = 0.34 + (level - 1) * 0.1;
    block(g, 0.82, height, 0.62, c.std('#b87b5d', { map: c.textures.brick, roughness: 0.9 }), 0, 0, 0);
    const roof = c.std('#7b8a93', { metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < 3; i += 1) gable(g, 0.27, 0.62, 0.14, roof, -0.27 + i * 0.27, height, 0, 0.01);
    block(g, 0.3, 0.24, 0.02, c.std('#5b6770', { metalness: 0.6, roughness: 0.4 }), -0.15, 0, 0.31, 0.004);
    const chimneyH = 0.5 + level * 0.1;
    cylinder(g, 0.04, 0.055, chimneyH, c.std('#8a5a44', { map: c.textures.brick }), 0.3, height, -0.18, 16);
    g.userData.smoke = [new THREE.Vector3(0.3, height + chimneyH, -0.18)];
    return g;
  },
  factory: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.04, 1.85, c.std('#9c9a94'), 0, 0, 0);
    const height = 0.45 + (level - 1) * 0.12;
    block(g, 1.3, height, 1.1, c.std('#c9c3b7', { map: c.textures.brick }), -0.15, 0.04, 0.1);
    const roof = c.std('#6f7d86', { metalness: 0.5, roughness: 0.45 });
    for (let i = 0; i < 4; i += 1) gable(g, 0.32, 1.1, 0.16, roof, -0.64 + i * 0.33, 0.04 + height, 0.1, 0.01);
    const silo = c.std('#d5d9dc', { metalness: 0.6, roughness: 0.35 });
    [[0.65, -0.5], [0.65, 0.05]].forEach(([x, z]) => { cylinder(g, 0.17, 0.17, 0.7 + level * 0.1, silo, x, 0.04, z, 28); add(g, new THREE.SphereGeometry(0.17, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), silo, x, 0.74 + level * 0.1, z); });
    const stripe = [c.std('#c94b3b'), c.std('#f2f2f2')];
    const chimneyH = 1.2 + level * 0.2;
    [[-0.6, -0.65], [-0.25, -0.65]].forEach(([x, z]) => {
      for (let i = 0; i < 6; i += 1) cylinder(g, 0.065 - i * 0.004, 0.07 - i * 0.004, chimneyH / 6, stripe[i % 2], x, 0.04 + (i * chimneyH) / 6, z, 20);
    });
    g.userData.smoke = [new THREE.Vector3(-0.6, 0.04 + chimneyH, -0.65), new THREE.Vector3(-0.25, 0.04 + chimneyH, -0.65)];
    return g;
  },
  powerplant: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.04, 1.85, c.std('#a4a29c'), 0, 0, 0);
    const concrete = c.std('#d6d3cc', { roughness: 0.85 });
    const towerH = 1.3 + level * 0.2;
    lathe(g, [[0.5, 0], [0.42, towerH * 0.35], [0.32, towerH * 0.7], [0.34, towerH * 0.9], [0.38, towerH], [0.36, towerH], [0.3, towerH * 0.7], [0.4, 0.02]], concrete, -0.4, 0.04, -0.35, 48);
    block(g, 0.9, 0.5, 0.6, c.facade({ wall: '#cfd5da', window: '#7a99ad', frame: '#9aa6ae', cols: 5, rows: 2, door: true, seed: 100 }), 0.4, 0.04, 0.3);
    gable(g, 0.9, 0.6, 0.12, c.std('#7b8a93', { metalness: 0.5 }), 0.4, 0.54, 0.3, 0.01);
    const steel = c.std('#9fa7ad', { metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < 3; i += 1) block(g, 0.12, 0.2, 0.12, steel, 0.6 - i * 0.22, 0.04, -0.55, 0.01);
    g.userData.smoke = [new THREE.Vector3(-0.4, 0.04 + towerH, -0.35)];
    return g;
  },
  windmill: (c, level) => {
    const g = new THREE.Group();
    const white = c.std('#f4f6f7', { roughness: 0.35, metalness: 0.1 });
    const height = 1.8 + level * 0.3;
    block(g, 0.5, 0.04, 0.5, c.std('#bdb8ad'), 0, 0, 0);
    cylinder(g, 0.035, 0.07, height, white, 0, 0.04, 0, 24);
    block(g, 0.12, 0.1, 0.26, white, 0, 0.04 + height - 0.05, -0.02, 0.03);
    const pivot = new THREE.Vector3(0, 0.04 + height, 0.12);
    const rotor = new THREE.Group();
    add(rotor, new THREE.SphereGeometry(0.045, 20, 12), white, 0, 0, 0);
    for (let i = 0; i < 3; i += 1) {
      const blade = add(rotor, new THREE.BoxGeometry(0.05, 0.75, 0.012), white, 0, 0.38, 0);
      blade.geometry.translate(0, 0, 0);
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI * 2) / 3;
      arm.add(blade);
      rotor.add(arm);
    }
    rotor.position.copy(pivot);
    rotor.traverse(object => { object.userData.anim = { kind: 'rotor', pivot }; });
    g.add(rotor);
    return g;
  },
  solar: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.03, 1.85, c.std('#b8c4a8', { map: c.textures.grass }), 0, 0, 0);
    const panel = c.std('#1d3557', { metalness: 0.7, roughness: 0.2 });
    const frame = c.std('#c9ced2', { metalness: 0.6 });
    const rows = 3 + level, cols = 3;
    for (let r = 0; r < rows; r += 1) for (let col = 0; col < cols; col += 1) {
      const x = -0.6 + col * 0.6, z = -0.75 + (r * 1.5) / (rows - 1);
      cylinder(g, 0.01, 0.01, 0.1, frame, x, 0.03, z, 6);
      const p = block(g, 0.5, 0.015, 0.24, panel, x, 0.13, z, 0.004);
      p.rotation.x = -0.5;
    }
    return g;
  },
  watertower: (c, level) => {
    const g = new THREE.Group();
    const steel = c.std('#8e9aa3', { metalness: 0.6, roughness: 0.4 });
    const legH = 0.7 + level * 0.12;
    block(g, 0.6, 0.03, 0.6, c.std('#bdb8ad'), 0, 0, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = cylinder(g, 0.015, 0.02, legH, steel, sx * 0.17, 0.03, sz * 0.17, 8);
      leg.rotation.set(sz * 0.08, 0, -sx * 0.08);
    });
    for (let i = 1; i < 3; i += 1) block(g, 0.36, 0.01, 0.01, steel, 0, (legH * i) / 3, 0.17, 0.003);
    const tank = c.std('#e9eef1', { metalness: 0.3, roughness: 0.4 });
    lathe(g, [[0.001, 0], [0.18, 0.05], [0.24, 0.16], [0.24, 0.34], [0.2, 0.4], [0.001, 0.46]], tank, 0, 0.03 + legH - 0.04, 0, 40);
    add(g, new THREE.ConeGeometry(0.06, 0.08, 16), steel, 0, 0.03 + legH + 0.46, 0);
    return g;
  },
  pump: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.03, 1.85, c.std('#a9aaa5'), 0, 0, 0);
    block(g, 0.9, 0.42, 0.6, c.facade({ wall: '#dfe4e8', window: '#7aa0b8', frame: '#9aa6ae', cols: 4, rows: 1, door: true, seed: 110 }), -0.35, 0.03, 0.4);
    hipRoof(g, 0.9, 0.6, 0.14, c.std('#4f6f8f', { map: c.textures.roof }), -0.35, 0.45, 0.4);
    const tank = c.std('#c6d3dc', { metalness: 0.4, roughness: 0.35 });
    const water = c.std('#3d8fb8', { roughness: 0.1, metalness: 0.2 });
    [[0.45, -0.4], [0.45, 0.4], ...(level >= 2 ? [[-0.45, -0.45]] : [])].forEach(([x, z]) => {
      cylinder(g, 0.32, 0.32, 0.2 + level * 0.05, tank, x, 0.03, z, 40);
      cylinder(g, 0.29, 0.29, 0.01, water, x, 0.235 + level * 0.05, z, 40);
    });
    const pipe = c.std('#5f7f9a', { metalness: 0.6, roughness: 0.4 });
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12), pipe, 0.45, 0.12, 0).rotation.x = Math.PI / 2;
    return g;
  },
  tree: (c, level) => {
    const g = new THREE.Group();
    block(g, 0.94, 0.012, 0.94, c.std('#7fb069', { map: c.textures.grass }), 0, 0, 0, 0.004);
    const spots: Array<[number, number, number, boolean, string]> = [[0, 0, 1.15, false, '#4f9a55'], [-0.27, 0.24, 0.85, true, '#3f7f4f'], [0.28, -0.22, 0.95, false, '#6aa84f'], [0.26, 0.28, 0.75, true, '#3f7f4f'], [-0.26, -0.26, 0.8, false, '#58a05a']];
    spots.slice(0, 1 + level).forEach(([x, z, s, conifer, tint]) => tree(c, g, x, z, s, conifer, tint));
    return g;
  },
  park: (c, level) => {
    const g = new THREE.Group();
    block(g, 0.96, 0.015, 0.96, c.std('#86c06c', { map: c.textures.grass }), 0, 0, 0, 0.004);
    const path = c.std('#e3d6b5', { map: c.textures.pavement });
    block(g, 0.96, 0.02, 0.14, path, 0, 0, 0, 0.004);
    block(g, 0.14, 0.02, 0.96, path, 0, 0, 0, 0.004);
    tree(c, g, -0.28, -0.28, 0.9, false);
    tree(c, g, 0.3, 0.3, 0.8, true, '#3f7f4f');
    const wood = c.std('#8a6446');
    block(g, 0.2, 0.04, 0.06, wood, -0.25, 0.05, 0.16, 0.006);
    [-0.33, -0.17].forEach(x => block(g, 0.012, 0.05, 0.05, c.std('#333'), x, 0, 0.16, 0.002));
    if (level >= 2) tree(c, g, 0.3, -0.3, 0.75, false, '#6aa84f');
    if (level >= 3) for (let i = 0; i < 8; i += 1) add(g, new THREE.SphereGeometry(0.025, 10, 8), c.std(['#f28da1', '#f6d36b', '#ffffff', '#b28dff'][i % 4]), -0.42 + i * 0.05, 0.03, 0.42);
    cylinder(g, 0.006, 0.008, 0.28, c.std('#2f3a40', { metalness: 0.6 }), 0.1, 0, 0.1, 8);
    add(g, new THREE.SphereGeometry(0.025, 12, 8), c.std('#fff8d6', { emissive: '#ffd77a', emissiveIntensity: 0 }), 0.1, 0.3, 0.1).userData.lamp = true;
    return g;
  },
  fountain: (c, level) => {
    const g = new THREE.Group();
    block(g, 0.96, 0.02, 0.96, c.std('#d9d2c3', { map: c.textures.pavement }), 0, 0, 0, 0.004);
    const stone = c.std('#cfc7b6', { roughness: 0.6 });
    lathe(g, [[0.001, 0.02], [0.38, 0.02], [0.4, 0.08], [0.37, 0.1], [0.34, 0.05], [0.001, 0.05]], stone, 0, 0, 0, 48);
    cylinder(g, 0.34, 0.34, 0.01, c.std('#4fa3c7', { roughness: 0.05, metalness: 0.3 }), 0, 0.07, 0, 40);
    lathe(g, [[0.05, 0], [0.04, 0.2], [0.16, 0.24], [0.17, 0.27], [0.03, 0.27], [0.02, 0.36 + level * 0.05], [0.001, 0.4 + level * 0.05]], stone, 0, 0.05, 0, 40);
    add(g, new THREE.ConeGeometry(0.05, 0.16, 20), c.std('#bfeaf6', { transparent: true, opacity: 0.65, roughness: 0.05 }), 0, 0.53 + level * 0.05, 0);
    const wood = c.std('#8a6446');
    [[0.4, 0], [-0.4, 0]].forEach(([x]) => { const bench = block(g, 0.06, 0.035, 0.22, wood, x, 0.04, 0, 0.006); bench.position.x = x; });
    return g;
  },
  school: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.02, 1.85, c.std('#9ecf7a', { map: c.textures.grass }), 0, 0, 0);
    const floors = 1 + level;
    const brick = c.facade({ wall: '#c9785d', window: '#a6cbe0', frame: '#ffffff', cols: 6, rows: floors, door: true, seed: 120 });
    block(g, 1.5, floors * 0.24, 0.5, brick, 0, 0.02, -0.55);
    block(g, 0.5, floors * 0.24, 0.8, c.facade({ wall: '#c9785d', window: '#a6cbe0', frame: '#ffffff', cols: 2, rows: floors, seed: 121 }), -0.5, 0.02, 0.05);
    block(g, 1.56, 0.05, 0.56, c.std('#5f6a70'), 0, 0.02 + floors * 0.24, -0.55, 0.01);
    block(g, 0.56, 0.05, 0.86, c.std('#5f6a70'), -0.5, 0.02 + floors * 0.24, 0.05, 0.01);
    block(g, 0.8, 0.01, 0.6, c.std('#c55a4a', { roughness: 0.9 }), 0.35, 0.02, 0.4, 0.004); // running track
    block(g, 0.6, 0.012, 0.4, c.std('#7cc36a', { map: c.textures.grass }), 0.35, 0.02, 0.4, 0.004);
    cylinder(g, 0.006, 0.006, 0.7, c.std('#cccccc', { metalness: 0.7 }), 0.75, 0.02, -0.2, 8);
    block(g, 0.18, 0.1, 0.005, c.std('#2f6fba'), 0.84, 0.6, -0.2, 0.002);
    return g;
  },
  clinic: (c, level) => {
    const g = new THREE.Group();
    block(g, 1.85, 0.03, 1.85, c.std('#c9c6bf', { map: c.textures.pavement }), 0, 0, 0);
    const floors = 2 + level;
    block(g, 1.4, floors * 0.24, 0.9, c.facade({ wall: '#f4f6f7', window: '#8fc1dc', frame: '#d0d7dc', cols: 6, rows: floors, door: true, seed: 130 }), 0, 0.03, -0.25);
    block(g, 1.44, 0.05, 0.94, c.std('#d9dee2'), 0, 0.03 + floors * 0.24, -0.25, 0.01);
    const red = c.std('#d63b3b', { emissive: '#d63b3b', emissiveIntensity: 0.2 });
    block(g, 0.22, 0.07, 0.02, red, 0, 0.12 + floors * 0.24, 0.21, 0.004);
    block(g, 0.07, 0.22, 0.02, red, 0, 0.045 + floors * 0.24, 0.21, 0.004);
    block(g, 0.5, 0.2, 0.3, c.std('#f4f6f7'), 0.35, 0.03, 0.4, 0.01); // canopy entrance
    return g;
  },
  // Advisor buildings.
  postoffice: (c, level) => {
    const g = new THREE.Group();
    const floors = 1 + level;
    block(g, 0.96, 0.02, 0.96, c.std('#d6d0c4', { map: c.textures.pavement }), 0, 0, 0, 0.004);
    block(g, 0.74, floors * 0.22, 0.56, c.std('#b5543f', { map: c.textures.brick, roughness: 0.9 }), 0, 0.02, -0.12);
    block(g, 0.7, floors * 0.22 - 0.02, 0.02, c.facade({ wall: '#b5543f', window: '#9cc3d8', frame: '#f4efe6', cols: 3, rows: floors, door: true, seed: 140 }), 0, 0.02, 0.165, 0.002);
    block(g, 0.8, 0.05, 0.62, c.std('#efe6d6'), 0, 0.02 + floors * 0.22, -0.12, 0.01);
    gable(g, 0.8, 0.62, 0.16, c.std('#5b4b46', { map: c.textures.roof }), 0, 0.07 + floors * 0.22, -0.12, 0.02);
    const red = c.std('#c8102e', { roughness: 0.45 });
    block(g, 0.78, 0.035, 0.16, red, 0, 0.27, 0.24, 0.006); // awning
    block(g, 0.34, 0.07, 0.012, red, 0, 0.32, 0.18, 0.004); // POST sign
    block(g, 0.26, 0.02, 0.014, c.std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0 }), 0, 0.345, 0.187, 0.002);
    cylinder(g, 0.045, 0.045, 0.16, red, 0.3, 0.02, 0.36, 24); // pillar post box
    add(g, new THREE.SphereGeometry(0.046, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, 0.3, 0.18, 0.36);
    block(g, 0.05, 0.008, 0.008, c.std('#222'), 0.3, 0.14, 0.405, 0.002);
    cylinder(g, 0.006, 0.006, 0.5 + level * 0.1, c.std('#cccccc', { metalness: 0.7 }), -0.38, 0.02, 0.3, 8);
    block(g, 0.14, 0.08, 0.005, red, -0.31, 0.44 + level * 0.1, 0.3, 0.002);
    return g;
  },
  vault: (c, level) => {
    const g = new THREE.Group();
    block(g, 0.96, 0.03, 0.96, c.std('#c9c2b3', { map: c.textures.pavement }), 0, 0, 0, 0.004);
    const stone = c.std('#d9d2c2', { roughness: 0.7 });
    const height = 0.42 + (level - 1) * 0.12;
    block(g, 0.8, height, 0.66, c.facade({ wall: '#ddd5c4', window: '#8fb2c4', frame: '#bfb6a3', cols: 2, rows: level, seed: 150 }), 0, 0.03, -0.08);
    block(g, 0.86, 0.06, 0.72, stone, 0, 0.03 + height, -0.08, 0.01);
    for (let i = 0; i < 2; i += 1) block(g, 0.84, 0.03, 0.04, stone, 0, 0.03 + i * 0.03, 0.27 - i * 0.04, 0.004); // steps
    // A big round vault door, brass-bound.
    const steel = c.std('#9aa4ab', { metalness: 0.85, roughness: 0.28 });
    const brass = c.std('#d4a64a', { metalness: 0.9, roughness: 0.25 });
    add(g, new THREE.CylinderGeometry(0.15, 0.15, 0.03, 40), steel, 0, 0.22, 0.265).rotation.x = Math.PI / 2;
    add(g, new THREE.TorusGeometry(0.15, 0.014, 10, 40), brass, 0, 0.22, 0.282);
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20), brass, 0, 0.22, 0.29).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i += 1) { const spoke = block(g, 0.13, 0.012, 0.012, brass, 0, 0.214, 0.3, 0.003); spoke.rotation.z = (i * Math.PI) / 3; spoke.position.y = 0.22; }
    // Piggy-bank emblem on the parapet.
    const gold = c.std('#e8b649', { metalness: 0.8, roughness: 0.3 });
    const pig = add(g, new THREE.SphereGeometry(0.06, 24, 16), gold, 0, 0.17 + height, 0.18);
    pig.scale.set(1.25, 0.95, 0.9);
    add(g, new THREE.CylinderGeometry(0.02, 0.022, 0.03, 16), gold, 0.075, 0.17 + height, 0.18).rotation.z = Math.PI / 2;
    [-0.035, 0.035].forEach(x => cylinder(g, 0.012, 0.012, 0.05, gold, x, 0.09 + height, 0.18, 10));
    return g;
  },
  creditunion: (c, level) => {
    const g = new THREE.Group();
    const floors = 1 + level;
    block(g, 0.96, 0.02, 0.96, c.std('#d6d0c4', { map: c.textures.pavement }), 0, 0, 0, 0.004);
    const glass = c.facade({ wall: '#2c5d7a', window: '#8ecae6', frame: '#e8eef2', cols: 4, rows: floors, glass: true, door: true, seed: 160 }, '#ffffff');
    glass.metalness = 0.4; glass.roughness = 0.2;
    block(g, 0.78, floors * 0.22, 0.6, glass, 0, 0.02, -0.08, 0.02);
    const navy = c.std('#1d6fa3', { roughness: 0.4 });
    block(g, 0.82, 0.08, 0.64, navy, 0, 0.02 + floors * 0.22, -0.08, 0.01); // fascia
    block(g, 0.5, 0.06, 0.012, c.std('#ffffff', { emissive: '#bfe3ff', emissiveIntensity: 0 }), 0, 0.03 + floors * 0.22, 0.235, 0.003);
    // Heart-and-coin sign.
    const coin = c.std('#f2c14e', { metalness: 0.8, roughness: 0.3 });
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 32), coin, 0.28, 0.17 + floors * 0.22, 0.25).rotation.x = Math.PI / 2;
    add(g, new THREE.SphereGeometry(0.03, 16, 12), c.std('#e63946'), 0.28, 0.18 + floors * 0.22, 0.265).scale.set(1, 0.9, 0.4);
    block(g, 0.84, 0.03, 0.16, c.std('#e8eef2'), 0, 0.26, 0.26, 0.006); // canopy
    [-0.36, 0.36].forEach(x => cylinder(g, 0.01, 0.01, 0.26, c.std('#c0c8ce', { metalness: 0.7 }), x, 0, 0.32, 10));
    return g;
  },
  lighthouse: (c, level) => {
    const g = new THREE.Group();
    add(g, new THREE.DodecahedronGeometry(0.4, 1), c.std('#7d8483', { roughness: 0.95 }), 0, 0.02, 0).scale.set(1, 0.3, 1);
    const bands = 5 + level;
    const red = c.std('#cf3b3b', { roughness: 0.5 }), white = c.std('#f6f6f2', { roughness: 0.5 });
    for (let i = 0; i < bands; i += 1) cylinder(g, 0.16 - (i + 1) * 0.008, 0.16 - i * 0.008, 0.22, i % 2 ? white : red, 0, 0.1 + i * 0.22, 0, 32);
    const top = 0.1 + bands * 0.22;
    cylinder(g, 0.15, 0.15, 0.03, c.std('#333'), 0, top, 0, 32);
    cylinder(g, 0.1, 0.1, 0.16, c.std('#fff6c2', { emissive: '#ffe38a', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }), 0, top + 0.03, 0, 24);
    add(g, new THREE.ConeGeometry(0.13, 0.14, 32), c.std('#2b2b2b', { metalness: 0.4 }), 0, top + 0.26, 0);
    const pivot = new THREE.Vector3(0, top + 0.11, 0);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 24, 1, true), c.std('#fff3a6', { transparent: true, opacity: 0.22, emissive: '#fff3a6', emissiveIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false }));
    beam.geometry.rotateX(-Math.PI / 2);
    beam.geometry.translate(0, 0, 1.2);
    beam.position.copy(pivot);
    beam.userData.anim = { kind: 'beam', pivot };
    beam.castShadow = false;
    g.add(beam);
    return g;
  },
};

// One geometry per material; animated parts stay separate, centred on their pivot.
export const bake = (group: THREE.Group): Prefab => {
  group.updateMatrixWorld(true);
  const staticParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const animated: Prefab['parts'] = [];
  const box = new THREE.Box3().setFromObject(group);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    ['position', 'normal', 'uv'].forEach(name => { if (!geometry.getAttribute(name) && name === 'uv') geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((geometry.getAttribute('position').count) * 2), 2)); });
    Object.keys(geometry.attributes).forEach(name => { if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name); });
    const material = object.material as THREE.Material;
    const anim = object.userData.anim as { kind: 'rotor' | 'beam'; pivot: THREE.Vector3 } | undefined;
    if (anim) {
      geometry.translate(-anim.pivot.x, -anim.pivot.y, -anim.pivot.z);
      animated.push({ geometry, material, anim });
      return;
    }
    staticParts.set(material, [...(staticParts.get(material) || []), geometry]);
  });
  const parts: Prefab['parts'] = [...staticParts.entries()].map(([material, geometries]) => {
    const merged = mergeGeometries(geometries, false)!;
    geometries.forEach(geometry => geometry.dispose());
    return { geometry: merged, material };
  });
  // Rotors of the same material merge too (a turbine's three blades and hub).
  const rotorGroups = new Map<string, Prefab['parts']>();
  animated.forEach(part => { const key = `${part.anim!.kind}:${part.material.uuid}`; rotorGroups.set(key, [...(rotorGroups.get(key) || []), part]); });
  rotorGroups.forEach(list => parts.push({ geometry: mergeGeometries(list.map(item => item.geometry), false)!, material: list[0].material, anim: list[0].anim }));
  return { parts, height: box.max.y, smoke: (group.userData.smoke as THREE.Vector3[]) || [] };
};

export const buildModel = (type: string, c: ModelContext, level: number, size: number) => MODELS[type](c, level, size);
export const hasModel = (type: string) => Boolean(MODELS[type]);
export { tree as treeModel };
