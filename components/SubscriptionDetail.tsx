
import React, { useState, useMemo, useEffect } from 'react';
import { Subscription, Friend } from '../types';
import { generateNaughtyReminder } from '../services/geminiService';
import { ArrowLeft, Trash2, CheckCircle2, Circle, MessageCircle, AlertTriangle, ChevronLeft, ChevronRight, Share2, Copy, CreditCard, Tag, Users, Edit, Plus, Bell, RotateCcw, PlayCircle } from 'lucide-react';

interface SubscriptionDetailProps {
  subscription: Subscription;
  friends: Friend[];
  onUpdate: (updated: Subscription) => void;
  onDelete: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  onClone: (sub: Subscription) => void;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

const getLogoUrl = (name: string) => {
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

const SubscriptionDetail: React.FC<SubscriptionDetailProps> = ({ subscription, friends, onUpdate, onDelete, onEdit, onClone, onClose, onShowToast }) => {
  const [loadingNudge, setLoadingNudge] = useState<string | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);
  const [showFriendSelector, setShowFriendSelector] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  
  // State for Month Navigation (defaults to current month)
  const [currentHistoryDate, setCurrentHistoryDate] = useState(new Date());

  const sharedPeople = useMemo(() => {
      return subscription.sharedWith || [];
  }, [subscription]);

  const availableFriends = friends;

  const logoUrl = getLogoUrl(subscription.name);

  const getMonthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;
  const formatMonth = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const togglePaymentStatus = (person: string) => {
      const monthKey = getMonthKey(currentHistoryDate);
      const history = { ...(subscription.paymentHistory || {}) };
      
      if (!history[monthKey]) history[monthKey] = {};
      
      const newStatus = !history[monthKey][person];
      history[monthKey][person] = newStatus;
      
      onUpdate({
          ...subscription,
          paymentHistory: history
      });
      
      if (newStatus) {
          onShowToast(`Marked ${person} as Paid`);
      }
  };

  const handleStatusToggle = () => {
      if (subscription.status === 'Active') {
          // Cancelling
          if (confirm("Cancel this subscription? It will be moved to Past and expenses will stop accumulating from today.")) {
             onUpdate({
                ...subscription,
                status: 'Past',
                cancellationDate: new Date().toISOString()
             });
             onShowToast("Subscription Cancelled");
          }
      } else {
          // Reactivating - Show options
          setShowReactivateModal(true);
      }
  }

  const handleResumeExisting = () => {
      onUpdate({
          ...subscription,
          status: 'Active',
          cancellationDate: undefined // Clear cancellation
      });
      setShowReactivateModal(false);
      onShowToast("Resumed existing subscription");
  };

  const handleStartNewCycle = () => {
      onClone(subscription);
      setShowReactivateModal(false);
      onShowToast("Started new subscription cycle!");
  };

  const handleNudge = async (person: string) => {
      setLoadingNudge(person);
      const splitAmount = (subscription.price / (sharedPeople.length + 1)).toFixed(2);
      const msg = await generateNaughtyReminder(subscription.name, person, `${splitAmount} ${subscription.currency}`);
      setNudgeMessage(msg);
      setLoadingNudge(null);
  };

  const sendNotification = (person: string) => {
      setNudgeMessage(null);
      // Simulate sending logic
      onShowToast(`Notification sent to ${person}!`);
  };

  const handlePrevMonth = () => {
      const newDate = new Date(currentHistoryDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setCurrentHistoryDate(newDate);
  };

  const handleNextMonth = () => {
      const newDate = new Date(currentHistoryDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setCurrentHistoryDate(newDate);
  };

  const addFriendToSub = (name: string) => {
      const current = subscription.sharedWith || [];
      if (!current.includes(name)) {
          onUpdate({
              ...subscription,
              sharedWith: [...current, name],
              sharedCount: (subscription.sharedCount || 1) + 1
          });
      }
      setShowFriendSelector(false);
      onShowToast(`${name} added to split`);
  };

  const currentMonthKey = getMonthKey(currentHistoryDate);
  const currentMonthHistory = subscription.paymentHistory?.[currentMonthKey] || {};

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface/50 backdrop-blur">
            <button onClick={onClose} className="p-2 -ml-2 text-secondary hover:text-textMain">
                <ArrowLeft size={24} />
            </button>
            <div className="flex items-center space-x-2">
                <button 
                    onClick={handleStatusToggle}
                    className={`text-xs px-3 py-1 rounded-full font-bold border transition-colors ${subscription.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-secondary/10 text-secondary border-secondary/20'}`}
                >
                    {subscription.status === 'Active' ? 'ACTIVE' : 'PAST / CANCELLED'}
                </button>
                <button onClick={() => onEdit(subscription)} className="p-2 text-secondary hover:text-primary">
                    <Edit size={20} />
                </button>
                <button onClick={() => onDelete(subscription.id)} className="p-2 text-secondary hover:text-red-500">
                    <Trash2 size={20} />
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24">
            {/* Main Info */}
            <div className="flex flex-col items-center mb-8 mt-4">
                <div 
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white mb-4 overflow-hidden bg-surface border border-border"
                    style={{ boxShadow: `0 10px 30px -10px ${subscription.color || 'rgba(0,0,0,0.1)'}` }}
                >
                    <img 
                        src={logoUrl} 
                        alt={subscription.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.style.backgroundColor = subscription.color;
                            e.currentTarget.parentElement!.innerText = subscription.name.charAt(0).toUpperCase();
                        }}
                    />
                </div>
                <h2 className="text-2xl font-bold text-textMain">{subscription.name}</h2>
                <div className="flex items-baseline mt-1">
                    <span className="text-3xl font-bold text-textMain">{subscription.price.toFixed(2)}</span>
                    <span className="text-sm font-semibold text-secondary ml-1">{subscription.currency} / {subscription.billingCycle}</span>
                </div>
                {subscription.status === 'Past' && subscription.cancellationDate && (
                    <p className="text-xs text-red-500 mt-1 font-medium">
                        Ended on {new Date(subscription.cancellationDate).toLocaleDateString()}
                    </p>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-secondary">
                    <span className="bg-surface px-3 py-1 rounded-lg border border-border flex items-center">
                        <CreditCard size={14} className="mr-2" /> 
                        {subscription.cardType && <span className="mr-1 font-bold">{subscription.cardType}</span>} 
                        {subscription.cardName}
                    </span>
                    <span className="bg-surface px-3 py-1 rounded-lg border border-border flex items-center">
                        <Tag size={14} className="mr-2" /> {subscription.category}
                    </span>
                </div>
            </div>

            {/* Split / Shared Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-textMain flex items-center">
                        <Users size={20} className="mr-2 text-primary" /> Payment History
                    </h3>
                    <button 
                        onClick={() => setShowFriendSelector(!showFriendSelector)}
                        className="text-primary text-xs font-bold flex items-center hover:underline"
                    >
                        <Plus size={14} className="mr-2" /> Add Person
                    </button>
                </div>

                {showFriendSelector && (
                    <div className="bg-surface border border-border rounded-lg p-2 animate-fade-in mb-2">
                        <p className="text-xs text-secondary mb-2 uppercase font-bold px-1">Add from Friends</p>
                        <div className="flex flex-wrap gap-2">
                            {availableFriends.map(f => (
                                <button 
                                    key={f.id}
                                    onClick={() => addFriendToSub(f.name)}
                                    className="bg-background border border-border px-3 py-1 rounded-full text-xs hover:border-primary hover:text-primary transition-colors flex items-center"
                                >
                                    <img src={f.avatar} alt={f.name} className="w-4 h-4 rounded-full mr-2" />
                                    {f.name}
                                </button>
                            ))}
                            {availableFriends.length === 0 && (
                                <span className="text-xs text-secondary px-1">No friends in list. Go to Settings to add friends.</span>
                            )}
                        </div>
                    </div>
                )}
                
                <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                    {/* Month Navigator Header */}
                    <div className="bg-background/50 p-3 flex items-center justify-between border-b border-border">
                        <button onClick={handlePrevMonth} className="p-1 text-secondary hover:text-primary transition-colors">
                            <ChevronLeft size={24} />
                        </button>
                        <span className="font-bold text-textMain select-none">{formatMonth(currentHistoryDate)}</span>
                        <button onClick={handleNextMonth} className="p-1 text-secondary hover:text-primary transition-colors">
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    {/* User List for Selected Month */}
                    <div className="p-2 space-y-1">
                            {/* Me Row */}
                            <div className="flex justify-between items-center p-3 hover:bg-background rounded-lg transition-colors border-b border-border/50">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mr-3">
                                        ME
                                    </div>
                                    <div>
                                        <p className="text-textMain font-bold text-sm">Me (Owner)</p>
                                        <p className={`text-[10px] font-bold ${currentMonthHistory['ME'] ? 'text-emerald-500' : 'text-secondary'}`}>
                                            {currentMonthHistory['ME'] ? 'PAID' : 'UNPAID'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                     <button 
                                        onClick={() => togglePaymentStatus('ME')}
                                        className={`p-1 rounded-full transition-colors ${currentMonthHistory['ME'] ? 'text-emerald-500' : 'text-secondary hover:text-textMain'}`}
                                    >
                                        {currentMonthHistory['ME'] ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                    </button>
                                </div>
                            </div>

                            {/* Shared People Rows */}
                            {sharedPeople.map(person => {
                                const isPaid = currentMonthHistory[person];
                                const friendDetails = availableFriends.find(f => f.name === person);
                                
                                return (
                                    <div key={person} className="flex justify-between items-center p-3 hover:bg-background rounded-lg transition-colors">
                                        <div className="flex items-center">
                                            {friendDetails ? (
                                                <img src={friendDetails.avatar} className="w-8 h-8 rounded-full mr-3" alt={person} />
                                            ) : (
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                                    {person.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-textMain font-medium text-sm">{person}</p>
                                                <p className={`text-[10px] font-bold ${isPaid ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {isPaid ? 'PAID' : 'PENDING'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            {!isPaid && (
                                                <button 
                                                    onClick={() => handleNudge(person)}
                                                    disabled={loadingNudge === person}
                                                    className="p-2 text-accent bg-accent/10 rounded-full hover:bg-accent hover:text-white transition-colors"
                                                    title="Send Naughty Reminder"
                                                >
                                                    {loadingNudge === person ? <span className="block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <MessageCircle size={16} />}
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => togglePaymentStatus(person)}
                                                className={`p-1 rounded-full transition-colors ${isPaid ? 'text-emerald-500' : 'text-secondary hover:text-textMain'}`}
                                            >
                                                {isPaid ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                </div>
            </div>
        </div>

        {/* Reactivation Modal */}
        {showReactivateModal && (
             <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
                <div className="bg-surface w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-in border border-border">
                    <h3 className="text-lg font-bold text-textMain mb-2">Resuming Subscription?</h3>
                    <p className="text-sm text-secondary mb-6">
                        Are you continuing the same billing cycle (mistake) or starting a fresh one (after a gap)?
                    </p>
                    <div className="space-y-3">
                         <button 
                            onClick={handleStartNewCycle}
                            className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 flex items-center justify-center"
                        >
                            <PlayCircle size={18} className="mr-2" /> Start New Cycle (Gap)
                        </button>
                        <button 
                            onClick={handleResumeExisting}
                            className="w-full bg-surface border border-border text-textMain py-3 rounded-xl font-bold hover:bg-background flex items-center justify-center"
                        >
                            <RotateCcw size={18} className="mr-2" /> Continue Existing
                        </button>
                        <button 
                            onClick={() => setShowReactivateModal(false)}
                            className="w-full text-secondary py-2 text-sm hover:text-textMain"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Nudge Modal */}
        {nudgeMessage && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
                <div className="bg-surface w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-in border border-border">
                    <div className="flex justify-center mb-4">
                        <div className="bg-accent/10 p-3 rounded-full text-accent">
                             <AlertTriangle size={32} />
                        </div>
                    </div>
                    <h3 className="text-center font-bold text-lg text-textMain mb-2">Naughty Reminder</h3>
                    <div className="bg-background p-4 rounded-xl border border-border mb-4 relative group">
                        <p className="text-textMain font-medium italic">"{nudgeMessage}"</p>
                        <button 
                           onClick={() => {
                               navigator.clipboard.writeText(nudgeMessage);
                               onShowToast("Copied to clipboard!");
                           }}
                           className="absolute top-2 right-2 p-1 bg-surface rounded text-secondary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setNudgeMessage(null)} 
                            className="py-3 rounded-xl font-bold text-secondary hover:bg-background transition-colors"
                        >
                            Dismiss
                        </button>
                        <button 
                             onClick={() => sendNotification("Friend")}
                            className="bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity flex justify-center items-center"
                        >
                            <Bell size={16} className="mr-2" /> Notify
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default SubscriptionDetail;
