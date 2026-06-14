
import React, { useState, useEffect } from 'react';
import { Subscription, BillingCycle, AiSuggestion, CURRENCIES, DEFAULT_CATEGORIES, CardType, PaymentCard } from '../types';
import { getSubscriptionSuggestions, POPULAR_SUBSCRIPTIONS } from '../services/geminiService';
import { Sparkles, X, Plus, Loader2, Check, DollarSign, Calendar, Tag, CreditCard as CardIcon, Users } from 'lucide-react';
import { getCurrencySymbol } from '../services/storageService';

interface AddSubscriptionProps {
  onSave: (sub: Omit<Subscription, 'id' | 'nextPaymentDate'>, newCard?: PaymentCard) => void;
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

const getLogoUrl = (name: string) => {
    if (!name) return '';
    const cleanName = name.toLowerCase().replace(/\s+/g, '').replace(/premium|plus|pro|standard|family|student|individual|plan/g, '');
    const domainMap: Record<string, string> = {
        'netflix': 'netflix.com', 'spotify': 'spotify.com', 'youtube': 'youtube.com', 'amazon': 'amazon.com', 'prime': 'amazon.com',
        'disney': 'disneyplus.com', 'hulu': 'hulu.com', 'hbo': 'hbo.com', 'max': 'max.com', 'apple': 'apple.com', 'icloud': 'apple.com',
        'google': 'google.com', 'dropbox': 'dropbox.com', 'slack': 'slack.com', 'adobe': 'adobe.com', 'chatgpt': 'openai.com',
        'openai': 'openai.com', 'github': 'github.com', 'playstation': 'playstation.com', 'xbox': 'xbox.com', 'nintendo': 'nintendo.com',
        'steam': 'steampowered.com', 'twitch': 'twitch.tv', 'duolingo': 'duolingo.com', 'canva': 'canva.com', 'notion': 'notion.so',
        'medium': 'medium.com', 'x': 'twitter.com', 'twitter': 'twitter.com', 'linkedin': 'linkedin.com', 'zoom': 'zoom.us',
        'discord': 'discord.com', 'figma': 'figma.com', 'tinder': 'tinder.com', 'bumble': 'bumble.com', 'hinge': 'hinge.co',
        'audible': 'audible.com', 'evernote': 'evernote.com', 'midjourney': 'midjourney.com', 'claude': 'anthropic.com'
    };
    for(const key in domainMap) {
        if(cleanName.includes(key)) return `https://logo.clearbit.com/${domainMap[key]}`;
    }
    return `https://logo.clearbit.com/${cleanName}.com`;
};

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
  const [last4, setLast4] = useState('');

  const [category, setCategory] = useState('General');
  const [selectedColor, setSelectedColor] = useState(COLORS[5]);
  const [isShared, setIsShared] = useState(false);
  
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [newShareName, setNewShareName] = useState('');
  
  const [showAi, setShowAi] = useState(false);
  
  const [aiQuery, setAiQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>(POPULAR_SUBSCRIPTIONS);
  const [loadingAi, setLoadingAi] = useState(false);

  // Derived logo for preview
  const logoPreview = name ? getLogoUrl(name) : '';

  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
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

  const handleAiSearch = async () => {
    setLoadingAi(true);
    const results = await getSubscriptionSuggestions(aiQuery);
    setSuggestions(results);
    setLoadingAi(false);
  };

  const applySuggestion = (s: AiSuggestion) => {
    setName(s.name);
    setPrice(s.estimatedPrice.toString());
    if (s.currency) setCurrency(s.currency);
    setCategory(s.category);
    if (s.billingCycle === 'Yearly') setCycle(BillingCycle.Yearly);
    else setCycle(BillingCycle.Monthly);
    setShowAi(false);
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    onSave({
      name,
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
  };

  return (
    <div className="bg-background min-h-screen pb-20 transition-colors duration-300">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 flex justify-between items-center border-b border-border">
        <button onClick={onCancel} className="text-secondary hover:text-textMain">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold text-textMain">{initialData ? 'Edit Subscription' : 'New Subscription'}</h2>
        <div className="w-6" /> 
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto animate-slide-up">
        
        {!initialData && (
            <div className="mb-4">
                <button 
                type="button"
                onClick={() => setShowAi(true)}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 flex items-center justify-between text-white shadow-lg active:scale-95 transition-transform"
                >
                    <div className="flex items-center">
                        <Sparkles size={20} className="mr-3" />
                        <div className="text-left">
                            <p className="font-bold text-sm">Browse Popular</p>
                            <p className="text-[10px] opacity-80">Tap to auto-fill common services</p>
                        </div>
                    </div>
                    <Plus size={20} />
                </button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-start space-x-3">
             <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden mt-6">
                 {logoPreview ? (
                     <img src={logoPreview} alt="" className="w-full h-full object-cover" 
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.style.backgroundColor = selectedColor;
                            e.currentTarget.parentElement!.innerHTML = `<span class="text-white font-bold text-lg">${name.charAt(0).toUpperCase()}</span>`;
                        }}
                     />
                 ) : (
                     <span className="text-secondary text-xs">Logo</span>
                 )}
             </div>
             <div className="flex-1">
                <label className="block text-xs font-semibold text-secondary uppercase mb-1">Service Name</label>
                <input 
                  required
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Netflix"
                  className="w-full bg-surface border border-border rounded-xl p-3 text-textMain focus:border-primary outline-none transition-colors"
                />
             </div>
          </div>

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
            className="w-full bg-primary hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-6"
          >
            {initialData ? 'Update Subscription' : 'Save Subscription'}
          </button>
        </form>
      </div>

      {/* AI Suggestions Modal */}
      {showAi && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-surface w-full max-w-md h-[85vh] sm:h-[600px] sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden shadow-2xl animate-slide-up">
            <div className="p-4 border-b border-border flex justify-between items-center bg-background">
              <h3 className="text-textMain font-bold flex items-center">
                <Sparkles className="text-primary mr-2" size={18} /> 
                Popular Services
              </h3>
              <button onClick={() => setShowAi(false)} className="text-secondary hover:text-textMain">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 bg-background border-b border-border">
              <div className="flex space-x-2">
                <input 
                  type="text"
                  placeholder="Type to search..."
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none"
                />
                <button 
                  onClick={handleAiSearch}
                  disabled={loadingAi}
                  className="bg-primary px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
                >
                  {loadingAi ? <Loader2 className="animate-spin" size={20} /> : 'Search'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-background">
               {suggestions.map((s, idx) => (
                 <button 
                  key={idx}
                  onClick={() => applySuggestion(s)}
                  className="w-full bg-surface border border-border hover:border-primary/50 p-3 rounded-xl flex justify-between items-center group text-left transition-all hover:shadow-md"
                 >
                   <div className="flex items-center">
                     <div className="w-10 h-10 rounded-full bg-indigo-100/10 flex items-center justify-center text-primary font-bold mr-3 text-lg overflow-hidden">
                        {/* Auto Logo in Suggestions too */}
                        <img 
                            src={getLogoUrl(s.name)} 
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = s.name.charAt(0);
                            }}
                        />
                     </div>
                     <div>
                       <p className="font-bold text-textMain">{s.name}</p>
                       <p className="text-xs text-secondary">{s.category} • {s.billingCycle}</p>
                     </div>
                   </div>
                   <div className="flex items-center text-primary">
                     <span className="font-semibold mr-2">${s.estimatedPrice}</span>
                     <Plus size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                 </button>
               ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddSubscription;
