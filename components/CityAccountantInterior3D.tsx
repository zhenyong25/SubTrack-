import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Armchair, House, Minus, Plus, RotateCcw, Pause, Play } from 'lucide-react';
import { createAccountantInterior, type OfficeResident } from './city3d/accountantInterior';
import type { AccountantReport } from '../services/cityAccountantService';
import type { AgentReport } from '../services/cityAgents';

type View = 'room' | 'desk';
interface Props { working: boolean; report?: AccountantReport | AgentReport; resident?: OfficeResident }
interface Engine { view: (view: View) => void; zoom: (scale: number) => void }

export default function CityAccountantInterior3D({ working, report, resident }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const status = useRef({ working, report }); status.current = { working, report };
  const [view, setView] = useState<View>('room');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const animationPaused = useRef(paused); animationPaused.current = paused;
  const activityLabel = useRef<HTMLSpanElement>(null);
  const name = resident ? resident.name || 'Office vacant' : 'Jules';

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
    catch { setFailed(true); return; }
    setFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block'; canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `${resident?.office || 'Town Hall'} 3D interior with ${name}. Drag to orbit, scroll to zoom, or use arrow keys and plus or minus.`);
    container.appendChild(canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce9e6');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = false;
    controls.minDistance = 1.7; controls.maxDistance = 19;
    controls.minPolarAngle = 0.2; controls.maxPolarAngle = Math.PI * 0.48;
    const preset = (next: View) => {
      if (next === 'room') { camera.position.set(6.8, 5.1, 7.6); controls.target.set(0, 1.0, -0.1); }
      else { camera.position.set(2.9, 2.5, -0.35); controls.target.set(0, 1.14, -0.35); }
      controls.update();
    };
    preset('room');
    const zoom = (scale: number) => {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * scale, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset); controls.update();
    };
    engine.current = { view: preset, zoom };
    scene.add(new THREE.HemisphereLight('#f4faff', '#9b8572', 2.0));
    const sunlight = new THREE.DirectionalLight('#fff0d6', 3.4);
    sunlight.position.set(-3, 6, 3); sunlight.target.position.set(0, 0, -0.6);
    sunlight.castShadow = true; sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 25 });
    sunlight.shadow.normalBias = 0.025; sunlight.shadow.bias = -0.0002;
    scene.add(sunlight, sunlight.target);
    const fill = new THREE.DirectionalLight('#d6eaff', 1.1); fill.position.set(4, 4, 5); scene.add(fill);
    const lamp = new THREE.PointLight('#ffdf9a', 0.8, 2.2, 2); lamp.position.set(-1.03, 1.29, 0.4); scene.add(lamp);

    let interior: ReturnType<typeof createAccountantInterior>;
    try { interior = createAccountantInterior(resident); scene.add(interior.room); }
    catch {
      controls.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      sunlight.shadow.dispose(); setFailed(true); engine.current = null; return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0; let disposed = false; let lost = false; let visible = true;
    let previousReport: AccountantReport | AgentReport | undefined; let previousWorking: boolean | undefined;
    let lastFrame = 0;
    let elapsed = 0, previousTimestamp = performance.now();
    const render = (timestamp: number) => {
      if (disposed || lost) return;
      const current = status.current;
      if (current.report !== previousReport || current.working !== previousWorking) {
        interior.updateReport(current.working, current.report);
        previousReport = current.report; previousWorking = current.working;
      }
      controls.update();
      if (!animationPaused.current && !document.hidden && visible) elapsed += Math.min(0.5, Math.max(0, timestamp - previousTimestamp) / 1000);
      previousTimestamp = timestamp;
      const activity = interior.tick(elapsed, current.working, reduced.matches, camera);
      canvas.dataset.activity = activity;
      canvas.dataset.animationPaused = String(animationPaused.current);
      if (activityLabel.current) activityLabel.current.textContent = activity;
      renderer.render(scene, camera);
      canvas.dataset.sceneReady = 'true';
    };
    const tick = (timestamp: number) => {
      if (disposed || lost) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden || !visible) { previousTimestamp = timestamp; return; }
      if (timestamp - lastFrame < 1000 / 30) return;
      lastFrame = timestamp; render(timestamp);
    };
    const resize = () => {
      if (disposed || lost) return;
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = Math.min(65, 42 * Math.max(1, 1.2 / camera.aspect));
      camera.updateProjectionMatrix(); render(performance.now());
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; }); intersection.observe(container);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.85); }
      else if (event.key === '-') { event.preventDefault(); zoom(1.18); }
      else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
        if (event.key === 'ArrowRight') spherical.theta += 0.12;
        if (event.key === 'ArrowUp') spherical.phi = Math.max(controls.minPolarAngle, spherical.phi - 0.08);
        if (event.key === 'ArrowDown') spherical.phi = Math.min(controls.maxPolarAngle, spherical.phi + 0.08);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical)); controls.update();
      }
    };
    const onContextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); setFailed(true); };
    canvas.addEventListener('keydown', onKey); canvas.addEventListener('webglcontextlost', onContextLost);
    resize(); frame = requestAnimationFrame(tick);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); controls.dispose();
      canvas.removeEventListener('keydown', onKey); canvas.removeEventListener('webglcontextlost', onContextLost);
      interior.dispose(); sunlight.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); engine.current = null;
    };
  }, [attempt, resident?.name, resident?.role, resident?.office, resident?.color, resident?.roaming]);

  const selectView = (next: View) => { setView(next); engine.current?.view(next); };
  const button = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors';
  return <section className="accountant-interior relative overflow-hidden rounded-2xl border border-border bg-[#dce9e6]" aria-label={`Interactive ${resident?.office || 'Town Hall'} interior`}>
    <div ref={host} className="accountant-interior-canvas" />
    {!failed && <>
      <div className="absolute left-3 top-3 flex gap-1 rounded-xl border border-white/60 bg-white/90 p-1 text-slate-700 shadow-sm backdrop-blur-sm">
        <button type="button" aria-pressed={view === 'room'} onClick={() => selectView('room')} className={`${button} ${view === 'room' ? 'bg-teal-800 text-white' : 'hover:bg-teal-50'}`}><House size={14} />Room</button>
        <button type="button" aria-pressed={view === 'desk'} onClick={() => selectView('desk')} className={`${button} ${view === 'desk' ? 'bg-teal-800 text-white' : 'hover:bg-teal-50'}`}><Armchair size={14} />{resident ? 'Desk view' : 'Jules’s desk'}</button>
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-xl bg-white/90 p-1 text-slate-700 shadow-sm">
        <button type="button" aria-label="Zoom into office" onClick={() => engine.current?.zoom(0.85)} className="rounded-lg p-2 hover:bg-teal-50"><Plus size={16} /></button>
        <button type="button" aria-label="Zoom out of office" onClick={() => engine.current?.zoom(1.18)} className="rounded-lg p-2 hover:bg-teal-50"><Minus size={16} /></button>
        <button type="button" aria-label="Reset office camera" onClick={() => selectView('room')} className="rounded-lg p-2 hover:bg-teal-50"><RotateCcw size={15} /></button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 rounded-xl bg-teal-950/90 px-3 py-2 text-[11px] font-semibold text-white"><span className={`h-1.5 w-1.5 rounded-full ${working ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'}`} />{name} · <span ref={activityLabel}>Typing at the desk</span></span>
        {resident?.roaming && resident.name && <button type="button" aria-label={paused ? 'Resume office animation' : 'Pause office animation'} onClick={() => setPaused(value => !value)} className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[11px] font-bold text-slate-700">{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Resume' : 'Pause'}</button>}
        <span className="rounded-full bg-white/85 px-3 py-1.5 text-[10px] font-medium text-slate-600">Drag to rotate · Scroll or pinch to zoom</span>
      </div>
    </>}
    {failed && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center"><House size={32} className="text-secondary" /><p className="text-sm font-bold text-textMain">The 3D room could not start on this device.</p><p className="max-w-sm text-xs text-secondary">Try enabling browser graphics acceleration. Your report is available alongside the room.</p><button type="button" onClick={() => { setFailed(false); setView('room'); setAttempt(value => value + 1); }} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Retry 3D room</button></div>}
  </section>;
}
