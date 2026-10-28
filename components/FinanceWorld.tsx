import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Building2, Check, Cloud, CloudOff, Coins, Droplets, Gift, Hammer, Lamp, Lock, Map as MapIcon, Move, Route, Shovel, Smile, Sparkles, Star, Trash2, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import type { Expense, Income, Loan, LoanPayment, Subscription } from '../types';
import { loadSavingsGoals, type SavingsData } from '../services/savingsGoalService';
import { todayDate } from '../services/savingsGoalMath';
import { weeklyWorldActivity, worldWeek, type QuestId } from '../services/financeWorldService';
import {
  ALL_DONE_BONUS, BUILDINGS, HALL, LIGHT_COST, MAP, MAX_BUILDING_LEVEL, ROAD_COST, TIMBER_COINS, WEEKLY_REWARDS,
  addLights, build, buildRoads, buyChunk, clearTrees, chunkCost, cityStats, claimMission, claimWeekly, collect, dailyMissions, demolish, demolishRefund, financeActivity, getBuilding,
  household, levelProgress, maxChunks, recordAgentReport, staffRoster, move, occupancy, pendingCoins, removeLight, removeRoad, terrainMap, tileIndex, treesAt, upgrade, upgradeCost,
  type BuildingCategory, type CityState, type Mission,
} from '../services/cityGameService';
import { loadCity, saveCityToCloud, writeLocal, type CloudStatus } from '../services/cityGameStore';
import type { SceneFocus, SceneMode } from './CityScene3D';
import CityAccountantOffice from './CityAccountantOffice';
import CityAgentOffice from './CityAgentOffice';
import { AGENTS, agentFor, agentForBuilding, type AgentId, type AgentInput } from '../services/cityAgents';
import type { AccountantReport } from '../services/cityAccountantService';

const CityScene3D = React.lazy(() => import('./CityScene3D'));

type Destination = 'goals' | 'expenses' | 'income' | 'review' | 'subscriptions' | 'debts';
interface Props { owner: string; expenses: Expense[]; incomes: Income[]; subscriptions: Subscription[]; loans: Loan[]; loanPayments: LoanPayment[]; onOpen: (destination: Destination) => void }

const ICONS: Record<string, string> = {
  hall: '🏛️', cottage: '🏠', townhouse: '🏘️', apartment: '🏢', tower: '🏙️', cafe: '☕', shop: '🏪', market: '🛒', office: '🏬', bank: '🏦',
  workshop: '🔧', factory: '🏭', powerplant: '⚡', windmill: '🌬️', solar: '☀️', watertower: '🚰', pump: '💧',
  tree: '🌳', park: '🌲', fountain: '⛲', school: '🏫', clinic: '🏥', lighthouse: '🗼',
  postoffice: '📮', vault: '🐷', creditunion: '🤝',
};
const CATEGORIES: Array<{ id: BuildingCategory; label: string }> = [
  { id: 'homes', label: 'Homes' }, { id: 'business', label: 'Business' }, { id: 'industry', label: 'Industry' }, { id: 'utilities', label: 'Utilities' }, { id: 'services', label: 'Services' }, { id: 'advisors', label: 'Advisors' },
];
const TITLES = ['', 'Camp', 'Hamlet', 'Village', 'Village', 'Town', 'Town', 'City', 'City', 'Metropolis', 'Metropolis', 'Capital', 'Capital', 'Megacity', 'Megacity', 'World city'];
const box = 'min-w-0 rounded-2xl border border-border bg-surface p-4';
const coinText = (value: number) => Math.floor(value).toLocaleString();
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const effects = (typeId: string) => {
  const type = getBuilding(typeId)!;
  return [
    type.income ? `+${type.income} 🪙/h` : '',
    type.residents ? `+${type.residents} residents` : '',
    type.jobs ? `${type.jobs} jobs` : '',
    type.powerSupply ? `+${type.powerSupply} ⚡` : '',
    type.waterSupply ? `+${type.waterSupply} 💧` : '',
    type.happiness ? `${type.happiness > 0 ? '+' : ''}${type.happiness} 😊` : '',
    type.size === 2 ? '2×2' : '',
  ].filter(Boolean);
};

const STATUS_TEXT: Record<CloudStatus, string> = {
  synced: 'Saved to your account',
  saving: 'Saving…',
  'local-only': 'Saved on this device',
  'setup-needed': 'Saved on this device - run supabase_city_game_schema.sql to sync',
  offline: 'Saved on this device - will sync when back online',
};

