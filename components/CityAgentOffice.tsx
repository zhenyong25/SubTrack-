import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Info, Loader2, RefreshCw, X } from 'lucide-react';
import { FIX_REWARD, runAgent, type AgentDefinition, type AgentInput, type AgentRecord, type AgentReport, type Destination } from '../services/cityAgents';

// An advisor's office: the resident at their desk, a review you can watch step by step, and an
// inbox of findings with a way to act on each. Same layout as the Accountant's office.

const AgentDeskScene = React.lazy(() => import('./CityAccountantInterior3D'));

const TONE = {
  warn: { icon: AlertTriangle, box: 'border-amber-500/25 bg-amber-500/5', iconClass: 'text-amber-500' },
  info: { icon: Info, box: 'border-border bg-background', iconClass: 'text-primary' },
  good: { icon: CheckCircle2, box: 'border-emerald-500/25 bg-emerald-500/5', iconClass: 'text-emerald-500' },
};

interface Props {
  agent: AgentDefinition;
  name: string | null; // null when nobody has been hired yet
  input: AgentInput;
  record?: AgentRecord;
  onReport: (report: AgentReport) => void;
  onNavigate: (destination: Destination) => void;
  onClose: () => void;
}

export default function CityAgentOffice({ agent, name, input, record, onReport, onNavigate, onClose }: Props) {
  const [step, setStep] = useState<number | null>(null);
  const [request, setRequest] = useState(0);
  const latest = useRef({ input, onReport });
  latest.current = { input, onReport };
  const report = record?.report;
  const fingerprint = useMemo(() => agent.fingerprint(input), [agent, input]);
  const stale = !report || report.fingerprint !== fingerprint;

  // Review on arrival when the records have changed since the last report.
  useEffect(() => { if (name && stale) setRequest(value => value + 1); }, [name, fingerprint]);

  useEffect(() => {
    if (!request || !name) return;
    let cancelled = false;
    const timers: number[] = [];
    // The rules run instantly; the steps are paced so you can watch the advisor work.
    agent.steps.forEach((_, index) => timers.push(window.setTimeout(() => { if (!cancelled) setStep(index); }, index * 420)));
    timers.push(window.setTimeout(() => {
      if (cancelled) return;
      latest.current.onReport(runAgent(agent, latest.current.input));
      setStep(null);
    }, agent.steps.length * 420));
    return () => { cancelled = true; timers.forEach(timer => clearTimeout(timer)); setStep(null); };
  }, [request]);

  const working = step !== null;
  const shownName = name || 'Nobody yet';

  return createPortal(
    <dialog ref={element => { if (element && !element.open) element.showModal(); }} onCancel={onClose} aria-labelledby="agent-office-title"
      className="accountant-office-dialog m-auto overflow-y-auto rounded-3xl border border-border bg-surface p-4 text-textMain shadow-2xl backdrop:bg-black/70 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: agent.color }}>{agent.office}</p>
          <h2 id="agent-office-title" className="mt-1 text-xl font-extrabold">{name ? `Meet ${name}, your ${agent.role}` : `The ${agent.role}'s desk is empty`}</h2>
          <p className="mt-1 text-xs text-secondary">{agent.intro}</p>
        </div>
        <button autoFocus type="button" onClick={onClose} aria-label="Close the office" className="rounded-lg p-2 text-secondary hover:bg-background"><X size={20} /></button>
      </header>

      <div className="accountant-office-layout mt-5 grid gap-5">
        <div className="space-y-3">
          <React.Suspense fallback={<div className="accountant-interior-canvas flex items-center justify-center rounded-2xl bg-background text-sm text-secondary">Opening the 3D office...</div>}><AgentDeskScene working={working} report={report} resident={{ name, role: agent.role, office: agent.office, color: agent.color, roaming: true }} /></React.Suspense>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              {working ? <Loader2 size={16} className="animate-spin text-primary" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
              {!name ? 'Waiting for a resident to hire' : working ? 'Working on your review' : report && !stale ? 'Your report is ready' : 'Ready for an assignment'}
            </p>
            <p className="mt-2 text-xs text-secondary" role="status" aria-live="polite">
              {!name ? 'Advisors are residents too. Build homes near a road so someone can take the job.' : working ? agent.steps[step!] : `Fix something I flag and you'll earn ${FIX_REWARD.coins} coins when I next review it.`}
            </p>
            {working && <progress aria-label="Review progress" max={agent.steps.length} value={step! + 1} className="mt-3 h-1.5 w-full accent-emerald-500" />}
          </div>
          <p className="text-[11px] leading-relaxed text-secondary">{shownName} works from the records in this app and never changes them - you decide what to do. Rewards are for acting on advice, never for amounts spent or earned.</p>
        </div>

        <div className="accountant-office-report min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold"><ClipboardList size={16} className="text-primary" /> {agent.role}'s report</h3>
            <button type="button" disabled={working || !name} onClick={() => setRequest(value => value + 1)} className="flex items-center gap-1.5 text-xs font-bold text-primary disabled:opacity-40"><RefreshCw size={13} /> Run review</button>
          </div>
          {report ? (
            <>
              <p className="text-xs text-secondary">Reviewed {new Date(report.completedAt).toLocaleString()}{stale && name && <span className="ml-1 text-amber-600 dark:text-amber-300">· updating for recent changes</span>}</p>
              {report.summary.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {report.summary.map(item => (
                    <div key={item.label} className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">{item.label}</p>
                      <p className="mt-1 text-base font-extrabold tabular-nums">{item.value}</p>
                      {item.note && <p className="mt-0.5 text-[10px] text-secondary">{item.note}</p>}
                    </div>
                  ))}
                </div>
              )}
              <ul className="space-y-2">
                {report.findings.map(finding => {
                  const tone = TONE[finding.tone];
                  const Icon = tone.icon;
                  return (
                    <li key={finding.id} className={`rounded-xl border p-3 ${tone.box}`}>
                      <p className="flex items-start gap-2 text-sm font-bold"><Icon size={15} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />{finding.title}</p>
                      <p className="mt-1 pl-6 text-xs leading-relaxed text-secondary">{finding.detail}</p>
                      {finding.action && (
                        <button type="button" onClick={() => onNavigate(finding.action!.destination)} className="mt-2 ml-6 inline-flex items-center gap-1 text-[11px] font-bold text-primary">{finding.action.label} <ArrowRight size={12} /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(record?.rewarded.length || 0) > 0 && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ {record!.rewarded.length} issue{record!.rewarded.length === 1 ? '' : 's'} fixed so far.</p>}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-secondary">{working ? `${shownName} is preparing your first report…` : name ? 'Run a review to fill the inbox.' : 'Once someone works here, their first review starts on its own.'}</p>
          )}
          <button type="button" onClick={() => onNavigate(agent.destination)} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: agent.color }}>{agent.destinationLabel} <ArrowRight size={15} /></button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
