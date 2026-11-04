import * as THREE from 'three';
import type { ModelContext } from './models';

// What an upgrade adds to any building, on top of its own model, so every level looks different
// from any side. The main block gets a stone plinth and a cornice whose colour marks the level
// (cream, bronze, silver, gold); then:
//   2 - flower planters at the front, vents on a flat roof
//   3 - a band at mid-height, street lamps by the entrance, solar panels (or a flagpole)
//   4 - corner pilasters, bunting strung between the lamps, a rooftop garden
//   5 - a glowing gold crown, a golden statue on a plinth, a beacon mast, gilded planters
// Everything stays inside the plot and off the roof's helipad. Positions are found by looking
// straight down at the model, so props stand on whatever is really there.

const raycaster = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), normal = new THREE.Vector3();
const surface = (model: THREE.Object3D, x: number, z: number, top: number) => {
  raycaster.set(new THREE.Vector3(x, top + 1, z), down);
  const hit = raycaster.intersectObject(model, true)[0]; if (!hit) return null;
  const flat = !hit.face || normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.95;
  return { y: hit.point.y, flat };
};

export function dressUpgrade(model: THREE.Group, c: ModelContext, level: number, size: number, helipad: THREE.Vector3 | null) {
  const outer = new THREE.Group(); outer.name = model.name; outer.add(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), half = size / 2, top = box.max.y;
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, extra?: THREE.MeshStandardMaterialParameters) => {
    const mesh = new THREE.Mesh(geometry, c.std(color, extra)); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `upgrade-${level}`; outer.add(mesh); return mesh;
  };
  // Ground props need a low, level spot; returns its height or null.
  const ground = (x: number, z: number) => { const s = surface(model, x, z, top); return s && s.flat && s.y < 0.16 ? s.y : s ? null : 0; };
  const gold = level >= 5;

  // The main block: the biggest box-shaped part (walls, not a pitched roof, dome or tree) that
  // isn't the ground plot.
  let body: THREE.Box3 | null = null, volume = 0;
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.name === 'plot' || object.name === 'pitched-roof' || !(object.geometry instanceof THREE.BoxGeometry)) return;
    const b = new THREE.Box3().setFromObject(object), v = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
    if (b.max.y - b.min.y > 0.12 && b.max.x - b.min.x > 0.15 && b.max.z - b.min.z > 0.15 && v > volume) { volume = v; body = b; }
  });
  if (body) {
    // Wrapped just outside the block, but never past the plot's edge.
    const b = body as THREE.Box3, cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2, h = b.max.y - b.min.y;
    const w = Math.min(b.max.x - b.min.x + 0.012, 2 * (half - Math.abs(cx)) - 0.06), d = Math.min(b.max.z - b.min.z + 0.012, 2 * (half - Math.abs(cz)) - 0.06);
    const TRIM = ['', '', '#efe6cf', '#b07a3c', '#c9d3dc', '#d4af37'][level], shiny = level >= 4 ? { metalness: 0.75, roughness: 0.3, ...(gold ? { emissive: '#7a5600', emissiveIntensity: 0.35 } : {}) } : undefined;
    // A band all the way round at height y.
    const band = (y: number, height: number, color: string, extra?: THREE.MeshStandardMaterialParameters, out = 0) => {
      for (const [sx, sz, lx, lz] of [[0, 1, w, 0.012], [0, -1, w, 0.012], [1, 0, 0.012, d], [-1, 0, 0.012, d]]) add(new THREE.BoxGeometry(lx + out * 2, height, lz + out * 2), color, cx + sx * (w / 2 + out), y, cz + sz * (d / 2 + out), extra);
    };
    band(b.min.y + 0.018, 0.035, '#8d8577');
    band(b.max.y - 0.012 - (gold ? 0.01 : 0), gold ? 0.045 : 0.025, TRIM, shiny, gold ? 0.006 : 0);
    if (level >= 3) band(b.min.y + h * 0.5, 0.014, TRIM, shiny);
    if (level >= 4) for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.026, h, 0.026), TRIM, cx + sx * w / 2, b.min.y + h / 2, cz + sz * d / 2, shiny);
    if (gold) for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.SphereGeometry(0.026, 10, 8), '#d4af37', cx + sx * w / 2, b.max.y + 0.02, cz + sz * d / 2, shiny);
  }
  const planterColor = gold ? '#d4af37' : '#b0684a';

  // Level 2: planters with flowers either side of the front.
  for (const side of [-1, 1]) {
    const x = side * (half - 0.09), z = half - 0.08, y = ground(x, z); if (y === null) continue;
    add(new THREE.BoxGeometry(0.12, 0.05, 0.07), planterColor, x, y + 0.025, z, gold ? { metalness: 0.7, roughness: 0.3 } : undefined);
    for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.022, 8, 6), ['#e05a7a', '#f2c94c', '#9b6dd6', '#ff8a5b'][(i + side + 4) % 4], x - 0.04 + i * 0.027, y + 0.065, z);
  }
  // Level 3: street lamps by the entrance.
  const lamps: THREE.Vector3[] = [];
  if (level >= 3) for (const side of [-1, 1]) {
    const x = side * (half - 0.22), z = half - 0.04, y = ground(x, z); if (y === null) continue;
    add(new THREE.CylinderGeometry(0.008, 0.011, 0.28, 8), gold ? '#d4af37' : '#3d464d', x, y + 0.14, z, { metalness: 0.6, roughness: 0.4 });
    add(new THREE.SphereGeometry(0.026, 10, 8), '#fff6d8', x, y + 0.29, z, { emissive: '#ffd68a', emissiveIntensity: 0.8 });
    lamps.push(new THREE.Vector3(x, y + 0.27, z));
  }
  // Level 4: bunting strung between the lamps.
  if (level >= 4 && lamps.length === 2) {
    const [a, b] = lamps, colors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a', '#8d6cab'];
    const string = add(new THREE.CylinderGeometry(0.0015, 0.0015, a.distanceTo(b), 4), '#f1f1ee', (a.x + b.x) / 2, a.y - 0.01, (a.z + b.z) / 2); string.rotation.z = Math.PI / 2;
    for (let i = 1; i < 9; i++) {
      const p = a.clone().lerp(b, i / 9), flag = add(new THREE.ConeGeometry(0.012, 0.03, 3), colors[i % colors.length], p.x, p.y - 0.03 - Math.sin(Math.PI * i / 9) * 0.015, p.z);
      flag.rotation.x = Math.PI;
    }
  }
  // Level 5: a golden statue on a stone plinth at a front corner.
  if (level >= 5) for (const [x, z] of [[-(half - 0.1), half - 0.2], [half - 0.1, half - 0.2], [-(half - 0.1), -(half - 0.12)], [half - 0.1, -(half - 0.12)]]) {
    const y = ground(x, z); if (y === null) continue;
    add(new THREE.BoxGeometry(0.09, 0.08, 0.09), '#d8d2c4', x, y + 0.04, z);
    add(new THREE.CylinderGeometry(0.016, 0.024, 0.1, 10), '#d4af37', x, y + 0.13, z, { metalness: 0.8, roughness: 0.25, emissive: '#7a5600', emissiveIntensity: 0.3 });
    add(new THREE.SphereGeometry(0.02, 10, 8), '#d4af37', x, y + 0.195, z, { metalness: 0.8, roughness: 0.25, emissive: '#7a5600', emissiveIntensity: 0.3 });
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), '#d4af37', x + 0.025, y + 0.21, z, { metalness: 0.8, roughness: 0.25 }).rotation.z = -0.5;
    break;
  }

  // Roof props go on the top flat roof, away from the helipad.
  const roofSpots: THREE.Vector3[] = [];
  if (top > 0.3) {
    const reach = Math.min(box.max.x, -box.min.x, box.max.z, -box.min.z) - 0.08;
    let highest = 0;
    const samples: THREE.Vector3[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const x = i * reach / 2.2, z = j * reach / 2.2, s = surface(model, x, z, top);
      if (s && s.flat && s.y > 0.3) { samples.push(new THREE.Vector3(x, s.y, z)); highest = Math.max(highest, s.y); }
    }
    for (const p of samples) if (p.y > highest - 0.05 && (!helipad || Math.hypot(p.x - helipad.x, p.z - helipad.z) > 0.32) && roofSpots.every(o => o.distanceTo(p) > 0.13)) roofSpots.push(p);
  }
  let next = 0;
  const spot = () => roofSpots[next++];
  for (let i = 0; i < 2; i++) { const p = spot(); if (!p) break; add(new THREE.BoxGeometry(0.06, 0.045, 0.05), '#9aa3ab', p.x, p.y + 0.022, p.z); add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10), '#5f676e', p.x, p.y + 0.049, p.z); }
  if (level >= 3) {
    const p = spot();
    if (p) {
      for (const dx of [-0.045, 0.045]) { const panel = add(new THREE.BoxGeometry(0.08, 0.008, 0.11), '#2f4f73', p.x + dx, p.y + 0.035, p.z, { metalness: 0.4, roughness: 0.25 }); panel.rotation.x = -0.35; }
      add(new THREE.BoxGeometry(0.16, 0.025, 0.02), '#9aa3ab', p.x, p.y + 0.012, p.z);
    } else {
      // No roof to speak of: a flagpole at the back corner instead.
      const x = half - 0.1, z = -(half - 0.1), y = ground(x, z);
      if (y !== null) {
        add(new THREE.CylinderGeometry(0.004, 0.005, 0.32, 6), '#d0d4d6', x, y + 0.16, z);
        add(new THREE.BoxGeometry(0.004, 0.05, 0.08), level >= 5 ? '#d4af37' : '#2a9d8f', x, y + 0.29, z + 0.04);
      }
    }
  }
  if (level >= 4) {
    const p = spot();
    if (p) {
      add(new THREE.BoxGeometry(0.14, 0.03, 0.14), '#8a6a4a', p.x, p.y + 0.015, p.z);
      add(new THREE.BoxGeometry(0.13, 0.008, 0.13), '#5e9e4f', p.x, p.y + 0.034, p.z);
      for (const [dx, dz] of [[-0.035, -0.03], [0.04, 0.035]]) add(new THREE.ConeGeometry(0.022, 0.07, 8), '#3f7f4f', p.x + dx, p.y + 0.073, p.z + dz);
    }
  }
  if (level >= 5) {
    const p = spot() || roofSpots[0];
    if (p) {
      add(new THREE.CylinderGeometry(0.006, 0.01, 0.34, 6), '#c9ced3', p.x, p.y + 0.17, p.z, { metalness: 0.7, roughness: 0.3 });
      add(new THREE.SphereGeometry(0.016, 10, 8), '#ff3b30', p.x, p.y + 0.35, p.z, { emissive: '#ff3b30', emissiveIntensity: 1.2 });
    }
  }
  return outer;
}
