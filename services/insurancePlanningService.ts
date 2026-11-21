import { annualPremium, insuranceMetrics, policyStatus, type InsurancePolicy } from './insuranceService';

export const dayDistance = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
export function nextPremiumDate(date: string, frequency: InsurancePolicy['frequency'], anchorDay?: number) {
  if (frequency === 'One-time') return '';
  const d = new Date(`${date}T12:00:00Z`); const day = anchorDay ?? d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + ({ Monthly: 1, Quarterly: 3, Yearly: 12 }[frequency]));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
}
export function premiumChanges(p: InsurancePolicy) {
  const rows = [...(p.premiumHistory ?? [])].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return rows.map((row, i) => { const previous = rows[i - 1]; const annual = annualPremium({ ...p, ...row }); const before = previous ? annualPremium({ ...p, ...previous }) : 0;
    return { ...row, annual, annualChange: previous && row.frequency !== 'One-time' && previous.frequency !== 'One-time' ? annual - before : null, percent: previous && before > 0 && row.frequency !== 'One-time' && previous.frequency !== 'One-time' ? (annual / before - 1) * 100 : null };
  });
}
export function insuranceReminders(policies: InsurancePolicy[], today: string) {
  return policies.filter(p => p.recordType !== 'Quotation' && !p.archived && policyStatus(p, today) !== 'Expired').flatMap(p => {
    const payment = p.paymentDueDate ?? p.renewalDate;
    return [{ kind: 'Payment', date: payment }, { kind: 'Renewal', date: p.policyRenewalDate }].filter(x => x.date && dayDistance(today, x.date) <= (p.reminderDays ?? 30) && !(x.kind === 'Payment' && p.payments?.some(pay => pay.dueDate === x.date))).map(x => ({ policy: p, kind: x.kind, date: x.date!, days: dayDistance(today, x.date!) }));
  }).sort((a, b) => a.date.localeCompare(b.date));
}
export function simulateClaim(bill: number, excluded: number, deductible: number, coPaymentPercent: number, remainingLimit: number) {
  if ([bill, excluded, deductible, remainingLimit].some(n => !Number.isFinite(n) || n < 0) || !Number.isFinite(coPaymentPercent) || coPaymentPercent < 0 || coPaymentPercent > 100 || excluded > bill) throw new Error('Enter non-negative amounts, excluded costs no greater than the bill, and co-payment from 0–100%.');
  const eligible = bill - excluded; const deductiblePaid = Math.min(eligible, deductible); const afterDeductible = eligible - deductiblePaid;
  const coPayment = afterDeductible * coPaymentPercent / 100; const insurer = Math.min(remainingLimit, afterDeductible - coPayment);
  return { eligible, deductiblePaid, coPayment, aboveLimit: Math.max(0, afterDeductible - coPayment - insurer), insurer, outOfPocket: bill - insurer };
}
export const REVIEW_TASKS = ['Confirm insured people and beneficiaries', 'Check limits, exclusions and waiting periods', 'Review premium changes and renewal letters', 'Confirm payment and renewal dates', 'Review overlapping benefits with insurer', 'Confirm claims contacts and documents'];
export function coveragePeople(policies: InsurancePolicy[], today: string) {
  const active = policies.filter(p => p.recordType !== 'Quotation' && policyStatus(p, today) === 'Active');
  const names = [...new Set(active.flatMap(p => p.people?.length ? p.people : [p.insuredPerson]))];
  return names.map(name => { const rows = active.filter(p => (p.people?.length ? p.people : [p.insuredPerson]).includes(name));
    return { name, policies: rows, overlaps: [...new Set(rows.filter(p => rows.filter(x => x.kind === p.kind).length > 1).map(p => p.kind))], missing: rows.filter(p => !p.exclusions || !p.waitingPeriod || !p.limitBasis || p.limitBasis === 'Unspecified') };
  });
}
export function insuranceReview(policies: InsurancePolicy[], currency: string, today: string, year: number) {
  const rows = policies.filter(p => p.recordType !== 'Quotation' && p.currency === currency);
  const paid = rows.reduce((sum, p) => sum + (p.payments ?? []).filter(x => x.paidDate.startsWith(`${year}-`)).reduce((s, x) => s + x.amount, 0), 0);
  return { annual: insuranceMetrics(rows, currency, today).annual, paid, reminders: insuranceReminders(rows, today), increases: rows.flatMap(p => premiumChanges(p).filter(h => h.effectiveDate.startsWith(`${year}-`) && h.annualChange !== null).map(h => ({ policy: p.name, ...h }))) };
}
export function downloadInsuranceFile(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function reminderCalendar(p: InsurancePolicy) {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const events = [{ date: p.paymentDueDate ?? p.renewalDate, label: 'Insurance payment' }, { date: p.policyRenewalDate, label: 'Policy renewal' }].filter(x => x.date).map(x => `BEGIN:VEVENT\r\nUID:${p.id}-${x.date}-${x.label.replace(/ /g, '')}@subtrack\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}\r\nDTSTART;VALUE=DATE:${x.date!.replace(/-/g, '')}\r\nSUMMARY:${escape(`${x.label}: ${p.name}`)}\r\nBEGIN:VALARM\r\nTRIGGER:-P${p.reminderDays ?? 30}D\r\nACTION:DISPLAY\r\nDESCRIPTION:${escape(p.name)}\r\nEND:VALARM\r\nEND:VEVENT`);
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SubTrack//Insurance//EN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
}
