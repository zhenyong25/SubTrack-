import React, { useMemo, useState } from 'react';
import { Landmark, Plus, Pencil, Trash2, Wallet, Globe2, LayoutDashboard } from 'lucide-react';
import CardPlanningBoard from './CardPlanningBoard';
import CreditCardMarket from './CreditCardMarket';
import type { MarketCountry } from '../services/creditCardMarketService';
import { CardBenefit, CardPointTransaction, Expense, PaymentCard, Subscription } from '../types';
import { getCardExpiryStatus, getCardMonthlySpend } from '../services/storageService';
import CardLogo from './CardLogo';
import { getCardMilesSummary, getCardPointsSummary } from '../services/cardBenefitsService';
import { formatAmount } from '../services/formatting';

interface CardsTabProps {
  ownerKey?: string;
  cards: PaymentCard[];
  subscriptions: Subscription[];
  expenses: Expense[];
  cardBenefits?: CardBenefit[];
  cardPointTransactions: CardPointTransaction[];
  baseCurrency: string;
  onAddCard: () => void;
  onViewCard: (card: PaymentCard) => void;
  onEditCard: (card: PaymentCard) => void;
  onDeleteCard: (card: PaymentCard) => void | Promise<void>;
}

const CardsTab: React.FC<CardsTabProps> = ({ ownerKey = 'local', cards, subscriptions, expenses, cardBenefits = [], cardPointTransactions, baseCurrency, onAddCard, onViewCard, onEditCard, onDeleteCard }) => {
  const [filter, setFilter] = useState<'All' | 'Debit' | 'Credit' | 'MultiCurrency'>('All');
  // My cards, or every credit card on the market in Singapore or Malaysia. Remembered per device.
  const [view, setView] = useState<'mine' | 'board' | MarketCountry>(() => {
    try { const saved = localStorage.getItem('subtrack_cards_view'); return saved === 'sg' || saved === 'my' || saved === 'board' ? saved : 'mine'; } catch { return 'mine'; }
  });
  const chooseView = (next: 'mine' | 'board' | MarketCountry) => {
    setView(next);
    try { localStorage.setItem('subtrack_cards_view', next); } catch { /* storage blocked */ }
  };
  const ownCardNames = useMemo(() => cards.filter(card => card.kind === 'Credit').map(card => card.name), [cards]);

  const cardRows = useMemo(() => {
    return cards
      .map(card => {
        const monthlySpend = getCardMonthlySpend(card, expenses, subscriptions, baseCurrency);

        const isCreditCard = card.kind === 'Credit';
        const limitOrBalance = isCreditCard ? (card.creditLimit ?? 0) : (card.currentBalance ?? 0);
        const debt = isCreditCard ? monthlySpend : undefined;
        const available = isCreditCard ? Math.max((card.creditLimit ?? 0) - (debt ?? 0), 0) : undefined;
        const pointsSummary = getCardPointsSummary(card.id, card.name, cardPointTransactions, cardBenefits);

        return {
          card,
          monthlySpend,
          isCreditCard,
          limitOrBalance,
          debt,
          available,
          currentBalance: card.currentBalance ?? 0,
          linkedCount: subscriptions.filter(sub => sub.cardId === card.id || sub.cardName === card.name).length,
          currentPoints: pointsSummary.currentPoints,
          krisflyerMiles: pointsSummary.krisflyerMiles,
          expiryStatus: getCardExpiryStatus(card),
        };
      })
      .sort((a, b) => b.monthlySpend - a.monthlySpend);
  }, [cards, expenses, cardPointTransactions, cardBenefits]);

  const filteredRows = useMemo(() => {
    if (filter === 'All') return cardRows;
    return cardRows.filter(row => row.card.kind === filter);
  }, [cardRows, filter]);

  const totalMonthlySpend = filteredRows.reduce((sum, row) => sum + row.monthlySpend, 0);
  const totalExchangeableMiles = cardRows.reduce((sum, row) => sum + row.krisflyerMiles, 0);
  const totalPoints = cardRows.reduce((sum, row) => sum + row.currentPoints, 0);

  return (
    <div className="desktop-layout cards-layout pb-24 animate-fade-in space-y-6">
      <div role="tablist" aria-label="Cards" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
        {([['mine', 'My cards', Wallet], ['sg', 'Singapore cards', Globe2], ['my', 'Malaysia cards', Globe2], ['board', 'Card board', LayoutDashboard]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => chooseView(id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition-colors ${view === id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Cards don't record a country, so your base currency decides which list they're matched in. */}
      {view === 'board' ? <CardPlanningBoard key={ownerKey} owner={ownerKey} ownCards={cards} baseCurrency={baseCurrency} /> : view !== 'mine' ? <CreditCardMarket country={view} ownCardNames={baseCurrency === (view === 'sg' ? 'MYR' : 'SGD') ? [] : ownCardNames} /> : (<>
      <div className="cards-overview bg-gradient-to-br from-[#1f2a44] via-[#18233a] to-[#11182b] rounded-2xl border border-white/5 p-5 shadow-[0_20px_60px_-30px_rgba(59,130,246,0.45)] text-white">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white">{formatAmount(totalMonthlySpend)} {baseCurrency}</h2>
              <p className="text-xs text-white/70 mt-1">
                Current month linked expenses across {filter === 'All' ? 'all cards' : `${filter.toLowerCase()} cards`}
              </p>
              <p className="text-xs text-white/70 mt-1">Points balance: {totalPoints.toFixed(0)}</p>
              <p className="text-xs text-white/70 mt-1">
                Exchangeable KrisFlyer miles: {totalExchangeableMiles.toFixed(0)}
              </p>
            </div>
            <button
              onClick={onAddCard}
              className="bg-primary text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center"
            >
              <Plus size={16} className="mr-2" />
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['All', 'Debit', 'Credit', 'MultiCurrency'] as const).map(option => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  filter === option
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:border-primary/40'
                }`}
              >
                {option === 'MultiCurrency' ? 'Multi-currency' : option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="bg-surface/70 rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <Landmark size={28} className="mx-auto text-secondary opacity-40 mb-3" />
          <p className="text-sm font-bold text-textMain">No cards yet</p>
          <p className="text-xs text-secondary mt-1">
            {filter === 'All'
              ? 'Add a debit, credit, or multi-currency card to track balances and debt here.'
              : `No ${filter.toLowerCase()} cards yet.`}
          </p>
          <button onClick={onAddCard} className="mt-4 bg-primary text-white px-4 py-2 rounded-lg font-semibold text-sm">
            Add Card
          </button>
        </div>
      ) : (
        <div className="desktop-collection cards-collection space-y-3">
          {filteredRows.map(({ card, monthlySpend, isCreditCard, limitOrBalance, debt, available, currentBalance, linkedCount, currentPoints, krisflyerMiles, expiryStatus }) => (
            (() => {
              const milesSummary = getCardMilesSummary(card.name, cardBenefits);
              return (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              onClick={() => onViewCard(card)}
              onKeyDown={e => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onViewCard(card);
                }
              }}
              className="bg-surface border border-border rounded-2xl p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: card.color || '#1e293b' }}
                  >
                    <CardLogo type={card.type} name={card.name} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="w-full break-words font-bold text-textMain">{card.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-secondary">
                        {card.kind === 'Credit' ? 'Credit' : card.kind === 'Debit' ? 'Debit' : 'Multi-currency'}
                      </span>
                      {expiryStatus === 'expired' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-500 font-bold">
                          Expired
                        </span>
                      )}
                      {expiryStatus === 'expiring-soon' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500 font-bold">
                          Expiring soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-0.5">
                      {card.type} •••• {card.last4Digits || '0000'}
                      {card.expiryMonth && card.expiryYear && (
                        <> · {card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear.toString().slice(-2)}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center justify-end gap-3 border-t border-border pt-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onEditCard(card);
                    }}
                    className="flex min-h-8 items-center rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/10"
                    aria-label={`Edit ${card.name}`}
                  >
                    <Pencil size={14} className="mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      void onDeleteCard(card);
                    }}
                    className="flex min-h-8 items-center rounded-lg px-2 text-xs font-bold text-red-500 hover:bg-red-500/10 hover:text-red-600"
                    aria-label={`Delete ${card.name}`}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-background rounded-xl p-3 border border-border">
                  <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                    {isCreditCard ? 'Current debt' : 'Current balance'}
                  </p>
                  <p className="text-lg font-bold text-textMain mt-1">
                    {isCreditCard
                      ? `${formatAmount((debt ?? 0))} ${baseCurrency}`
                      : `${formatAmount(currentBalance)} ${baseCurrency}`}
                  </p>
                </div>
                <div className="bg-background rounded-xl p-3 border border-border">
                  <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                    {isCreditCard ? 'Available credit' : 'Linked monthly spend'}
                  </p>
                  <p className="text-lg font-bold text-textMain mt-1">
                    {isCreditCard
                      ? `${formatAmount((available ?? 0))} ${baseCurrency}`
                      : `${formatAmount(monthlySpend)} ${baseCurrency}`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
                <span>{linkedCount} linked subscription{linkedCount === 1 ? '' : 's'}</span>
                <span>
                  {limitOrBalance > 0
                    ? `${isCreditCard ? 'Limit' : 'Balance'}: ${formatAmount(limitOrBalance)} ${baseCurrency}`
                    : 'Set balance or limit in Edit'}
                </span>
              </div>

              {card.rewardType !== 'Cashback' && milesSummary.benefits.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">Miles Benefits</p>
                    <p className="text-[10px] text-secondary">Transfer ratio {milesSummary.transferLabel}</p>
                  </div>
                  <div className="space-y-2">
                    {milesSummary.benefits.map(benefit => (
                      <div key={benefit.id} className="bg-background rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-textMain truncate">{benefit.category}</p>
                            <p className="text-[10px] text-secondary truncate">{benefit.title}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-textMain">{(benefit.earnRateMpd ?? 0).toFixed(1)} miles per SGD</p>
                            <p className="text-[10px] text-secondary">
                              {benefit.krisflyerTransferRatio ? `KrisFlyer ${benefit.krisflyerTransferRatio < 1 ? `1:${(1 / benefit.krisflyerTransferRatio).toFixed(0)}` : `${benefit.krisflyerTransferRatio.toFixed(1)}:1`}` : 'KrisFlyer 1:1'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-secondary">
                    <div className="rounded-lg bg-background border border-border px-3 py-2">
                      <p className="uppercase font-bold">Points balance</p>
                      <p className="text-sm font-semibold text-textMain mt-1">{currentPoints.toFixed(0)}</p>
                    </div>
                    <div className="rounded-lg bg-background border border-border px-3 py-2">
                      <p className="uppercase font-bold">KrisFlyer miles</p>
                      <p className="text-sm font-semibold text-textMain mt-1">{krisflyerMiles.toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
              );
            })()
          ))}
        </div>
      )}
      </>)}
    </div>
  );
};

export default CardsTab;
