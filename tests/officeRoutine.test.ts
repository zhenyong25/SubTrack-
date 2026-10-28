import test from 'node:test';
import assert from 'node:assert/strict';
import { officeRoutine, OFFICE_ROUTINE_SECONDS } from '../components/city3d/officeRoutine';

test('the resident works, stands, walks, checks folders, rests and returns without teleporting', () => {
  const activities = new Set<string>();
  let previous = officeRoutine(0);
  for (let time = 0.02; time <= OFFICE_ROUTINE_SECONDS * 2; time += 0.02) {
    const pose = officeRoutine(time); activities.add(pose.activity);
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) < 0.035, 'continuous position');
    assert.ok(Math.abs(pose.stand - previous.stand) < 0.025, 'continuous sit/stand transition');
    const turn = Math.atan2(Math.sin(pose.angle - previous.angle), Math.cos(pose.angle - previous.angle));
    assert.ok(Math.abs(turn) < 0.16, 'continuous facing direction');
    // Radius 0.3m clearance from the desktop and bookcase.
    assert.ok(pose.z <= -0.9 || pose.x <= -1.65, 'stay out of the desk');
    assert.ok(pose.z > -1.97, 'stay out of the bookcase');
    assert.ok(pose.x > -3.6 && pose.x < 3.6 && pose.z > -2.6 && pose.z < 2.6, 'stay inside walls');
    previous = pose;
  }
  assert.equal(activities.size, 8);
  assert.deepEqual(officeRoutine(0), officeRoutine(OFFICE_ROUTINE_SECONDS));
});

test('reduced motion holds a seated pose throughout the routine', () => {
  for (let time = 0; time < 100; time += 0.5) assert.deepEqual(officeRoutine(time, true), officeRoutine(0));
});
