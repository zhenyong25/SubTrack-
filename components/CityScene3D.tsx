import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Home, Minus, Moon, Plus, RotateCcw, RotateCw, Sun } from 'lucide-react';
import {
  CHUNK, CHUNKS, HALL, MAP, canPlace, chunkAvailable, chunkCost, chunkOf, getBuilding, hasRoadAccess, isForest, isHallTile, levelForXp, maxChunks,
  occupancy, ownsTile, planLights, planRoads, roadPath, terrainMap, tileIndex, tileXZ, treeSeed, wildTrees,
  roadKindAt, frontQuarter, doorTile, type CityState, type CityStats, type RoadKind, type StopKind,
} from '../services/cityGameService';
import { createTextures, type FacadeStyle } from './city3d/textures';
import { bake, buildModel, type ModelContext, type Prefab } from './city3d/models';
import { LANE, PAVEMENT_SURFACE, ROAD_SURFACE, Smoke, Traffic, vehiclePose } from './city3d/traffic';
import { Pedestrians, type HomePlace, type WorkPlace } from './city3d/people';
import { RECREATION_TYPES, type RecreationPlace } from './city3d/recreation';
import { TRACTOR_TYPES } from './city3d/farmVehicles';
import { ACTIVITY_TYPES, WATER_ACTIVITY_TYPES, boatKind, boatState, waterAccess, type WaterAccess } from './city3d/activities';
import { StreetNetwork } from './city3d/streets';
import { ANIMAL_TYPES, Animals, type AnimalPlace } from './city3d/animals';
import { BILLBOARD_TYPES, DigitalBillboards } from './city3d/billboards';
import { RoadIncidents } from './city3d/incidents';
import { CityWeather, WEATHER_LABELS, type WeatherChoice } from './city3d/weather';
import { groundAt, terrainHeights } from './city3d/terrainShape';
import { Aviation, RoofPads, type AirportPlace, type Helipad } from './city3d/aviation';
import { FlightLife } from './city3d/flights';
import { StreetStops, stopFrame } from './city3d/streetStops';
import { litWindows, setWindowLights, windowLight } from './city3d/windowLights';
import { expansionById } from '../services/cityBuildingExpansion';
import { TrafficSignals } from './city3d/trafficSignals';
import type { BuildingEntrance } from './city3d/buildingVisits';
import type { RoadsidePoint } from './city3d/roadside';
import { pavementRects } from './city3d/pavement';

// The 3D city on a 100×100 map. Physically based lighting from a sky model, procedural
// textures, smooth models baked into InstancedMeshes, and residents and cars walking and
// driving the roads. Drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom.

export type SceneMode =
  | { kind: 'idle' }
  | { kind: 'place'; type: string; rotation?: number } // quarter turns; unset faces the road
  | { kind: 'move'; id: string; rotation?: number }
  | { kind: 'road'; road?: RoadKind }
  | { kind: 'lights' }
  | { kind: 'stops'; stop?: StopKind }
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

// Which way a building faces (radians about y): the rotation the player chose, or else towards a
// road (cityGameService `frontQuarter`).
const facing = (roads: Set<number>, x: number, z: number, size: number, rotation?: number) => frontQuarter(roads, { x, z, rotation }, size) * Math.PI / 2;

// A building's front door: the road it faces, or else any road beside it.
const doorFor = (roads: Set<number>, x: number, z: number, size: number, rotation?: number) => doorTile(roads, { x, z, rotation }, size);

