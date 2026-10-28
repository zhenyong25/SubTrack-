import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Compass, Minus, Moon, Plus, RotateCcw, RotateCw, Sun } from 'lucide-react';

export const ISLAND_STATIONS = [
  { id: 'grove', name: 'Goal Grove', x: -3.2, z: -1.8, color: '#8b7fe6', description: 'Your goals take root here. Recorded savings fill the landmark crystals.', action: 'Visit savings goals', destination: 'goals' },
  { id: 'lodge', name: 'Ledger Lodge', x: 0, z: -2.9, color: '#e49b65', description: 'A clear record is a good compass. Track expenses on three days to complete your weekly quest.', action: 'Record expenses', destination: 'expenses' },
  { id: 'tower', name: 'Reflection Tower', x: 3.2, z: -1.2, color: '#68c6bb', description: 'Pause and look ahead. Review your spending, balances and next savings action.', action: 'Open financial review', destination: 'review' },
] as const;
interface Props {
  level: number; decorations: string[]; avatarColor: string; visited: string[];
  goals: { name: string; progress: number }[]; celebration: number;
  onVisit: (id: string) => void; onOpen: (destination: 'goals' | 'expenses' | 'review') => void;
  fallback: React.ReactNode;
}
const avatarColors = ['#6c8cff', '#e898b4', '#f2b75d', '#58c4ad'];
export { avatarColors };

