import React, { useEffect, useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';
import { NotificationSetupError, createPriceAlert, deletePriceAlert, loadPriceAlerts, notificationsAvailable, type PriceAlert } from '../services/notificationService';

interface PriceAlertControlsProps {
  symbol: string;
  currentPrice: number;
  averageCost: number;
  currency: string;
}

// Price alerts for one ticker, set from its detail screen. The reminder worker checks them every
// 15 minutes and notifies the devices that turned notifications on in Settings.
const PriceAlertControls: React.FC<PriceAlertControlsProps> = ({ symbol, currentPrice, averageCost, currency }) => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!notificationsAvailable()) return;
    let cancelled = false;
    loadPriceAlerts(symbol)
      .then(loaded => { if (!cancelled) setAlerts(loaded.filter(alert => !alert.triggeredAt)); })
      .catch(reason => { if (!cancelled) setMessage(reason instanceof NotificationSetupError ? reason.message : ''); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (!notificationsAvailable()) return null;

  const add = async (price: number, label?: string) => {
    setBusy(true);
    setMessage('');
    try {
      const alert = await createPriceAlert({ symbol, target: price, currentPrice, label });
      setAlerts(current => [alert, ...current]);
      setTarget('');
      setMessage(`You'll be notified when ${symbol} ${alert.direction === 'above' ? 'rises to' : 'falls to'} ${price.toFixed(2)}. Make sure notifications are on in Settings.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not add the alert.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (alert: PriceAlert) => {
    setAlerts(current => current.filter(item => item.id !== alert.id));
    deletePriceAlert(alert.id).catch(reason => {
      setAlerts(current => [alert, ...current]);
      setMessage(reason instanceof Error ? reason.message : 'Could not delete the alert.');
    });
  };

  const hasBreakEvenAlert = alerts.some(alert => Math.abs(alert.target - averageCost) < 1e-6);
  const canAlertBreakEven = averageCost > 0 && Math.abs(averageCost - currentPrice) > 1e-9 && !hasBreakEvenAlert;
  const typed = Number(target);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell size={14} className="text-secondary" />
        <span className="text-[10px] font-black uppercase tracking-wide text-secondary">Price alerts</span>
        {alerts.map(alert => (
          <span key={alert.id} className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold">
            {alert.direction === 'above' ? '≥' : '≤'} {alert.target.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            {alert.label && <span className="font-normal text-secondary">{alert.label}</span>}
            <button type="button" onClick={() => remove(alert)} aria-label={`Delete alert at ${alert.target}`} className="text-secondary hover:text-rose-500"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {canAlertBreakEven && (
          <button type="button" disabled={busy} onClick={() => void add(averageCost, 'break-even')} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            Alert me at break-even ({averageCost.toFixed(2)})
          </button>
        )}
        <form className="flex min-w-[200px] flex-1 gap-2" onSubmit={event => { event.preventDefault(); if (typed > 0) void add(typed); }}>
          <input type="number" inputMode="decimal" min="0" step="any" value={target} onChange={event => setTarget(event.target.value)} placeholder={`Alert at a price (${currency})`} aria-label="Alert price"
            className="w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-textMain outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]" />
          <button type="submit" disabled={busy || !(typed > 0)} className="flex shrink-0 items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary hover:border-primary disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} Add
          </button>
        </form>
      </div>
      {message && <p className="mt-2 text-[10px] text-secondary">{message}</p>}
    </div>
  );
};

export default PriceAlertControls;
