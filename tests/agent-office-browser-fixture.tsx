import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import CityAgentOffice from '../components/CityAgentOffice';
import { agentFor, type AgentReport } from '../services/cityAgents';
import { createAccountantInterior } from '../components/city3d/accountantInterior';

const agent = agentFor('auditor');
const input = { today: '2026-10-28', subscriptions: [], loans: [], payments: [], goals: [], entries: [] };
let saved: AgentReport | undefined;
let navigated = false;
function App() {
  const [open, setOpen] = useState(true), [report, setReport] = useState<AgentReport>();
  return <><button id="visit" onClick={() => setOpen(true)}>Visit Kavitha</button>{open && <CityAgentOffice agent={agent} name="Kavitha Nair" input={input} record={report ? { report, rewarded: [] } : undefined}
    onReport={next => { saved = next; setReport(next); }} onClose={() => setOpen(false)} onNavigate={() => { navigated = true; setOpen(false); }} />}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
const waitFor = async (check: () => unknown, label: string) => { for (let n = 0; n < 160; n++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Timed out: ' + label); };
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
(async () => { try {
  await waitFor(() => saved && document.querySelector('canvas[data-scene-ready="true"]'), 'report and 3D rendering');
  const canvas = document.querySelector('canvas')!;
  const gl = canvas.getContext('webgl2');
  if (!gl || gl.isContextLost()) throw new Error('No WebGL room');
  if (!document.body.textContent?.includes('Kavitha Nair')) throw new Error('Wrong resident');
  click('[aria-label="Pause office animation"]');
  await waitFor(() => canvas.dataset.animationPaused === 'true', 'pause');
  const activity = canvas.dataset.activity;
  await new Promise(resolve => setTimeout(resolve, 200));
  if (canvas.dataset.activity !== activity) throw new Error('Pause did not hold activity');
  click('[aria-label="Resume office animation"]');
  await waitFor(() => canvas.dataset.animationPaused === 'false', 'resume');
  const desk = [...document.querySelectorAll('button')].find(button => button.textContent === 'Desk view')!;
  desk.click(); await waitFor(() => desk.getAttribute('aria-pressed') === 'true', 'desk view');
  click('[aria-label="Reset office camera"]');

  // Exercise the actual articulated mesh through a whole routine, independently of frame rate.
  const model = createAccountantInterior({ name: 'Kavitha Nair', role: agent.role, office: agent.office, color: agent.color, roaming: true });
  const camera = new THREE.PerspectiveCamera(); camera.position.set(6, 5, 7);
  const actor = model.room.getObjectByName('Kavitha Nair')!;
  model.tick(0, false, false, camera); const seated = actor.position.clone();
  model.tick(14, false, false, camera);
  if (actor.position.distanceTo(seated) < 0.8) throw new Error('Resident did not walk away from the desk');
  if (model.tick(20, false, false, camera) !== 'Checking a folder') throw new Error('Missing shelf activity');
  model.tick(30, false, true, camera);
  if (actor.position.distanceTo(seated) > 0.001) throw new Error('Reduced motion did not seat resident');
  model.updateReport(false, saved);
  model.dispose();
  const vacant = createAccountantInterior({ name: null, role: agent.role, office: agent.office, color: agent.color, roaming: true });
  if (vacant.room.getObjectByName('Vacant')?.visible) throw new Error('Unhired resident rendered');
  vacant.dispose();

  const before = saved;
  [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Run review'))!.click();
  await waitFor(() => saved !== before, 'rerun audit');
  click('[aria-label="Close the office"]');
  await waitFor(() => !document.querySelector('dialog') && gl.isContextLost(), 'close and release WebGL');
  click('#visit'); await waitFor(() => document.querySelector('dialog[open]'), 'reopen');
  [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Open Subscriptions'))!.click();
  await waitFor(() => navigated, 'subscriptions navigation');
  click('#visit'); await waitFor(() => document.querySelector('canvas[data-scene-ready="true"]'), 'final room');
  document.getElementById('result')!.textContent = 'PASS: 3D advisor, walk cycle, folders, reduced motion, pause/resume, camera, report, navigation and cleanup';
} catch (error) { document.getElementById('result')!.textContent = 'FAIL: ' + (error as Error).message; } })();
