import React, { useMemo, useState } from 'react';
import { Landmark, Plus, Pencil } from 'lucide-react';
import { CardBenefit, CardPointTransaction, Expense, PaymentCard, Subscription } from '../types';
import { getCardExpiryStatus, getCardMonthlySpend } from '../services/storageService';
import CardLogo from './CardLogo';
import { getCardMilesSummary, getCardPointsSummary } from '../services/cardBenefitsService';

interface CardsTabProps {
  cards: PaymentCard[];
  subscriptions: Subscription[];
  expenses: Expense[];
  cardBenefits?: CardBenefit[];
  cardPointTransactions: CardPointTransaction[];
  baseCurrency: string;
  onAddCard: () => void;
  onViewCard: (card: PaymentCard) => void;
  onEditCard: (card: PaymentCard) => void;
}

const CardsTab: React.FC<CardsTabProps> = ({ cards, subscriptions, expenses, cardBenefits = [], cardPointTransactions, baseCurrency, onAddCard, onViewCard, onEditCard }) => {
  const [filter, setFilter] = useState<'All' | 'Debit' | 'Credit' | 'MultiCurrency'>('All');

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
    <div className="pb-24 animate-fade-in space-y-6">
      <div className="bg-gradient-to-br from-[#1f2a44] via-[#18233a] to-[#11182b] rounded-2xl border border-white/5 p-5 shadow-[0_20px_60px_-30px_rgba(59,130,246,0.45)] text-white">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white">{totalMonthlySpend.toFixed(2)} {baseCurrency}</h2>
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
        <div className="space-y-3">
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
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onViewCard(card);
                }
              }}
              className="bg-surface border border-border rounded-2xl p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white mr-3 shrink-0"
                    style={{ backgroundColor: card.color || '#1e293b' }}
                  >
                    <CardLogo type={card.type} name={card.name} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-textMain truncate">{card.name}</h3>
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

                <button
                  onClick={e => {
                    e.stopPropagation();
                    onEditCard(card);
                  }}
                  className="text-primary text-xs font-bold flex items-center shrink-0"
                >
                  <Pencil size={14} className="mr-1" />
                  Edit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-background rounded-xl p-3 border border-border">
                  <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                    {isCreditCard ? 'Current debt' : 'Current balance'}
                  </p>
                  <p className="text-lg font-bold text-textMain mt-1">
                    {isCreditCard
                      ? `${(debt ?? 0).toFixed(2)} ${baseCurrency}`
                      : `${currentBalance.toFixed(2)} ${baseCurrency}`}
                  </p>
                </div>
                <div className="bg-background rounded-xl p-3 border border-border">
                  <p className="text-[10px] uppercase tracking-wide text-secondary font-bold">
                    {isCreditCard ? 'Available credit' : 'Linked monthly spend'}
                  </p>
                  <p className="text-lg font-bold text-textMain mt-1">
                    {isCreditCard
                      ? `${(available ?? 0).toFixed(2)} ${baseCurrency}`
                      : `${monthlySpend.toFixed(2)} ${baseCurrency}`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-secondary">
                <span>{linkedCount} linked subscription{linkedCount === 1 ? '' : 's'}</span>
                <span>
                  {limitOrBalance > 0
                    ? `${isCreditCard ? 'Limit' : 'Balance'}: ${limitOrBalance.toFixed(2)} ${baseCurrency}`
                    : 'Set balance or limit in Edit'}
                </span>
              </div>

              {milesSummary.benefits.length > 0 && (
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
    </div>
  );
};

export default CardsTab;
