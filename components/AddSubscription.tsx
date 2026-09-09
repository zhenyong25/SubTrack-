
import React, { useState, useEffect } from 'react';
import { Subscription, BillingCycle, CURRENCIES, DEFAULT_CATEGORIES, CardType, PaymentCard, PaymentCardKind } from '../types';
import { X, Plus, Check, DollarSign, Calendar, Loader2, Tag, CreditCard as CardIcon, Users } from 'lucide-react';
import { getCurrencySymbol } from '../services/storageService';
import ServicePicker from './ServicePicker';
import { findExactService } from '../services/serviceCatalog';
import { useServiceCatalog } from '../services/serviceCatalogStore';

interface AddSubscriptionProps {
  onSave: (sub: Omit<Subscription, 'id' | 'nextPaymentDate'>, newCard?: PaymentCard) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Subscription;
  savedCards: PaymentCard[];
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const CARD_TYPES: { type: CardType, label: string }[] = [
    { type: 'Visa', label: 'Visa' },
    { type: 'Mastercard', label: 'Mastercard' },
    { type: 'Amex', label: 'Amex' },
    { type: 'Paypal', label: 'PayPal' },
    { type: 'ApplePay', label: 'Apple Pay' },
    { type: 'GooglePay', label: 'Google Pay' },
    { type: 'Other', label: 'Other' },
];

const AddSubscription: React.FC<AddSubscriptionProps> = ({ onSave, onCancel, initialData, savedCards }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('SGD');
  const [cycle, setCycle] = useState<BillingCycle>(BillingCycle.Monthly);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Card Selection Logic
  const [selectedCardId, setSelectedCardId] = useState<string>('none');
  // New Card Fields (if adding new)
  const [cardName, setCardName] = useState('');
  const [cardType, setCardType] = useState<CardType>('Other');
  const [cardKind, setCardKind] = useState<PaymentCardKind>('Credit');
  const [last4, setLast4] = useState('');

  const [category, setCategory] = useState('General');
  const [selectedColor, setSelectedColor] = useState(COLORS[5]);
  const [isShared, setIsShared] = useState(false);
  
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [newShareName, setNewShareName] = useState('');
  
  const catalog = useServiceCatalog();
  const [serviceId, setServiceId] = useState<string>();
  const [logoUrl, setLogoUrl] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
        setServiceId(initialData.serviceId);
        setLogoUrl(initialData.logoUrl);
        setPrice(initialData.price.toString());
        setCurrency(initialData.currency);
        setCycle(initialData.billingCycle);
        setDate(initialData.firstPaymentDate.split('T')[0]);
        setCategory(initialData.category);
        
        // Card handling
        if (initialData.cardId && savedCards.find(c => c.id === initialData.cardId)) {
            setSelectedCardId(initialData.cardId);
        } else if (initialData.cardName && initialData.cardName !== 'Cash' && initialData.cardName !== 'None') {
            // It was a legacy/manual card, select New but prefill
            setSelectedCardId('new');
            setCardName(initialData.cardName);
            if(initialData.cardType) setCardType(initialData.cardType);
            const linkedCard = savedCards.find(c => c.name === initialData.cardName);
            if (linkedCard?.kind) setCardKind(linkedCard.kind);
        } else {
            setSelectedCardId('none');
        }

        setSelectedColor(initialData.color);
        if (initialData.sharedWith && initialData.sharedWith.length > 0) {
            setIsShared(true);
            setSharedWith(initialData.sharedWith);
        }
    } else {
        // If there are saved cards, defaulting to the first one is usually convenient, otherwise None
        if (savedCards.length > 0) setSelectedCardId(savedCards[0].id);
        else setSelectedCardId('none');
    }
  }, [initialData, savedCards]);

  const addSharePerson = () => {
      if(newShareName.trim()) {
          setSharedWith([...sharedWith, newShareName.trim()]);
          setNewShareName('');
      }
  };

  const removeSharePerson = (idx: number) => {
      const newSw = [...sharedWith];
      newSw.splice(idx, 1);
      setSharedWith(newSw);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    let finalCardName = 'Cash';
    let finalCardType = undefined;
    let finalCardId = undefined;
    let newCardObj = undefined;

    if (selectedCardId === 'new') {
        finalCardName = cardName || 'New Card';
        
        // Only Create card if user typed name
        if (cardName.trim()) {
            newCardObj = {
                id: crypto.randomUUID(),
                name: cardName,
                type: cardType,
                kind: cardKind,
                last4Digits: last4,
                color: '#1e293b' // Default color
            };
            finalCardId = newCardObj.id;
        }
    } else if (selectedCardId === 'none') {
        finalCardName = 'Cash';
    } else {
        const existing = savedCards.find(c => c.id === selectedCardId);
        if (existing) {
            finalCardName = existing.name;
            finalCardType = existing.type;
            finalCardId = existing.id;
        }
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        serviceId: serviceId || findExactService(name, catalog.filter(s => s.is_active))?.id,
        logoUrl,
        price: parseFloat(price) || 0,
        currency,
        billingCycle: cycle,
        firstPaymentDate: date,
        category,
        cardName: finalCardName,
        cardType: finalCardType,
        cardId: finalCardId,
        color: selectedColor,
        sharedCount: isShared ? sharedWith.length + 1 : 1,
        sharedWith: isShared ? sharedWith : [],
        status: initialData ? initialData.status : 'Active',
        paymentHistory: initialData ? initialData.paymentHistory : {}
      }, newCardObj);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-background min-h-screen pb-20 transition-colors duration-300">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 flex justify-between items-center border-b border-border">
        <button onClick={onCancel} disabled={isSaving} className="text-secondary hover:text-textMain disabled:opacity-40">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold text-textMain">{initialData ? 'Edit Subscription' : 'New Subscription'}</h2>
        <div className="w-6" /> 
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto animate-slide-up">
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <ServicePicker name={name} serviceId={serviceId} logoUrl={logoUrl}
            onNameChange={value => { setName(value); setServiceId(undefined); setLogoUrl(undefined); }}
            onSelect={service => {
              setName(service.name);
              setServiceId(service.id);
              setLogoUrl(undefined);
              setCategory(service.category);
            }} />

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <div>
                <label className="block text-xs font-semibold text-secondary uppercase mb-1">
                  {cycle === BillingCycle.FreeTrial ? 'Future Cost' : 'Cost'}
                </label>
                <div className="relative">
                    <span className="absolute left-3 top-3 text-secondary"><DollarSign size={16} /></span>
                    <input 
                    required
                    type="number" 
                    step="0.01"
                    value={price} 
                    onChange={e => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none no-spinner"
                    />
                </div>
            </div>
            <div>
                 <label className="block text-xs font-semibold text-secondary uppercase mb-1">Currency</label>
                 <select 
                   value={currency}
                   onChange={e => setCurrency(e.target.value)}
                   className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none text-sm"
                 >
                     {CURRENCIES.map(c => <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>)}
                 </select>
            </div>
          </div>

          <div>
             <label className="block text-xs font-semibold text-secondary uppercase mb-1">Cycle</label>
             <select 
               value={cycle}
               onChange={e => setCycle(e.target.value as BillingCycle)}
               className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none appearance-none"
             >
               {Object.values(BillingCycle).map(c => (
                 <option key={c} value={c}>{c}</option>
               ))}
             </select>
          </div>

          {/* Payment Card Section - Updated for Card Management */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <label className="block text-xs font-semibold text-secondary uppercase mb-2">Payment Method</label>
            
            {/* Card Selector */}
            <div className="mb-3">
                 <select 
                    value={selectedCardId}
                    onChange={e => setSelectedCardId(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none"
                 >
                     <option value="none">No Card / Cash / Other</option>
                     {savedCards.map(c => (
                         <option key={c.id} value={c.id}>
                             {c.name} ({c.type} ...{c.last4Digits})
                         </option>
                     ))}
                     <option value="new">+ Add New Card</option>
                 </select>
            </div>

            {/* New Card Fields - Only show if 'new' is selected */}
            {selectedCardId === 'new' && (
                <div className="space-y-3 animate-fade-in pl-2 border-l-2 border-primary/20">
                     <div className="relative">
                        <span className="absolute left-3 top-3 text-secondary"><CardIcon size={16} /></span>
                        <input 
                            type="text" 
                            value={cardName}
                            onChange={e => setCardName(e.target.value)}
                            placeholder="Card Name (e.g. Chase)"
                            className="w-full bg-background border border-border rounded-lg p-3 pl-9 text-textMain focus:border-primary outline-none text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                              <select 
                                value={cardKind}
                                onChange={e => setCardKind(e.target.value as PaymentCardKind)}
                                className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none text-sm"
                              >
                                <option value="Credit">Credit Card</option>
                                <option value="Debit">Debit Card</option>
                                <option value="MultiCurrency">Multi-currency</option>
                              </select>
                        </div>
                        <div className="flex-1">
                              <select 
                                 value={cardType}
                                 onChange={e => setCardType(e.target.value as CardType)}
                                 className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none text-sm"
                              >
                                {CARD_TYPES.map(c => <option key={c.type} value={c.type}>{c.label}</option>)}
                             </select>
                        </div>
                        <div className="w-1/3">
                            <input 
                                type="text" 
                                value={last4}
                                onChange={e => setLast4(e.target.value.slice(0, 4))}
                                placeholder="Last 4"
                                className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none text-sm text-center tracking-widest no-spinner"
                                maxLength={4}
                            />
                        </div>
                    </div>
                </div>
            )}
          </div>

          {/* Shared Split Section */}
          <div className="bg-surface border border-border rounded-xl p-3">
              <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users size={18} className="text-primary" />
                    <span className="text-sm font-medium text-textMain">Split Bill?</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
              </div>
              
              {isShared && (
                  <div className="mt-3 pt-3 border-t border-border animate-fade-in">
                      <div className="space-y-2 mb-2">
                          {sharedWith.map((person, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-background p-2 rounded-lg border border-border">
                                  <span className="text-sm text-textMain">{person}</span>
                                  <button type="button" onClick={() => removeSharePerson(idx)} className="text-secondary hover:text-red-500">
                                      <X size={14} />
                                  </button>
                              </div>
                          ))}
                      </div>
                      <div className="flex space-x-2">
                          <input 
                            type="text" 
                            value={newShareName}
                            onChange={e => setNewShareName(e.target.value)}
                            onKeyDown={e => {
                                if(e.key === 'Enter') {
                                    e.preventDefault();
                                    addSharePerson();
                                }
                            }}
                            placeholder="Add name"
                            className="flex-1 bg-background border border-border rounded-lg p-2 text-textMain text-sm focus:border-primary outline-none"
                          />
                          <button 
                            type="button" 
                            onClick={addSharePerson}
                            className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary hover:text-white transition-colors"
                          >
                              <Plus size={18} />
                          </button>
                      </div>
                  </div>
              )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">
               {cycle === BillingCycle.FreeTrial ? 'Trial Ends On' : 'First Payment'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-secondary"><Calendar size={16} /></span>
              <input 
                type="date" 
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none [color-scheme:dark] dark:[color-scheme:dark] light:[color-scheme:light]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Category</label>
            <div className="relative mb-2">
              <span className="absolute left-3 top-3 text-secondary"><Tag size={16} /></span>
              <input 
                type="text" 
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Entertainment"
                className="w-full bg-surface border border-border rounded-xl p-3 pl-9 text-textMain focus:border-primary outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
                {DEFAULT_CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${category === cat ? 'bg-primary text-white border-primary' : 'bg-surface text-secondary border-border hover:border-primary/50'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-2">Color Tag</label>
            <div className="flex flex-wrap gap-3">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${selectedColor === c ? 'scale-110 ring-2 ring-primary shadow-lg' : 'opacity-70'}`}
                  style={{ backgroundColor: c }}
                >
                  {selectedColor === c && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-6 flex items-center justify-center disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              initialData ? 'Update Subscription' : 'Save Subscription'
            )}
          </button>
        </form>
      </div>

    </div>
  );
};

export default AddSubscription;
