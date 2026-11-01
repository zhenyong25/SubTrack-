import * as THREE from 'three';
import { EXPANSION_BUILDINGS, EXPANSION_CATEGORIES } from '../services/cityBuildingExpansion';
import { buildModel, type ModelContext } from '../components/city3d/models';
import { createTextures } from '../components/city3d/textures';

const root = document.getElementById('root')!;
root.style.cssText = 'width:1400px;padding:0!important;margin:0 auto;background:#e9efe9;color:#304c53;font:14px system-ui;position:relative';
document.documentElement.classList.remove('dark'); document.body.style.background = '#e9efe9';
const header = document.createElement('div'); header.style.cssText = 'height:72px;padding:14px 24px'; root.append(header);
const canvas = document.createElement('canvas'); root.append(canvas);
const labels = document.createElement('div'); labels.style.cssText = 'position:absolute;top:72px;left:0;width:1400px;height:600px;pointer-events:none'; root.append(labels);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1400, 600); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const textures = createTextures();
const materials: THREE.Material[] = [];
const context: ModelContext = {
  textures,
  std: (color, extra) => { const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }); materials.push(material); return material; },
  facade: style => { const maps = textures.facade(style); const material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: maps.map, roughness: 0.6 }); materials.push(material); return material; },
};
let models: THREE.Group[] = [];
function renderCategory(category: string) {
  models.forEach(model => model.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); })); models = [];
  materials.splice(0).forEach(material => material.dispose());
  labels.replaceChildren(); const definition = EXPANSION_CATEGORIES.find(c => c.id === category)!;
  header.innerHTML = `<strong style="font-size:24px">${definition.label}</strong><span style="float:right;font-size:12px;padding-top:8px">MY CITY · Individual building models · Level 1</span>`;
  renderer.setScissorTest(false); renderer.setClearColor('#e9efe9'); renderer.clear(); renderer.setScissorTest(true);
  EXPANSION_BUILDINGS.filter(type => type.category === category).forEach((type, i) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(i % 2 ? '#e7eee7' : '#edf2eb');
    scene.add(new THREE.HemisphereLight('#fff7df', '#a0b2a2', 2.3)); const sun = new THREE.DirectionalLight('#fff4d9', 3.2); sun.position.set(-3, 7, 5); scene.add(sun);
    const model = buildModel(type.id, context, 1, type.size); model.scale.multiplyScalar(1 / type.size); models.push(model); scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model, true); const center = bounds.getCenter(new THREE.Vector3()); const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(34, 280 / 260, 0.01, 100); camera.position.copy(center).add(new THREE.Vector3(1, 0.85, 1.25).normalize().multiplyScalar(sphere.radius * 4)); camera.lookAt(center);
    renderer.setViewport(i % 5 * 280, (1 - Math.floor(i / 5)) * 300 + 35, 280, 260);
    renderer.setScissor(i % 5 * 280, (1 - Math.floor(i / 5)) * 300 + 35, 280, 260); renderer.render(scene, camera);
    const label = document.createElement('div'); label.textContent = type.name; label.style.cssText = `position:absolute;left:${i % 5 * 280}px;top:${Math.floor(i / 5) * 300 + 267}px;width:280px;text-align:center;font-size:13px;font-weight:650`; labels.append(label);
  });
  renderer.setScissorTest(false);
}
(window as any).renderBuildingGallery = renderCategory;
renderCategory('farming'); document.getElementById('result')!.textContent = 'PASS: architectural gallery rendered';
