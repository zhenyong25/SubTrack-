import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, ShieldAlert, Store, Layers, Wrench } from 'lucide-react';
import PokemonCardPanel from './PokemonCardPanel';
import PokemonShopsPanel from './PokemonShopsPanel';
import PokemonEventsPanel from './PokemonEventsPanel';
import PokemonServicesPanel from './PokemonServicesPanel';
import PokemonScamPanel from './PokemonScamPanel';
import { EMPTY_EXTRAS, openPokemonExtrasStore, type PokemonExtras } from '../services/pokemonExtrasService';

// Investments → Pokémon Cards, in tabs: your card tracker, shops & gyms, events, grading &
// repair, and scam watch. The last tab you opened is remembered on this device.

type HubTab = 'tracker' | 'shops' | 'events' | 'services' | 'scams';
const TABS: Array<{ id: HubTab; label: string; icon: React.ElementType }> = [
  { id: 'tracker', label: 'Card tracker', icon: Layers },
  { id: 'shops', label: 'Shops & gyms', icon: Store },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'services', label: 'Grading & repair', icon: Wrench },
  { id: 'scams', label: 'Scam watch', icon: ShieldAlert },
];
const TAB_KEY = 'subtrack_pokemon_tab';

export default function PokemonHub({ baseCurrency }: { baseCurrency: string }) {
  const [tab, setTab] = useState<HubTab>(() => {
    try { const saved = localStorage.getItem(TAB_KEY) as HubTab | null; return TABS.some(item => item.id === saved) ? saved! : 'tracker'; } catch { return 'tracker'; }
  });
  const [store, setStore] = useState<Awaited<ReturnType<typeof openPokemonExtrasStore>> | null>(null);
  const [extras, setExtras] = useState<PokemonExtras>(EMPTY_EXTRAS);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    openPokemonExtrasStore()
      .then(result => { if (active) { setStore(result); setExtras(result.data); setNotice(result.notice); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Your Pokémon records could not be opened.'); });
    return () => { active = false; };
  }, []);

  const choose = (next: HubTab) => {
    setTab(next);
    try { localStorage.setItem(TAB_KEY, next); } catch { /* storage blocked */ }
  };

  const save = async (next: PokemonExtras) => {
    if (!store || busy) return false;
    setBusy(true); setError('');
    try { setNotice(await store.save(next)); setExtras(next); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false; }
    finally { setBusy(false); }
  };

  const needsStore = tab === 'events' || tab === 'services' || tab === 'scams';
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Pokémon cards" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => choose(id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition-colors ${tab === id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {needsStore && error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {needsStore && notice && tab !== 'events' && <p className="text-xs text-secondary">{notice}</p>}

      {tab === 'tracker' && <PokemonCardPanel baseCurrency={baseCurrency} />}
      {tab === 'shops' && <PokemonShopsPanel />}
      {needsStore && !store && !error && <div className="flex items-center justify-center gap-2 rounded-3xl border border-border bg-surface p-8 text-sm text-secondary"><Loader2 size={16} className="animate-spin" /> Opening your records…</div>}
      {store && tab === 'events' && <PokemonEventsPanel extras={extras} busy={busy} onSave={save} />}
      {store && tab === 'services' && <PokemonServicesPanel extras={extras} busy={busy} baseCurrency={baseCurrency} onSave={save} />}
      {store && tab === 'scams' && <PokemonScamPanel extras={extras} busy={busy} baseCurrency={baseCurrency} onSave={save} />}
    </div>
  );
}
