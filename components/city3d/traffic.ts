import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Cars moving along the road network, chimney smoke, and the road-walking helpers people.ts
// shares. Each is a few
// InstancedMeshes updated every frame, so thousands of residents stay cheap to draw.

export type ToWorld = (index: number) => THREE.Vector3; // centre of a tile

// Road surfaces, shared with the road geometry in CityScene3D so people and cars stand on top
// of them: the asphalt's top, the raised pavement's top, and where the pavement starts (its
// distance from the road's centre line, on sides with no road joining).
export const ROAD_SURFACE = 0.03;
export const PAVEMENT_SURFACE = 0.075;
export const PAVEMENT_INNER = 0.355;

// Height of whatever is underfoot at a point: pavement, asphalt, or the grass at 0.
export const surfaceHeight = (roads: Set<number>, x: number, z: number) => {
  const tx = Math.floor(x + 50), tz = Math.floor(z + 50);
  if (tx < 0 || tz < 0 || tx > 99 || tz > 99) return 0;
  const index = tz * 100 + tx;
  if (!roads.has(index)) return 0;
  const lx = x + 50 - tx - 0.5, lz = z + 50 - tz - 0.5;
  const pavement = (lx > PAVEMENT_INNER && (tx === 99 || !roads.has(index + 1)))
    || (lx < -PAVEMENT_INNER && (tx === 0 || !roads.has(index - 1)))
    || (lz > PAVEMENT_INNER && !roads.has(index + 100))
    || (lz < -PAVEMENT_INNER && !roads.has(index - 100));
  return pavement ? PAVEMENT_SURFACE : ROAD_SURFACE;
};

const DIRS = [1, -1, 100, -100];

export const buildGraph = (roads: Set<number>) => {
  const graph = new Map<number, number[]>();
  roads.forEach(index => {
    // East/west steps must stay on the same row; north/south ones can't leave the map.
    graph.set(index, DIRS.filter(d => Math.abs(d) === 100 || Math.floor((index + d) / 100) === Math.floor(index / 100)).map(d => index + d).filter(n => roads.has(n)));
  });
  return graph;
};


export const pickNext = (graph: Map<number, number[]>, at: number, cameFrom: number) => {
  const options = graph.get(at) || [];
  const forward = options.filter(n => n !== cameFrom);
  const list = forward.length ? forward : options;
  return list.length ? list[Math.floor(Math.random() * list.length)] : at;
};

export const spawnOnRoads = (graph: Map<number, number[]>, roadList: number[]) => {
  const from = roadList[Math.floor(Math.random() * roadList.length)];
  return { from, to: pickNext(graph, from, -1) };
};

// Position along a road segment, shifted sideways (pavement for people, lane for cars).
export const along = (toWorld: ToWorld, from: number, to: number, t: number, offset: number, out: THREE.Vector3) => {
  const a = toWorld(from), b = toWorld(to);
  out.lerpVectors(a, b, t);
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  out.x += (-dz / length) * offset;
  out.z += (dx / length) * offset;
  return Math.atan2(dx, dz);
};

const CARS = ['#d62828', '#f7f7f2', '#1d3557', '#2a9d8f', '#ffb703', '#6c757d', '#111111', '#8ecae6', '#9b2226'];

interface Car { from: number; to: number; t: number; speed: number }