// The whole 100×100 map from above: a minimap that jumps the camera, and the city itself on
// devices without WebGL.
const CityMap2D: React.FC<{ city: CityState; size: number; onPick: (x: number, z: number) => void; focus?: { x: number; z: number } | null; label: string }> = ({ city, size, onPick, focus, label }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(MAP, MAP);
    const tiles = terrainMap();
    const roads = new Set(city.roads);
    const taken = occupancy(city);
    for (let z = 0; z < MAP; z += 1) for (let x = 0; x < MAP; x += 1) {
      const index = z * MAP + x;
      const owned = city.chunks.includes(Math.floor(z / 10) * 10 + Math.floor(x / 10));
      let rgb = tiles[index] === 'water' ? [40, 126, 166] : tiles[index] === 'sand' ? [226, 211, 160] : [110, 170, 92];
      if (roads.has(index)) rgb = [70, 74, 80];
      const occupant = taken.get(index);
      if (occupant) { const type = occupant === 'hall' ? null : getBuilding(city.buildings.find(b => b.id === occupant)!.type); rgb = !type ? [240, 196, 80] : type.category === 'homes' ? [232, 140, 110] : type.category === 'business' ? [90, 150, 230] : type.category === 'industry' ? [190, 150, 90] : type.category === 'utilities' ? [250, 210, 70] : [60, 140, 70]; }
      if (!owned && tiles[index] !== 'water') rgb = rgb.map(v => v * 0.6 + 40);
      image.data.set([...rgb, 255], index * 4);
    }
    ctx.putImageData(image, 0, 0);
    if (focus) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(focus.x - 7, focus.z - 5, 14, 10); }
  }, [city, focus]);
  return (
    <canvas ref={canvas} width={MAP} height={MAP} aria-label={label} role="img" style={{ width: size, height: size, imageRendering: 'pixelated' }} className="cursor-crosshair rounded-xl border border-white/20 shadow-lg"
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onPick(Math.floor(((event.clientX - bounds.left) / bounds.width) * MAP), Math.floor(((event.clientY - bounds.top) / bounds.height) * MAP));
      }} />
  );
};

