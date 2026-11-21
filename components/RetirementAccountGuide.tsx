import React from 'react';
import type { RetirementScheme } from '../types';

const CHECKED = '21 November 2026';
const sources = {
  epfDividend: 'https://www.kwsp.gov.my/en/others/resource-centre/dividend',
  epfAccounts: 'https://www.kwsp.gov.my/en/member/account-centre/account-restructuring',
  epfCalculation: 'https://www.kwsp.gov.my/en/w/article/akaun-fleksibel-dividend',
  epfRetirement: 'https://www.kwsp.gov.my/en/member/life-stages/age-55-60-withdrawal',
  cpfRates: 'https://www.cpf.gov.sg/service/article/what-are-the-cpf-interest-rates',
  cpfUses: 'https://www.cpf.gov.sg/member/infohub/educational-resources/simple-steps-to-make-a-cpf-transfer-from-your-oa-to-sa',
  cpfMediSave: 'https://www.cpf.gov.sg/service/article/what-is-medisave',
  cpfRetirement: 'https://www.cpf.gov.sg/member/infohub/educational-resources/can-you-withdraw-your-cpf-at-55',
  cpfOverview: 'https://www.cpf.gov.sg/member/cpf-overview',
};

type AccountGuide = { name: string; tag: string; purpose: string; access: string; source: string };
const accounts: Record<RetirementScheme, AccountGuide[]> = {
  EPF: [
    { name: 'Akaun Persaraan (Account 1)', tag: '75% of new contributions · below 55', purpose: 'Long-term retirement savings.', access: 'Generally reserved until age 55. Eligible members can invest a portion through the Members Investment Scheme; special withdrawal routes have separate conditions.', source: sources.epfAccounts },
    { name: 'Akaun Sejahtera (Account 2)', tag: '15% of new contributions · below 55', purpose: 'Approved needs before retirement: housing, education, health, insurance/takaful protection and Hajj.', access: 'Purpose-based withdrawals have eligibility rules and limits. An age-50 withdrawal route is also available; this is not an unrestricted spending account.', source: sources.epfAccounts },
    { name: 'Akaun Fleksibel (Account 3)', tag: '10% of new contributions · below 55', purpose: 'Short-term needs and emergencies.', access: 'Members below 55 can apply to withdraw at any time, with a minimum withdrawal of RM50 and subject to EPF conditions.', source: sources.epfAccounts },
  ],
  CPF: [
    { name: 'Ordinary Account (OA)', tag: '2.5% p.a. base interest', purpose: 'Housing, approved education, insurance and investments, as well as retirement savings.', access: 'Uses are subject to CPF scheme rules and limits. Using OA for a home means less remains in CPF earning interest.', source: sources.cpfUses },
    { name: 'Special Account (SA)', tag: '4% p.a. base interest · below 55', purpose: 'Savings primarily for retirement; eligible savings can fund approved retirement-related investments.', access: 'SA closes at age 55 under the rules introduced in 2025. Savings move to RA up to the Full Retirement Sum, with the remainder going to OA.', source: sources.cpfOverview },
    { name: 'MediSave Account (MA)', tag: '4% p.a. base interest', purpose: 'Approved healthcare expenses and medical insurance premiums, including MediShield Life.', access: 'Medical uses and withdrawal limits apply. It is not general-purpose cash, and does not become freely withdrawable just because you turn 55.', source: sources.cpfMediSave },
    { name: 'Retirement Account (RA)', tag: '4% p.a. base interest · from 55', purpose: 'Created at 55 to provide income in retirement, including CPF LIFE where applicable.', access: 'Funded from SA and OA up to the Full Retirement Sum. Retirement payouts can start between 65 and 70; turning 55 does not make the whole RA freely withdrawable.', source: sources.cpfRetirement },
  ],
};

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">{children} ↗</a>;
}

