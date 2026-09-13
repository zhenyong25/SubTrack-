import React, { useState } from 'react';
import { CardType, Expense, PaymentCard, PaymentCardKind, Subscription } from '../types';
import { getCardMonthlySpend } from '../services/storageService';
import CardLogo from './CardLogo';
import { AlertTriangle, ArrowLeft, Save } from 'lucide-react';

interface CardEditModalProps {
  card: PaymentCard;
  baseCurrency: string;
  expenses: Expense[];
  subscriptions: Subscription[];
  onSave: (card: PaymentCard) => void;
  onClose: () => void;
}

const CARD_TYPES: CardType[] = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Paypal', 'ApplePay', 'GooglePay', 'Other'];
const EXPIRY_YEAR_OPTIONS = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + i);

const CardEditModal: React.FC<CardEditModalProps> = ({ card, baseCurrency, expenses, subscriptions, onSave, onClose }) => {
  const [name, setName] = useState(card.name);
  const [type, setType] = useState<CardType>(card.type);
  const [last4, setLast4] = useState(card.last4Digits);
  const [kind, setKind] = useState<PaymentCardKind>(card.kind);
  const [creditLimit, setCreditLimit] = useState(card.creditLimit?.toString() || '');
  const [currentBalance, setCurrentBalance] = useState(card.currentBalance?.toString() || '');
  const [color, setColor] = useState(card.color || '#1e293b');
  const [expiryMonth, setExpiryMonth] = useState(card.expiryMonth?.toString() || '');
  const [expiryYear, setExpiryYear] = useState(card.expiryYear?.toString() || '');

  const computedCreditDebt = kind === 'Credit' ? getCardMonthlySpend(card, expenses, subscriptions, baseCurrency) : 0;

  const handleSave = () => {
    if (!name.trim()) {
      alert('Card name is required');
      return;
    }

    onSave({
      ...card,
      name,
      type,
      kind,
      last4Digits: last4,
      creditLimit: kind === 'Credit' ? (creditLimit ? parseFloat(creditLimit) : undefined) : undefined,
      currentDebt: kind === 'Credit' ? computedCreditDebt : undefined,
      currentBalance: kind !== 'Credit' ? (currentBalance ? parseFloat(currentBalance) : 0) : undefined,
      color,
      expiryMonth: expiryMonth ? parseInt(expiryMonth, 10) : undefined,
      expiryYear: expiryYear ? parseInt(expiryYear, 10) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden animate-slide-up">
      <div
        className="flex items-center justify-between p-4 border-b border-border bg-surface shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 text-secondary hover:text-textMain" aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-base font-bold text-textMain">{card.id === 'new' ? 'Add Card' : 'Edit Card'}</h2>
        <div className="w-8" />
      </div>

      <div className="p-4 pb-10 space-y-6 max-w-lg mx-auto w-full overflow-y-auto flex-1 min-h-0">
        <div className="flex justify-center perspective-1000">
          <div
            className="w-80 h-48 rounded-2xl relative p-6 text-white shadow-2xl transition-transform hover:scale-105"
            style={{ background: color, boxShadow: `0 10px 30px -10px ${color}` }}
          >
            <div className="w-12 h-9 mb-4 bg-yellow-200/20 rounded-md border border-yellow-200/40 relative overflow-hidden">
              <div className="absolute top-1/2 w-full h-[1px] bg-yellow-200/40"></div>
              <div className="absolute left-1/2 h-full w-[1px] bg-yellow-200/40"></div>
              <div className="absolute top-2 left-2 w-4 h-5 border border-yellow-200/30 rounded-sm"></div>
            </div>

            <div className="mb-4 font-mono text-xl tracking-widest drop-shadow-md">
              **** **** **** {last4 || '0000'}
            </div>

            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] uppercase opacity-70 mb-0.5">Card Holder</p>
                <p className="text-sm font-bold tracking-wide uppercase truncate max-w-[120px]">{name || 'MY CARD'}</p>
                {(expiryMonth || expiryYear) && (
                  <p className="text-[10px] tracking-wide opacity-70 mt-1">
                    VALID THRU {expiryMonth ? expiryMonth.padStart(2, '0') : 'MM'}/{expiryYear ? expiryYear.slice(-2) : 'YY'}
                  </p>
                )}
              </div>
              <div className="scale-125 origin-bottom-right opacity-90">
                <CardLogo type={type} name={name} />
              </div>
            </div>

            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/20 to-transparent rounded-2xl pointer-events-none"></div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Card Kind</label>
            <select
              value={kind}
              onChange={e => setKind(e.target.value as PaymentCardKind)}
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
            >
              <option value="Credit">Credit Card</option>
              <option value="Debit">Debit Card</option>
              <option value="MultiCurrency">Multi-currency Card</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Card Nickname</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Chase Sapphire"
              className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Card Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as CardType)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
              >
                {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Last 4 Digits</label>
              <input
                type="text"
                maxLength={4}
                value={last4}
                onChange={e => setLast4(e.target.value)}
                placeholder="4242"
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none font-mono text-center tracking-widest"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Expiry Date</label>
            <div className="grid grid-cols-2 gap-4">
              <select
                value={expiryMonth}
                onChange={e => setExpiryMonth(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
              >
                <option value="">Month</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                  <option key={month} value={month}>{month.toString().padStart(2, '0')}</option>
                ))}
              </select>
              <select
                value={expiryYear}
                onChange={e => setExpiryYear(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
              >
                <option value="">Year</option>
                {EXPIRY_YEAR_OPTIONS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {kind === 'Credit' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-secondary uppercase mb-1">Credit Limit</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={e => setCreditLimit(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none no-spinner"
                    />
                    <span className="absolute right-3 top-3 text-xs text-secondary">{baseCurrency}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-secondary uppercase mb-1">Current Debt</label>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-base font-bold text-textMain">
                      {computedCreditDebt.toFixed(2)} {baseCurrency}
                    </p>
                    <p className="text-[10px] text-secondary mt-1">
                      Auto-calculated from this month&apos;s linked expenses and subscriptions.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-secondary uppercase mb-1">Current Balance</label>
                <div className="relative">
                  <input
                    type="number"
                    value={currentBalance}
                    onChange={e => setCurrentBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none no-spinner"
                  />
                  <span className="absolute right-3 top-3 text-xs text-secondary">{baseCurrency}</span>
                </div>
              </div>
            )}
            <div className={kind === 'Credit' ? '' : 'col-span-2'}>
              <label className="block text-xs font-semibold text-secondary uppercase mb-1">Theme Color</label>
              <div className="flex items-center space-x-2 bg-surface border border-border rounded-xl p-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                />
                <span className="text-xs text-secondary font-mono">{color}</span>
              </div>
            </div>
          </div>

          {kind === 'Credit' && creditLimit && parseFloat(creditLimit) > 0 && (
            <div className="flex items-start bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <AlertTriangle size={16} className="text-blue-500 mr-2 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Credit cards show debt and limit. The remaining credit is calculated automatically.
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center mt-4"
          >
            <Save size={18} className="mr-2" /> {card.id === 'new' ? 'Add Card' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardEditModal;