const FinanceWorld: React.FC<Props> = ({ owner, expenses, incomes, subscriptions, loans, loanPayments, onOpen }) => {
  const [city, setCity] = useState<CityState | null>(null);
  const [status, setStatus] = useState<CloudStatus>('local-only');
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now);
  const [today, setToday] = useState(todayDate);
  const [mode, setMode] = useState<SceneMode>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accountantOpen, setAccountantOpen] = useState(false);
  const [accountantWorking, setAccountantWorking] = useState(false);
  const [category, setCategory] = useState<BuildingCategory>('homes');
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [savings, setSavings] = useState<SavingsData>({ goals: [], entries: [] });
  const [agentOpen, setAgentOpen] = useState<AgentId | null>(null);
  const [review, setReview] = useState([false, false, false]);
  const [focus, setFocus] = useState<SceneFocus | null>(null);
  const saveTimer = useRef<number>();
  const cityRef = useRef<CityState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCity(owner, Date.now(), todayDate())
      .then(result => {
        if (cancelled) return;
        setCity(result.state);
        cityRef.current = result.state;
        setStatus(result.status);
        try { writeLocal(owner, result.state); } catch { /* storage full - the cloud copy still saves */ }
      })
      .catch(reason => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Your city could not be loaded.'); });
    return () => { cancelled = true; };
  }, [owner]);

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); setToday(todayDate()); }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => { loadSavingsGoals().then(setSavings).catch(() => undefined); };
    refresh();
    window.addEventListener('subtrack-savings-changed', refresh);
    return () => window.removeEventListener('subtrack-savings-changed', refresh);
  }, []);

  // Saves on this device immediately; the account copy a moment later, so rapid taps batch up.
  const commit = useCallback((next: CityState, message?: string) => {
    setCity(next);
    cityRef.current = next;
    try { writeLocal(owner, next); } catch { setToast({ text: 'Could not save on this device - storage may be full.', tone: 'bad' }); }
    if (message) setToast({ text: message, tone: 'good' });
    window.clearTimeout(saveTimer.current);
    setStatus(current => (current === 'setup-needed' || current === 'local-only' ? current : 'saving'));
    saveTimer.current = window.setTimeout(() => {
      if (cityRef.current) saveCityToCloud(cityRef.current).then(setStatus).catch(() => setStatus('offline'));
    }, 1500);
  }, [owner]);

  useEffect(() => () => {
    if (saveTimer.current !== undefined) { window.clearTimeout(saveTimer.current); if (cityRef.current) void saveCityToCloud(cityRef.current); }
  }, []);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode({ kind: 'idle' }); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  const activity = useMemo(() => financeActivity(expenses, incomes, savings.entries, today), [expenses, incomes, savings.entries, today]);
  const weeklyActivity = useMemo(() => weeklyWorldActivity(expenses, savings.entries, today), [expenses, savings.entries, today]);
  useEffect(() => { setReview([false, false, false]); }, [weeklyActivity.week]);
  const stats = useMemo(() => (city ? cityStats(city, now) : null), [city, now]);

  if (loadError) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{loadError}</div>;
  if (!city || !stats) return <div className="flex h-[420px] items-center justify-center text-sm text-secondary">Opening your city…</div>;

  const progress = levelProgress(city.xp);
  const level = progress.level;
  const missions = dailyMissions(city, activity, today);
  const allClaimed = missions.every(mission => mission.claimed);
  const bonusClaimed = city.daily.day === today && city.daily.claimed.includes('bonus');
  const rawPending = pendingCoins(city, now, stats);
  const pending: Record<string, number> = {};
  Object.entries(rawPending).forEach(([id, value]) => { pending[id] = Math.floor(value); });
  const totalPending = Object.values(pending).reduce((sum, value) => sum + value, 0);
  const selected = selectedId === 'hall' ? null : city.buildings.find(building => building.id === selectedId) || null;
  const selectedType = selected ? getBuilding(selected.type)! : null;
  const selectedStatus = selectedId ? stats.status.get(selectedId) : undefined;
  const placingType = mode.kind === 'place' ? getBuilding(mode.type) : null;

  const report = (result: { state?: CityState; error?: string }, message: string) => {
    if (result.error || !result.state) { setToast({ text: result.error || 'Something went wrong.', tone: 'bad' }); return false; }
    commit(result.state, message);
    return true;
  };

  const handleCollect = (id?: string) => {
    const result = collect(city, Date.now(), today, id);
    if (result.coins === 0) { setToast({ text: 'Nothing to collect yet - buildings fill up over time.', tone: 'bad' }); return; }
    commit(result.state, `+${result.coins} coins collected`);
  };

  const handleTile = (x: number, z: number) => {
    if (mode.kind === 'place') {
      const type = getBuilding(mode.type)!;
      // Cheap greenery is usually planted in a row, so stay in place mode for it.
      if (report(build(city, mode.type, x, z, Date.now(), today, newId()), `${type.name} built!`) && (type.cost > 20 || city.coins - type.cost < type.cost)) setMode({ kind: 'idle' });
      return;
    }
    if (mode.kind === 'move') {
      if (report(move(city, mode.id, x, z, Date.now(), today), 'Moved.')) setMode({ kind: 'idle' });
      return;
    }
    if (mode.kind === 'bulldoze') {
      const index = tileIndex(x, z);
      // One thing at a time: a street light first, then the road under it.
      if (city.lights.includes(index)) { report(removeLight(city, index, Date.now(), today), 'Street light removed.'); return; }
      if (city.roads.includes(index)) { report(removeRoad(city, index, Date.now(), today), 'Road removed.'); return; }
      const trees = treesAt(city, x, z);
      if (trees && !occupancy(city).has(index)) { report(clearTrees(city, x, z, Date.now(), today), `Trees cleared · +${trees * TIMBER_COINS} coins for the timber`); return; }
      const occupant = occupancy(city).get(index);
      if (occupant === 'hall') { setToast({ text: 'The Town Hall stays.', tone: 'bad' }); return; }
      if (occupant) {
        const building = city.buildings.find(item => item.id === occupant)!;
        report(demolish(city, occupant, Date.now(), today), `${getBuilding(building.type)!.name} removed · +${demolishRefund(building)} coins`);
      }
      return;
    }
    const picked = occupancy(city).get(tileIndex(x, z)) ?? null;
    setSelectedId(picked);
    if (picked === 'hall') setAccountantOpen(true);
    setConfirmDemolish(false);
  };

  const handleMission = (mission: Mission | 'bonus') => {
    const id = mission === 'bonus' ? 'bonus' : mission.id;
    const reward = mission === 'bonus' ? ALL_DONE_BONUS : mission;
    report(claimMission(city, missions, id, Date.now(), today), `+${reward.coins} coins · +${reward.xp} XP`);
  };

  const reviewed = city.weekly.some(item => item.week === worldWeek(today) && item.quest === 'review');
  const weekly: Array<{ id: QuestId; title: string; note: string; ratio: number; eligible: boolean; destination: Destination }> = [
    { id: 'record', title: 'A clear picture', note: `${Math.min(3, weeklyActivity.days)} / 3 days with expenses recorded this week`, ratio: Math.min(1, weeklyActivity.days / 3), eligible: weeklyActivity.days >= 3, destination: 'expenses' },
    { id: 'save', title: 'Toward tomorrow', note: weeklyActivity.saved ? 'A savings contribution this week' : 'Add to any savings goal this week', ratio: weeklyActivity.saved ? 1 : 0, eligible: weeklyActivity.saved, destination: 'goals' },
    { id: 'review', title: 'Weekly money moment', note: reviewed ? 'Reviewed this week' : `${review.filter(Boolean).length} / 3 review steps checked`, ratio: reviewed ? 1 : review.filter(Boolean).length / 3, eligible: review.every(Boolean), destination: 'review' },
  ];

  const nextUnlocks = BUILDINGS.filter(type => type.unlock === level + 1);
  const powerShort = stats.power.demand > stats.power.supply;
  const waterShort = stats.water.demand > stats.water.supply;
  const tips = [
    stats.noRoad ? `${stats.noRoad} building${stats.noRoad === 1 ? ' has' : 's have'} no road - they earn nothing and nobody can live there. Draw a road next to ${stats.noRoad === 1 ? 'it' : 'them'}.` : '',
    powerShort ? `Power shortage (${stats.power.demand} needed, ${stats.power.supply} supplied) - build a power plant or wind turbine.` : '',
    waterShort ? `Water shortage (${stats.water.demand} needed, ${stats.water.supply} supplied) - build a water tower.` : '',
    stats.jobs > 0 && stats.staffing < 1 ? `Shops are short of workers (${Math.round(stats.staffing * 100)}% staffed) - build homes.` : '',
    stats.happiness < 50 ? 'Residents are unhappy - parks, trees, schools and clinics raise income.' : '',
    city.buildings.length === 0 ? 'Start beside the avenue: a Cottage and a Café, then a Water tower and a Power plant as you grow.' : '',
  ].filter(Boolean);
  // Each advisor: their building (the first one built), the resident in the job, and their last report.
  // Filled jobs: these residents are inside at work; the rest are the people on the streets.
  const employed = [...stats.status.values()].reduce((sum, item) => sum + item.staff, 0);
  const advisors = AGENTS.map(agent => {
    const building = city.buildings.find(item => item.type === agent.building) || null;
    const staff = building ? stats.status.get(building.id)?.staff || 0 : 0;
    return { agent, building, name: building && staff > 0 ? staffRoster(building.id, building.type, staff)[0]?.name ?? null : null, record: city.agents?.[agent.id] };
  });
  const agentInput: AgentInput = { today, subscriptions, loans, payments: loanPayments, goals: savings.goals, entries: savings.entries };
  const modeText = mode.kind === 'place' ? `${ICONS[mode.type]} Tap to build ${placingType?.name} · ${placingType?.cost} 🪙 - green has a road, yellow needs one`
    : mode.kind === 'move' ? 'Tap where to move it'
      : mode.kind === 'road' ? `Drag to draw a road · ${ROAD_COST} 🪙 per tile`
        : mode.kind === 'lights' ? `Drag along roads to put up street lights · ${LIGHT_COST} 🪙 each`
        : mode.kind === 'bulldoze' ? `Tap trees to clear them (+${TIMBER_COINS} 🪙 a tree), or a light, road or building to remove it (part refunded)`
          : mode.kind === 'land' ? `Tap a highlighted plot to buy it · ${chunkCost(city)} 🪙 · ${city.chunks.length}/${maxChunks(level)} plots at level ${level}`
            : '';
  const tool = (kind: 'road' | 'lights' | 'bulldoze' | 'land', label: string, Icon: React.ElementType) => (
    <button type="button" onClick={() => { setMode(mode.kind === kind ? { kind: 'idle' } : { kind }); setSelectedId(null); }}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${mode.kind === kind ? 'border-primary bg-primary text-white' : 'border-border bg-background text-textMain hover:border-primary'}`}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="world-layout space-y-4 pb-4">
      {agentOpen && (() => {
        const advisor = advisors.find(item => item.agent.id === agentOpen)!;
        return <CityAgentOffice agent={advisor.agent} name={advisor.name} input={agentInput} record={advisor.record} onClose={() => setAgentOpen(null)}
          onNavigate={destination => { setAgentOpen(null); onOpen(destination); }}
          onReport={report => {
            const current = cityRef.current;
            if (!current) return;
            const result = recordAgentReport(current, report, Date.now(), todayDate());
            commit(result.state, result.fixed ? `${advisor.agent.role}: ${result.fixed} issue${result.fixed === 1 ? '' : 's'} fixed · +${result.fixed * 40} coins` : undefined);
          }} />;
      })()}
      <CityAccountantOffice key={owner} open={accountantOpen} expenses={expenses} today={today} report={city.accountantReport}
        onClose={() => setAccountantOpen(false)} onWorking={setAccountantWorking}
        onOpenExpenses={() => { setAccountantOpen(false); onOpen('expenses'); }}
        onReport={(accountantReport: AccountantReport) => { const current = cityRef.current; if (current) commit({ ...current, accountantReport, updatedAt: Date.now() }); }} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-500"><Building2 size={13} /> Build with good habits</p>
          <h1 className="mt-1 text-2xl font-extrabold text-textMain">My City</h1>
          <p className="mt-1 text-xs text-secondary">Lay roads, power and water, build homes and businesses - and grow it with daily money habits.</p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold ${status === 'synced' ? 'border-emerald-500/30 text-emerald-500' : 'border-border text-secondary'}`}>
          {status === 'synced' || status === 'saving' ? <Cloud size={14} /> : <CloudOff size={14} />} {STATUS_TEXT[status]}
        </span>
      </header>
      <button type="button" onClick={() => { setSelectedId('hall'); setMode({ kind: 'idle' }); setAccountantOpen(true); }} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-left hover:border-emerald-500/50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Users size={20} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-textMain">Jules · Accountant resident</span><span className="mt-0.5 block text-xs text-secondary">{accountantWorking ? 'Reviewing expenses at the Town Hall...' : city.accountantReport ? 'Your spending report is at the Town Hall. Visit the office.' : 'Your first working resident is at the Town Hall. Visit the office.'}</span></span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${accountantWorking ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} /><ArrowRight size={16} className="text-emerald-500" />
      </button>

      <div className="grid gap-2 sm:grid-cols-3">
        {advisors.map(({ agent, building, name, record }) => {
          const open = record?.report?.findings.filter(finding => finding.tone === 'warn').length || 0;
          return (
            <button key={agent.id} type="button" onClick={() => { if (building) { setSelectedId(building.id); setMode({ kind: 'idle' }); setAgentOpen(agent.id); } else { setCategory('advisors'); setMode({ kind: 'place', type: agent.building }); } }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 text-left hover:border-primary">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${agent.color}22` }}>{ICONS[agent.building]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-textMain">{building ? `${name || 'Hiring…'} · ${agent.role}` : agent.role}</span>
                <span className="mt-0.5 block truncate text-[11px] text-secondary">{!building ? `Build a ${getBuilding(agent.building)!.name} to hire one` : !name ? 'Needs residents to hire' : open ? `${open} thing${open === 1 ? '' : 's'} to look at` : record?.report ? 'All clear - visit for the report' : 'Visit for a first review'}</span>
              </span>
              {building && open > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">{open}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <div className="col-span-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-300">Coins</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xl font-black text-amber-600 dark:text-amber-300"><Coins size={18} />{coinText(city.coins)}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-baseline justify-between"><p className="text-[10px] font-bold uppercase text-secondary">Level {level} · {TITLES[level]}</p><p className="text-[10px] text-secondary">{progress.ratio >= 1 ? 'Max' : `${progress.current} / ${progress.needed} XP`}</p></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.ratio * 100}%` }} /></div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary"><Users size={12} /> Residents</p><p className="mt-0.5 text-base font-black text-textMain">{stats.residents.toLocaleString()} <span className="text-[10px] font-semibold text-secondary">/ {stats.jobs} jobs</span></p><p className="text-[10px] text-secondary">{employed} at work · {stats.residents - employed} out walking</p></div>
        <div className="rounded-2xl border border-border bg-surface p-3"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary"><Smile size={12} /> Happiness</p><p className={`mt-0.5 text-base font-black ${stats.happiness >= 70 ? 'text-emerald-500' : stats.happiness < 45 ? 'text-rose-500' : 'text-textMain'}`}>{stats.happiness}%</p></div>
        <div className="rounded-2xl border border-border bg-surface p-3"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary"><Zap size={12} /> Power</p><p className={`mt-0.5 text-base font-black ${powerShort ? 'text-rose-500' : 'text-textMain'}`}>{stats.power.demand}<span className="text-[10px] font-semibold text-secondary"> / {stats.power.supply}</span></p></div>
        <div className="rounded-2xl border border-border bg-surface p-3"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary"><Droplets size={12} /> Water</p><p className={`mt-0.5 text-base font-black ${waterShort ? 'text-rose-500' : 'text-textMain'}`}>{stats.water.demand}<span className="text-[10px] font-semibold text-secondary"> / {stats.water.supply}</span></p></div>
        <div className="col-span-2 rounded-2xl border border-border bg-surface p-3 sm:col-span-1"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-secondary"><TrendingUp size={12} /> Income</p><p className="mt-0.5 text-base font-black text-textMain">{stats.incomePerHour.toFixed(0)} <span className="text-[10px] font-semibold text-secondary">🪙/h</span></p></div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-teal-500/20 bg-[#9fd8e6] shadow-lg">
            <React.Suspense fallback={<div className="flex h-[560px] items-center justify-center text-sm text-teal-900">Building your city…</div>}>
              <CityScene3D
                paused={accountantOpen || !!agentOpen}
                city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={pending} mode={mode} selectedId={selectedId} focus={focus}
                onTile={handleTile}
                onRoad={tiles => report(buildRoads(city, tiles, Date.now(), today), 'Road built.')}
                onLights={tiles => report(addLights(city, tiles, Date.now(), today), 'Street lights on - residents feel safer.')}
                onSelect={id => { setSelectedId(id); setConfirmDemolish(false); if (id === 'hall') setAccountantOpen(true); }}
                onCollect={id => handleCollect(id)}
                onChunk={chunk => { if (report(buyChunk(city, chunk, Date.now(), today), 'New land bought - your city can grow!')) setMode({ kind: 'idle' }); }}
                fallback={<div className="flex justify-center p-4"><CityMap2D city={city} size={520} label="Your city map" onPick={handleTile} /></div>}
              />
            </React.Suspense>
            {mode.kind !== 'idle' && (
              <div className="absolute left-3 top-14 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-xl bg-slate-950/85 px-3 py-2 text-xs font-bold text-white backdrop-blur sm:top-3 sm:max-w-[calc(100%-200px)]">
                <span>{modeText}</span>
                <button type="button" onClick={() => setMode({ kind: 'idle' })} aria-label="Done" className="rounded-md bg-white/15 p-1"><X size={12} /></button>
              </div>
            )}
            <div className="absolute bottom-3 left-3 hidden sm:block">
              <CityMap2D city={city} size={132} label="Minimap - click to move the camera" focus={focus} onPick={(x, z) => setFocus({ x, z, key: Date.now() })} />
            </div>
            {mode.kind === 'idle' && totalPending >= 1 && (
              <button type="button" onClick={() => handleCollect()} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-black text-amber-950 shadow-lg hover:bg-amber-300">
                <Coins size={16} /> Collect {coinText(totalPending)}
              </button>
            )}
            {toast && (
              <p role="status" className={`absolute left-1/2 top-24 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-bold shadow-lg ${toast.tone === 'good' ? 'bg-emerald-500 text-white' : 'bg-slate-950/90 text-white'}`}>{toast.text}</p>
            )}
          </div>

          <section className={box}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-2 flex items-center gap-2 text-sm font-bold text-textMain"><Hammer size={16} className="text-primary" /> Build</h2>
              {tool('road', 'Roads', Route)}
              {tool('lights', 'Street lights', Lamp)}
              {tool('bulldoze', 'Bulldoze', Shovel)}
              {tool('land', 'Buy land', MapIcon)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1 rounded-xl border border-border bg-background p-1">
              {CATEGORIES.map(item => (
                <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold ${category === item.id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>{item.label}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {BUILDINGS.filter(type => type.category === category).map(type => {
                const locked = level < type.unlock;
                const affordable = city.coins >= type.cost;
                const active = mode.kind === 'place' && mode.type === type.id;
                return (
                  <button key={type.id} type="button" disabled={locked} onClick={() => { setMode(active ? { kind: 'idle' } : { kind: 'place', type: type.id }); setSelectedId(null); }}
                    className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary'} ${locked ? 'opacity-50' : ''} bg-background`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl leading-none">{ICONS[type.id]}</span>
                      {locked ? <span className="flex items-center gap-1 text-[10px] font-bold text-secondary"><Lock size={11} /> Lv {type.unlock}</span>
                        : <span className={`text-[11px] font-black ${affordable ? 'text-amber-600 dark:text-amber-300' : 'text-rose-500'}`}>{type.cost} 🪙</span>}
                    </div>
                    <p className="mt-2 text-xs font-bold text-textMain">{type.name}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-secondary">{effects(type.id).join(' · ')}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-secondary">Buildings need a road beside them, and power and water to run. Drag to pan the map, right-drag or two fingers to rotate, scroll or pinch to zoom. Esc leaves a tool.</p>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {(selected || selectedId === 'hall') && mode.kind === 'idle' && (
            <section className={`${box} border-amber-400/40`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl leading-none">{ICONS[selected?.type || 'hall']}</p>
                  <h2 className="mt-2 text-sm font-black text-textMain">{selectedType?.name || HALL.name}</h2>
                  {selected && <p className="mt-0.5 flex gap-0.5 text-amber-400">{Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => <Star key={i} size={12} fill={i < selected.level ? 'currentColor' : 'none'} />)}</p>}
                </div>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" className="text-secondary hover:text-textMain"><X size={16} /></button>
              </div>
              <p className="mt-2 text-xs text-secondary">{selectedType?.description || 'The heart of your city. It also supplies a little power and water.'}</p>
              {selected && agentForBuilding(selected.type) && (() => { const agent = agentForBuilding(selected.type)!; const name = advisors.find(item => item.agent.id === agent.id)?.name; return <button type="button" onClick={() => setAgentOpen(agent.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-white" style={{ background: agent.color }}><Users size={14} />{name ? `Visit ${name}, your ${agent.role}` : `Visit the ${agent.role}'s desk`}</button>; })()}
              {selectedId === 'hall' && <button type="button" onClick={() => setAccountantOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white"><Users size={14} />Visit Jules in the Accountant office</button>}
              {selectedStatus && selectedId !== 'hall' && (
                <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${!selectedStatus.road ? 'bg-rose-500/10 text-rose-500' : selectedStatus.serviced < 1 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                  {!selectedStatus.road ? 'No road access - build a road next to it.' : selectedStatus.serviced < 1 ? `Running at ${Math.round(selectedStatus.serviced * 100)}% - short of power or water.` : `Running well · ${selectedStatus.rate.toFixed(1)} 🪙/h`}
                </p>
              )}
              {selected && selectedStatus && (selectedStatus.jobs > 0 || selectedStatus.residents > 0) && (() => {
                const people = selectedStatus.jobs > 0
                  ? staffRoster(selected.id, selected.type, selectedStatus.staff).map(person => `${person.name} · ${person.role}`)
                  : household(selected.id, selectedStatus.residents);
                return (
                  <div className="mt-3 rounded-xl border border-border bg-background p-3">
                    <div className="flex items-baseline justify-between text-[10px] font-bold uppercase text-secondary">
                      <span>{selectedStatus.jobs > 0 ? 'Staff' : 'Household'}</span>
                      <span>{selectedStatus.jobs > 0 ? `${selectedStatus.staff} of ${selectedStatus.jobs} jobs filled` : `${selectedStatus.residents} residents`}</span>
                    </div>
                    {people.length === 0
                      ? <p className="mt-1.5 text-[11px] text-secondary">{selectedStatus.road ? 'No one to hire yet - build homes nearby.' : 'Nobody can get here without a road.'}</p>
                      : <ul className="mt-1.5 grid grid-cols-1 gap-0.5 text-[11px] text-textMain sm:grid-cols-2 xl:grid-cols-1">{people.slice(0, 8).map((person, i) => <li key={i} className="truncate">👤 {person}</li>)}</ul>}
                    {people.length > 8 && <p className="mt-1 text-[10px] text-secondary">+{people.length - 8} more</p>}
                    {selectedStatus.jobs > 0 && people.length > 0 && <p className="mt-1.5 text-[10px] text-secondary">They live in your homes and walk here for their shifts, in uniform.</p>}
                  </div>
                );
              })()}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs">
                <span className="text-secondary">Ready to collect</span>
                <span className="font-black text-amber-600 dark:text-amber-300">{pending[selected?.id || 'hall'] || 0} 🪙</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={(pending[selected?.id || 'hall'] || 0) < 1} onClick={() => handleCollect(selected?.id || 'hall')} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-amber-950 disabled:opacity-40"><Coins size={13} /> Collect</button>
                {selected && (() => {
                  const cost = upgradeCost(selected);
                  return (
                    <button type="button" disabled={cost === null || city.coins + (pending[selected.id] || 0) < cost} onClick={() => report(upgrade(city, selected.id, Date.now(), today), `${selectedType!.name} upgraded to level ${selected.level + 1}!`)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                      <Sparkles size={13} /> {cost === null ? 'Max level' : `Upgrade · ${cost} 🪙`}
                    </button>
                  );
                })()}
                {selected && <button type="button" onClick={() => setMode({ kind: 'move', id: selected.id })} className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-textMain hover:border-primary"><Move size={13} /> Move</button>}
                {selected && (confirmDemolish
                  ? <button type="button" onClick={() => { if (report(demolish(city, selected.id, Date.now(), today), `Removed · +${demolishRefund(selected)} coins back`)) { setSelectedId(null); setConfirmDemolish(false); } }} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white">Confirm · +{demolishRefund(selected)} 🪙</button>
                  : <button type="button" onClick={() => setConfirmDemolish(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-rose-500 hover:border-rose-500"><Trash2 size={13} /> Remove</button>)}
              </div>
            </section>
          )}

          <section className={box}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-textMain"><Gift size={16} className="text-amber-500" /> Daily missions</h2>
              <span className="text-[10px] text-secondary">Resets at midnight</span>
            </div>
            <div className="mt-3 space-y-2">
              {missions.map(mission => (
                <article key={mission.id} className={`rounded-xl border p-3 ${mission.claimed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="text-xs font-bold text-textMain">{mission.title}</h3><p className="mt-0.5 text-[11px] text-secondary">{mission.detail}</p></div>
                    <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-300">+{mission.coins} 🪙 · {mission.xp} XP</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${mission.progress * 100}%` }} /></div>
                  <div className="mt-2 flex justify-end">
                    {mission.claimed ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500"><Check size={13} /> Claimed</span>
                      : mission.done ? <button type="button" onClick={() => handleMission(mission)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Claim</button>
                        : mission.destination ? <button type="button" onClick={() => onOpen(mission.destination!)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">Go <ArrowRight size={12} /></button>
                          : <span className="text-[11px] text-secondary">Do it in your city</span>}
                  </div>
                </article>
              ))}
            </div>
            <div className={`mt-3 flex items-center justify-between gap-2 rounded-xl border p-3 ${bonusClaimed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <p className="text-xs font-bold text-textMain">🎁 All done today <span className="font-semibold text-amber-600 dark:text-amber-300">+{ALL_DONE_BONUS.coins} 🪙</span></p>
              {bonusClaimed ? <span className="text-[11px] font-bold text-emerald-500">Opened</span>
                : <button type="button" disabled={!allClaimed} onClick={() => handleMission('bonus')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Open</button>}
            </div>
          </section>

          <section className={box}>
            <div className="flex justify-between gap-2"><h2 className="text-sm font-bold text-textMain">Weekly quests</h2><span className="text-[10px] text-secondary">Week of {weeklyActivity.week}</span></div>
            <div className="mt-3 space-y-2">
              {weekly.map(quest => {
                const claimed = city.weekly.some(item => item.week === weeklyActivity.week && item.quest === quest.id);
                return (
                  <article key={quest.id} className={`rounded-xl border p-3 ${claimed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background'}`}>
                    <div className="flex justify-between gap-2"><h3 className="text-xs font-bold text-textMain">{quest.title}</h3><span className="text-[10px] font-bold text-amber-600 dark:text-amber-300">+{WEEKLY_REWARDS[quest.id].coins} 🪙</span></div>
                    <p className="mt-0.5 text-[11px] text-secondary">{quest.note}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><div className="h-full bg-emerald-500" style={{ width: `${quest.ratio * 100}%` }} /></div>
                    {quest.id === 'review' && !claimed && (
                      <div className="mt-2 space-y-1">
                        {['I reviewed my spending and upcoming bills.', 'I checked my balances and debts.', 'I chose one savings action for next week.'].map((text, index) => (
                          <label key={text} className="flex cursor-pointer items-start gap-2 text-[11px] text-secondary">
                            <input type="checkbox" checked={review[index]} onChange={event => setReview(current => current.map((value, i) => (i === index ? event.target.checked : value)))} className="mt-0.5 accent-emerald-500" />{text}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      {claimed ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500"><Check size={13} /> Claimed</span>
                        : quest.eligible ? <button type="button" onClick={() => report(claimWeekly(city, quest.id, quest.eligible, Date.now(), today), `+${WEEKLY_REWARDS[quest.id].coins} coins · weekly quest done!`)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Claim</button>
                          : <button type="button" onClick={() => onOpen(quest.destination)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">Open <ArrowRight size={12} /></button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={box}>
            <h2 className="text-sm font-bold text-textMain">City guide</h2>
            <ul className="mt-2 space-y-1.5 text-[11px] text-secondary">
              {tips.map(tip => <li key={tip}>💡 {tip}</li>)}
              <li>💡 {city.lights.length} street light{city.lights.length === 1 ? '' : 's'}: every 4 add 1 happiness (up to +12), and they light the streets at night.</li>
              <li>🌲 Bulldoze wild trees on your land for {TIMBER_COINS} 🪙 a tree - building or laying road over them pays too.</li>
              <li>🗺️ You own {city.chunks.length} of 100 plots; level {level} allows {maxChunks(level)}. The next costs {chunkCost(city)} 🪙.</li>
              {nextUnlocks.length > 0 && <li>🔓 Level {level + 1} unlocks {nextUnlocks.map(type => `${ICONS[type.id]} ${type.name}`).join(', ')}.</li>}
              <li>🚶 Residents are everyone living in the homes you've built. Those with a job are inside at work; everyone else is out walking - each one someone you can see on your streets{stats.residents > 4000 ? ' (4,000 are drawn at once)' : ''}.</li>
              <li>🪙 {coinText(city.lifetimeCoins)} coins earned so far. Coins have no cash value - the game rewards recording and reviewing, never how much you spend or earn.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default FinanceWorld;
