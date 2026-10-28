import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Home, Minus, Moon, Plus, RotateCcw, RotateCw, Sun } from 'lucide-react';
import {
  CHUNK, CHUNKS, HALL, MAP, canPlace, chunkAvailable, chunkCost, chunkOf, getBuilding, hasRoadAccess, isForest, isHallTile, levelForXp, maxChunks,
  occupancy, ownsTile, planLights, planRoads, roadPath, terrainMap, tileIndex, tileXZ, treeSeed, wildTrees,
  type CityState, type CityStats,
} from '../services/cityGameService';
import { createTextures, type FacadeStyle } from './city3d/textures';
import { bake, buildModel, type ModelContext, type Prefab } from './city3d/models';
import { PAVEMENT_INNER, PAVEMENT_SURFACE, ROAD_SURFACE, Smoke, Traffic } from './city3d/traffic';
import { Pedestrians, type HomePlace, type WorkPlace } from './city3d/people';

// The 3D city on a 100×100 map. Physically based lighting from a sky model, procedural
// textures, smooth models baked into InstancedMeshes, and residents and cars walking and
// driving the roads. Drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom.

export type SceneMode =
  | { kind: 'idle' }
  | { kind: 'place'; type: string }
  | { kind: 'move'; id: string }
  | { kind: 'road' }
  | { kind: 'lights' }
  | { kind: 'bulldoze' }
  | { kind: 'land' };

export interface SceneFocus { x: number; z: number; key: number }

interface Props {
  paused?: boolean;
  city: CityState;
  residents: number;
  jobs: number;
  status: CityStats['status']; // residents and filled jobs per building
  pending: Record<string, number>;
  mode: SceneMode;
  selectedId: string | null;
  focus: SceneFocus | null;
  onTile: (x: number, z: number) => void;
  onRoad: (tiles: number[]) => void;
  onLights: (tiles: number[]) => void;
  onSelect: (id: string | null) => void;
  onCollect: (id: string) => void;
  onChunk: (chunk: number) => void;
  fallback: React.ReactNode;
}

const MAX_PEOPLE = 4000;
const MAX_CARS = 600;
const HALF = MAP / 2;
const world = (x: number, z: number, out = new THREE.Vector3()) => out.set(x - HALF + 0.5, 0, z - HALF + 0.5);
const isNightNow = () => { const hour = new Date().getHours(); return hour >= 19 || hour < 6; };

// Which way a building faces: towards a road if it has one (south, east, west, north).
const facing = (roads: Set<number>, x: number, z: number, size: number) => {
  const side = (tiles: Array<[number, number]>) => tiles.some(([tx, tz]) => roads.has(tileIndex(tx, tz)));
  const range = Array.from({ length: size }, (_, i) => i);
  if (side(range.map(i => [x + i, z + size]))) return 0;
  if (side(range.map(i => [x + size, z + i]))) return Math.PI / 2;
  if (side(range.map(i => [x - 1, z + i]))) return -Math.PI / 2;
  if (side(range.map(i => [x + i, z - 1]))) return Math.PI;
  return 0;
};

// A building's front door: the first road beside it - front, then sides, then back.
const doorFor = (roads: Set<number>, x: number, z: number, size: number) => {
  const range = Array.from({ length: size }, (_, i) => i);
  const sides: Array<Array<[number, number]>> = [
    range.map(i => [x + i, z + size]),
    range.map(i => [x + size, z + i]),
    range.map(i => [x - 1, z + i]),
    range.map(i => [x + i, z - 1]),
  ];
  for (const side of sides) {
    const road = side.find(([tx, tz]) => roads.has(tileIndex(tx, tz)));
    if (road) return tileIndex(road[0], road[1]);
  }
  return null;
};

