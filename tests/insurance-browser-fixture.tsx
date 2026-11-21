import React from 'react';
import { createRoot } from 'react-dom/client';
import InsuranceTab from '../components/InsuranceTab';
import { insuranceToday, type InsurancePolicy } from '../services/insuranceService';
const today = insuranceToday();
const policy: InsurancePolicy = { id: 'medical', name: 'Family Medical', insurer: 'Example Insurer', insuredPerson: 'Alex and Sam', people: ['Alex', 'Sam'], policyNumber: 'POL-001', kind: 'Medical', currency: 'MYR', premium: 200, frequency: 'Monthly', coverage: 100000, deductible: 500, coPaymentPercent: 10, startDate: '2025-01-01', endDate: '', renewalDate: '', paymentDueDate: today, policyRenewalDate: today, reminderDays: 30, destination: '', emergencyPhone: '', notes: '', archived: false, benefits: [{ id: 'b', name: 'Hospital', limit: 100000, limitText: '', details: 'Annual', subLimit: false }] };
if (!localStorage.getItem('subtrack_insurance_v1')) localStorage.setItem('subtrack_insurance_v1', JSON.stringify([policy, { ...policy, id: 'quote', name: 'Alternative quotation', recordType: 'Quotation', premium: 150, exclusions: 'As in quotation', waitingPeriod: '30 days', limitBasis: 'Annual' }]));
Object.assign(window, { insuranceTestToday: today });
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-7xl p-3 text-textMain sm:p-6"><InsuranceTab baseCurrency="MYR" /></main>);
