import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Loader2, Trash2 } from 'lucide-react';
import { disableDailyReminder, enableDailyReminder, getActivePushSubscription, isPushSupported } from '../services/pushService';
import {
  DEFAULT_NOTIFICATION_PREFS, NotificationSetupError, deletePriceAlert, loadNotificationPrefs, loadPriceAlerts, saveNotificationPrefs, showTestNotification,
  type NotificationPrefs, type PriceAlert,
} from '../services/notificationService';

const Switch: React.FC<{ checked: boolean; disabled?: boolean; label: string; onChange: () => void }> = ({ checked, disabled, label, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-border'}`}
  >
    <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

const TYPES: Array<{ key: Exclude<keyof NotificationPrefs, 'leadDays'>; title: string; detail: string }> = [
  { key: 'bills', title: 'Bills & free trials', detail: 'Subscriptions about to renew and trials about to end.' },
  { key: 'debts', title: 'Debt payments', detail: 'Loan and credit card payments coming due.' },
  { key: 'earnings', title: 'Earnings for your stocks', detail: 'Two days before a US-listed stock you hold reports.' },
  { key: 'priceAlerts', title: 'Price alerts', detail: 'When a stock hits a price you set on its detail page. Checked every 15 minutes.' },
  { key: 'logReminder', title: 'Forgot to log', detail: 'Every 8 hours until an expense or income is recorded that day.' },
];
const LEAD_OPTIONS = [0, 1, 2, 3, 5, 7, 14];

const NotificationSettings: React.FC = () => {
  const pushSupported = isPushSupported();
  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(pushSupported);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;
    getActivePushSubscription().then(sub => { if (!cancelled) setDeviceEnabled(Boolean(sub)); }).catch(() => undefined);
    Promise.all([loadNotificationPrefs(), loadPriceAlerts()])
      .then(([loadedPrefs, loadedAlerts]) => { if (!cancelled) { setPrefs(loadedPrefs); setAlerts(loadedAlerts); } })
      .catch(reason => { if (!cancelled) { if (reason instanceof NotificationSetupError) setSetupNeeded(true); else setError(reason instanceof Error ? reason.message : 'Could not load notification settings.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pushSupported]);

  const toggleDevice = async () => {
    setDeviceBusy(true);
    setError('');
    try {
      if (deviceEnabled) { await disableDailyReminder(); setDeviceEnabled(false); }
      else { await enableDailyReminder(); setDeviceEnabled(true); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong');
    } finally {
      setDeviceBusy(false);
    }
  };

  const updatePrefs = (next: NotificationPrefs) => {
    const previous = prefs;
    setPrefs(next);
    setError('');
    saveNotificationPrefs(next).catch(reason => {
      setPrefs(previous);
      if (reason instanceof NotificationSetupError) setSetupNeeded(true);
      else setError(reason instanceof Error ? reason.message : 'Could not save.');
    });
  };

  const removeAlert = (alert: PriceAlert) => {
    setAlerts(current => current.filter(item => item.id !== alert.id));
    deletePriceAlert(alert.id).catch(reason => {
      setAlerts(current => [alert, ...current]);
      setError(reason instanceof Error ? reason.message : 'Could not delete the alert.');
    });
  };

  const sendTest = () => {
    setNotice('');
    showTestNotification().then(() => setNotice('Test sent - check your notifications.')).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not show a notification.'));
  };

  const pending = alerts.filter(alert => !alert.triggeredAt);
  const fired = alerts.filter(alert => alert.triggeredAt).slice(0, 5);

  return (
    <div className="settings-reminders rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center text-primary">
        <Bell size={20} className="mr-2" />
        <h3 className="text-lg font-bold">Notifications</h3>
      </div>

      {!pushSupported ? (
        <p className="text-xs text-secondary">Push notifications aren't available here. Sign in and use this device's installed app to enable them.</p>
      ) : !isStandalone && !deviceEnabled ? (
        <p className="text-xs text-secondary">Add SubTrack to your Home Screen first, then open it from there to turn on notifications (required on iPhone).</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-textMain">Notifications on this device</p>
              <p className="mt-0.5 text-[10px] text-secondary">{deviceEnabled ? 'This device receives the notifications chosen below.' : 'Turn on to receive them here. Each device is turned on separately.'}</p>
            </div>
            <div className="flex items-center gap-2">
              {deviceEnabled && <button type="button" onClick={sendTest} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-secondary hover:text-textMain"><BellRing size={12} className="mr-1 inline" />Test</button>}
              <Switch checked={deviceEnabled} disabled={deviceBusy} label="Notifications on this device" onChange={() => void toggleDevice()} />
            </div>
          </div>

          {setupNeeded ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Choosing notification types and price alerts needs one more step: run <code className="font-bold">supabase_notifications_schema.sql</code> in this app's Supabase project. Until then you get the forgot-to-log reminder only.
            </p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-xs text-secondary"><Loader2 size={14} className="animate-spin" /> Loading your notification settings…</p>
          ) : (
            <>
              <div className="divide-y divide-border border-t border-border">
                {TYPES.map(type => (
                  <div key={type.key} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-textMain">{type.title}</p>
                      <p className="mt-0.5 text-[10px] text-secondary">{type.detail}</p>
                    </div>
                    <Switch checked={prefs[type.key]} label={type.title} onChange={() => updatePrefs({ ...prefs, [type.key]: !prefs[type.key] })} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-textMain">Remind me about bills and debts</p>
                    <p className="mt-0.5 text-[10px] text-secondary">Sent at 8:00 AM Singapore time, and again on the day.</p>
                  </div>
                  <select
                    value={prefs.leadDays}
                    onChange={event => updatePrefs({ ...prefs, leadDays: Number(event.target.value) })}
                    disabled={!prefs.bills && !prefs.debts}
                    aria-label="How many days before"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold text-textMain disabled:opacity-40 [color-scheme:light] dark:[color-scheme:dark]"
                  >
                    {LEAD_OPTIONS.map(days => <option key={days} value={days}>{days === 0 ? 'On the day' : `${days} day${days === 1 ? '' : 's'} before`}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-secondary">Price alerts</p>
                {pending.length === 0 && fired.length === 0 && <p className="mt-1 text-[11px] text-secondary">None yet. Open a stock in Investments and set one from its break-even card.</p>}
                <ul className="mt-2 space-y-1.5">
                  {[...pending, ...fired].map(alert => (
                    <li key={alert.id} className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs ${alert.triggeredAt ? 'opacity-60' : ''}`}>
                      <span className="min-w-0">
                        <strong>{alert.symbol}</strong> {alert.direction === 'above' ? '≥' : '≤'} {alert.target.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        {alert.label && <span className="text-secondary"> · {alert.label}</span>}
                        {alert.triggeredAt && <span className="text-secondary"> · hit {new Date(alert.triggeredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{alert.triggeredPrice ? ` at ${alert.triggeredPrice.toFixed(2)}` : ''}</span>}
                      </span>
                      <button type="button" onClick={() => removeAlert(alert)} aria-label={`Delete ${alert.symbol} alert`} className="shrink-0 p-1 text-secondary hover:text-red-500"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {notice && <p className="text-[10px] text-emerald-500">{notice}</p>}
          {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
