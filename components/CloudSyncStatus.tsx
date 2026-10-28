import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { cloudSync } from '../services/cloudSyncService';
import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from '../services/appDataService';

export default function CloudSyncStatus() {
  const state = useSyncExternalStore(cloudSync.subscribe, cloudSync.getSnapshot);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState('');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { setCheck(''); }, [state.userId]);
  const configured = isSupabaseConfigured();
  const connected = configured && !!state.userId;
  const working = state.active > 0 || state.retrying;
  const retryable = state.issues.filter(issue => issue.retryable).length;
  const title = !configured ? 'Cloud storage not configured' : !state.userId ? 'Saved on this device' : !online ? 'Offline' : working ? 'Saving to Supabase...' : state.issues.length ? 'Some saves need attention' : state.lastSuccess ? 'Recent database saves completed' : 'Ready for cloud saves';
  const Icon = working ? Loader2 : !connected || !online ? CloudOff : state.issues.length ? Cloud : CheckCircle;
  const retry = async () => {
    setCheck('');
    try {
      await cloudSync.retry(async () => { const session = await getSupabaseSession(); return session ? { userId: session.user.id, token: session.access_token } : null; });
    } catch (error) { setCheck(error instanceof Error ? error.message : 'Could not retry saves.'); }
  };
  const checkConnection = async () => {
    setChecking(true); setCheck('');
    const owner = state.userId;
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Cloud storage is not configured.');
      const { error } = await client.from('profiles').select('id').limit(1).abortSignal(AbortSignal.timeout(15000));
      if (error) throw new Error(error.message);
      if (cloudSync.getSnapshot().userId === owner) setCheck(`Supabase responded at ${new Date().toLocaleTimeString()}. This check does not upload changes.`);
    } catch (error) { if (cloudSync.getSnapshot().userId === owner) setCheck(error instanceof Error ? error.message : 'Could not reach Supabase.'); }
    finally { setChecking(false); }
  };
  return <section className="bg-surface rounded-xl p-5 border border-border shadow-sm">
    <h3 className="flex items-center gap-2 font-bold text-lg text-textMain"><Cloud size={20} className="text-primary" /> Cloud sync</h3>
    <div className="mt-4 flex items-start gap-3" role="status" aria-live="polite">
      <Icon size={20} className={`mt-0.5 shrink-0 ${working ? 'animate-spin text-primary' : state.issues.length || !online ? 'text-amber-500' : 'text-primary'}`} />
      <div><p className="font-semibold text-sm text-textMain">{title}</p><p className="mt-1 text-xs text-secondary">{connected ? 'Database save activity for your signed-in account.' : configured ? 'Sign in to sync records across devices.' : 'Configure Supabase to enable cloud saves.'}</p></div>
    </div>
    {connected && <>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="bg-background rounded-lg border border-border p-3"><dt className="text-secondary">Last successful cloud save</dt><dd className="mt-1 font-semibold text-textMain">{state.lastSuccess && Number.isFinite(Date.parse(state.lastSuccess)) ? new Date(state.lastSuccess).toLocaleString() : 'No save observed yet'}</dd></div>
        <div className="bg-background rounded-lg border border-border p-3"><dt className="text-secondary">Saves in progress / failed</dt><dd className="mt-1 font-semibold text-textMain">{state.active} in progress · {state.issues.length} failed</dd></div>
      </dl>
      {state.issues.length > 0 && <ul className="mt-3 space-y-2 text-xs">{state.issues.map(issue => <li key={issue.id} className="rounded-lg bg-amber-500/10 p-3"><p className="font-bold text-textMain">{issue.table.replace(/_/g, ' ')}</p><p className="mt-1 text-secondary break-words">{issue.message}</p>{!issue.retryable && <p className="mt-1 text-secondary">Reopen this record and save it again. A newer request exists, or this operation cannot be safely replayed.</p>}</li>)}</ul>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!online || working || checking || !retryable} onClick={() => void retry()} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><RefreshCw size={14} className={state.retrying ? 'animate-spin' : ''} /> Retry failed saves{retryable ? ` (${retryable})` : ''}</button>
        <button disabled={!online || working || checking} onClick={() => void checkConnection()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-textMain disabled:opacity-40">{checking ? 'Checking...' : 'Check connection'}</button>
      </div>
      {check && <p role="status" className="mt-3 text-xs text-secondary break-words">{check}</p>}
      <p className="mt-3 text-[11px] text-secondary">Tracks database writes in this tab, including Trade and Options. Failed requests can be retried while this tab stays open. Reloading clears this activity list. File uploads and other devices’ changes are not included.</p>
    </>}
  </section>;
}
