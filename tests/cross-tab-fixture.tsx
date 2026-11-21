import React from 'react';
import { createRoot } from 'react-dom/client';
import TaxTab from '../components/TaxTab';
import { announceWrite, muteAnnouncements, onDataChanged, setSyncAccount } from '../services/crossTabSync';

// Each tab opens with ?account=…&local=0|1. The Tax tab stands in for any screen: in local mode
// its records live in localStorage, like the rest of the app without cloud sync.
const params = new URLSearchParams(location.search);
setSyncAccount(params.get('account'), params.get('local') === '1');
const received: string[][] = [];
onDataChanged(tables => received.push(tables));
Object.assign(window, { syncTest: { received, announce: announceWrite, mute: muteAnnouncements } });
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-7xl p-3 text-textMain sm:p-6"><TaxTab incomes={[]} /></main>);
