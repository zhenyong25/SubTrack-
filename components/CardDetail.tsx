import React, { useState, useMemo } from 'react';
import { PaymentCard, Subscription, CardType } from '../types';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getCardSpendingHistory } from '../services/storageService';
import CardLogo from './CardLogo';
import { X, Save, AlertTriangle, Edit3 } from 'lucide-react';

interface CardDetailProps {
  card: PaymentCard;
  subscriptions: Subscription[];
  baseCurrency: string;
  onUpdate: (card: PaymentCard) => void;
  onClose: () => void;
}

const CARD_TYPES: CardType[] = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Paypal', 'ApplePay', 'GooglePay', 'Other'];

const CardDetail: React.FC<CardDetailProps> = ({ card, subscriptions, baseCurrency, onUpdate, onClose }) => {
  const [name, setName] = useState(card.name);
  const [type, setType] = useState<CardType>(card.type);
  const [last4, setLast4] = useState(card.last4Digits);
  const [budget, setBudget] = useState(card.budget?.toString() || '');
  const [color, setColor] = useState(card.color || '#1e293b');

  const historyData = useMemo(() => {
    return getCardSpendingHistory(subscriptions, name, baseCurrency);
  }, [subscriptions, name, baseCurrency]);

  const handleSave = () => {
    if (!name.trim()) return alert("Card name is required");
    
    onUpdate({
        ...card,
        name,
        type,
        last4Digits: last4,
        budget: budget ? parseFloat(budget) : undefined,
        color
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border">
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
                <h3 className="text-lg font-bold text-textMain">{card.id === 'new' ? 'Add New Card' : 'Card Details'}</h3>
                <button onClick={onClose} className="text-secondary hover:text-textMain"><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[80vh]">
                
                {/* Visual Card Representation */}
                <div className="flex justify-center mb-8 perspective-1000">
                    <div 
                        className="w-80 h-48 rounded-2xl relative p-6 text-white shadow-2xl transition-transform hover:scale-105"
                        style={{ background: color, boxShadow: `0 10px 30px -10px ${color}` }}
                    >
                        {/* Chip */}
                        <div className="w-12 h-9 mb-4 bg-yellow-200/20 rounded-md border border-yellow-200/40 relative overflow-hidden">
                             <div className="absolute top-1/2 w-full h-[1px] bg-yellow-200/40"></div>
                             <div className="absolute left-1/2 h-full w-[1px] bg-yellow-200/40"></div>
                             <div className="absolute top-2 left-2 w-4 h-5 border border-yellow-200/30 rounded-sm"></div>
                        </div>

                        {/* Number */}
                        <div className="mb-4 font-mono text-xl tracking-widest drop-shadow-md">
                            **** **** **** {last4 || '0000'}
                        </div>

                        {/* Bottom Info */}
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[10px] uppercase opacity-70 mb-0.5">Card Holder</p>
                                <p className="text-sm font-bold tracking-wide uppercase truncate max-w-[120px]">{name || 'MY CARD'}</p>
                            </div>
                            <div className="scale-125 origin-bottom-right opacity-90">
                                <CardLogo type={type} name={name} />
                            </div>
                        </div>

                        {/* Gloss Effect */}
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/20 to-transparent rounded-2xl pointer-events-none"></div>
                    </div>
                </div>

                {/* Spending Chart (Only if not new) */}
                {card.id !== 'new' && (
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-secondary uppercase mb-3">12-Month Spending History</h4>
                        <div className="h-40 w-full min-w-0 bg-background rounded-xl p-2 border border-border">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={historyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
                                    <XAxis dataKey="name" hide />
                                    <Tooltip 
                                        cursor={{fill: 'var(--color-text-main)', opacity: 0.05}} 
                                        contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)', borderRadius: '8px', fontSize: '12px' }}
                                        itemStyle={{ color: 'var(--color-text-main)', fontWeight: 'bold' }} 
                                        formatter={(value: number) => [`${value.toFixed(2)} ${baseCurrency}`, 'Spent']}
                                    />
                                    <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Edit Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-secondary uppercase mb-1">Card Nickname</label>
                        <input 
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Chase Sapphire"
                            className="w-full bg-background border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Card Type</label>
                            <select 
                                value={type}
                                onChange={e => setType(e.target.value as CardType)}
                                className="w-full bg-background border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none"
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
                                className="w-full bg-background border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none font-mono text-center tracking-widest"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Monthly Budget</label>
                            <div className="relative">
                                <input 
                                    type="number"
                                    value={budget}
                                    onChange={e => setBudget(e.target.value)}
                                    placeholder="No Limit"
                                    className="w-full bg-background border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none no-spinner"
                                />
                                <span className="absolute right-3 top-3 text-xs text-secondary">{baseCurrency}</span>
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-secondary uppercase mb-1">Theme Color</label>
                             <div className="flex items-center space-x-2 bg-background border border-border rounded-xl p-2">
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
                    
                    {budget && parseFloat(budget) > 0 && (
                        <div className="flex items-start bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <AlertTriangle size={16} className="text-blue-500 mr-2 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                If your subscriptions on this card exceed <span className="font-bold">{budget} {baseCurrency}</span>, 
                                the card row will turn red in the dashboard.
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
    </div>
  );
};

export default CardDetail;