const CityScene3D: React.FC<Props> = props => {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const engine = useRef<{ rotate: (delta: number) => void; zoom: (factor: number) => void; setNight: (night: boolean) => void; focus: (x: number, z: number) => void } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [night, setNight] = useState(isNightNow);
  const [roadCost, setRoadCost] = useState<{ tiles: number; cost: number; blocked: number; what: string } | null>(null);

  useEffect(() => { engine.current?.setNight(night); }, [night]);
  useEffect(() => { if (props.focus) engine.current?.focus(props.focus.x, props.focus.z); }, [props.focus]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Your 3D city. Drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom.');
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 800);
    camera.position.set(9, 12, 15);
    const controls = new MapControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 95;
    controls.maxPolarAngle = 1.3;
    controls.target.set(0, 0, 0);
    controls.zoomToCursor = true;
    controls.update();

    // ---------------------------------------------------------------- sky, light, environment
    const sky = new Sky();
    sky.scale.setScalar(600);
    const skyUniforms = sky.material.uniforms;
    skyUniforms.turbidity.value = 5;
    skyUniforms.rayleigh.value = 1.4;
    skyUniforms.mieCoefficient.value = 0.004;
    skyUniforms.mieDirectionalG.value = 0.82;
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(600);
    Object.assign(envSky.material.uniforms.turbidity, { value: 5 });
    skyScene.add(envSky);
    let envTarget: THREE.WebGLRenderTarget | null = null;

    const hemisphere = new THREE.HemisphereLight('#dfefff', '#6b7f5a', 0.6);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 140 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);
    const sunDirection = new THREE.Vector3();

    const textures = createTextures();
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const glow = new Set<THREE.MeshStandardMaterial>(); // light up at night
    const std: ModelContext['std'] = (color, extra) => {
      const key = `${color}|${JSON.stringify(extra || {})}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
        if (extra?.emissiveIntensity === 0) glow.add(material);
        materials.set(key, material);
      }
      return material;
    };
    const facade: ModelContext['facade'] = (style: FacadeStyle, tint = '#ffffff') => {
      const key = `facade|${JSON.stringify(style)}|${tint}`;
      let material = materials.get(key);
      if (!material) {
        const { map, emissiveMap } = textures.facade(style);
        material = new THREE.MeshStandardMaterial({ color: tint, map, emissiveMap, emissive: '#ffd08a', emissiveIntensity: 0, roughness: 0.7 });
        glow.add(material);
        materials.set(key, material);
      }
      return material;
    };
    const modelContext: ModelContext = { std, facade, textures };

    // ---------------------------------------------------------------- terrain and water
    const terrainGeometry = new THREE.PlaneGeometry(MAP, MAP, MAP, MAP);
    terrainGeometry.rotateX(-Math.PI / 2);
    const terrainColors = new Float32Array((MAP + 1) * (MAP + 1) * 3);
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
    const grassTexture = textures.grass.clone();
    grassTexture.repeat.set(MAP / 2.5, MAP / 2.5);
    grassTexture.needsUpdate = true;
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTexture, roughness: 0.95 });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.receiveShadow = true;
    scene.add(terrain);
    {
      const tiles = terrainMap();
      const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j <= MAP; j += 1) for (let i = 0; i <= MAP; i += 1) {
        const around = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].map(([x, z]) => (x < 0 || z < 0 || x >= MAP || z >= MAP ? 'water' : tiles[z * MAP + x]));
        const wet = around.filter(t => t === 'water').length;
        positions.setY(j * (MAP + 1) + i, wet === 4 ? -0.55 : wet > 0 ? -0.16 : 0);
      }
      positions.needsUpdate = true;
      terrainGeometry.computeVertexNormals();
    }
    const paintTerrain = (city: CityState) => {
      const tiles = terrainMap();
      const color = new THREE.Color();
      for (let j = 0; j <= MAP; j += 1) for (let i = 0; i <= MAP; i += 1) {
        const x = Math.min(MAP - 1, i), z = Math.min(MAP - 1, j);
        const t = tiles[z * MAP + x];
        const variation = (Math.sin(i * 0.37) + Math.cos(j * 0.29) + Math.sin((i + j) * 0.11)) * 0.03;
        if (t === 'water') color.set('#b9a77c');
        else if (t === 'sand') color.setRGB(0.93 + variation, 0.86 + variation, 0.66 + variation);
        else color.setRGB(0.3 + variation, 0.55 + variation * 1.5, 0.22 + variation);
        const owned = ownsTile(city, Math.min(MAP - 1, i), Math.min(MAP - 1, j)) || ownsTile(city, Math.max(0, i - 1), Math.max(0, j - 1));
        if (!owned && t !== 'water') color.multiplyScalar(0.72).lerp(new THREE.Color('#7f8f87'), 0.25);
        color.toArray(terrainColors, (j * (MAP + 1) + i) * 3);
      }
      (terrainGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    };

    // The edge of the land you own, as a soft golden line.
    let border: THREE.LineSegments | null = null;
    const drawBorder = (city: CityState) => {
      if (border) { border.geometry.dispose(); border.removeFromParent(); }
      const points: number[] = [];
      const owns = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < CHUNKS && cz < CHUNKS && city.chunks.includes(cz * CHUNKS + cx);
      for (let cz = 0; cz < CHUNKS; cz += 1) for (let cx = 0; cx < CHUNKS; cx += 1) {
        if (!owns(cx, cz)) continue;
        const x0 = cx * CHUNK - HALF, z0 = cz * CHUNK - HALF, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
        if (!owns(cx, cz - 1)) points.push(x0, 0.05, z0, x1, 0.05, z0);
        if (!owns(cx, cz + 1)) points.push(x0, 0.05, z1, x1, 0.05, z1);
        if (!owns(cx - 1, cz)) points.push(x0, 0.05, z0, x0, 0.05, z1);
        if (!owns(cx + 1, cz)) points.push(x1, 0.05, z0, x1, 0.05, z1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      border = new THREE.LineSegments(geometry, borderMaterial);
      scene.add(border);
    };
    const borderMaterial = new THREE.LineBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8 });

    const waterNormal = textures.waterNormal;
    const waterMaterial = new THREE.MeshStandardMaterial({ color: '#1f7ea6', roughness: 0.06, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.86 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.07;
    water.receiveShadow = true;
    scene.add(water);

    // ---------------------------------------------------------------- instancing helpers
    const dummy = new THREE.Object3D();
    const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, shadow = true) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
      mesh.count = count;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    const disposeMeshes = (meshes: THREE.InstancedMesh[], geometryToo = true) => meshes.forEach(mesh => { if (geometryToo) mesh.geometry.dispose(); mesh.removeFromParent(); mesh.dispose(); });

    // ---------------------------------------------------------------- roads
    const asphaltMaterial = std('#ffffff', { map: textures.asphalt, roughness: 0.9 });
    const markingMaterial = std('#f4f1e6', { roughness: 0.6 });
    const curbMaterial = std('#e8e4dc', { map: textures.pavement, roughness: 0.85 });
    const poleMaterial = std('#3d464d', { metalness: 0.6, roughness: 0.4 });
    const lampMaterial = std('#fff6d8', { emissive: '#ffd68a', emissiveIntensity: 0 });
    let roadMeshes: THREE.InstancedMesh[] = [];
    let roadSet = new Set<number>();
    const buildRoads = (roads: Set<number>) => {
      disposeMeshes(roadMeshes);
      const list = [...roads];
      const asphalt = instanced(new THREE.BoxGeometry(1, 0.05, 1), asphaltMaterial, list.length, false);
      const marks: THREE.Matrix4[] = [], curbs: THREE.Matrix4[] = [], stripes: THREE.Matrix4[] = [];
      const p = new THREE.Vector3();
      list.forEach((index, i) => {
        const { x, z } = tileXZ(index);
        world(x, z, p);
        dummy.position.set(p.x, ROAD_SURFACE - 0.025, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        asphalt.setMatrixAt(i, dummy.matrix);
        const links = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => roads.has(tileIndex(x + dx, z + dz)) && x + dx >= 0 && x + dx < MAP && z + dz >= 0 && z + dz < MAP);
        const connections = links.filter(Boolean).length;
        links.forEach((linked, side) => {
          const angle = side * (Math.PI / 2); // 0: +z, 1: +x, 2: -z, 3: -x
          const dx = Math.sin(angle), dz = Math.cos(angle);
          if (linked) {
            if (connections <= 2) {
              const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.28, 0.034, p.z + dz * 0.28), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1, 1, 1));
              marks.push(m);
            } else {
              // Zebra crossing on each arm of a junction.
              for (let s = -2; s <= 2; s += 1) {
                stripes.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.4 + Math.cos(angle) * s * 0.12, 0.034, p.z + dz * 0.4 - Math.sin(angle) * s * 0.12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1, 1, 1)));
              }
            }
          } else {
            curbs.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * (PAVEMENT_INNER + 0.075), PAVEMENT_SURFACE - 0.035, p.z + dz * (PAVEMENT_INNER + 0.075)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1, 1, 1)));
          }
        });
      });
      const make = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], shadow = false) => {
        const mesh = instanced(geometry, material, matrices.length, shadow);
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        return mesh;
      };
      roadMeshes = [
        asphalt,
        make(new THREE.BoxGeometry(0.035, 0.006, 0.2), markingMaterial, marks),
        make(new THREE.BoxGeometry(0.06, 0.006, 0.16), markingMaterial, stripes),
        make(new THREE.BoxGeometry(1, 0.07, 0.15), curbMaterial, curbs),
      ];
      roadMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    };

    // Street lights the player has put up: a post on the pavement, an arm over the road, a
    // lamp, and at night a warm pool of light on the ground.
    let lightMeshes: THREE.InstancedMesh[] = [];
    const poolMaterial = new THREE.MeshBasicMaterial({ map: textures.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const buildLights = (lights: number[], roads: Set<number>) => {
      disposeMeshes(lightMeshes);
      const poles: THREE.Matrix4[] = [], arms: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], pools: THREE.Matrix4[] = [];
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
      lights.forEach(index => {
        const { x, z } = tileXZ(index);
        world(x, z, p);
        // Stand it on a side with no road joining - the pavement.
        const sides = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => !roads.has(tileIndex(x + dx, z + dz)));
        const side = Math.max(0, sides.findIndex(Boolean));
        const angle = side * (Math.PI / 2);
        const dx = Math.sin(angle), dz = Math.cos(angle);
        q.setFromAxisAngle(yAxis, angle);
        poles.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.44, 0.07, p.z + dz * 0.44), q, one));
        arms.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.34, 0.66, p.z + dz * 0.34), q, one));
        heads.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.24, 0.635, p.z + dz * 0.24), q, one));
        pools.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.2, 0.045, p.z + dz * 0.2), new THREE.Quaternion(), new THREE.Vector3(1.9, 1, 1.9)));
      });
      const make = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], shadow: boolean) => {
        const mesh = instanced(geometry, material, matrices.length, shadow);
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
      };
      lightMeshes = [
        make(new THREE.CylinderGeometry(0.011, 0.016, 0.6, 12).translate(0, 0.3, 0), poleMaterial, poles, true),
        make(new THREE.BoxGeometry(0.014, 0.014, 0.22), poleMaterial, arms, true),
        make(new THREE.CylinderGeometry(0.02, 0.035, 0.03, 16), lampMaterial, heads, false),
        make(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMaterial, pools, false),
      ];
      lightMeshes[3].renderOrder = 3;
      lightMeshes[3].receiveShadow = false;
    };

    // ---------------------------------------------------------------- scenery trees
    let treeMeshes: THREE.InstancedMesh[] = [];
    const trunkGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.3, 8).translate(0, 0.15, 0);
    const crownGeometry = new THREE.IcosahedronGeometry(0.2, 2).translate(0, 0.42, 0);
    const pineGeometry = new THREE.ConeGeometry(0.17, 0.55, 16).translate(0, 0.5, 0);
    const trunkMaterial = std('#7a5638', { roughness: 0.9 });
    const leafMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const buildTrees = (city: CityState, roads: Set<number>) => {
      disposeMeshes(treeMeshes, false);
      const taken = occupancy(city);
      const spots: Array<{ x: number; z: number; s: number; pine: boolean; tint: number }> = [];
      const tiles = terrainMap();
      const cleared = new Set(city.cleared);
      for (let z = 0; z < MAP; z += 1) for (let x = 0; x < MAP; x += 1) {
        const index = z * MAP + x;
        if (tiles[index] !== 'grass' || roads.has(index) || taken.has(index) || cleared.has(index)) continue;
        const count = wildTrees(x, z);
        const h = treeSeed(x, z);
        for (let k = 0; k < count; k += 1) spots.push({ x: x + 0.25 + ((h * 7 + k * 0.4) % 0.5), z: z + 0.25 + ((h * 13 + k * 0.3) % 0.5), s: (isForest(x, z) ? 0.9 : 0.8) + ((h * 31) % 0.6), pine: (h * 97) % 1 < 0.45, tint: (h * 53) % 1 });
      }
      const trunks = instanced(trunkGeometry, trunkMaterial, spots.length);
      const crowns = instanced(crownGeometry, leafMaterial, spots.filter(s => !s.pine).length);
      const pines = instanced(pineGeometry, leafMaterial, spots.filter(s => s.pine).length);
      const color = new THREE.Color();
      let c = 0, pc = 0;
      spots.forEach((spot, i) => {
        dummy.position.set(spot.x - HALF, 0, spot.z - HALF);
        dummy.rotation.set(0, spot.tint * 6, 0);
        dummy.scale.setScalar(spot.s);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        color.setHSL(0.25 + spot.tint * 0.08, 0.45, 0.28 + spot.tint * 0.12);
        if (spot.pine) { pines.setMatrixAt(pc, dummy.matrix); pines.setColorAt(pc, color); pc += 1; }
        else { crowns.setMatrixAt(c, dummy.matrix); crowns.setColorAt(c, color); c += 1; }
      });
      treeMeshes = [trunks, crowns, pines];
      treeMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
    };

    // ---------------------------------------------------------------- buildings
    const prefabs = new Map<string, Prefab>();
    const prefabFor = (type: string, level: number) => {
      const key = `${type}:${level}`;
      let prefab = prefabs.get(key);
      if (!prefab) {
        const size = type === 'hall' ? HALL.size : getBuilding(type)!.size;
        const group = buildModel(type, modelContext, level, size);
        prefab = bake(group);
        group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
        prefabs.set(key, prefab);
      }
      return prefab;
    };
    interface Placed { id: string; matrix: THREE.Matrix4; height: number; smoke: THREE.Vector3[] }
    const groups = new Map<string, { meshes: THREE.InstancedMesh[]; placed: Placed[]; prefab: Prefab }>();
    const placedById = new Map<string, Placed>();
    const animatedParts: Array<{ mesh: THREE.InstancedMesh; kind: 'rotor' | 'beam'; pivot: THREE.Vector3; placed: Placed[] }> = [];
    const smoke = new Smoke(scene, 160);
    const syncBuildings = (city: CityState, roads: Set<number>) => {
      const wanted = new Map<string, Array<{ id: string; x: number; z: number; size: number }>>();
      wanted.set('hall:1', [{ id: 'hall', x: HALL.x, z: HALL.z, size: HALL.size }]);
      city.buildings.forEach(building => {
        const key = `${building.type}:${building.level}`;
        wanted.set(key, [...(wanted.get(key) || []), { id: building.id, x: building.x, z: building.z, size: getBuilding(building.type)!.size }]);
      });
      groups.forEach((group, key) => { if (!wanted.has(key)) { disposeMeshes(group.meshes, false); groups.delete(key); } });
      placedById.clear();
      animatedParts.length = 0;
      const emitters: THREE.Vector3[] = [];
      wanted.forEach((list, key) => {
        const [type, level] = key.split(':');
        const prefab = prefabFor(type, Number(level));
        let group = groups.get(key);
        if (group && group.meshes[0].instanceMatrix.count < list.length) { disposeMeshes(group.meshes, false); group = undefined; }
        if (!group) {
          const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(list.length + 1)));
          const meshes = prefab.parts.map(part => {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
            mesh.castShadow = !(part.material as THREE.MeshStandardMaterial).transparent;
            mesh.receiveShadow = true;
            mesh.userData.key = key;
            scene.add(mesh);
            return mesh;
          });
          group = { meshes, placed: [], prefab };
          groups.set(key, group);
        }
        group.placed = list.map(item => {
          const center = world(item.x + (item.size - 1) / 2, item.z + (item.size - 1) / 2);
          const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing(roads, item.x, item.z, item.size)), new THREE.Vector3(1, 1, 1));
          const placed = { id: item.id, matrix, height: prefab.height, smoke: prefab.smoke.map(point => point.clone().applyMatrix4(matrix)) };
          placedById.set(item.id, placed);
          emitters.push(...placed.smoke);
          return placed;
        });
        group.meshes.forEach((mesh, partIndex) => {
          mesh.count = list.length;
          const part = prefab.parts[partIndex];
          if (part.anim) animatedParts.push({ mesh, kind: part.anim.kind, pivot: part.anim.pivot, placed: group!.placed });
          else group!.placed.forEach((placed, i) => mesh.setMatrixAt(i, placed.matrix));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        });
      });
      smoke.setEmitters(emitters);
    };

    // ---------------------------------------------------------------- people, cars, coins
    const hallCenter = world(HALL.x + 0.5, HALL.z + 0.5);
    const people = new Pedestrians(scene, MAX_PEOPLE, index => { const { x, z } = tileXZ(index); return world(x, z); }, hallCenter);
    const traffic = new Traffic(scene, MAX_CARS, index => { const { x, z } = tileXZ(index); return world(x, z); });
    const coinMaterial = new THREE.MeshStandardMaterial({ color: '#f5c542', metalness: 0.95, roughness: 0.22, emissive: '#7a5600', emissiveIntensity: 0.35 });
    const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 40).rotateX(Math.PI / 2), coinMaterial, 3000);
    coinMesh.count = 0;
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);
    let coinIds: string[] = [];

    // ---------------------------------------------------------------- overlays
    const overlayMaterial = new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.38, depthWrite: false });
    const hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), overlayMaterial);
    hover.visible = false;
    hover.renderOrder = 2;
    scene.add(hover);
    const selectionMaterial = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthWrite: false });
    const selection = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), selectionMaterial);
    selection.visible = false;
    scene.add(selection);
    const roadPreviewMaterial = new THREE.MeshBasicMaterial({ color: '#7dc4ff', transparent: true, opacity: 0.55, depthWrite: false });
    const roadPreview = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), roadPreviewMaterial, 400);
    roadPreview.count = 0;
    roadPreview.frustumCulled = false;
    scene.add(roadPreview);
    const landMaterial = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.22, depthWrite: false });
    let landMeshes: THREE.Object3D[] = [];
    const ghost = new THREE.Group();
    scene.add(ghost);
    let ghostKey = '';
    const ghostMaterials: THREE.Material[] = [];
    const setGhost = (type: string | null, level = 1) => {
      const key = type ? `${type}:${level}` : '';
      if (key === ghostKey) return;
      ghostKey = key;
      ghost.clear();
      ghostMaterials.forEach(material => material.dispose());
      ghostMaterials.length = 0;
      if (!type) return;
      prefabFor(type, level).parts.forEach(part => {
        const material = (part.material as THREE.MeshStandardMaterial).clone();
        material.transparent = true;
        material.opacity = 0.6;
        material.depthWrite = false;
        ghostMaterials.push(material);
        ghost.add(new THREE.Mesh(part.geometry, material));
      });
    };

    const updateLand = (city: CityState, active: boolean) => {
      landMeshes.forEach(object => { object.removeFromParent(); if (object instanceof THREE.Mesh) object.geometry.dispose(); if (object instanceof THREE.Sprite) object.material.dispose(); });
      landMeshes = [];
      if (!active) return;
      const level = levelForXp(city.xp);
      const canBuyMore = city.chunks.length < maxChunks(level);
      const price = chunkCost(city);
      for (let chunk = 0; chunk < CHUNKS * CHUNKS; chunk += 1) {
        if (!chunkAvailable(city, chunk)) continue;
        const cx = chunk % CHUNKS, cz = Math.floor(chunk / CHUNKS);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK - 0.2, CHUNK - 0.2).rotateX(-Math.PI / 2), landMaterial);
        plane.position.set(cx * CHUNK - HALF + CHUNK / 2, 0.08, cz * CHUNK - HALF + CHUNK / 2);
        plane.userData.chunk = chunk;
        scene.add(plane);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.label(canBuyMore ? `${price} 🪙` : `Lv ${level + 1}`, canBuyMore ? '#1d3b4d' : '#6b6b6b'), depthTest: false }));
        sprite.position.set(plane.position.x, 1.4, plane.position.z);
        sprite.scale.set(3, 3, 1);
        scene.add(sprite);
        landMeshes.push(plane, sprite);
      }
    };

    // ---------------------------------------------------------------- day and night
    let isNight = isNightNow();
    const applyNight = (value: boolean) => {
      isNight = value;
      const elevation = value ? -1.5 : 38, azimuth = value ? 200 : 135;
      sunDirection.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
      skyUniforms.sunPosition.value.copy(sunDirection);
      envSky.material.uniforms.sunPosition.value.copy(sunDirection);
      envTarget?.dispose();
      envTarget = pmrem.fromScene(skyScene, 0.02, 0.1, 1000); // far enough to include the sky dome
      scene.environment = envTarget.texture;
      // The sky model's light is very bright, so the image-based part is kept low and the sun
      // does the shaping.
      scene.environmentIntensity = value ? 0.35 : 0.38;
      renderer.toneMappingExposure = value ? 1.05 : 0.72;
      sun.intensity = value ? 0.55 : 2.4;
      sun.color.set(value ? '#9fb3ff' : '#fff1d6');
      hemisphere.intensity = value ? 0.9 : 0.45;
      hemisphere.color.set(value ? '#8fa6d9' : '#dfefff');
      poolMaterial.opacity = value ? 0.85 : 0;
      glow.forEach(material => { material.emissiveIntensity = value ? (material.emissiveMap ? 1.4 : 2.2) : 0; });
      traffic.lightMaterial.emissiveIntensity = value ? 2.5 : 0.2;
      waterMaterial.color.set(value ? '#1d4f73' : '#1f7ea6');
    };

    // ---------------------------------------------------------------- picking and input
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const aim = (clientX: number, clientY: number) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };
    const tileUnderPointer = () => {
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
      const x = Math.floor(hit.x + HALF), z = Math.floor(hit.z + HALF);
      return x >= 0 && z >= 0 && x < MAP && z < MAP ? { x, z } : null;
    };
    let hovered: { x: number; z: number } | null = null;
    let down: { x: number; y: number; time: number; id: number } | null = null;
    let roadStart: { x: number; z: number } | null = null;
    let roadTiles: number[] = [];
    let dragKind: 'road' | 'lights' = 'road'; // a drag lays roads or puts up street lights

    const previewRoad = (tiles: number[]) => {
      const city = latest.current.city;
      const plan = dragKind === 'road' ? planRoads(city, tiles) : { ...planLights(city, tiles), blocked: tiles.filter(index => !city.roads.includes(index)).length };
      const fresh = new Set(plan.fresh);
      const done = dragKind === 'road' ? city.roads : city.lights;
      roadPreview.count = Math.min(400, tiles.length);
      tiles.slice(0, 400).forEach((index, i) => {
        const { x, z } = tileXZ(index);
        const p = world(x, z);
        dummy.position.set(p.x, 0.06, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        roadPreview.setMatrixAt(i, dummy.matrix);
        roadPreview.setColorAt(i, new THREE.Color(fresh.has(index) ? (dragKind === 'road' ? '#7dc4ff' : '#ffd166') : done.includes(index) ? '#c0c0c0' : '#ff6b6b'));
      });
      roadPreview.instanceMatrix.needsUpdate = true;
      if (roadPreview.instanceColor) roadPreview.instanceColor.needsUpdate = true;
      setRoadCost({ tiles: plan.fresh.length, cost: plan.cost, blocked: plan.blocked, what: dragKind === 'road' ? 'new road tiles' : 'street lights' });
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      canvas.focus({ preventScroll: true });
      down = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
      const kind = latest.current.mode.kind;
      if ((kind === 'road' || kind === 'lights') && event.button === 0 && event.isPrimary) {
        dragKind = kind;
        aim(event.clientX, event.clientY);
        const tile = tileUnderPointer();
        if (tile) {
          controls.enabled = false; // the drag draws instead of panning
          roadStart = tile;
          roadTiles = [tileIndex(tile.x, tile.z)];
          previewRoad(roadTiles);
          canvas.setPointerCapture(event.pointerId);
        }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      aim(event.clientX, event.clientY);
      hovered = tileUnderPointer();
      if (roadStart && hovered) {
        roadTiles = roadPath(roadStart, hovered);
        previewRoad(roadTiles);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (roadStart) {
        const tiles = roadTiles;
        roadStart = null;
        roadTiles = [];
        roadPreview.count = 0;
        setRoadCost(null);
        controls.enabled = true;
        if (tiles.length) (dragKind === 'road' ? latest.current.onRoad : latest.current.onLights)(tiles);
        down = null;
        return;
      }
      if (!down || down.id !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.time < 600;
      down = null;
      if (moved > 6 || !quick || event.button !== 0) return;
      aim(event.clientX, event.clientY);
      const current = latest.current;
      const tile = tileUnderPointer();
      if (current.mode.kind === 'land') {
        const planes = landMeshes.filter(object => object instanceof THREE.Mesh);
        const chunkHit = raycaster.intersectObjects(planes)[0];
        if (chunkHit) current.onChunk(chunkHit.object.userData.chunk);
        else if (tile) current.onChunk(chunkOf(tile.x, tile.z));
        return;
      }
      if (current.mode.kind !== 'idle') { if (tile) current.onTile(tile.x, tile.z); return; }
      const coinHit = raycaster.intersectObject(coinMesh)[0];
      if (coinHit?.instanceId !== undefined && coinIds[coinHit.instanceId]) { current.onCollect(coinIds[coinHit.instanceId]); return; }
      const buildingMeshes: THREE.InstancedMesh[] = [];
      groups.forEach(group => buildingMeshes.push(...group.meshes));
      const buildingHit = raycaster.intersectObjects(buildingMeshes, false)[0];
      if (buildingHit?.instanceId !== undefined) {
        const group = groups.get(buildingHit.object.userData.key);
        const id = group?.placed[buildingHit.instanceId]?.id;
        if (id) { current.onSelect(id); return; }
      }
      if (tile) current.onSelect(isHallTile(tile.x, tile.z) ? 'hall' : occupancy(current.city).get(tileIndex(tile.x, tile.z)) ?? null);
    };
    const onPointerLeave = () => { hovered = null; };
    canvas.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('contextmenu', event => event.preventDefault());

    const offset = new THREE.Vector3();
    engine.current = {
      rotate: delta => {
        offset.copy(camera.position).sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), delta);
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      zoom: factor => {
        offset.copy(camera.position).sub(controls.target).multiplyScalar(factor);
        if (offset.length() < controls.minDistance || offset.length() > controls.maxDistance) return;
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      setNight: applyNight,
      focus: (x, z) => {
        const target = world(x, z);
        offset.copy(camera.position).sub(controls.target);
        controls.target.copy(target);
        camera.position.copy(target).add(offset);
        controls.update();
      },
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // ---------------------------------------------------------------- frame loop
    let frame = 0;
    let previous = performance.now();
    let lastCity: CityState | null = null;
    let lastRoads: number[] | null = null;
    let lastLights: number[] | null = null;
    let lastCleared: number[] | null = null;
    let lastChunks: number[] | null = null;
    let landKey = '';
    let treesDue = 0;
    let lastPeopleCity: CityState | null = null;
    let lastStatus: CityStats['status'] | null = null;
    const animMatrix = new THREE.Matrix4(), animLocal = new THREE.Matrix4(), coinMatrix = new THREE.Matrix4(), coinQuat = new THREE.Quaternion(), coinPos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (latest.current.paused) { previous = time; return; }
      if (document.hidden || time - previous < 1000 / 50) return;
      const dt = Math.min((time - previous) / 1000, 0.1);
      previous = time;
      const current = latest.current;
      const motion = !reduced.matches;
      const city = current.city;

      if (city.chunks !== lastChunks) { lastChunks = city.chunks; paintTerrain(city); drawBorder(city); }
      if (city.roads !== lastRoads || city.lights !== lastLights) {
        const roadsChanged = city.roads !== lastRoads;
        lastRoads = city.roads;
        lastLights = city.lights;
        roadSet = new Set(city.roads);
        if (roadsChanged) buildRoads(roadSet);
        buildLights(city.lights, roadSet);
        people.setRoads(roadSet);
        traffic.setRoads(roadSet);
        treesDue = time + 400;
      }
      if (city.cleared !== lastCleared) { lastCleared = city.cleared; treesDue = treesDue || time + 50; }
      if (city !== lastCity) {
        lastCity = city;
        syncBuildings(city, roadSet);
        treesDue = treesDue || time + 400;
      }
      if (treesDue && time > treesDue) { treesDue = 0; buildTrees(city, roadSet); }
      // Plots for sale, redrawn only when what they show changes.
      const landMode = current.mode.kind === 'land';
      const nextLandKey = landMode ? `${city.chunks.join(',')}|${levelForXp(city.xp)}` : '';
      if (nextLandKey !== landKey) { landKey = nextLandKey; updateLand(city, landMode); }

      if (city !== lastPeopleCity || current.status !== lastStatus) {
        lastPeopleCity = city;
        lastStatus = current.status;
        const homes: HomePlace[] = [], works: WorkPlace[] = [];
        city.buildings.forEach(building => {
          const type = getBuilding(building.type)!;
          const status = current.status.get(building.id);
          if (!status) return;
          if (status.residents > 0) homes.push({ id: building.id, residents: status.residents, door: doorFor(roadSet, building.x, building.z, type.size) });
          if (status.staff > 0) works.push({ id: building.id, staff: status.staff });
        });
        people.setCity(homes, works);
      }
      traffic.setCount((current.residents + current.jobs) / 12);
      people.update(dt, time, motion, camera);
      traffic.update(dt, motion);
      smoke.update(time, motion);
      waterNormal.offset.set(motion ? time * 0.000012 : 0, motion ? time * 0.000008 : 0);

      // Spinning turbines and the lighthouse beam.
      animatedParts.forEach(part => {
        const angle = motion ? time * (part.kind === 'rotor' ? 0.002 : 0.0009) : 0;
        part.mesh.visible = part.kind === 'rotor' || isNight;
        part.placed.forEach((placed, i) => {
          if (part.kind === 'rotor') animLocal.makeRotationZ(angle);
          else animLocal.makeRotationY(angle);
          animLocal.setPosition(part.pivot);
          animMatrix.multiplyMatrices(placed.matrix, animLocal);
          part.mesh.setMatrixAt(i, animMatrix);
        });
        part.mesh.instanceMatrix.needsUpdate = true;
      });

      // Coins over buildings with something to collect.
      coinIds = Object.keys(current.pending).filter(id => current.pending[id] >= 1 && placedById.has(id)).slice(0, 3000);
      coinMesh.count = coinIds.length;
      coinIds.forEach((id, i) => {
        const placed = placedById.get(id)!;
        coinPos.setFromMatrixPosition(placed.matrix);
        coinPos.y = Math.min(placed.height, 6) + 0.35 + (motion ? Math.sin(time * 0.004 + coinPos.x) * 0.06 : 0);
        coinQuat.setFromAxisAngle(up, motion ? time * 0.003 + i : 0);
        coinMatrix.compose(coinPos, coinQuat, one);
        coinMesh.setMatrixAt(i, coinMatrix);
      });
      coinMesh.instanceMatrix.needsUpdate = true;

      // Placement preview.
      const mode = current.mode;
      const placing = mode.kind === 'place' ? { type: mode.type, level: 1, ignore: undefined as string | undefined } : mode.kind === 'move' ? (() => { const b = city.buildings.find(item => item.id === mode.id); return b ? { type: b.type, level: b.level, ignore: b.id } : null; })() : null;
      if (placing && hovered) {
        const size = getBuilding(placing.type)!.size;
        const ok = canPlace(city, placing.type, hovered.x, hovered.z, placing.ignore).ok;
        const center = world(hovered.x + (size - 1) / 2, hovered.z + (size - 1) / 2);
        hover.visible = true;
        hover.position.set(center.x, 0.05, center.z);
        hover.scale.set(size, 1, size);
        overlayMaterial.color.set(ok ? (getBuilding(placing.type)!.noRoad || hasRoadAccess(roadSet, hovered.x, hovered.z, size) ? '#7dff9a' : '#ffd166') : '#ff6b6b');
        setGhost(placing.type, placing.level);
        ghost.visible = true;
        ghost.position.copy(center);
        ghost.rotation.y = facing(roadSet, hovered.x, hovered.z, size);
      } else if ((mode.kind === 'bulldoze' || mode.kind === 'road' || mode.kind === 'lights') && hovered && !roadStart) {
        setGhost(null);
        ghost.visible = false;
        hover.visible = true;
        const center = world(hovered.x, hovered.z);
        hover.position.set(center.x, 0.06, center.z);
        hover.scale.set(1, 1, 1);
        overlayMaterial.color.set(mode.kind === 'bulldoze' ? '#ff6b6b' : mode.kind === 'lights' ? '#ffd166' : '#7dc4ff');
      } else {
        hover.visible = false;
        ghost.visible = false;
      }

      // Selection outline.
      const selected = current.selectedId === 'hall' ? { x: HALL.x, z: HALL.z, size: HALL.size } : (() => { const b = city.buildings.find(item => item.id === current.selectedId); return b ? { x: b.x, z: b.z, size: getBuilding(b.type)!.size } : null; })();
      selection.visible = Boolean(selected) && mode.kind === 'idle';
      if (selected) {
        const center = world(selected.x + (selected.size - 1) / 2, selected.z + (selected.size - 1) / 2);
        selection.position.set(center.x, 0.06, center.z);
        selection.scale.set(selected.size, 1, selected.size);
      }

      // Shadows follow the part of the city you're looking at.
      sun.target.position.copy(controls.target);
      sun.position.copy(controls.target).addScaledVector(sunDirection.y > 0 ? sunDirection : new THREE.Vector3(0.3, 1, 0.2).normalize(), 60);
      controls.update();
      renderer.render(scene, camera);
    };
    applyNight(isNight);
    frame = requestAnimationFrame(tick);

    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setUnavailable(true); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      engine.current = null;
      canvas.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', lost);
      people.dispose();
      traffic.dispose();
      smoke.dispose();
      updateLand(latest.current.city, false);
      disposeMeshes(roadMeshes);
      disposeMeshes(lightMeshes);
      poolMaterial.dispose();
      disposeMeshes(treeMeshes, false);
      groups.forEach(group => disposeMeshes(group.meshes, false));
      prefabs.forEach(prefab => prefab.parts.forEach(part => part.geometry.dispose()));
      [trunkGeometry, crownGeometry, pineGeometry, terrainGeometry, coinMesh.geometry, hover.geometry, selection.geometry, roadPreview.geometry, (water.geometry as THREE.BufferGeometry), border?.geometry].forEach(geometry => geometry?.dispose());
      [leafMaterial, terrainMaterial, waterMaterial, coinMaterial, overlayMaterial, selectionMaterial, roadPreviewMaterial, landMaterial, borderMaterial, sky.material, envSky.material, ...ghostMaterials, ...materials.values()].forEach(material => material.dispose());
      grassTexture.dispose();
      textures.dispose();
      envTarget?.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  if (unavailable) return <>{props.fallback}</>;

  return (
    <div className="city-game relative overflow-hidden rounded-2xl">
      <div ref={host} className="city-canvas" data-testid="city-3d" />
      <div className="absolute right-3 top-3 flex gap-1">
        <button type="button" aria-label="Rotate left" onClick={() => engine.current?.rotate(-0.4)} className="island-pad-button"><RotateCcw size={15} /></button>
        <button type="button" aria-label="Rotate right" onClick={() => engine.current?.rotate(0.4)} className="island-pad-button"><RotateCw size={15} /></button>
        <button type="button" aria-label="Back to the Town Hall" onClick={() => engine.current?.focus(HALL.x + 1, HALL.z + 1)} className="island-pad-button"><Home size={15} /></button>
        <button type="button" aria-label={night ? 'Switch to day' : 'Switch to night'} onClick={() => setNight(value => !value)} className="island-pad-button">{night ? <Sun size={15} /> : <Moon size={15} />}</button>
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => engine.current?.zoom(0.8)} className="island-pad-button"><Plus size={16} /></button>
        <button type="button" aria-label="Zoom out" onClick={() => engine.current?.zoom(1.25)} className="island-pad-button"><Minus size={16} /></button>
      </div>
      {roadCost && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-950/85 px-4 py-1.5 text-xs font-bold text-white">
          {roadCost.tiles} {roadCost.what} · {roadCost.cost} 🪙{roadCost.blocked ? ` · ${roadCost.blocked} blocked` : ''}
        </div>
      )}
    </div>
  );
};

export default CityScene3D;
