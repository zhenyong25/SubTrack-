import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pedestrians } from '../components/city3d/people';
import { WINDOW_LIGHT, litWindows, setWindowLights, windowLight } from '../components/city3d/windowLights';

const world = (index: number) => new THREE.Vector3(index % 100, 0, Math.floor(index / 100));

test('window lights follow who is home and who is at work, day and night', () => {
  const people = new Pedestrians(new THREE.Scene(), 40, world, new THREE.Vector3(), undefined);
  people.setRoads(new Set([0, 1, 2, 3]));
  people.setCity([{ id: 'flats', residents: 20, door: 0 }], [{ id: 'office', staff: 10, door: 3 }]);
  const inside = people as unknown as { people: Array<{ work: unknown; streetVisible: boolean }> };
  // Nobody is out walking: everyone without a job is at home.
  inside.people.forEach(p => { p.streetVisible = false; });
  const day = people.occupancy(false), night = people.occupancy(true);
  assert.equal(day.get('office'), 10, 'by day everyone with a job is at work');
  assert.equal(day.get('flats'), 10, 'and the rest are at home');
  assert.ok((night.get('office') || 0) >= 1 && (night.get('office') || 0) <= 4, 'a night shift keeps a few office lights on');
  assert.ok((night.get('flats') || 0) >= 16, 'most people are home at night');
  // People out on the streets are not at home.
  inside.people.forEach(p => { if (!p.work) p.streetVisible = true; });
  assert.equal(people.occupancy(false).get('flats') || 0, 0);
  people.dispose();
});

test('each building gets its own seed and a lit share, and the attribute grows with the mesh', () => {
  const value = windowLight('tower-1', 0.4);
  assert.ok(Math.abs(value % 1 - 0.4) < 1e-6); assert.ok(value >= 1 || value === 0.4);
  assert.notEqual(Math.floor(windowLight('tower-1', 0)), Math.floor(windowLight('tower-2', 0)));
  assert.ok(windowLight('x', 5) % 1 < 1, 'a full building stays below the next seed');
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 4);
  setWindowLights(mesh, [1.5, 2.25]);
  const attribute = mesh.geometry.getAttribute(WINDOW_LIGHT) as THREE.InstancedBufferAttribute;
  assert.equal(attribute.count, 4); assert.equal(attribute.array[1], 2.25);
});

test('the window shader hooks into the standard material', () => {
  const material = new THREE.MeshStandardMaterial({ emissiveMap: new THREE.Texture() });
  litWindows(material, 6, 4);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /vWindowLight = instanceLight/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \*= step\(chance, share/);
  assert.deepEqual((shader.uniforms.windowGrid.value as THREE.Vector2).toArray(), [6, 4]);
});
