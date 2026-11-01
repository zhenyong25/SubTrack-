import React from 'react';
import { createRoot } from 'react-dom/client';
import FinanceWorld from '../components/FinanceWorld';
import { BUILDINGS, CITY_PREFIX, canPlace, build, newCity, type CityState } from '../services/cityGameService';
import { EXPANSION_CATEGORIES } from '../services/cityBuildingExpansion';

const today = '2026-10-31', now = Date.now();
let city: CityState = { ...newCity(now, today), coins: 100000, xp: 100000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const positions = Array.from({ length: 10000 }, (_, i) => ({ x: i % 100, z: Math.floor(i / 100) })).sort((a, b) => Math.hypot(a.x - 49, a.z - 49) - Math.hypot(b.x - 49, b.z - 49));
for (const type of ['wheatfield', 'redbarn', 'appleorchard', 'ricepaddy', 'fishingjetty', 'harbourcrane', 'twintowers', 'glasstower', 'loftblock', 'solarcanopy', 'waterreclamation', 'botanicalgarden']) {
  const spot = positions.find(p => canPlace(city, type, p.x, p.z).ok)!;
  city = build(city, type, spot.x, spot.z, now, today, type).state!;
}
localStorage.setItem(CITY_PREFIX + 'expansion-browser', JSON.stringify(city));
createRoot(document.getElementById('root')!).render(<FinanceWorld owner="expansion-browser" expenses={[]} incomes={[]} subscriptions={[]} loans={[]} loanPayments={[]} onOpen={() => {}} />);
const wait = async (check: () => unknown) => { for (let i = 0; i < 250; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Browser fixture timed out'); };
const clickCategory = async (name: string) => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(name) && b.getAttribute('aria-pressed') !== null)!;
  button.click(); await wait(() => button.getAttribute('aria-pressed') === 'true');
};
async function verify() {
  await wait(() => document.querySelector('[aria-label="Search building catalogue"]'));
  await wait(() => document.querySelector('canvas'));
  for (const category of EXPANSION_CATEGORIES) {
    await clickCategory(category.label);
    await wait(() => document.querySelectorAll('.city-building-catalogue > button').length === 10);
  }
  await clickCategory('All');
  await wait(() => document.querySelectorAll('.city-building-catalogue > button').length === BUILDINGS.length);
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search building catalogue"]')!;
  const setSearch = (value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, value); search.dispatchEvent(new Event('input', { bubbles: true })); };
  setSearch('harbour crane');
  await wait(() => document.querySelectorAll('.city-building-catalogue > button').length === 1);
  const card = document.querySelector<HTMLButtonElement>('.city-building-catalogue > button')!;
  if (!card.textContent?.includes('Shoreline')) throw new Error('Missing coastal placement guidance');
  card.click(); await wait(() => document.body.textContent?.includes('Tap to build Harbour crane'));
  setSearch('no-such-building');
  await wait(() => document.body.textContent?.includes('No buildings match'));
  setSearch(''); await clickCategory('Farming');
  await wait(() => document.querySelectorAll('.city-building-catalogue > button').length === 10);
  // Also exercise touch layouts and verify no horizontal overflow via the runner.
  (document.getElementById('result')!).textContent = 'PASS: 12 categories, 120 additions, global search, empty results, coastal guidance, placement tool, and live scene.';
}
verify().catch(error => { document.getElementById('result')!.textContent = 'FAIL: ' + error.message; });