export class Traffic {
  readonly meshes: THREE.InstancedMesh[];
  private body: THREE.InstancedMesh; private cabin: THREE.InstancedMesh; private wheels: THREE.InstancedMesh; private lights: THREE.InstancedMesh;
  private cars: Car[] = [];
  private graph = new Map<number, number[]>();
  private roadList: number[] = [];
  private base = new THREE.Matrix4(); private local = new THREE.Matrix4(); private out = new THREE.Matrix4(); private quat = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0); private one = new THREE.Vector3(1, 1, 1); private pos = new THREE.Vector3();
  readonly lightMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, private capacity: number, private toWorld: ToWorld) {
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.55 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1c2833', roughness: 0.1, metalness: 0.8 });
    const tyre = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.8 });
    this.lightMaterial = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff1b0', emissiveIntensity: 0.2 });
    // Real-world size with a tile as ~10 m: about 4.5 m long and 1.8 m wide.
    const bodyGeometry = new RoundedBoxGeometry(0.18, 0.07, 0.45, 3, 0.03); bodyGeometry.translate(0, 0.065, 0);
    const cabinGeometry = new RoundedBoxGeometry(0.16, 0.065, 0.24, 3, 0.03); cabinGeometry.translate(0, 0.125, -0.025);
    const wheelGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.026, 18); wheelGeometry.rotateZ(Math.PI / 2);
    const lightGeometry = new THREE.BoxGeometry(0.14, 0.02, 0.006); lightGeometry.translate(0, 0.075, 0.226);
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.body = make(bodyGeometry, paint, capacity);
    this.cabin = make(cabinGeometry, glass, capacity);
    this.wheels = make(wheelGeometry, tyre, capacity * 4);
    this.lights = make(lightGeometry, this.lightMaterial, capacity);
    this.meshes = [this.body, this.cabin, this.wheels, this.lights];
    const color = new THREE.Color();
    for (let i = 0; i < capacity; i += 1) this.body.setColorAt(i, color.set(CARS[(i * 7) % CARS.length]));
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }

  setRoads(roads: Set<number>) {
    this.graph = buildGraph(roads);
    this.roadList = [...roads];
    this.cars.forEach(car => { if (!this.graph.has(car.from) || !this.graph.has(car.to)) Object.assign(car, spawnOnRoads(this.graph, this.roadList)); });
  }

  setCount(count: number) {
    const target = this.roadList.length < 4 ? 0 : Math.min(this.capacity, Math.max(0, Math.round(count)));
    while (this.cars.length < target) this.cars.push({ ...spawnOnRoads(this.graph, this.roadList), t: Math.random(), speed: 0.6 + Math.random() * 0.35 });
    this.cars.length = target;
    this.body.count = this.cabin.count = this.lights.count = target;
    this.wheels.count = target * 4;
  }

  update(dt: number, motion: boolean) {
    for (let i = 0; i < this.cars.length; i += 1) {
      const car = this.cars[i];
      if (motion && car.from !== car.to) {
        car.t += dt * car.speed;
        while (car.t >= 1) { car.t -= 1; const next = pickNext(this.graph, car.to, car.from); car.from = car.to; car.to = next; }
      }
      // Drive on the left, as in Malaysia and Singapore.
      const heading = along(this.toWorld, car.from, car.to, car.t, -0.2, this.pos);
      this.pos.y = ROAD_SURFACE; // tyres on the asphalt, not sunk into it
      this.quat.setFromAxisAngle(this.up, heading);
      this.base.compose(this.pos, this.quat, this.one);
      this.body.setMatrixAt(i, this.base);
      this.cabin.setMatrixAt(i, this.base);
      this.lights.setMatrixAt(i, this.base);
      [[-0.085, 0.145], [0.085, 0.145], [-0.085, -0.145], [0.085, -0.145]].forEach(([x, z], w) => {
        this.out.multiplyMatrices(this.base, this.local.makeTranslation(x, 0.034, z));
        this.wheels.setMatrixAt(i * 4 + w, this.out);
      });
    }
    this.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }

  dispose() {
    this.meshes.forEach(mesh => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.removeFromParent(); mesh.dispose(); });
  }
}

export class Smoke {
  private mesh: THREE.InstancedMesh;
  private emitters: THREE.Vector3[] = [];
  private matrix = new THREE.Matrix4(); private quat = new THREE.Quaternion(); private scale = new THREE.Vector3(); private pos = new THREE.Vector3();
  private static PUFFS = 7;

  constructor(scene: THREE.Scene, private capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 2), new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }), capacity * Smoke.PUFFS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  setEmitters(points: THREE.Vector3[]) {
    this.emitters = points.slice(0, this.capacity);
    this.mesh.count = this.emitters.length * Smoke.PUFFS;
  }

  update(time: number, motion: boolean) {
    this.emitters.forEach((origin, e) => {
      for (let p = 0; p < Smoke.PUFFS; p += 1) {
        const t = motion ? ((time * 0.00025 + p / Smoke.PUFFS + e * 0.13) % 1) : p / Smoke.PUFFS;
        this.pos.set(origin.x + t * 0.5, origin.y + t * 1.1, origin.z + Math.sin(t * 6 + e) * 0.08);
        this.scale.setScalar((0.5 + t * 2.2) * (1 - t * 0.6) * (t > 0.85 ? (1 - t) / 0.15 : 1));
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.mesh.setMatrixAt(e * Smoke.PUFFS + p, this.matrix);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.removeFromParent(); this.mesh.dispose(); }
}
