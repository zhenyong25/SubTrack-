import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AccountantReport } from '../../services/cityAccountantService';
import type { AgentReport } from '../../services/cityAgents';
import { officeRoutine } from './officeRoutine';

export interface OfficeResident { name: string | null; role: string; office: string; color: string; roaming?: boolean }

// A room in metres, modelled around a seated resident. Front and right walls are
// cut away so the room can be explored, including the space behind the desk.
export function createAccountantInterior(resident?: OfficeResident) {
  const room = new THREE.Group();
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });
    materials.add(result); return result;
  };
  const oak = material('#bd8a54');
  const oakEdge = material('#805a39');
  const cream = material('#eee8d8');
  const brass = material('#b68b4f', { metalness: 0.65, roughness: 0.3 });
  const charcoal = material('#253944', { roughness: 0.48 });
  const teal = material(resident?.color || '#3a7772');
  const darkTeal = material('#224e50');
  const paper = material('#fffcf0');
  const ink = material('#567678');
  const leaf = material('#478363');
  const terracotta = material('#c98262');
  const glass = material('#afdcdf', { metalness: 0.05, roughness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
  const mesh = (shape: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = room) => {
    geometry.add(shape);
    const object = new THREE.Mesh(shape, surface);
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, surface = oak, parent: THREE.Object3D = room, radius = 0.025) =>
    mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), surface, x, y, z, parent);
  const cylinder = (top: number, bottom: number, height: number, x: number, y: number, z: number, surface = brass, parent: THREE.Object3D = room) =>
    mesh(new THREE.CylinderGeometry(top, bottom, height, 20), surface, x, y, z, parent);
  const sphere = (radius: number, x: number, y: number, z: number, surface: THREE.Material, parent: THREE.Object3D = room) =>
    mesh(new THREE.SphereGeometry(radius, 20, 14), surface, x, y, z, parent);
  const segment = (start: THREE.Vector3, end: THREE.Vector3, radius: number, surface: THREE.Material, parent: THREE.Object3D = room) => {
    const object = mesh(new THREE.CylinderGeometry(radius, radius * 0.93, 1, 14), surface, 0, 0, 0, parent);
    positionSegment(object, start, end); return object;
  };
  const canvasTexture = (width: number, height: number) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The 3D office needs canvas support.');
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture); return { canvas, context, texture };
  };
  const label = (text: string, sub: string, width: number, height: number, background = '#234b4c') => {
    const { context, texture } = canvasTexture(768, 256);
    context.fillStyle = background; context.fillRect(0, 0, 768, 256);
    context.fillStyle = '#f3e7c8'; context.textAlign = 'center'; context.font = '600 64px Georgia'; context.fillText(text, 384, 112, 710);
    context.fillStyle = '#c3d6c5'; context.font = '24px sans-serif'; context.fillText(sub, 384, 180, 710);
    const surface = new THREE.MeshBasicMaterial({ map: texture }); materials.add(surface);
    return mesh(new THREE.PlaneGeometry(width, height), surface, 0, 0, 0);
  };

  // Parquet floor and a low plinth establish the building's footprint.
  box(8.4, 0.24, 6.4, 0, -0.16, 0, darkTeal, room, 0.09);
  const woodShades = ['#c5a37b', '#b9966c', '#d0b28c', '#c0a07a', '#c9aa81'].map(color => material(color));
  for (let row = 0; row < 15; row++) for (let col = 0; col < 8; col++) {
    box(0.985, 0.065, 0.388, -3.5 + col, -0.015, -2.8 + row * 0.4, woodShades[(row * 3 + col * 7) % woodShades.length], room, 0.004);
  }
  const backWall = new THREE.Group(); room.add(backWall);
  const sideWall = new THREE.Group(); room.add(sideWall);
  const plaster = material(resident ? '#e5d1c9' : '#c3d6ce');
  const panelling = material(resident ? '#a0796f' : '#617d73');
  box(8.1, 3.35, 0.16, 0, 1.64, -3.04, plaster, backWall);
  box(8.08, 0.92, 0.06, 0, 0.46, -2.93, panelling, backWall);
  box(8.12, 0.07, 0.11, 0, 0.96, -2.88, cream, backWall);
  box(8.12, 0.12, 0.15, 0, 0.08, -2.88, cream, backWall);
  for (let i = 0; i < 10; i++) box(0.025, 0.75, 0.03, -3.6 + i * 0.8, 0.48, -2.88, cream, backWall);
  box(8.2, 0.14, 0.22, 0, 3.29, -2.99, cream, backWall);

  // Left wall has an actual opening with glazing, sill and mullions.
  box(0.16, 1.1, 6.1, -4.03, 0.5, 0, plaster, sideWall);
  box(0.16, 0.55, 6.1, -4.03, 3.06, 0, plaster, sideWall);
  box(0.16, 1.7, 1.5, -4.03, 1.92, -2.28, plaster, sideWall);
  box(0.16, 1.7, 2.1, -4.03, 1.92, 2.0, plaster, sideWall);
  box(0.06, 0.92, 6.1, -3.92, 0.46, 0, panelling, sideWall);
  box(0.11, 0.07, 6.12, -3.88, 0.96, 0, cream, sideWall);
  box(0.22, 0.14, 6.2, -4.0, 3.29, 0, cream, sideWall);
  box(0.15, 0.12, 6.1, -3.88, 0.08, 0, cream, sideWall);
  box(0.04, 1.58, 2.5, -4.05, 1.92, -0.3, glass, sideWall);
  for (const z of [-1.55, -0.3, 0.95]) box(0.16, 1.74, 0.07, -3.94, 1.92, z, cream, sideWall);
  for (const y of [1.1, 1.92, 2.76]) box(0.17, 0.07, 2.64, -3.94, y, -0.3, cream, sideWall);
  box(0.42, 0.09, 2.85, -3.85, 1.06, -0.3, cream, sideWall);
  // A translucent skyline visible through the window gives the interior a city setting.
  const skyline = new THREE.Group(); sideWall.add(skyline);
  const skylineMat = material('#92b8b1');
  for (let i = 0; i < 6; i++) box(0.3, 0.5 + (i % 3) * 0.24, 0.29, -4.5, 1.15, -1.4 + i * 0.44, skylineMat, skyline);

  // Door, a city crest and a wall clock.
  box(1.04, 2.4, 0.12, 2.9, 1.2, -2.9, oakEdge, backWall);
  box(0.87, 2.23, 0.07, 2.9, 1.15, -2.81, teal, backWall);
  box(0.66, 1.25, 0.035, 2.9, 1.52, -2.76, darkTeal, backWall);
  sphere(0.045, 3.21, 1.06, -2.69, brass, backWall);
  const doorLabel = label(resident ? 'ADVISOR' : 'TOWN HALL', resident?.role || 'ACCOUNTS OFFICE', 0.66, 0.22);
  backWall.add(doorLabel); doorLabel.position.set(2.9, 2.12, -2.715);
  const crest = label(resident?.role || 'Town Hall', resident ? resident.name || 'Position available' : 'THE CITY ACCOUNTANT', 2.15, 0.72, resident?.color);
  backWall.add(crest); crest.position.set(-0.4, 2.46, -2.93);
  for (const x of [-1.51, 0.71]) box(0.045, 0.81, 0.04, x, 2.46, -2.9, brass, backWall);
  for (const y of [2.055, 2.865]) box(2.26, 0.045, 0.04, -0.4, y, -2.9, brass, backWall);
  const clock = new THREE.Group(); clock.position.set(-2.8, 2.35, -2.9); backWall.add(clock);
  const clockRim = cylinder(0.32, 0.32, 0.055, 0, 0, 0, brass, clock); clockRim.rotation.x = Math.PI / 2;
  const clockFace = cylinder(0.285, 0.285, 0.06, 0, 0, 0.01, cream, clock); clockFace.rotation.x = Math.PI / 2;
  for (let index = 0; index < 12; index++) {
    const mark = box(0.018, 0.04, 0.01, Math.sin(index * Math.PI / 6) * 0.24, Math.cos(index * Math.PI / 6) * 0.24, 0.05, charcoal, clock);
    mark.rotation.z = -index * Math.PI / 6;
  }
  const hourHand = new THREE.Group(); const minuteHand = new THREE.Group(); clock.add(hourHand, minuteHand);
  box(0.024, 0.14, 0.012, 0, 0.06, 0.065, charcoal, hourHand);
  box(0.015, 0.21, 0.012, 0, 0.095, 0.08, charcoal, minuteHand);
  sphere(0.026, 0, 0, 0.085, brass, clock);

  // Cabinet with binders, books and paper trays.
  box(1.65, 0.12, 0.46, -2.65, 0.14, -2.5, oakEdge);
  for (const x of [-3.45, -1.85]) box(0.08, 1.65, 0.46, x, 0.94, -2.5, oak);
  for (const y of [0.2, 0.7, 1.23, 1.78]) box(1.68, 0.065, 0.48, -2.65, y, -2.5, oak);
  box(1.63, 1.6, 0.045, -2.65, 0.96, -2.73, oakEdge);
  const bookColors = ['#416970', '#bc775c', '#d3b97f', '#75876b', '#354f61'].map(color => material(color));
  for (let shelf = 0; shelf < 3; shelf++) for (let i = 0; i < 7; i++) {
    const book = box(0.12 + i % 2 * 0.02, 0.31 + i % 3 * 0.025, 0.28, -3.26 + i * 0.18, 0.4 + shelf * 0.52, -2.45, bookColors[(i + shelf * 2) % 5]);
    if (i === 6) book.rotation.z = -0.12;
    box(0.065, 0.05, 0.008, book.position.x, book.position.y + 0.055, -2.305, cream);
  }

  // A woven rug, work table and real swivel chair.
  const rug = material('#728f85');
  box(3.9, 0.018, 3.0, 0.05, 0.034, -0.22, rug, room, 0.006);
  for (const z of [-1.6, 1.16]) box(3.6, 0.003, 0.025, 0.05, 0.046, z, cream, room, 0);
  for (const x of [-1.75, 1.85]) box(0.025, 0.003, 2.76, x, 0.046, -0.22, cream, room, 0);
  box(2.65, 0.12, 1.36, 0, 0.87, 0.08, oak, room, 0.055);
  box(2.53, 0.16, 0.06, 0, 0.74, 0.65, oakEdge);
  for (const x of [-1.15, 1.15]) for (const z of [-0.46, 0.62]) box(0.105, 0.8, 0.105, x, 0.42, z, oakEdge);
  box(0.53, 0.48, 1.12, -0.94, 0.6, 0.06, oak);
  for (const y of [0.48, 0.68]) { box(0.45, 0.17, 0.03, -0.94, y, 0.635, oakEdge); box(0.17, 0.018, 0.04, -0.94, y, 0.67, brass); }
  const beforeChair = new Set(room.children);
  const chairZ = -1.11;
  cylinder(0.07, 0.07, 0.37, 0, 0.27, chairZ, charcoal);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const end = new THREE.Vector3(Math.sin(angle) * 0.34, 0.09, chairZ + Math.cos(angle) * 0.34);
    segment(new THREE.Vector3(0, 0.13, chairZ), end, 0.023, charcoal);
    const wheel = cylinder(0.055, 0.055, 0.04, end.x, 0.07, end.z, charcoal); wheel.rotation.z = Math.PI / 2;
  }
  box(0.66, 0.12, 0.61, 0, 0.52, chairZ, darkTeal, room, 0.06);
  const chairBack = box(0.62, 0.7, 0.13, 0, 0.97, chairZ - 0.28, darkTeal, room, 0.06); chairBack.rotation.x = -0.1;
  for (const x of [-0.36, 0.36]) { box(0.04, 0.35, 0.05, x, 0.7, chairZ, charcoal); box(0.09, 0.055, 0.36, x, 0.89, chairZ, darkTeal); }
  const chair = new THREE.Group();
  room.children.filter(child => !beforeChair.has(child)).forEach(child => chair.add(child)); room.add(chair);

  // Monitor is facing Jules. The canvas texture shows the real report state.
  const screen = canvasTexture(1024, 640);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screen.texture }); materials.add(screenMaterial);
  box(1.02, 0.64, 0.065, 0.12, 1.36, 0.36, charcoal, room, 0.025);
  const display = mesh(new THREE.PlaneGeometry(0.94, 0.55), screenMaterial, 0.12, 1.375, 0.324);
  display.rotation.y = Math.PI;
  box(0.065, 0.25, 0.06, 0.12, 1.04, 0.36, charcoal);
  box(0.39, 0.024, 0.24, 0.12, 0.943, 0.36, charcoal);
  const keyboard = box(0.62, 0.03, 0.22, 0, 0.946, -0.27, charcoal, room, 0.014);
  const keyMat = material('#bfcac5');
  for (let row = 0; row < 4; row++) for (let key = 0; key < 12; key++) box(0.038, 0.008, 0.036, -0.267 + key * 0.048, 0.966, -0.345 + row * 0.047, keyMat, room, 0.003);
  box(0.21, 0.008, 0.025, 0, 0.967, -0.165, keyMat, room, 0.003);
  box(0.23, 0.006, 0.25, 0.57, 0.934, -0.23, darkTeal, room, 0.015);
  const mouse = sphere(0.055, 0.57, 0.96, -0.23, charcoal); mouse.scale.set(0.8, 0.45, 1.3);
  const nameplate = label(resident ? resident.name || 'Vacant' : 'Jules', resident?.role || 'CITY ACCOUNTANT', 0.65, 0.2);
  nameplate.position.set(0.73, 1.025, 0.62); nameplate.rotation.x = -0.2;
  box(0.51, 0.025, 0.14, 0.73, 0.945, 0.61, brass);
  for (let i = 0; i < 6; i++) {
    const page = box(0.34, 0.007, 0.43, -0.9 + (i % 3) * 0.007, 0.94 + i * 0.008, -0.03, paper, room, 0.002);
    page.rotation.y = 0.1;
  }
  for (let i = 0; i < 5; i++) box(0.22 - i % 2 * 0.05, 0.001, 0.008, -0.9, 0.99, -0.13 + i * 0.04, ink, room, 0);
  // Pen, cup and a banker's lamp.
  const pen = cylinder(0.008, 0.008, 0.2, -0.61, 0.943, 0.04, brass); pen.rotation.x = Math.PI / 2; pen.rotation.z = 0.4;
  cylinder(0.085, 0.068, 0.14, 0.99, 1.005, -0.28, cream);
  cylinder(0.073, 0.073, 0.003, 0.99, 1.077, -0.28, material('#51342c'));
  const mugHandle = mesh(new THREE.TorusGeometry(0.049, 0.012, 8, 20), cream, 1.075, 1.017, -0.28); mugHandle.rotation.y = Math.PI / 2;
  cylinder(0.13, 0.15, 0.035, -1.03, 0.947, 0.43, brass);
  segment(new THREE.Vector3(-1.03, 0.96, 0.43), new THREE.Vector3(-1.03, 1.4, 0.43), 0.018, brass);
  const shade = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 24, 1, true, 0, Math.PI), teal, -1.03, 1.4, 0.4); shade.rotation.z = Math.PI / 2;
  const bulbMat = material('#fff1bc', { emissive: '#ffe3a0', emissiveIntensity: 1.5 });
  box(0.23, 0.018, 0.12, -1.03, 1.37, 0.4, bulbMat);

  // Jules: a seated, jointed character in the same rounded style as the city residents.
  const actor = new THREE.Group(); actor.position.z = -1.04; room.add(actor);
  const jules = new THREE.Group(); jules.position.z = 1.04; actor.add(jules);
  actor.name = resident ? resident.name || 'Vacant' : 'Jules'; actor.visible = !resident || !!resident.name;
  const skin = material('#d9a681', { roughness: 0.55 });
  const hair = material('#302c31'); const shirt = material(resident?.color || '#417e79'); const trousers = material('#354456');
  box(0.41, 0.19, 0.3, 0, 0.67, -1.04, trousers, jules, 0.07);
  const torso = box(0.46, 0.53, 0.28, 0, 1.03, -1.065, shirt, jules, 0.1);
  const head = new THREE.Group(); head.position.set(0, 1.65, -1.025); jules.add(head);
  cylinder(0.065, 0.075, 0.15, 0, 1.38, -1.04, skin, jules);
  const face = sphere(0.2, 0, 0, 0, skin, head); face.scale.set(0.87, 1.12, 0.91);
  const hairCap = mesh(new THREE.SphereGeometry(0.211, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.57), hair, 0, 0.027, -0.022, head); hairCap.scale.set(0.9, 1.05, 0.94);
  const fringe = sphere(0.12, -0.065, 0.125, 0.095, hair, head); fringe.scale.set(1, 0.5, 0.6); fringe.rotation.z = -0.3;
  if (resident?.roaming) { const bun = sphere(0.12, 0, 0.01, -0.21, hair, head); bun.scale.set(0.9, 1, 0.85); }
  for (const x of [-0.175, 0.175]) { const ear = sphere(0.04, x, -0.015, -0.005, skin, head); ear.scale.set(0.4, 1, 0.75); }
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.072, 0.072]) {
    const eye = sphere(0.014, x, 0.005, 0.165, charcoal, head); eyes.push(eye);
    const frame = mesh(new THREE.TorusGeometry(0.047, 0.006, 6, 20), brass, x, 0.007, 0.18, head); frame.scale.y = 0.82;
  }
  segment(new THREE.Vector3(-0.024, 0.01, 0.184), new THREE.Vector3(0.024, 0.01, 0.184), 0.005, brass, head);
  const nose = sphere(0.03, 0, -0.035, 0.18, skin, head); nose.scale.set(0.7, 0.9, 0.9);
  const smile = mesh(new THREE.TorusGeometry(0.034, 0.004, 5, 16, Math.PI * 0.72), material('#925e50'), 0.025, -0.085, 0.163, head); smile.rotation.z = Math.PI * 1.12;
  for (const x of [-0.09, 0.09]) { const collar = box(0.12, 0.07, 0.025, x, 1.25, -0.909, cream, jules, 0.008); collar.rotation.z = x < 0 ? -0.5 : 0.5; }
  for (let i = 0; i < 3; i++) sphere(0.008, 0, 1.14 - i * 0.1, -0.918, brass, jules);
  const upperBody = jules.children.map(object => ({ object, y: object.position.y }));
  const legs = [-0.13, 0.13].map(x => {
    const hip = new THREE.Vector3(x, 0.64, -1.04), knee = new THREE.Vector3(x, 0.59, -0.55), ankle = new THREE.Vector3(x, 0.15, -0.48);
    const thigh = segment(hip, knee, 0.085, trousers, jules), joint = sphere(0.08, knee.x, knee.y, knee.z, trousers, jules);
    const shin = segment(knee, ankle, 0.065, trousers, jules);
    const shoe = box(0.15, 0.105, 0.28, x, 0.105, -0.4, charcoal, jules, 0.04);
    return { x, hip, knee, ankle, thigh, joint, shin, shoe };
  });
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Vector3(side * 0.23, 1.23, -1.04);
    const elbow = new THREE.Vector3(side * 0.32, 0.98, -0.78);
    const wrist = new THREE.Vector3(side * 0.17, 0.998, -0.29);
    const shoulderJoint = sphere(0.075, shoulder.x, shoulder.y, shoulder.z, shirt, jules);
    const upperArm = segment(shoulder, elbow, 0.064, shirt, jules);
    const elbowJoint = sphere(0.051, elbow.x, elbow.y, elbow.z, skin, jules);
    const forearm = segment(elbow, wrist, 0.044, skin, jules);
    const hand = new THREE.Group(); hand.position.copy(wrist); jules.add(hand);
    box(0.095, 0.043, 0.105, 0, 0, 0.035, skin, hand, 0.018);
    const fingers = Array.from({ length: 4 }, (_, i) => {
      const finger = box(0.017, 0.019, 0.066, -0.031 + i * 0.021, -0.004, 0.1, skin, hand, 0.008);
      finger.rotation.x = 0.16; return finger;
    });
    return { side, shoulder, shoulderJoint, upperArm, elbowJoint, elbow, wrist, hand, fingers, forearm };
  });
  const folder = new THREE.Group(); jules.add(folder); folder.visible = false;
  box(0.37, 0.025, 0.27, 0, 0, 0, bookColors[1], folder);
  box(0.33, 0.008, 0.23, 0, 0.018, 0, paper, folder);

  // Visitor chair and corner greenery make the space feel like a usable office.
  const guest = new THREE.Group(); guest.position.set(0.15, 0, 1.7); guest.rotation.y = Math.PI; room.add(guest);
  for (const x of [-0.25, 0.25]) for (const z of [-0.23, 0.23]) box(0.045, 0.46, 0.045, x, 0.25, z, oakEdge, guest);
  box(0.61, 0.09, 0.58, 0, 0.5, 0, teal, guest, 0.045);
  box(0.61, 0.55, 0.08, 0, 0.86, -0.24, teal, guest, 0.045);
  const plant = (x: number, z: number, scale = 1) => {
    const group = new THREE.Group(); group.position.set(x, 0.06, z); group.scale.setScalar(scale); room.add(group);
    cylinder(0.23, 0.17, 0.43, 0, 0.23, 0, terracotta, group);
    cylinder(0.212, 0.212, 0.015, 0, 0.45, 0, oakEdge, group);
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4; const height = 0.8 + i % 3 * 0.16;
      const end = new THREE.Vector3(Math.sin(angle) * 0.25, height, Math.cos(angle) * 0.25);
      segment(new THREE.Vector3(0, 0.4, 0), end, 0.012, leaf, group);
      const blade = sphere(0.16, end.x, end.y, end.z, leaf, group); blade.scale.set(0.6, 1.9, 0.2); blade.rotation.set(0.35, angle, -0.45);
    }
  };
  plant(3.25, 1.7, 1.25); plant(-3.1, 1.75, 0.8);
  const sideTable = new THREE.Group(); sideTable.position.set(2.8, 0, -1.25); room.add(sideTable);
  cylinder(0.48, 0.48, 0.065, 0, 0.7, 0, oak, sideTable);
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    segment(new THREE.Vector3(Math.sin(angle) * 0.3, 0.05, Math.cos(angle) * 0.3), new THREE.Vector3(Math.sin(angle) * 0.2, 0.68, Math.cos(angle) * 0.2), 0.025, oakEdge, sideTable);
  }
  box(0.35, 0.05, 0.25, 0, 0.76, 0, bookColors[1], sideTable);
  box(0.31, 0.04, 0.22, 0.02, 0.81, 0.03, bookColors[2], sideTable);

  const updateReport = (working: boolean, report?: AccountantReport | AgentReport) => {
    const ctx = screen.context;
    if (resident) {
      const audit = report && 'summary' in report ? report : undefined;
      ctx.fillStyle = '#132e3a'; ctx.fillRect(0, 0, 1024, 640);
      ctx.fillStyle = resident.color; ctx.fillRect(0, 0, 1024, 68);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(resident.role.toUpperCase(), 40, 45, 940);
      ctx.font = 'bold 42px sans-serif'; ctx.fillText(working ? 'Reviewing your records...' : 'Your review', 42, 140);
      ctx.font = '26px sans-serif'; ctx.fillStyle = '#b7d3cb'; ctx.fillText(resident.name || 'Waiting for a resident', 42, 190);
      (audit?.summary || []).slice(0, 4).forEach((item, index) => {
        ctx.fillStyle = '#b7d3cb'; ctx.font = '24px sans-serif'; ctx.fillText(item.label, 42, 265 + index * 70, 480);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(item.value, 560, 265 + index * 70, 420);
      });
      ctx.fillStyle = '#b7d3cb'; ctx.font = '24px sans-serif'; ctx.fillText(audit ? `${audit.findings.length} findings in your report` : 'Ready for a review', 42, 590);
      screen.texture.needsUpdate = true; return;
    }
    const account = report && 'currencies' in report ? report : undefined;
    report = account;
    ctx.fillStyle = '#132e3a'; ctx.fillRect(0, 0, 1024, 640);
    ctx.fillStyle = '#254653'; ctx.fillRect(0, 0, 1024, 68);
    ctx.fillStyle = '#83dfc0'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('TOWN HALL / ACCOUNTS', 40, 45);
    ctx.fillStyle = '#f1f5ec'; ctx.font = 'bold 44px sans-serif'; ctx.fillText(working ? 'Reviewing your expenses...' : 'Weekly spending report', 42, 138);
    ctx.fillStyle = '#a0bcc0'; ctx.font = '25px sans-serif'; ctx.fillText(report ? `${report.start}  —  ${report.asOf}` : 'Jules / Your city accountant', 42, 185);
    const values = report?.currencies.slice(0, 4) || [];
    const maximum = Math.max(1, ...values.map(item => item.current));
    values.forEach((item, index) => {
      const y = 240 + index * 74;
      ctx.fillStyle = '#e3e9df'; ctx.font = '24px sans-serif'; ctx.fillText(`${item.currency}   ${item.current.toFixed(2)}`, 42, y);
      ctx.fillStyle = '#395360'; ctx.fillRect(320, y - 23, 620, 29);
      ctx.fillStyle = '#6ed1b3'; ctx.fillRect(320, y - 23, Math.max(3, item.current / maximum * 620), 29);
    });
    if (!values.length) { ctx.fillStyle = '#91b8b1'; ctx.font = '30px sans-serif'; ctx.fillText(working ? 'Checking records and categories' : 'Ready for your next review', 42, 300); }
    ctx.fillStyle = '#a0bcc0'; ctx.font = '25px sans-serif'; ctx.fillText(report ? `${report.reviewed} expenses reviewed  /  ${report.findings.length} findings` : 'Waiting for expense records', 42, 565);
    ctx.fillStyle = working ? '#ecc97b' : '#83dfc0'; ctx.fillRect(42, 602, working ? 520 : 900, 6);
    screen.texture.needsUpdate = true;
  };
  const tick = (time: number, working: boolean, reducedMotion: boolean, camera: THREE.Camera) => {
    const routine = officeRoutine(resident?.roaming ? time : 0, reducedMotion);
    const stand = routine.stand, rise = stand * 0.36;
    actor.position.set(routine.x, 0, routine.z); actor.rotation.y = routine.angle;
    chair.position.z = -stand * 0.6;
    upperBody.forEach(({ object, y }) => { object.position.y = y + rise; });
    const stride = Math.sin(time * 7) * routine.gait * 0.21;
    legs.forEach(leg => {
      const swing = stride * Math.sign(leg.x);
      const lift = Math.max(0, swing) * 0.35;
      leg.hip.set(leg.x, 0.64 + rise, -1.04);
      leg.knee.set(leg.x, 0.59 + lift, THREE.MathUtils.lerp(-0.55, -1.04 + swing * 0.5, stand));
      leg.ankle.set(leg.x, 0.15 + lift, THREE.MathUtils.lerp(-0.48, -1.04 + swing, stand));
      positionSegment(leg.thigh, leg.hip, leg.knee); positionSegment(leg.shin, leg.knee, leg.ankle);
      leg.joint.position.copy(leg.knee); leg.shoe.position.set(leg.x, 0.105 + lift, leg.ankle.z + 0.08);
    });
    folder.visible = routine.folder > 0.1;
    folder.position.set(0, 1.22, -0.68); folder.rotation.x = -0.2;
    const speed = working ? 8 : 4.3;
    const phase = reducedMotion ? 0 : time;
    const pause = !working && phase % 12 > 8;
    torso.rotation.x = reducedMotion ? 0 : Math.sin(phase * 1.5) * 0.012;
    head.rotation.set(0.08 + Math.sin(phase * 1.3) * 0.015, Math.sin(phase * 0.5) * 0.035, Math.sin(phase * 0.7) * 0.012);
    const blink = !reducedMotion && phase % 4.7 > 4.52;
    eyes.forEach(eye => { eye.scale.y = blink ? 0.12 : 1; });
    arms.forEach(arm => {
      const lift = reducedMotion || pause ? 0 : (Math.sin(phase * speed + arm.side * 1.4) + 1) * 0.008;
      const swing = -stride * arm.side;
      arm.shoulder.set(arm.side * 0.23, 1.23 + rise, -1.04);
      arm.elbow.set(arm.side * 0.32, THREE.MathUtils.lerp(0.98, 1.27, stand), THREE.MathUtils.lerp(-0.78, -1.04 + swing * 0.6, stand));
      arm.wrist.set(arm.side * THREE.MathUtils.lerp(0.17, 0.3, stand), THREE.MathUtils.lerp(0.998 + lift, 1, stand), THREE.MathUtils.lerp(-0.29, -1.04 + swing, stand));
      arm.wrist.y += routine.folder * 0.26; arm.wrist.z += routine.folder * 0.36;
      arm.shoulderJoint.position.copy(arm.shoulder); arm.elbowJoint.position.copy(arm.elbow);
      positionSegment(arm.upperArm, arm.shoulder, arm.elbow);
      arm.hand.position.copy(arm.wrist);
      arm.hand.rotation.x = lift * 2;
      arm.fingers.forEach((finger, index) => { finger.rotation.x = 0.16 + (reducedMotion || pause ? 0 : Math.sin(phase * speed * 1.6 + index + arm.side) * 0.13); });
      positionSegment(arm.forearm, arm.elbow, arm.wrist);
    });
    const now = new Date();
    hourHand.rotation.z = -(now.getHours() % 12 + now.getMinutes() / 60) * Math.PI / 6;
    minuteHand.rotation.z = -(now.getMinutes() + now.getSeconds() / 60) * Math.PI / 30;
    backWall.visible = camera.position.z > -2.9;
    sideWall.visible = camera.position.x > -3.9;
    return resident && !resident.name ? 'Office vacant' : routine.activity;
  };
  updateReport(false);
  return { room, updateReport, tick, dispose: () => { geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); } };
}

const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
function positionSegment(object: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
  direction.subVectors(end, start);
  object.position.copy(start).addScaledVector(direction, 0.5);
  object.scale.y = direction.length();
  object.quaternion.setFromUnitVectors(up, direction.normalize());
}
