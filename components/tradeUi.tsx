import React from 'react';

// Shared bits for the Trade tab's panels, in the app's flat panel style.

export const INPUT_CLASS = 'w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]';
export const LABEL_CLASS = 'block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1';

export const money = (value: number, currency = '') =>
  `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
const clean = (value: number) => (Math.abs(value) < 0.005 ? 0 : value); // no "-0.00"
export const signedR = (value: number) => `${clean(value) > 0 ? '+' : ''}${clean(value).toFixed(2)}R`;
export const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
export const toneFor = (value: number) => (Math.abs(value) < 1e-9 ? 'text-textMain' : value > 0 ? 'text-emerald-500' : value < 0 ? 'text-red-500' : 'text-textMain');

export const Panel: React.FC<{ title: string; eyebrow?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, eyebrow, action, className = '', children }) => (
  <section className={`bg-surface rounded-2xl border border-border p-4 shadow-sm ${className}`}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>}
        <h3 className="mt-1 text-lg font-extrabold text-textMain">{title}</h3>
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

export const Stat: React.FC<{ label: string; value: string; note?: string; tone?: string }> = ({ label, value, note, tone = 'text-textMain' }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-1.5 text-base font-extrabold tabular-nums sm:text-lg ${tone}`}>{value}</p>
    {note && <p className="mt-1 text-[11px] text-secondary">{note}</p>}
  </div>
);

export const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
  <div>
    <label className={LABEL_CLASS} htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <p className="mt-1 text-[10px] text-secondary">{hint}</p>}
  </div>
);

// New York "now": today's date and the minute of the day, for windows and journal dates.
export const nyNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
};

export const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
