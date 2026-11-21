import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock, Coins, Flame, MapPin, Trophy, X } from 'lucide-react';
import type { Achievement, CityEvent } from '../services/cityFunService';

const box = 'min-w-0 rounded-2xl border border-border bg-surface p-4';
const fmt = (value: number) => Math.floor(value).toLocaleString();

/** Coins waiting, counting up live between the city's 5-second refreshes. */
export function LiveCoins({ base, ratePerHour, since }: { base: number; ratePerHour: number; since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick(n => n + 1), 250); return () => clearInterval(timer); }, []);
  return <span className="tabular-nums">{fmt(base + (ratePerHour * Math.max(0, Date.now() - since)) / 3_600_000)}</span>;
}

/** A shower of coins from the bottom of the map. Re-runs whenever `trigger` changes. */
export function CoinBurst({ trigger }: { trigger: number }) {
  const coins = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ dx: Math.round((Math.random() - 0.5) * 320), dy: -140 - Math.round(Math.random() * 160), delay: i * 18, spin: Math.round((Math.random() - 0.5) * 720) })), [trigger]);
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!trigger) return; setVisible(true); const t = window.setTimeout(() => setVisible(false), 1300); return () => clearTimeout(t); }, [trigger]);
  if (!visible) return null;
  return <div aria-hidden="true" className="pointer-events-none absolute bottom-10 left-1/2 z-20">
    {coins.map((c, i) => <span key={`${trigger}-${i}`} className="city-coin-burst absolute text-xl" style={{ ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px`, ['--spin' as string]: `${c.spin}deg`, animationDelay: `${c.delay}ms` }}>🪙</span>)}
  </div>;
}

/** Shown once when the city has been left alone for an hour or more. */
export function WelcomeBack({ text, coins, onCollect, onDismiss }: { text: string; coins: number; onCollect: () => void; onDismiss: () => void }) {
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-emerald-500/10 px-4 py-3">
    <span className="text-2xl" aria-hidden="true">🌅</span>
    <p className="min-w-0 flex-1 text-sm text-textMain"><b>Welcome back!</b> While you were away for {text}, your city earned <b className="text-amber-600 dark:text-amber-300">{fmt(coins)} 🪙</b>.</p>
    <button type="button" onClick={onCollect} className="flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-amber-950 hover:bg-amber-300"><Coins size={14} />Collect it all</button>
    <button type="button" onClick={onDismiss} aria-label="Dismiss" className="p-1 text-secondary"><X size={16} /></button>
  </div>;
}

export function StreakCard({ count, best, bonus, recordedToday, claimedToday, onRecord }: { count: number; best: number; bonus: number; recordedToday: boolean; claimedToday: boolean; onRecord: () => void }) {
  const milestones = [3, 7, 14, 30, 60, 100];
  const next = milestones.find(m => m > count) ?? null;
  const atRisk = count > 0 && !claimedToday;
  return <div className={`rounded-xl border p-3 ${count >= 3 ? 'border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-amber-500/5' : 'border-border bg-background'}`}>
    <div className="flex items-center gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${count ? 'bg-orange-500/15' : 'bg-surface grayscale'}`} aria-hidden="true">🔥</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-sm font-black text-textMain">{count}-day streak <span className="text-[10px] font-semibold text-secondary">best {Math.max(best, count)}</span></p>
        <p className="text-[11px] text-secondary">{bonus > 0 ? <>Mission coins <b className="text-orange-500">+{Math.round(bonus * 100)}%</b> today. </> : null}{next ? `${next - count} more day${next - count === 1 ? '' : 's'} to a ${next}-day streak.` : 'Legendary consistency!'}</p>
      </div>
      <Flame size={16} className={count ? 'text-orange-500' : 'text-secondary'} />
    </div>
    {atRisk && <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-orange-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-orange-600 dark:text-orange-300">
      <span>{recordedToday ? 'Claim “Record an expense” to keep your streak.' : 'Record an expense today to keep your streak going!'}</span>
      {!recordedToday && <button type="button" onClick={onRecord} className="inline-flex shrink-0 items-center gap-1 font-bold">Record <ArrowRight size={12} /></button>}
    </div>}
  </div>;
}

const timeLeft = (ms: number) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

/** This window's city event. Go there to see the choices. */
export function EventCard({ event, now, here, onGo, onChoose }: { event: CityEvent; now: number; here: boolean; onGo: () => void; onChoose: (choice: number) => void }) {
  return <section className={`${box} ${event.resolved ? '' : 'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/10 to-amber-500/5'}`} aria-label="City event">
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-textMain"><span className={event.resolved ? '' : 'city-event-bounce inline-block'} aria-hidden="true">{event.icon}</span> City event</h2>
      <span className="flex items-center gap-1 text-[10px] text-secondary"><Clock size={11} />{event.resolved ? `Next in ${timeLeft(event.endsAt - now)}` : `Ends in ${timeLeft(event.endsAt - now)}`}</span>
    </div>
    <h3 className="mt-2 text-sm font-black text-textMain">{event.title}</h3>
    <p className="mt-0.5 text-xs text-secondary">{event.story}</p>
    {event.resolved ? <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-500"><Check size={14} />Handled - the city thanks you. A new event starts soon.</p>
      : here ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{event.choices.map((choice, i) => (
        <button key={choice.label} type="button" onClick={() => onChoose(i)} className="rounded-xl border border-fuchsia-500/40 bg-surface px-3 py-2 text-left hover:border-fuchsia-500 hover:bg-fuchsia-500/5">
          <span className="block text-xs font-bold text-textMain">{choice.label}</span>
          <span className="mt-0.5 block text-[11px] font-semibold text-amber-600 dark:text-amber-300">+{fmt(choice.coins)} 🪙 · +{choice.xp} XP</span>
        </button>))}</div>
        : <button type="button" onClick={onGo} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-bold text-white hover:bg-fuchsia-500"><MapPin size={14} />Go there</button>}
  </section>;
}

export function AchievementsPanel({ items, onClaim }: { items: Achievement[]; onClaim: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const ready = items.filter(a => a.claimable).length;
  const sorted = [...items].sort((a, b) => Number(b.claimable) - Number(a.claimable) || (b.next ? b.value / b.next : 1) - (a.next ? a.value / a.next : 1));
  const shown = showAll ? sorted : sorted.slice(0, 4);
  return <section className={box} aria-label="Achievements">
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-textMain"><Trophy size={16} className="text-amber-500" /> Achievements</h2>
      {ready > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">{ready} ready</span>}
    </div>
    <ul className="mt-3 space-y-2">{shown.map(a => {
      const ratio = a.next ? Math.min(1, a.value / a.next) : 1;
      return <li key={a.id} className={`rounded-xl border p-3 ${a.claimable ? 'city-achievement-ready border-amber-500/60 bg-amber-500/10' : 'border-border bg-background'}`}>
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">{a.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold text-textMain">{a.title}<span className="flex gap-0.5" aria-label={`Tier ${a.tier} of 4`}>{[0, 1, 2, 3].map(t => <span key={t} className={`h-1.5 w-1.5 rounded-full ${t < a.tier ? 'bg-amber-500' : 'bg-border'}`} />)}</span></p>
            <p className="text-[11px] text-secondary">{a.next === null ? 'All tiers complete!' : `${fmt(Math.min(a.value, a.next))} / ${fmt(a.next)} ${a.unit}`}</p>
          </div>
          {a.claimable && a.reward ? <button type="button" onClick={() => onClaim(a.id)} className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-amber-400">Claim +{fmt(a.reward.coins)}</button>
            : a.reward ? <span className="shrink-0 text-[10px] font-semibold text-secondary">+{fmt(a.reward.coins)} 🪙</span> : <Check size={14} className="text-emerald-500" />}
        </div>
        {a.next !== null && <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><div className={`h-full ${a.claimable ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${ratio * 100}%` }} /></div>}
      </li>;
    })}</ul>
    {items.length > 4 && <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-[11px] font-bold text-primary">{showAll ? 'Show fewer' : `Show all ${items.length}`}</button>}
  </section>;
}

/** A banner for big moments, such as a new city level. */
export function Celebration({ title, detail, onClose }: { title: string; detail?: string; onClose: () => void }) {
  useEffect(() => { const t = window.setTimeout(onClose, 5000); return () => clearTimeout(t); }, [title, onClose]);
  return <div role="status" className="city-celebrate absolute left-1/2 top-16 z-30 w-[min(92%,420px)] -translate-x-1/2 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-300 to-orange-400 px-5 py-4 text-center text-amber-950 shadow-2xl">
    <p className="text-3xl" aria-hidden="true">🎉</p>
    <p className="mt-1 text-lg font-black">{title}</p>
    {detail && <p className="mt-1 text-xs font-semibold">{detail}</p>}
    <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 p-1"><X size={14} /></button>
  </div>;
}
