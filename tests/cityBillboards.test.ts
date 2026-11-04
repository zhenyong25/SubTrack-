import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DigitalBillboards, BILLBOARD_TYPES, billboardLayout, type BillboardPlace } from '../components/city3d/billboards';
import { getBuilding } from '../services/cityGameService';

const place = (type = 'shop'): BillboardPlace => ({ id: type, type, center: new THREE.Vector3(4, 0, 7), rotation: Math.PI / 2, size: getBuilding(type)!.size, height: 2 });

test('digital signs fit their plots and roof supports follow upgraded building height', () => {
  for (const type of BILLBOARD_TYPES) {
    assert.ok(getBuilding(type), type);
    for (const s of billboardLayout(place(type))) {
      const sideways = Math.abs(Math.sin(s.turn)) > 0.5;
      assert.ok(Math.abs(s.x) + (sideways ? 0.02 : s.width / 2) <= 0.5);
      assert.ok(Math.abs(s.z) + (sideways ? s.width / 2 : 0.02) <= 0.5);
      assert.ok(s.y > s.height / 2);
    }
  }
  const p = place();
  assert.equal(billboardLayout({ ...p, height: 3 })[0].y - billboardLayout(p)[0].y, 1 / p.size);
  assert.equal(billboardLayout({ ...p, type: 'cottage' }).length, 0);
});

test('billboard playback pauses, moved signs update, and demolition and disposal release the scene', () => {
  const scene = new THREE.Scene(), signs = new DigitalBillboards(scene, () => new THREE.Texture());
  signs.setPlaces([place(), place('metropolisspire')]); assert.equal(signs.count, 4);
  signs.update(9, true, false); assert.equal(signs.clock, 9);
  signs.update(8, false, true); assert.equal(signs.clock, 9);
  const before = new THREE.Matrix4(); signs.screens.getMatrixAt(0, before);
  signs.setPlaces([{ ...place(), center: new THREE.Vector3(12, 0, 7), rotation: 0 }]);
  const after = new THREE.Matrix4(); signs.screens.getMatrixAt(0, after); assert.notDeepEqual(after.elements, before.elements);
  assert.equal(signs.count, 1); signs.setPlaces([]); assert.equal(signs.count, 0);
  signs.dispose(); assert.equal(scene.children.length, 0);
});