export default function RetirementAccountGuide({ scheme }: { scheme: RetirementScheme }) {
  const epf = scheme === 'EPF';
  const today = new Date();
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const reviewDue = localDay >= (epf ? '2027-03-01' : '2027-01-01');

  return (
    <details data-retirement-guide={scheme} className="mt-4 rounded-xl border border-border bg-surface text-textMain">
      <summary className="cursor-pointer rounded-xl p-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="font-bold">{scheme} returns & account guide</span>
        <span className="mt-1 block pl-4 text-[11px] text-secondary">
          {epf ? '2025 declared dividend: 6.15% p.a.' : 'OA: 2.5% · SA / MA / RA: 4% p.a. base'}
        </span>
      </summary>
      <div className="space-y-4 border-t border-border p-3 sm:p-4">
        <p className="text-[10px] text-secondary">Saved reference · checked {CHECKED}. {epf ? 'Dividend year: 2025; announced 28 February 2026.' : 'Rate period: 1 October–31 December 2026.'} This guide does not update automatically.</p>
        {reviewDue && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">{epf ? 'A newer annual dividend may now be available.' : 'The displayed CPF rate period has ended.'} Check the official rate source before using these figures for a new decision.</p>}

        <section className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          <h4 className="font-bold">What return does it earn?</h4>
          {epf ? <>
            <p className="mt-2 text-secondary">EPF declared <strong className="text-textMain">6.15% for 2025</strong> for both Simpanan Konvensional and Simpanan Shariah. This is a past annual dividend, not a promised 2026 return. Konvensional has a 2.5% minimum dividend; Shariah dividends depend on investment performance.</p>
            <p className="mt-2 text-secondary">The three accounts share the scheme’s declared dividend rate. Contributions, withdrawals and time in the account affect the amount earned. EPF uses a Modified Aggregate Daily Balance calculation, rather than simply multiplying your latest balance by the rate.</p>
            <p className="mt-2 text-secondary">For scale: RM1,000 held for a full year at 6.15% corresponds to about <strong className="text-textMain">RM61.50</strong>, before account movements. Withdrawn savings stop earning future dividends.</p>
            <p className="mt-2"><SourceLink href={sources.epfDividend}>EPF dividend rates</SourceLink><span className="mx-2 text-secondary">·</span><SourceLink href={sources.epfCalculation}>How dividends are calculated</SourceLink></p>
          </> : <>
            <p className="mt-2 text-secondary">For <strong className="text-textMain">1 October–31 December 2026</strong>, OA earns 2.5% a year and SA, MA and RA earn 4% a year before extra interest. “p.a.” means per year: 4% p.a. is not 4% every quarter. CPF reviews account rates quarterly.</p>
            <p className="mt-2 text-secondary">For scale: S$1,000 held for a full year at an unchanged 2.5% earns about <strong className="text-textMain">S$25</strong>; at 4%, about <strong className="text-textMain">S$40</strong>. These base-rate examples exclude extra interest and account movements, and do not predict the next four quarters.</p>
            <p className="mt-2"><SourceLink href={sources.cpfRates}>CPF interest rates and extra interest</SourceLink></p>
          </>}
        </section>

        <section>
          <h4 className="text-xs font-bold">What can each account do?</h4>
          {epf && <p className="mt-1 text-[11px] text-secondary">The 75 / 15 / 10 split allocates new contributions for members below 55. It is not a dividend rate or a required split of your existing balance.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {accounts[scheme].map(account => (
              <article key={account.name} className="min-w-0 rounded-xl border border-border bg-background p-3 text-xs leading-relaxed">
                <h5 className="font-bold">{account.name}</h5>
                <p className="mt-1 text-[10px] font-semibold text-primary">{account.tag}</p>
                <p className="mt-2 text-secondary">{account.purpose}</p>
                <p className="mt-2 text-secondary"><span className="font-semibold text-textMain">Access: </span>{account.access}</p>
                <p className="mt-2 text-[10px]"><SourceLink href={account.source}>Official account rules</SourceLink></p>
              </article>
            ))}
          </div>
        </section>

        {epf ? <section className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          <h4 className="font-bold">What changes at 55 and 60?</h4>
          <p className="mt-2 text-secondary">At 55, the three balances consolidate into Akaun 55, with full, partial or monthly withdrawal options. New contributions after 55 go into Akaun Emas, generally accessible at 60. These are different from the three pre-55 accounts shown in this tracker.</p>
          <p className="mt-2"><SourceLink href={sources.epfRetirement}>Age 55 & 60 withdrawal rules</SourceLink></p>
        </section> : <section className="rounded-xl bg-background p-3 text-xs leading-relaxed">
          <h4 className="font-bold">Extra CPF interest depends on your age</h4>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-secondary">
            <li>Below 55: an extra 1% p.a. on the first S$60,000 of combined CPF balances, with at most S$20,000 from OA counted.</li>
            <li>55 and above: an extra 2% on the first S$30,000, then an extra 1% on the next S$30,000, with the same S$20,000 OA cap.</li>
          </ul>
          <p className="mt-2 text-secondary">These tiers apply across combined balances, not separately to every account. Extra interest on OA savings goes to SA or RA. An advertised “up to 6%” is not a flat rate on your entire CPF balance.</p>
        </section>}

        <p className="text-[10px] leading-relaxed text-secondary">Your logged balance change includes contributions, withdrawals and transfers. It is not your personal investment return. Account access depends on eligibility and scheme rules; the official statement remains the record of credited dividends or interest.</p>
      </div>
    </details>
  );
}