// Scene-owned geometries, materials, textures, controls and render loops are disposed on unmount.
const FinanceIsland3D: React.FC<Props> = props => {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const engine = useRef<{ night: (value: boolean) => void; turn: (delta: number) => void; zoom: (delta: number) => void; go: (id: string) => void }>();
  const controls = useRef(new Set<string>());
  const [unavailable, setUnavailable] = useState(false);
  const [night, setNight] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [walking, setWalking] = useState(false);
  const [arrived, setArrived] = useState(false);
  const station = ISLAND_STATIONS.find(s => s.id === selected);
  const visit = (id: string) => { setSelected(id); setArrived(false); engine.current?.go(id); };
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setUnavailable(true); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', '3D island. Click the ground to walk. Use arrow keys or W A S D to move.');
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#a5d9df');
    scene.fog = new THREE.Fog('#a5d9df', 22, 50);
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    let angle = .72, distance = 19;
    const aim = new THREE.Vector3(0, .6, 0);
    const updateCamera = () => { const fitted = distance * Math.max(1, .98 / camera.aspect); camera.position.set(Math.sin(angle) * fitted, fitted * .8, Math.cos(angle) * fitted); camera.lookAt(aim); };
    updateCamera();
    const ambient = new THREE.HemisphereLight('#d7f8ff', '#527762', 2.7); scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff1cb', 3.5); sun.position.set(-6, 14, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); sun.shadow.normalBias = .04; scene.add(sun);
    const materials: THREE.Material[] = [];
    const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .85, flatShading: true, ...extra }); materials.push(m); return m; };
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object; };
    const cube = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
    const stone = material('#758f91'), grass = material('#78bc8e'), wood = material('#936745'), leaves = material('#3c977b');
    const waterMat = material('#57b6c2', { roughness: .4, metalness: .15 });
    const ocean = mesh(new THREE.CircleGeometry(70, 64), waterMat, scene, 0, -1.25); ocean.rotation.x = -Math.PI / 2; ocean.receiveShadow = false;
    mesh(new THREE.CylinderGeometry(6.1, 4.9, 1.65, 9), stone, scene, 0, -.8);
    const land = mesh(new THREE.CylinderGeometry(6.15, 6.1, .3, 9), grass, scene, 0, .08); land.name = 'ground';
    const sand = material('#dfd3a4'); mesh(new THREE.CylinderGeometry(6.35, 6.2, .14, 9), sand, scene, 0, -.08);
    const pathMat = material('#dfcfaa');
    for (const s of ISLAND_STATIONS) {
      const end = new THREE.Vector3(s.x, .25, s.z + 1.1), start = new THREE.Vector3(0, .25, 2.2);
      const path = cube(.45, .03, end.distanceTo(start), pathMat, scene);
      path.position.copy(start.clone().add(end).multiplyScalar(.5)); path.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    }
    const pine = (x: number, z: number, height: number) => { const tree = new THREE.Group(); tree.position.set(x, .25, z); scene.add(tree); mesh(new THREE.CylinderGeometry(.09, .13, height * .5, 6), wood, tree, 0, height * .25); mesh(new THREE.ConeGeometry(height * .36, height * .85, 6), leaves, tree, 0, height * .72); mesh(new THREE.ConeGeometry(height * .28, height * .7, 6), leaves, tree, 0, height); };
    [[-4.9, 0, 1.6], [-4.3, 2, 1.8], [-3.5, 3.7, 1.3], [4.7, 1.5, 1.9], [4.4, -2.7, 1.5], [1.6, -4.7, 1.6], [-1.8, -4.4, 1.7], [2.7, 4.1, 1.2]].forEach(([x, z, h]) => pine(x, z, h));
    const targets: THREE.Object3D[] = [land];
    const textSprite = (text: string) => { const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#163d49'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 90, 24); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 58); const texture = new THREE.CanvasTexture(canvas); const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false }); materials.push(mat); const sprite = new THREE.Sprite(mat); sprite.scale.set(2.5, .47, 1); return sprite; };
    const stationGroups = new Map<string, THREE.Group>();
    const cream = material('#f0ddba'), roof = material('#c37c61');
    const house = new THREE.Group(); house.position.set(0, .25, -2.9); scene.add(house); stationGroups.set('lodge', house);
    cube(1.7, 1.5, 1.4, cream, house, 0, .75); const houseRoof = mesh(new THREE.ConeGeometry(1.55, 1.0, 4), roof, house, 0, 2); houseRoof.rotation.y = Math.PI / 4;
    cube(.45, .85, .05, wood, house, 0, .44, .73); const glass = material('#80e4e1', { emissive: '#3fa4af', emissiveIntensity: .4 }); cube(.36, .4, .06, glass, house, -.52, .95, .74); cube(.36, .4, .06, glass, house, .52, .95, .74);
    const chimney = cube(.3, .7, .3, stone, house, .65, 2.25, -.25);
    const tower = new THREE.Group(); tower.position.set(3.2, .25, -1.2); scene.add(tower); stationGroups.set('tower', tower);
    mesh(new THREE.CylinderGeometry(.4, .65, 2.5, 8), cream, tower, 0, 1.25); mesh(new THREE.CylinderGeometry(.75, .75, .15, 8), roof, tower, 0, 2.5); mesh(new THREE.CylinderGeometry(.38, .38, .6, 8), glass, tower, 0, 2.85); mesh(new THREE.ConeGeometry(.8, .65, 8), roof, tower, 0, 3.4);
    const grove = new THREE.Group(); grove.position.set(-3.2, .25, -1.8); scene.add(grove); stationGroups.set('grove', grove);
    const crystalMats = ['#b397ed', '#77d7d2', '#f6c978'].map(color => material(color, { metalness: .15, roughness: .25, emissive: color, emissiveIntensity: .12 }));
    const crystals: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { mesh(new THREE.CylinderGeometry(.45, .55, .17, 8), stone, grove, (i - 1) * .7, .1, i % 2 * .65); crystals.push(mesh(new THREE.OctahedronGeometry(.43, 0), crystalMats[i], grove, (i - 1) * .7, .9, i % 2 * .65)); }
    for (const s of ISLAND_STATIONS) {
      const group = stationGroups.get(s.id)!; group.userData.station = s.id;
      group.traverse(child => { child.userData.station = s.id; if (child instanceof THREE.Mesh) targets.push(child); });
      const label = textSprite(s.name); label.position.set(0, s.id === 'tower' ? 4.1 : 3, 0); group.add(label);
      const halo = mesh(new THREE.TorusGeometry(.9, .04, 5, 32), material(s.color, { emissive: s.color, emissiveIntensity: .5 }), scene, s.x, .28, s.z + 1.2); halo.rotation.x = Math.PI / 2;
    }
    // Chunky explorer with articulated arms and legs, a backpack and a tiny fox companion.
    const avatar = new THREE.Group(); scene.add(avatar); avatar.position.set(0, .25, 2.4);
    const shirt = material(latest.current.avatarColor), skin = material('#f1c49b'), trousers = material('#354a68'), boots = material('#58474a');
    const body = new THREE.Group(); avatar.add(body); cube(.48, .55, .33, shirt, body, 0, .89); cube(.25, .35, .2, material('#d6a66a'), body, 0, .9, -.23);
    mesh(new THREE.SphereGeometry(.27, 12, 9), skin, body, 0, 1.43); mesh(new THREE.CylinderGeometry(.34, .34, .09, 10), shirt, body, 0, 1.65); mesh(new THREE.SphereGeometry(.27, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), shirt, body, 0, 1.66);
    const eyes = material('#263f51'); cube(.045, .055, .03, eyes, body, -.09, 1.46, .245); cube(.045, .055, .03, eyes, body, .09, 1.46, .245);
    const arms = [-1, 1].map(sign => { const limb = new THREE.Group(); limb.position.set(sign * .32, 1.13, 0); body.add(limb); cube(.17, .35, .19, shirt, limb, 0, -.16); mesh(new THREE.SphereGeometry(.09, 7, 6), skin, limb, 0, -.37); return limb; });
    const legs = [-1, 1].map(sign => { const limb = new THREE.Group(); limb.position.set(sign * .13, .65, 0); avatar.add(limb); cube(.19, .43, .22, trousers, limb, 0, -.2); cube(.23, .14, .32, boots, limb, 0, -.46, .045); return limb; });
    const fox = new THREE.Group(); fox.position.set(-.9, .25, 2.9); scene.add(fox);
    const orange = material('#db8b54'); cube(.33, .35, .65, orange, fox, 0, .3); cube(.4, .36, .36, orange, fox, 0, .57, .28); cube(.26, .16, .2, cream, fox, 0, .48, .49);
    [-1, 1].forEach(sign => { mesh(new THREE.ConeGeometry(.13, .26, 4), orange, fox, sign * .15, .85, .25); cube(.04, .05, .03, eyes, fox, sign * .11, .62, .47); }); const tail = cube(.2, .2, .55, orange, fox, 0, .4, -.53); tail.rotation.x = -.45;
    const pointerRing = mesh(new THREE.TorusGeometry(.22, .025, 5, 20), material('#fff2b5', { emissive: '#fff2b5' }), scene, 0, .29, 2.4); pointerRing.rotation.x = Math.PI / 2; pointerRing.visible = false;
    const garden = new THREE.Group(); scene.add(garden); for (let i = 0; i < 14; i++) { const x = -2.3 + (i % 7) * .25, z = 2.2 + Math.floor(i / 7) * .35; mesh(new THREE.CylinderGeometry(.015, .015, .25, 4), leaves, garden, x, .4, z); mesh(new THREE.IcosahedronGeometry(.08), crystalMats[i % 3], garden, x, .57, z); }
    const boat = new THREE.Group(); boat.position.set(6.7, -.8, 2.7); scene.add(boat); const hull = mesh(new THREE.SphereGeometry(.7, 8, 5), wood, boat); hull.scale.set(.6, .25, 1.5); cube(.04, 1.7, .04, cream, boat, 0, .7); const sail = mesh(new THREE.ConeGeometry(.6, 1.3, 3), cream, boat, 0, .9); sail.scale.z = .05;
    const fireflies = new THREE.Group(); scene.add(fireflies); for (let i = 0; i < 12; i++) mesh(new THREE.SphereGeometry(.035, 5, 4), material('#fff2b0', { emissive: '#ffe879', emissiveIntensity: 3 }), fireflies, Math.sin(i * 2.4) * 4, 1 + i % 3 * .4, Math.cos(i * 2.4) * 4);
    const cloud = new THREE.Group(); scene.add(cloud); const cloudMat = material('#ecf7ed'); for (let i = 0; i < 5; i++) { const part = mesh(new THREE.SphereGeometry(.7, 7, 5), cloudMat, cloud, -5 + i * .65, 5 + (i % 2) * .25, -4); part.scale.set(1.5, .5, .8); part.castShadow = false; }
    const particles = new THREE.Group(); scene.add(particles); const confetti = Array.from({ length: 28 }, (_, i) => { const m = cube(.08, .12, .04, crystalMats[i % 3], particles); m.userData.seed = i; return m; }); particles.visible = false;
    const raycaster = new THREE.Raycaster();
    let destination: THREE.Vector3 | undefined, destinationStation: string | undefined, moving = false, previous = performance.now(), animation = 0, lastCelebration = latest.current.celebration, partyUntil = 0;
    const go = (id: string) => { const s = ISLAND_STATIONS.find(item => item.id === id); if (!s) return; destination = new THREE.Vector3(s.x, .25, s.z + 1.35); destinationStation = id; pointerRing.position.set(destination.x, .29, destination.z); pointerRing.visible = true; };
    engine.current = {
      go, turn: delta => { angle += delta; updateCamera(); }, zoom: delta => { distance = THREE.MathUtils.clamp(distance + delta, 13, 26); updateCamera(); },
      night: value => { scene.background = new THREE.Color(value ? '#10213c' : '#a5d9df'); scene.fog = new THREE.Fog(value ? '#10213c' : '#a5d9df', 22, 50); ambient.intensity = value ? 1.3 : 2.7; sun.intensity = value ? .8 : 3.5; waterMat.color.set(value ? '#173b60' : '#57b6c2'); },
    };
    const click = (event: PointerEvent) => {
      renderer.domElement.focus({ preventScroll: true });
      const bounds = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(targets, false)[0]; if (!hit) return;
      if (hit.object.userData.station) { const id = hit.object.userData.station; setSelected(id); setArrived(false); go(id); }
      else { const point = hit.point; const radius = Math.hypot(point.x, point.z); if (radius > 5.6) return; destination = new THREE.Vector3(point.x, .25, point.z); destinationStation = undefined; pointerRing.position.set(point.x, .29, point.z); pointerRing.visible = true; setArrived(false); }
    };
    const keys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
    const keyDown = (event: KeyboardEvent) => { if (keys.has(event.key.toLowerCase())) { event.preventDefault(); controls.current.add(event.key.toLowerCase()); } };
    const keyUp = (event: KeyboardEvent) => controls.current.delete(event.key.toLowerCase());
    const blur = () => controls.current.clear();
    renderer.domElement.addEventListener('pointerup', click); renderer.domElement.addEventListener('keydown', keyDown); renderer.domElement.addEventListener('keyup', keyUp); renderer.domElement.addEventListener('blur', blur); window.addEventListener('blur', blur);
    const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); updateCamera(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const tick = (now: number) => {
      animation = requestAnimationFrame(tick);
      if (now - previous < 1000 / 30) return;
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      if (document.hidden) return;
      const input = controls.current;
      const direction = new THREE.Vector3((input.has('arrowright') || input.has('d') ? 1 : 0) - (input.has('arrowleft') || input.has('a') ? 1 : 0), 0, (input.has('arrowdown') || input.has('s') ? 1 : 0) - (input.has('arrowup') || input.has('w') ? 1 : 0));
      const manual = direction.lengthSq() > 0;
      if (manual) { direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle); destination = undefined; destinationStation = undefined; pointerRing.visible = false; }
      else if (destination) direction.subVectors(destination, avatar.position).setY(0);
      const walkingNow = direction.length() > .07;
      if (walkingNow) {
        const step = Math.min(2.7 * dt, manual ? 2.7 * dt : direction.length());
        direction.normalize(); const next = avatar.position.clone().addScaledVector(direction, step);
        // Keep the explorer on land and outside the two solid buildings.
        if (Math.hypot(next.x, next.z) < 5.5 && !ISLAND_STATIONS.filter(s => s.id !== 'grove').some(s => Math.hypot(next.x - s.x, next.z - s.z) < .9)) avatar.position.copy(next);
        else { destination = undefined; pointerRing.visible = false; }
        avatar.rotation.y = Math.atan2(direction.x, direction.z);
      } else if (destination) {
        destination = undefined; pointerRing.visible = false;
        if (destinationStation) { latest.current.onVisit(destinationStation); setSelected(destinationStation); setArrived(true); destinationStation = undefined; }
      }
      if (walkingNow !== moving) { moving = walkingNow; setWalking(moving); }
      const cycle = reduced.matches ? 0 : now * .012;
      legs.forEach((leg, i) => leg.rotation.x = walkingNow ? Math.sin(cycle + i * Math.PI) * .55 : 0);
      arms.forEach((arm, i) => arm.rotation.x = walkingNow ? -Math.sin(cycle + i * Math.PI) * .5 : 0);
      body.position.y = reduced.matches ? 0 : walkingNow ? Math.abs(Math.sin(cycle)) * .04 : Math.sin(now * .002) * .018;
      shirt.color.set(latest.current.avatarColor);
      const follow = avatar.position.clone().add(new THREE.Vector3(-.8, 0, .65)); const delta = follow.sub(fox.position); if (delta.length() > .35) { fox.position.addScaledVector(delta, Math.min(1, dt * 2.5)); fox.rotation.y = Math.atan2(delta.x, delta.z); } fox.position.y = .25 + (!reduced.matches && walkingNow ? Math.abs(Math.sin(cycle)) * .035 : 0);
      crystals.forEach((c, i) => { const progress = latest.current.goals[i]?.progress || 0; c.scale.setScalar(.65 + progress * .75); c.position.y = .7 + progress * .35; if (!reduced.matches) c.rotation.y = now * .0004 + i; });
      chimney.visible = latest.current.level >= 2;
      house.scale.setScalar(latest.current.level >= 2 ? 1.1 : 1);
      garden.visible = latest.current.decorations.includes('garden'); boat.visible = latest.current.decorations.includes('sailboat'); fireflies.visible = latest.current.decorations.includes('stars');
      if (!reduced.matches) { cloud.position.x = Math.sin(now * .00012) * .5; boat.rotation.z = Math.sin(now * .001) * .04; fireflies.rotation.y = now * .0001; }
      if (latest.current.celebration !== lastCelebration) { lastCelebration = latest.current.celebration; partyUntil = now + 2200; }
      particles.visible = !reduced.matches && now < partyUntil;
      if (particles.visible) confetti.forEach((m, i) => { const t = (2200 - (partyUntil - now)) / 1000; m.position.set(avatar.position.x + Math.sin(i * 2.4) * t, 1 + t * 4 - t * t * 1.4, avatar.position.z + Math.cos(i * 2.4) * t); m.rotation.set(t + i, t * 2, t * 3); });
      renderer.render(scene, camera);
    };
    animation = requestAnimationFrame(tick);
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(animation); setUnavailable(true); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(animation); observer.disconnect(); controls.current.clear(); engine.current = undefined;
      renderer.domElement.removeEventListener('pointerup', click); renderer.domElement.removeEventListener('keydown', keyDown); renderer.domElement.removeEventListener('keyup', keyUp); renderer.domElement.removeEventListener('blur', blur); window.removeEventListener('blur', blur); renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(mat => { if (mat instanceof THREE.SpriteMaterial) mat.map?.dispose(); mat.dispose(); }); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  if (unavailable) return <div><p className="p-3 text-xs text-teal-100">3D is unavailable on this device. Your island and financial quests still work below.</p>{props.fallback}</div>;
  const pad = (key: string, label: string, Icon: typeof ArrowUp) => <button type="button" aria-label={label} className="island-pad-button" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); controls.current.add(key); }} onPointerUp={() => controls.current.delete(key)} onPointerCancel={() => controls.current.delete(key)} onLostPointerCapture={() => controls.current.delete(key)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); controls.current.add(key); } }} onKeyUp={() => controls.current.delete(key)} onBlur={() => controls.current.delete(key)}><Icon size={17} /></button>;
  return <div className="island-game relative overflow-hidden rounded-2xl bg-[#a5d9df]">
    <div ref={host} className="island-canvas" data-testid="island-3d" />
    <div className="absolute left-3 top-3 rounded-xl border border-white/30 bg-slate-950/75 px-3 py-2 text-white shadow-lg backdrop-blur"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-emerald-300">Chapter {Math.min(props.level, 3)} · Evergreen Isle</p><p className="mt-1 flex items-center gap-2 text-xs font-bold"><Compass size={14} />{walking ? 'Exploring with Pip…' : 'Your next adventure starts here'}</p></div>
    <div className="absolute right-3 top-3 flex gap-1"><button type="button" title="Rotate left" aria-label="Rotate camera left" onClick={() => engine.current?.turn(-.4)} className="island-pad-button"><RotateCcw size={15} /></button><button type="button" aria-label="Rotate camera right" onClick={() => engine.current?.turn(.4)} className="island-pad-button"><RotateCw size={15} /></button><button type="button" aria-label={night ? 'Switch to daytime' : 'Switch to night'} onClick={() => { engine.current?.night(!night); setNight(!night); }} className="island-pad-button">{night ? <Sun size={15} /> : <Moon size={15} />}</button></div>
    <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1"><span />{pad('arrowup', 'Walk forward', ArrowUp)}<span />{pad('arrowleft', 'Walk left', ArrowLeft)}{pad('arrowdown', 'Walk backward', ArrowDown)}{pad('arrowright', 'Walk right', ArrowRight)}</div>
    <div className="absolute bottom-3 right-3 flex flex-col gap-1"><button type="button" aria-label="Zoom in" onClick={() => engine.current?.zoom(-2)} className="island-pad-button"><Plus size={16} /></button><button type="button" aria-label="Zoom out" onClick={() => engine.current?.zoom(2)} className="island-pad-button"><Minus size={16} /></button></div>
    <div className="island-station-menu absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl bg-slate-950/80 p-1.5 text-white backdrop-blur">{ISLAND_STATIONS.map(s => <button key={s.id} type="button" onClick={() => visit(s.id)} aria-pressed={selected === s.id} className={`rounded-lg px-2 py-2 text-[10px] font-bold ${selected === s.id ? 'bg-emerald-600' : 'hover:bg-white/15'}`}>{props.visited.includes(s.id) ? '✦ ' : ''}{s.name}</button>)}</div>
    {station && <div role="status" className="absolute left-3 right-3 top-[74px] max-w-sm rounded-xl border border-white/30 bg-slate-950/90 p-3 text-white shadow-lg backdrop-blur"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{arrived ? `Welcome to ${station.name}` : `Walking to ${station.name}…`}</p><button type="button" aria-label="Close island dialogue" onClick={() => setSelected(undefined)}>×</button></div><p className="mt-1 text-[11px] text-slate-300">{station.description}</p>{arrived && <button type="button" onClick={() => props.onOpen(station.destination)} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950">{station.action} →</button>}</div>}
    <span className="sr-only" role="status">{props.visited.length} of 3 island destinations explored.</span>
  </div>;
};
export default FinanceIsland3D;
