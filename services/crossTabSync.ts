// Keeps open tabs of the app in step. After a tab writes to the database, it tells the other
// tabs of the same browser which tables changed, and they reload them. Local-only data (no cloud
// sync) lives in localStorage, whose `storage` event already reaches other tabs. A tab that comes
// back into view after a while also reloads, which picks up changes from other devices.
import { useEffect, useRef } from 'react';
import { cloudSync } from './cloudSyncService';

/** `*` means "anything may have changed". */
export type ChangedTables = string[];
type Listener = (tables: ChangedTables) => void;

const CHANNEL = 'subtrack-data';
const DEBOUNCE_MS = 300;
/** A tab hidden at least this long reloads when it becomes visible again. */
export const RETURN_AFTER_MS = 20_000;

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
let account: string | null = null;
/** True without cloud sync, when records live only in this browser's localStorage. */
let localOnly = false;
let mutedUntil = 0;
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let hiddenAt: number | null = null;
let started = false;

function deliver(tables: ChangedTables) {
  for (const t of tables) pending.add(t);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const batch = [...pending]; pending = new Set();
    listeners.forEach(listener => { try { listener(batch); } catch (error) { console.error('Refresh after a change in another tab failed', error); } });
  }, DEBOUNCE_MS);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  cloudSync.onWrite = announceWrite;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = event => {
      const data = event.data as { account?: string | null; tables?: unknown };
      // Ignore other accounts signed in elsewhere in the same browser.
      if (!data || data.account !== account || !Array.isArray(data.tables)) return;
      deliver(data.tables.filter((t): t is string => typeof t === 'string'));
    };
  } catch { channel = null; /* Very old browsers: tabs still refresh on return. */ }
  window.addEventListener('storage', event => {
    // Only in local mode: with cloud sync, localStorage holds caches and sync metadata (written
    // after every save), and the broadcast channel already reports real changes.
    if (!localOnly || event.storageArea !== localStorage) return;
    if (event.key === null || event.key.startsWith('subtrack')) deliver(['*']);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt !== null && Date.now() - hiddenAt >= RETURN_AFTER_MS) deliver(['*']);
    hiddenAt = null;
  });
}

/** The signed-in account, so a tab only reacts to its own account's changes. */
export function setSyncAccount(userId: string | null, isLocalOnly: boolean) { account = userId; localOnly = isLocalOnly; start(); }

/**
 * Stops this tab announcing its writes for a while. Used while a tab loads or reloads data,
 * because loading re-saves a few normalised lists; announcing those would make open tabs keep
 * reloading each other.
 */
export function muteAnnouncements(ms: number) { mutedUntil = Math.max(mutedUntil, Date.now() + ms); }

/** Called after a successful database write. */
export function announceWrite(table: string) {
  start();
  if (Date.now() < mutedUntil || !channel) return;
  try { channel.postMessage({ account, tables: [table] }); } catch { /* Closed channel: nothing to tell. */ }
}

export function onDataChanged(listener: Listener) { start(); listeners.add(listener); return () => { listeners.delete(listener); }; }

export const touches = (changed: ChangedTables, tables: string[]) => changed.includes('*') || changed.some(t => tables.includes(t));

/** Calls `refresh` when another tab changes any of `tables` (or on return to the tab). */
export function useRemoteRefresh(tables: string[], refresh: () => void) {
  const latest = useRef(refresh); latest.current = refresh;
  const key = tables.join(',');
  useEffect(() => onDataChanged(changed => { if (touches(changed, key.split(','))) latest.current(); }), [key]);
}

/** Test hook: reset module state. */
export function resetCrossTabSyncForTests() { listeners.clear(); pending = new Set(); clearTimeout(timer); mutedUntil = 0; account = null; localOnly = false; }