const CityScene3D: React.FC<Props> = props => {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const engine = useRef<{ rotate: (delta: number) => void; zoom: (factor: number) => void; setNight: (night: boolean) => void; setWeather: (weather: WeatherChoice) => void; focus: (x: number, z: number) => void } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [night, setNight] = useState(isNightNow);
  const [weatherChoice, setWeatherChoice] = useState<WeatherChoice>('auto');
  const [weatherName, setWeatherName] = useState('Sunny');
  const [incidentNotice, setIncidentNotice] = useState<{ id: number; text: string; x: number; z: number } | null>(null);
  const [roadCost, setRoadCost] = useState<{ tiles: number; cost: number; blocked: number; what: string } | null>(null);
  const [boatNotice, setBoatNotice] = useState<{ id: string; text: string } | null>(null);
  const boatPosition = useRef<{ x: number; z: number } | null>(null);

  useEffect(() => { engine.current?.setNight(night); }, [night]);
  useEffect(() => { engine.current?.setWeather(weatherChoice); }, [weatherChoice]);
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
    canvas.setAttribute('aria-label', 'Your 3D city. Residents visit buildings and use traffic-controlled crossings. Drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom.');
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
    // Materials made after night has fallen (buildings load after the scene starts) glow too.
    let glowing = false;
    const glowFor = (material: THREE.MeshStandardMaterial) => (glowing ? (material.emissiveMap ? 1.4 : 2.2) : 0);
    const std: ModelContext['std'] = (color, extra) => {
      const key = `${color}|${JSON.stringify(extra || {})}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
        if (extra?.emissiveIntensity === 0) { glow.add(material); material.emissiveIntensity = glowFor(material); }
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
        litWindows(material, style.cols, style.rows);
        glow.add(material); material.emissiveIntensity = glowFor(material);
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
    // Mountains, valleys and the sea bed; level under everything built, redone as the city grows.
    let groundHeights = terrainHeights(terrainMap(), new Set());
    const shapeTerrain = (city: CityState) => {
      groundHeights = terrainHeights(terrainMap(), new Set([...occupancy(city).keys(), ...city.roads]));
      const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;
      groundHeights.forEach((height, vertex) => positions.setY(vertex, height));
      positions.needsUpdate = true;
      terrainGeometry.computeVertexNormals();
      terrainGeometry.computeBoundingSphere();
    };
    const rock = new THREE.Color('#8f897e'), snow = new THREE.Color('#f3f5f6');
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
        // Grass gives way to bare rock up the mountains, and snow on the highest peaks.
        const height = groundHeights[j * (MAP + 1) + i];
        if (t !== 'water' && height > 0.6) color.lerp(rock, Math.min(1, (height - 0.6) / 1.2));
        if (height > 2.6) color.lerp(snow, Math.min(1, (height - 2.6) / 0.6));
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
    // Each kind of road has its own surface and kerb; avenues add a planted median, tram lines
    // rails that follow the tram's own path round bends.
    const surfaces: Record<RoadKind, THREE.Material> = {
      street: std('#ffffff', { map: textures.asphalt, roughness: 0.9 }),
      avenue: std('#c9ccd0', { map: textures.asphalt, roughness: 0.85 }),
      tram: std('#e6e3dd', { map: textures.asphalt, roughness: 0.9 }),
      country: std('#ffffff', { map: textures.gravel, roughness: 1 }),
      cobble: std('#ffffff', { map: textures.cobble, roughness: 0.95 }),
    };
    const kerbs: Record<RoadKind, THREE.Material> = {
      street: std('#e8e4dc', { map: textures.pavement, roughness: 0.85 }),
      avenue: std('#ece6da', { map: textures.pavement, roughness: 0.85 }),
      tram: std('#e8e4dc', { map: textures.pavement, roughness: 0.85 }),
      country: std('#b7c98f', { map: textures.grass, roughness: 1 }),
      cobble: std('#d9c8ab', { map: textures.cobble, roughness: 0.9 }),
    };
    const markingMaterial = std('#f4f1e6', { roughness: 0.6 });
    const railMaterial = std('#a4abb0', { metalness: 0.8, roughness: 0.3 });
    const hedgeMaterial = std('#4f8a4b', { roughness: 0.9 });
    const planterMaterial = std('#cfc8ba', { roughness: 0.8 });
    const poleMaterial = std('#3d464d', { metalness: 0.6, roughness: 0.4 });
    const lampMaterial = std('#fff6d8', { emissive: '#ffd68a', emissiveIntensity: 0 });
    let roadMeshes: THREE.InstancedMesh[] = [];
    let roadSet = new Set<number>();
    let roadKinds = new Map<number, RoadKind>();
    const buildRoads = (roads: Set<number>, kinds: Map<number, RoadKind>) => {
      disposeMeshes(roadMeshes);
      const kindOf = (index: number) => kinds.get(index) || 'street';
      const surface = new Map<RoadKind, THREE.Matrix4[]>(), kerb = new Map<RoadKind, THREE.Matrix4[]>();
      const push = (map: Map<RoadKind, THREE.Matrix4[]>, kind: RoadKind, m: THREE.Matrix4) => { const list = map.get(kind); if (list) list.push(m); else map.set(kind, [m]); };
      const bridgePiers: THREE.Matrix4[] = [], railings: THREE.Matrix4[] = [];
      const marks: THREE.Matrix4[] = [], stripes: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = [], planters: THREE.Matrix4[] = [], hedges: THREE.Matrix4[] = [], trees: THREE.Matrix4[] = [];
      const p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), unit = new THREE.Vector3(1, 1, 1);
      const turn = (angle: number) => new THREE.Quaternion().setFromAxisAngle(yAxis, angle);
      // A straight rail between two points on the road surface.
      const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
        const length = a.distanceTo(b); if (length < 0.001) return;
        rails.push(new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, ROAD_SURFACE + 0.002, (a.z + b.z) / 2), turn(Math.atan2(b.x - a.x, b.z - a.z)), new THREE.Vector3(1, 1, length + 0.004)));
      };
      // Both rails of the lane a tram takes from `from` through `via` to `to`, sampled from the
      // same curve the trams drive.
      const track = (from: number, via: number, to: number) => {
        const points: Array<[THREE.Vector3, number]> = [];
        for (let i = 0; i <= 8; i++) {
          const u = i / 8, pos = new THREE.Vector3();
          const heading = u < 0.5 ? vehiclePose(streets.toWorld, { from, to: via, next: to, t: 0.5 + u, speed: 0 }, pos) : vehiclePose(streets.toWorld, { from: via, to, previous: from, t: u - 0.5, speed: 0 }, pos);
          points.push([pos, heading]);
        }
        for (const side of [-0.035, 0.035]) for (let i = 1; i < points.length; i++) {
          const offset = (pos: THREE.Vector3, heading: number) => pos.clone().add(new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(side));
          rail(offset(...points[i - 1]), offset(...points[i]));
        }
      };
      [...roads].forEach(index => {
        const { x, z } = tileXZ(index), kind = kindOf(index);
        world(x, z, p);
        push(surface, kind, new THREE.Matrix4().compose(new THREE.Vector3(p.x, ROAD_SURFACE - 0.025, p.z), new THREE.Quaternion(), unit));
        const neighbour = (dx: number, dz: number) => x + dx >= 0 && x + dx < MAP && z + dz >= 0 && z + dz < MAP && roads.has(tileIndex(x + dx, z + dz)) ? tileIndex(x + dx, z + dz) : null;
        const sides = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => neighbour(dx, dz));
        const straight = sides.filter(n => n !== null).length === 2 && (sides[0] !== null && sides[2] !== null || sides[1] !== null && sides[3] !== null);
        const crossing = streets.crossings.has(index) || streets.boxAt(index);
        sides.forEach((linked, side) => {
          if (linked === null) return;
          const angle = side * (Math.PI / 2); // 0: +z, 1: +x, 2: -z, 3: -x
          const dx = Math.sin(angle), dz = Math.cos(angle);
          if (streets.crossings.has(index)) {
            // A marked crossing matches each controlled sidewalk edge.
            for (let s = -2; s <= 2; s += 1) stripes.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.4 + Math.cos(angle) * s * 0.15, 0.034, p.z + dz * 0.4 - Math.sin(angle) * s * 0.15), turn(angle), unit));
          } else if (kind === 'street' || kind === 'avenue' && !straight) {
            marks.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.28, 0.034, p.z + dz * 0.28), turn(angle), unit));
          }
        });
        if (kind === 'avenue' && straight && !crossing) {
          // A raised planter down the middle with a clipped hedge and two slim trees.
          const angle = sides[0] !== null ? 0 : Math.PI / 2;
          planters.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ROAD_SURFACE, p.z), turn(angle), unit));
          hedges.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ROAD_SURFACE + 0.025, p.z), turn(angle), unit));
          for (const along of [-0.25, 0.25]) trees.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + Math.sin(angle) * along, ROAD_SURFACE + 0.03, p.z + Math.cos(angle) * along), new THREE.Quaternion(), unit));
        }
        if (kind === 'tram') {
          const tramSides = sides.map(n => n !== null && kindOf(n) === 'tram' ? n : null), linked = tramSides.filter((n): n is number => n !== null);
          if (linked.length === 2) { track(linked[0], index, linked[1]); track(linked[1], index, linked[0]); }
          else tramSides.forEach((n, side) => {
            if (n === null) return;
            const angle = side * (Math.PI / 2), dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), across = new THREE.Vector3(dir.z, 0, -dir.x);
            for (const lane of [-LANE, LANE]) for (const r of [-0.035, 0.035]) {
              const offset = across.clone().multiplyScalar(lane + r);
              rail(p.clone().add(offset), p.clone().addScaledVector(dir, 0.5).add(offset));
            }
          });
        }
        if (terrainMap()[index] === 'water') {
          for (const s of [-1, 1]) for (const along of [-0.3, 0.3]) {
            const horizontal = sides[1] !== null || sides[3] !== null;
            bridgePiers.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + (horizontal ? along : s * 0.32), -0.6, p.z + (horizontal ? s * 0.32 : along)), new THREE.Quaternion(), unit));
          }
          // A continuous railing along each open edge of the deck.
          sides.forEach((linked, side) => {
            if (linked !== null) return;
            const angle = side * (Math.PI / 2), dx = Math.sin(angle), dz = Math.cos(angle);
            railings.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * 0.485, PAVEMENT_SURFACE, p.z + dz * 0.485), new THREE.Quaternion(), new THREE.Vector3(dx ? 0.012 : 1, 1, dz ? 0.012 : 1)));
          });
        }
        for (const rect of pavementRects(roads, index)) push(kerb, kind, new THREE.Matrix4().compose(new THREE.Vector3(p.x + rect.x, PAVEMENT_SURFACE - 0.035, p.z + rect.z), new THREE.Quaternion(), new THREE.Vector3(rect.width, 1, rect.depth)));
      });
      const make = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], shadow = false) => {
        const mesh = instanced(geometry, material, matrices.length, shadow);
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        return mesh;
      };
      const tree = new THREE.ConeGeometry(0.035, 0.16, 8).translate(0, 0.11, 0);
      roadMeshes = [
        ...[...surface].map(([kind, list]) => make(new THREE.BoxGeometry(1, 0.05, 1), surfaces[kind], list)),
        ...[...kerb].map(([kind, list]) => make(new THREE.BoxGeometry(1, 0.07, 1), kerbs[kind], list)),
        make(new THREE.BoxGeometry(0.035, 0.006, 0.2), markingMaterial, marks),
        make(new THREE.BoxGeometry(0.06, 0.006, 0.2), markingMaterial, stripes),
        make(new THREE.BoxGeometry(0.012, 0.005, 1), railMaterial, rails),
        make(new THREE.BoxGeometry(0.07, 0.025, 0.94).translate(0, 0.0125, 0), planterMaterial, planters),
        make(new THREE.BoxGeometry(0.052, 0.022, 0.9).translate(0, 0.011, 0), hedgeMaterial, hedges),
        make(tree, hedgeMaterial, trees, true),
        make(new THREE.CylinderGeometry(0.006, 0.008, 0.04, 6).translate(0, 0.02, 0), poleMaterial, trees),
        make(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 10).translate(0, 0.31, 0), planterMaterial, bridgePiers, true),
        make(new THREE.BoxGeometry(1, 0.05, 1).translate(0, 0.025, 0), poleMaterial, railings),
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
        if (tiles[index] !== 'grass' || roads.has(index) || taken.has(index) || cleared.has(index) || groundAt(groundHeights, x + 0.5, z + 0.5) > 2.2) continue;
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
        dummy.position.set(spot.x - HALF, groundAt(groundHeights, spot.x, spot.z), spot.z - HALF);
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
    let roofPadsById = new Map<string, Helipad>();
    interface Placed { id: string; matrix: THREE.Matrix4; height: number; smoke: THREE.Vector3[]; pad: THREE.Vector3 | null }
    // Flat roofs that aren't a place to land: a crane's boom, the airport's control tower.
    const NO_ROOF_PAD = new Set(['harbourcrane', 'airport', 'hall']);
    const groups = new Map<string, { meshes: THREE.InstancedMesh[]; placed: Placed[]; prefab: Prefab }>();
    const placedById = new Map<string, Placed>();
    const animatedParts: Array<{ mesh: THREE.InstancedMesh; kind: 'rotor' | 'beam'; pivot: THREE.Vector3; placed: Placed[] }> = [];
    const smoke = new Smoke(scene, 160);
    const syncBuildings = (city: CityState, roads: Set<number>) => {
      const wanted = new Map<string, Array<{ id: string; x: number; z: number; size: number; rotation?: number }>>();
      wanted.set('hall:1', [{ id: 'hall', x: HALL.x, z: HALL.z, size: HALL.size }]);
      city.buildings.forEach(building => {
        const key = `${building.type}:${building.level}`;
        wanted.set(key, [...(wanted.get(key) || []), { id: building.id, x: building.x, z: building.z, size: getBuilding(building.type)!.size, rotation: building.rotation }]);
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
          const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing(roads, item.x, item.z, item.size, item.rotation)), new THREE.Vector3(1, 1, 1));
          const placed = { id: item.id, matrix, height: prefab.height, smoke: prefab.smoke.map(point => point.clone().applyMatrix4(matrix)), pad: prefab.pad && !NO_ROOF_PAD.has(type) ? prefab.pad.clone().applyMatrix4(matrix) : null };
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
      // Helipads on the flat roofs of tall buildings, and the airports helicopters and planes use.
      // Each pad has a roof hatch beside it (towards the middle of the roof) that passengers come
      // up through, and the street outside the building they come out onto.
      const pads: Helipad[] = [...placedById.values()].filter(p => p.pad).flatMap(p => {
        const building = city.buildings.find(item => item.id === p.id); if (!building) return [];
        const size = getBuilding(building.type)!.size, center = world(building.x + (size - 1) / 2, building.z + (size - 1) / 2), position = p.pad!.clone().setY(p.pad!.y + 0.004);
        const inward = center.clone().sub(position).setY(0), road = doorFor(roads, building.x, building.z, size, building.rotation);
        const hatch = position.clone().addScaledVector(inward.lengthSq() > 0.0025 ? inward.normalize() : new THREE.Vector3(1, 0, 0), 0.14);
        // The front door, just inside the facade on the road side, at ground level.
        const front = facing(roads, building.x, building.z, size, building.rotation), ground = expansionById.has(building.type) ? 0.035 * size + 0.002 : 0.022;
        const door = center.clone().add(new THREE.Vector3(Math.sin(front), 0, Math.cos(front)).multiplyScalar(size * 0.18)).setY(ground);
        return [{ id: p.id, position, roof: true, hatch, door, road: road ?? undefined, curb: road !== null ? streets.curb(road, center) : undefined }];
      });
      roofPadsById = new Map(pads.map(pad => [pad.id, pad]));
      roofPads.set(pads);
      const airports: AirportPlace[] = city.buildings.filter(b => b.type === 'airport').map(b => {
        const size = getBuilding(b.type)!.size, center = world(b.x + (size - 1) / 2, b.z + (size - 1) / 2), road = doorFor(roads, b.x, b.z, size, b.rotation);
        return { id: b.id, size, center, rotation: facing(roads, b.x, b.z, size, b.rotation), road: road ?? undefined, curb: road !== null ? streets.curb(road, center) : undefined };
      });
      aviation.setPlaces(airports, pads);
    };

    // ---------------------------------------------------------------- people, cars, coins
    const hallCenter = world(HALL.x + 0.5, HALL.z + 0.5);
    const streets = new StreetNetwork(index => { const { x, z } = tileXZ(index); return world(x, z); });
    const signals = new TrafficSignals(scene, streets);
    const traffic = new Traffic(scene, MAX_CARS, streets.toWorld, streets);
    const incidents = new RoadIncidents(scene, traffic);
    const weather = new CityWeather(scene);
    const weatherFog = new THREE.FogExp2('#b7c6d1', 0.001); scene.fog = weatherFog;
    const people = new Pedestrians(scene, MAX_PEOPLE, streets.toWorld, hallCenter, streets, traffic);
    const animals = new Animals(scene);
    const billboards = new DigitalBillboards(scene);
    const aviation = new Aviation(scene), roofPads = new RoofPads(scene), streetStops = new StreetStops(scene);
    let lastStops: CityState['stops'] | null | undefined = null;
    let windowsAt = -1e9;
    people.flights = new FlightLife(scene, people.recreation, aviation);
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
      glowing = value;
      glow.forEach(material => { material.emissiveIntensity = glowFor(material); });
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
      const roadKind = latest.current.mode.kind === 'road' ? latest.current.mode.road || 'street' : 'street';
      const done = dragKind === 'road' ? city.roads.filter(index => roadKindAt(city, index) === roadKind) : city.lights;
      const plan = dragKind === 'road' ? planRoads(city, tiles, roadKind) : { ...planLights(city, tiles), blocked: tiles.filter(index => !city.roads.includes(index)).length };
      const fresh = new Set(plan.fresh);

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
      setWeather: choice => weather.setChoice(choice),
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
    let lastShapeRoads: number[] | null = null, lastShapeBuildings: CityState['buildings'] | null = null;
    let landKey = '';
    let treesDue = 0;
    let lastPeopleCity: CityState | null = null;
    let lastStatus: CityStats['status'] | null = null;
    let lastEntranceKey = '';
    // Jetty and boat loop for each waterfront facility, worked out once per placement.
    const waterCache = new Map<string, WaterAccess | null>();
    const terrainTiles = terrainMap();
    const isWater = (x: number, z: number) => { const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF); return tx < 0 || tz < 0 || tx >= MAP || tz >= MAP || terrainTiles[tz * MAP + tx] === 'water'; };
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

      if (city.roads !== lastShapeRoads || city.buildings !== lastShapeBuildings) { lastShapeRoads = city.roads; lastShapeBuildings = city.buildings; shapeTerrain(city); lastChunks = null; }
      if (city.chunks !== lastChunks) { lastChunks = city.chunks; paintTerrain(city); drawBorder(city); }
      if (city.stops !== lastStops) { lastStops = city.stops; streetStops.set(city.stops || [], streets.toWorld); }
      const entranceKey = city.buildings.map(b => `${b.id}:${b.type}:${b.x}:${b.z}`).join('|');
      if (city.roads !== lastRoads || city.lights !== lastLights || entranceKey !== lastEntranceKey) {
        const roadsChanged = city.roads !== lastRoads;
        const navigationChanged = roadsChanged || entranceKey !== lastEntranceKey;
        lastEntranceKey = entranceKey;
        lastRoads = city.roads;
        lastLights = city.lights;
        roadSet = new Set(city.roads);
        if (navigationChanged) {
          const doors = city.buildings.map(b => doorFor(roadSet, b.x, b.z, getBuilding(b.type)!.size, b.rotation)).filter((d): d is number => d !== null);
          roadKinds = new Map(city.roads.map(index => [index, roadKindAt(city, index)] as const).filter(([, kind]) => kind !== 'street'));
          streets.setRoads(roadSet, doors); signals.rebuild(); buildRoads(roadSet, roadKinds);
          people.setRoads(roadSet); traffic.setRoads(roadSet, roadKinds);
          incidents.setRoads(roadSet);
        }
        buildLights(city.lights, roadSet);
        lastStops = null;
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
        const homes: HomePlace[] = [], works: WorkPlace[] = [], recreation: RecreationPlace[] = [], entrances: BuildingEntrance[] = [];
        city.buildings.forEach(building => {
          const type = getBuilding(building.type)!;
          const status = current.status.get(building.id);
          if (!status) return;
          const door = doorFor(roadSet, building.x, building.z, type.size, building.rotation);
          const center = world(building.x + (type.size - 1) / 2, building.z + (type.size - 1) / 2);
          const rotation = facing(roadSet, building.x, building.z, type.size, building.rotation);
          if (door !== null && !RECREATION_TYPES.has(building.type) && !['nature'].includes(type.category) && !['tree', 'park', 'fountain', 'solar', 'windmill'].includes(building.type)) entrances.push({
            id: building.id, type: building.type, door, curb: streets.curb(door, center),
            threshold: new THREE.Vector3(center.x + Math.sin(rotation) * type.size * 0.18, 0.065, center.z + Math.cos(rotation) * type.size * 0.18),
            online: status.road && (status.residents > 0 || status.serviced > 0), public: ['business', 'shopping', 'dining', 'services', 'culture', 'civic', 'transport', 'advisors'].includes(type.category),
          });
          if (status.residents > 0) homes.push({ id: building.id, residents: status.residents, door: doorFor(roadSet, building.x, building.z, type.size, building.rotation) });
          if (status.staff > 0) works.push({ id: building.id, staff: status.staff, door: doorFor(roadSet, building.x, building.z, type.size, building.rotation) });
          if (RECREATION_TYPES.has(building.type) || ACTIVITY_TYPES.has(building.type)) {
            const waterKey = `${building.id}:${building.type}:${building.x}:${building.z}`;
            if (WATER_ACTIVITY_TYPES.has(building.type) && !waterCache.has(waterKey)) waterCache.set(waterKey, waterAccess(center, type.size, isWater, boatKind(building.type)));
            recreation.push({
              id: building.id, type: building.type, size: type.size, door, center, rotation,
              online: type.noRoad ? status.road || door !== null : status.road && status.serviced > 0, water: waterCache.get(waterKey) || undefined,
            });
          }
        });
        let sanitation = recreation.find(p => p.type === 'recyclingcentre' && p.online && p.door !== null);
        if (!sanitation && current.residents > 0) {
          const door = doorFor(roadSet, HALL.x, HALL.z, HALL.size);
          if (door !== null) { sanitation = { id: 'municipal-sanitation', type: 'recyclingcentre', size: 2, center: hallCenter.clone(), rotation: 0, door, online: true }; recreation.push(sanitation); }
        }
        if (sanitation) sanitation.serviceRole = 'sanitation';
        const roadsidePoints: RoadsidePoint[] = city.buildings.flatMap(b => {
          const type = getBuilding(b.type)!, s = current.status.get(b.id), road = doorFor(roadSet, b.x, b.z, type.size, b.rotation);
          if (road === null || !s?.road) return [];
          const center = world(b.x + (type.size - 1) / 2, b.z + (type.size - 1) / 2);
          return [{ id: b.id, type: b.type, road, center, curb: streets.curb(road, center), online: s.residents > 0 || s.serviced > 0,
            waste: Boolean(type.residents) || ['business', 'shopping', 'dining', 'civic'].includes(type.category) }];
        });
        if (sanitation && !roadsidePoints.some(p => p.id === sanitation.id)) roadsidePoints.push({ id: sanitation.id, type: sanitation.type, road: sanitation.door!, center: sanitation.center, curb: streets.curb(sanitation.door!, sanitation.center), online: true, waste: false });
        // Bus stops and taxi stands on the pavement: a place to queue, and a point buses and taxis serve.
        for (const stop of city.stops || []) {
          const { centre, rotation } = stopFrame(streets.toWorld, stop), id = `stop:${stop.road}:${stop.side}`, type = stop.kind === 'bus' ? 'busstop' : 'taxistand';
          recreation.push({ id, type, size: 1, door: stop.road, center: centre, rotation, online: true, pavementStop: true });
          roadsidePoints.push({ id, type, road: stop.road, center: centre, curb: centre.clone(), online: true, waste: false });
        }
        people.setRoadsidePlaces(roadsidePoints);
        // Rooftops with a helipad: residents go up and wait there for a helicopter.
        for (const pad of roofPadsById.values()) {
          const building = city.buildings.find(item => item.id === pad.id), s = building && current.status.get(building.id);
          if (!building || !s || pad.road === undefined || !pad.hatch) continue;
          const size = getBuilding(building.type)!.size;
          recreation.push({ id: `${building.id}:roof`, type: building.type, size, door: pad.road, center: world(building.x + (size - 1) / 2, building.z + (size - 1) / 2), rotation: facing(roadSet, building.x, building.z, size, building.rotation), online: s.road && (s.serviced > 0 || s.residents > 0), helipad: { pad: pad.position, hatch: pad.hatch } });
        }
        people.setCity(homes, works);
        people.setEntrances(entrances);
        people.setRecreation(recreation);
        // Animals live at their building whether or not it's open; kit-built (expansion) plots
        // are raised a little higher than the original models' ground.
        animals.setPlaces(city.buildings.filter(building => ANIMAL_TYPES.has(building.type)).map((building): AnimalPlace => {
          const type = getBuilding(building.type)!;
          return { id: building.id, type: building.type, size: type.size, center: world(building.x + (type.size - 1) / 2, building.z + (type.size - 1) / 2), rotation: facing(roadSet, building.x, building.z, type.size, building.rotation), ground: expansionById.has(building.type) ? 0.035 * type.size + 0.002 : 0.022 };
        }));
        billboards.setPlaces(city.buildings.filter(b => BILLBOARD_TYPES.has(b.type)).map(b => {
          const size = getBuilding(b.type)!.size;
          return { id: b.id, type: b.type, size, center: world(b.x + (size - 1) / 2, b.z + (size - 1) / 2), rotation: facing(roadSet, b.x, b.z, size, b.rotation), height: prefabFor(b.type, b.level).height };
        }));
        // Where buses, trams and taxis stop: the road outside each stop, station or shop.
        const stops = { bus: new Set<number>(), tram: new Set<number>(), taxiRanks: new Set<number>(), dropOffs: new Set<number>(), waste: new Set(roadsidePoints.filter(p => p.waste).map(p => p.road)), sanitation: new Set(sanitation?.door !== null && sanitation?.door !== undefined ? [sanitation.door] : []) };
        for (const building of city.buildings) {
          const door = doorFor(roadSet, building.x, building.z, getBuilding(building.type)!.size, building.rotation); if (door === null) continue;
          if (['busstop', 'busdepot', 'interchange', 'railwaystation'].includes(building.type)) stops.bus.add(door);
          if (['tramstop', 'interchange', 'railwaystation'].includes(building.type)) stops.tram.add(door);
          if (building.type === 'taxistand') stops.taxiRanks.add(door);
        }
        for (const entrance of entrances) if (entrance.public && entrance.door !== null) stops.dropOffs.add(entrance.door);
        for (const stop of city.stops || []) (stop.kind === 'bus' ? stops.bus : stops.taxiRanks).add(stop.road);
        traffic.setStops(stops);
        const hallRoad = doorFor(roadSet, HALL.x, HALL.z, HALL.size);
        incidents.setBases([
          ...city.buildings.flatMap(b => {
            const road = doorFor(roadSet, b.x, b.z, getBuilding(b.type)!.size, b.rotation);
            if (road === null || !current.status.get(b.id)?.road) return [];
            return [{ road, police: b.type === 'policestation', tow: ['workshop', 'busdepot', 'roboticsworkshop'].includes(b.type) }];
          }).filter(b => b.police || b.tow),
          ...(hallRoad === null ? [] : [{ road: hallRoad, police: true, tow: true }]),
        ]);
      }
      weather.update(dt, motion, controls.target, isNight);
      traffic.setDrivingConditions(weather.speed, weather.risk);
      sun.intensity = (isNight ? 0.55 : 2.4) * (1 - weather.cover * 0.78) + weather.flash * 0.8;
      hemisphere.intensity = (isNight ? 0.9 : 0.45) * (1 - weather.cover * 0.45) + weather.flash * 0.2;
      scene.environmentIntensity = (isNight ? 0.35 : 0.38) * (1 - weather.cover * 0.55);
      renderer.toneMappingExposure = (isNight ? 1.05 : 0.72) * (1 - weather.cover * (isNight ? 0.15 : 0.35)) + weather.flash * 0.1;
      weatherFog.color.set(isNight ? '#172532' : '#a9bdcb'); weatherFog.density = 0.001 + weather.cover * 0.007;
      skyUniforms.turbidity.value = 5 + weather.cover * 14;
      skyUniforms.rayleigh.value = 1.4 * (1 - weather.cover * 0.65);
      setWeatherName(name => name === WEATHER_LABELS[weather.kind] ? name : WEATHER_LABELS[weather.kind]);
      traffic.setCount((current.residents + current.jobs) / 12);
      streets.update(dt, motion);
      traffic.update(dt, motion);
      // Lit windows follow who is inside, refreshed twice a second.
      if (time - windowsAt > 500) {
        windowsAt = time;
        const inside = people.occupancy(isNight), litShares: Record<string, number> = {};
        groups.forEach(group => {
          const values = group.placed.map(placed => {
            const status = current.status.get(placed.id), people = inside.get(placed.id) || 0;
            if (placed.id === 'hall') return windowLight('hall', isNight ? 0.3 : 0.6);
            // Share of the building in use: residents and staff, plus a few visitors.
            const capacity = (status?.residents || 0) + (status?.staff || 0) + 3;
            return windowLight(placed.id, people > 0 ? Math.max(0.12, Math.min(1, people / (capacity * 0.75))) : 0);
          });
          group.meshes.forEach(mesh => { if ((mesh.material as THREE.MeshStandardMaterial).emissiveMap) setWindowLights(mesh, values); });
          group.placed.forEach((placed, i) => { litShares[placed.id] = Math.round((values[i] % 1) * 100) / 100; });
        });
        canvas.dataset.windowLights = JSON.stringify({ night: isNight, shares: litShares, glow: [...glow].filter(m => m.emissiveMap).map(m => m.emissiveIntensity).slice(0, 3) });
      }
      incidents.update(dt, motion);
      const accident = incidents.notice;
      setIncidentNotice(old => accident ? old?.id === accident.id && old.text === accident.text ? old : { id: accident.id, text: accident.text, x: accident.position.x + HALF - 0.5, z: accident.position.z + HALF - 0.5 } : old ? null : old);
      people.update(dt, time, motion, camera);
      const selectedBoat = city.buildings.find(b => b.id === current.selectedId && boatKind(b.type));
      let notice: { id: string; text: string } | null = null;
      boatPosition.current = null;
      if (selectedBoat) {
        const status = current.status.get(selectedBoat.id), place = people.recreation.placeList.find(p => p.id === selectedBoat.id);
        const passengers = [...people.recreation.visits.values()].filter(v => v.place.id === selectedBoat.id && v.phase === 'playing').length;
        const boat = place?.water ? boatState(place, people.recreation.seconds, passengers > 0) : null;
        if (boat) boatPosition.current = { x: boat.position.x + HALF - 0.5, z: boat.position.z + HALF - 0.5 };
        let text = !status?.road ? 'No road access. Connect this harbour to the roads by your homes.'
          : !status.serviced ? 'Boat trips need power and water at this harbour.'
          : !current.residents ? 'Build homes so residents can take boat trips.'
          : !place?.water ? 'This harbour needs an accessible waterfront.'
          : !place.water.loop ? 'Not enough clear water for this boat to sail safely.'
          : !motion ? 'Boat trips are paused by your reduced-motion setting.'
          : !passengers && !place.boatTrip?.active ? 'Waiting for residents to walk here and board.'
          : boat?.phase === 'boarding' ? `${passengers} aboard. Departing in ${Math.max(0, Math.ceil(8 - (place.boatTrip?.elapsed || 0)))}s.`
          : boat?.phase === 'fishing' ? `${passengers} residents are fishing offshore.`
          : boat?.phase === 'sightseeing' ? `${passengers} residents are sightseeing offshore.`
          : boat?.phase === 'returning' ? 'Boat returning to the harbour.'
          : boat?.phase === 'unloading' ? 'Residents are stepping ashore.' : 'Boat heading out with residents.';
        notice = { id: selectedBoat.id, text };
      }
      setBoatNotice(old => old?.id === notice?.id && old?.text === notice?.text ? old : notice);
      animals.update(dt, motion, people.outdoorPositions);
      billboards.update(dt, motion, isNight);
      aviation.update(dt, motion);
      const attendance = people.recreation.attendance;
      const visitors = [...attendance.values()].reduce((sum, value) => sum + value, 0);
      if (renderer.domElement.dataset.recreationVisitors !== String(visitors)) renderer.domElement.dataset.recreationVisitors = String(visitors);
      const activeRecreation = [...attendance.keys()].map(id => city.buildings.find(b => b.id === id)?.type).filter(Boolean).join(',');
      if (renderer.domElement.dataset.recreationActivities !== activeRecreation) renderer.domElement.dataset.recreationActivities = activeRecreation;
      signals.update();
      const diagnostics = {
        weather: weather.kind, weatherSeconds: weather.seconds.toFixed(3), rainDrops: weather.rainCount, lightning: weather.flash.toFixed(3), drivingSpeed: weather.speed.toFixed(3),
        accidents: JSON.stringify({ ...incidents.stats, active: incidents.active.size }),
        emergencyScenes: JSON.stringify([...incidents.active.values()].map(i => ({ id: i.id, stage: i.stage, x: i.position.x + HALF - 0.5, z: i.position.z + HALF - 0.5 }))),
        transitBoarded: JSON.stringify(people.roadside?.stats || {}),
        roadsideVehicles: JSON.stringify(traffic.serviceVehicles.map(v => ({ id: v.id, model: v.model, stage: people.roadside?.trips.get(v.id)?.stage || null, position: [v.position.x + HALF - 0.5, v.position.z + HALF - 0.5] }))),
        transitRiding: [...(people.roadside?.riders.values() || [])].filter(r => r.phase === 'aboard').length,
        transitBoarding: [...(people.roadside?.riders.values() || [])].filter(r => r.phase === 'boarding').length,
        transitAlighting: [...(people.roadside?.riders.values() || [])].filter(r => r.phase === 'alighting').length,
        garbageCollectors: [...(people.roadside?.riders.values() || [])].filter(r => r.phase === 'working').length,
        digitalBillboards: billboards.count, billboardSeconds: billboards.clock.toFixed(3),
        wildlifeReactions: JSON.stringify({ ...animals.stats, active: animals.reacting }),
        boatVoyages: JSON.stringify(people.recreation.placeList.filter(p => p.boatTrip && p.water).map(p => {
          const visitors = [...people.recreation.visits.values()].filter(v => v.place.id === p.id), aboard = visitors.filter(v => v.phase === 'playing');
          const boat = boatState(p, people.recreation.seconds, aboard.length > 0)!;
          return { id: p.id, type: p.type, phase: boat.phase, passengers: aboard.length, distance: Number(boat.position.distanceTo(p.water!.dock).toFixed(2)), completed: p.boatTrip!.completed,
            fishers: aboard.filter(v => people.recreation.pose(v.resident)?.rod).length, sightseers: aboard.filter(v => people.recreation.pose(v.resident)?.hold === 'binoculars').length,
            returning: visitors.filter(v => v.phase === 'returning').length, position: [boat.position.x + HALF - 0.5, boat.position.z + HALF - 0.5], canSail: Boolean(p.water!.loop) };
        })),
        activitySeconds: people.recreation.seconds.toFixed(3),
        farmTractors: [...people.recreation.visits.values()].filter(v => v.phase === 'playing' && v.slot === 0 && TRACTOR_TYPES.has(v.place.type)).length,
        buildingEntries: people.buildings?.entered || 0, buildingExits: people.buildings?.exited || 0,
        buildingVisitors: people.buildings?.visits.size || 0, trafficSignals: streets.crossings.size,
        pedestrianCrossings: streets.completedCrossings, waitingPedestrians: [...streets.crossings.values()].reduce((sum, c) => sum + c.waiting.size, 0),
        activeCrossings: [...streets.crossings.values()].reduce((sum, c) => sum + c.active.size, 0),
        stoppedCars: streets.stoppedCars, flights: JSON.stringify({ ...(people.flights?.stats || {}), aboard: [...(people.flights?.riders.values() || [])].filter(r => r.stage === 'aboard').length, rooftop: [...people.recreation.visits.values()].filter(v => v.place.helipad && v.phase === 'playing').length }), aircraft: `planes:${aviation.planes.filter(p => p.phase !== 'gate').length}/${aviation.planes.length},helicopters:${aviation.helicopters.filter(h => h.mode !== 'landed').length}/${aviation.helicopters.length},pads:${aviation.padCount}`, animals: animals.species.join(','), vehicles: Object.entries(traffic.vehicleCounts).map(([model, n]) => `${model}:${n}`).sort().join(","), signalPhases: [...new Set([...streets.crossings.values()].map(c => c.phase))].join(','),
      };
      for (const [key, value] of Object.entries(diagnostics)) if (canvas.dataset[key] !== String(value)) canvas.dataset[key] = String(value);
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
      const placing = mode.kind === 'place' ? { type: mode.type, level: 1, ignore: undefined as string | undefined, rotation: mode.rotation } : mode.kind === 'move' ? (() => { const b = city.buildings.find(item => item.id === mode.id); return b ? { type: b.type, level: b.level, ignore: b.id, rotation: mode.rotation ?? b.rotation } : null; })() : null;
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
        ghost.rotation.y = facing(roadSet, hovered.x, hovered.z, size, placing.rotation);
      } else if ((mode.kind === 'bulldoze' || mode.kind === 'road' || mode.kind === 'lights' || mode.kind === 'stops') && hovered && !roadStart) {
        setGhost(null);
        ghost.visible = false;
        hover.visible = true;
        const center = world(hovered.x, hovered.z);
        hover.position.set(center.x, 0.06, center.z);
        hover.scale.set(1, 1, 1);
        overlayMaterial.color.set(mode.kind === 'bulldoze' ? '#ff6b6b' : mode.kind === 'lights' ? '#ffd166' : mode.kind === 'stops' ? (latest.current.city.roads.includes(tileIndex(hovered.x, hovered.z)) ? '#7dd3a8' : '#ff6b6b') : '#7dc4ff');
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
      incidents.dispose(); weather.dispose();
      animals.dispose();
      billboards.dispose();
      aviation.dispose(); roofPads.dispose(); streetStops.dispose();
      traffic.dispose();
      signals.dispose();
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
      <div className="absolute left-3 top-3 max-w-[150px] text-xs text-white">
        <select aria-label="City weather" value={weatherChoice} onChange={e => setWeatherChoice(e.target.value as WeatherChoice)} className="max-w-full rounded-lg border border-slate-600 bg-slate-950/85 px-2 py-2 text-xs text-white">
          {(Object.keys(WEATHER_LABELS) as WeatherChoice[]).map(choice => <option key={choice} value={choice}>{choice === 'auto' ? `Auto · ${weatherName}` : WEATHER_LABELS[choice]}</option>)}
        </select>
      </div>
      {incidentNotice && <div className="absolute bottom-16 left-3 max-w-[min(280px,calc(100%-24px))] rounded-xl bg-slate-950/90 px-3 py-2 text-xs text-white" data-testid="road-incident-status">
        <p role="status">{incidentNotice.text}</p>
        <button type="button" onClick={() => engine.current?.focus(incidentNotice.x, incidentNotice.z)} className="mt-1 font-bold text-amber-300">Show accident</button>
      </div>}
      {props.mode.kind === 'idle' && boatNotice?.id === props.selectedId && (
        <div className="absolute left-3 top-14 max-w-[calc(100%-24px)] rounded-xl bg-slate-950/90 px-3 py-2 text-xs text-white sm:max-w-xs" data-testid="boat-trip-status">
          <p role="status">{props.paused ? 'Boat trips are paused.' : boatNotice.text}</p>
          <button type="button" disabled={!boatPosition.current} onClick={() => { const p = boatPosition.current; if (p) engine.current?.focus(p.x, p.z); }} className="mt-1 font-bold text-cyan-300 disabled:hidden">Show working boat</button>
        </div>
      )}
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
      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[240px] rounded-lg bg-slate-950/75 px-2.5 py-2 text-[10px] leading-relaxed text-slate-200">Residents visit buildings.<br /><span className="text-emerald-300">Green walk light</span> · Cars wait at crossings.</div>
      {roadCost && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-950/85 px-4 py-1.5 text-xs font-bold text-white">
          {roadCost.tiles} {roadCost.what} · {roadCost.cost} 🪙{roadCost.blocked ? ` · ${roadCost.blocked} blocked` : ''}
        </div>
      )}
    </div>
  );
};

export default CityScene3D;
