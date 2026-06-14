
import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, Sun, Moon, CheckCircle, Plus } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import SubscriptionList from './components/SubscriptionList';
import AddSubscription from './components/AddSubscription';
import SubscriptionDetail from './components/SubscriptionDetail';
import Settings from './components/Settings';
import CardDetail from './components/CardDetail';
import { Subscription, BillingCycle, UserProfile, PaymentCard } from './types';
import { calculateNextPayment, isUpcoming, getUrgencyLevel } from './services/storageService';
import { clearStoredAppData, createDefaultProfile, getSupabaseClient, getSupabaseSession, isSupabaseConfigured, loadAppData, saveCards, saveProfile, saveSubscriptions, signOut as supabaseSignOut } from './services/appDataService';
import AppLogo from './components/AppLogo';

enum Tab {
  Dashboard = 'Dashboard',
  Subscriptions = 'Subscriptions',
  Settings = 'Settings'
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Dashboard);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>(undefined);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(isSupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  
  // Card Management State
  const [addingCard, setAddingCard] = useState<PaymentCard | null>(null);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>({ 
      name: '', 
      currency: 'USD', 
      isLoggedIn: false, 
      friends: [],
      notificationDays: 3,
  });
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Load auth state, data and theme on mount
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem('subtrack_theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }

    let authSubscription: { unsubscribe: () => void } | null = null;
    let alive = true;

    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured()) {
        setAuthChecking(false);
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        setAuthChecking(false);
        return;
      }

      const currentSession = await getSupabaseSession();
      if (!alive) return;

      setSession(currentSession);
      setAuthChecking(false);

      const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      authSubscription = data.subscription;
    };

    void bootstrapAuth();

    // Click outside handler for notifications
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      alive = false;
      authSubscription?.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapData = async () => {
      if (authChecking) return;

      if (isSupabaseConfigured() && !session) {
        setUserProfile(createDefaultProfile());
        setSubscriptions([]);
        setCards([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const loaded = await loadAppData();
        const updated = loaded.subscriptions.map(sub => {
          let next = sub.nextPaymentDate;
          if (!sub.status) sub.status = 'Active';

          if (new Date(next) < new Date() && sub.status === 'Active') {
            if (sub.billingCycle !== BillingCycle.FreeTrial) {
              next = calculateNextPayment(sub.firstPaymentDate, sub.billingCycle);
            }
          }
          return { ...sub, nextPaymentDate: next };
        });

        if (cancelled) return;

        const sessionEmail = session?.user.email;
        const sessionPhoto =
          session?.user.user_metadata?.avatar_url ||
          session?.user.user_metadata?.picture ||
          undefined;

        setUserProfile({
          ...loaded.profile,
          email: sessionEmail || loaded.profile.email,
          photoUrl: loaded.profile.photoUrl || sessionPhoto,
          isLoggedIn: Boolean(session || loaded.userId),
        });
        setSubscriptions(updated);
        setCards(loaded.cards);

        if (loaded.userId) {
          void saveProfile({ ...loaded.profile, isLoggedIn: true });
          void saveSubscriptions(updated);
        }
      } catch (error) {
        console.error('Failed to load app data', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void bootstrapData();

    return () => {
      cancelled = true;
    };
  }, [authChecking, session]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleTheme = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('subtrack_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('subtrack_theme', 'light');
    }
  };

  const handleUpdateProfile = (profile: UserProfile) => {
      setUserProfile(profile);
      void saveProfile(profile);
  };

  const handleSignOut = async () => {
      await supabaseSignOut();
      setSession(null);
      setSubscriptions([]);
      setCards([]);
      setUserProfile(createDefaultProfile());
      setSelectedSubId(null);
      setEditingSub(undefined);
      setIsAdding(false);
      setActiveTab(Tab.Dashboard);
      showToast('Signed out.');
  };

  const handleCurrencyChange = (curr: string) => {
    handleUpdateProfile({ ...userProfile, currency: curr });
  };

  const handleAddOrUpdateSubscription = (data: Omit<Subscription, 'id' | 'nextPaymentDate'>, newCard?: PaymentCard) => {
    // 1. Handle New Card Creation
    let updatedCards = [...cards];
    if (newCard) {
        // Avoid duplications if ID already exists
        if (!cards.find(c => c.id === newCard.id)) {
            updatedCards = [...cards, newCard];
            setCards(updatedCards);
            void saveCards(updatedCards);
        }
    }

    // 2. Handle Subscription
    if (editingSub) {
        const updatedList = subscriptions.map(s => s.id === editingSub.id ? { ...data, id: editingSub.id, nextPaymentDate: editingSub.nextPaymentDate } : s);
        setSubscriptions(updatedList);
        void saveSubscriptions(updatedList);
        showToast(`Updated ${data.name}`);
    } else {
        const newSub: Subscription = {
            ...data,
            id: crypto.randomUUID(),
            nextPaymentDate: calculateNextPayment(data.firstPaymentDate, data.billingCycle)
        };
        const updatedList = [...subscriptions, newSub];
        setSubscriptions(updatedList);
        void saveSubscriptions(updatedList);
        showToast(`Added ${newSub.name}`);
    }
    
    setIsAdding(false);
    setEditingSub(undefined);
    if(editingSub) setSelectedSubId(editingSub.id);
    else setActiveTab(Tab.Subscriptions);
  };

  const handleCloneSubscription = (originalSub: Subscription) => {
      const newSub: Subscription = {
          ...originalSub,
          id: crypto.randomUUID(),
          firstPaymentDate: new Date().toISOString(),
          nextPaymentDate: calculateNextPayment(new Date().toISOString(), originalSub.billingCycle),
          status: 'Active',
          cancellationDate: undefined,
          paymentHistory: {} // Start fresh history
      };
      const updatedList = [...subscriptions, newSub];
      setSubscriptions(updatedList);
      void saveSubscriptions(updatedList);
      setSelectedSubId(newSub.id); // Switch view to new sub
      showToast(`${newSub.name} renewed!`);
  };

  const handleStartEdit = (sub: Subscription) => {
      setEditingSub(sub);
      setSelectedSubId(null);
      setIsAdding(true);
  };

  const handleCancelAdd = () => {
      setIsAdding(false);
      setEditingSub(undefined);
      if(editingSub) setSelectedSubId(editingSub.id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this subscription permanently?")) {
      const updated = subscriptions.filter(s => s.id !== id);
      setSubscriptions(updated);
      void saveSubscriptions(updated);
      setSelectedSubId(null);
      showToast("Subscription deleted.");
    }
  };

  const handleClearData = async () => {
      if(confirm("This will wipe all your subscriptions and cards. Are you sure?")) {
          setSubscriptions([]);
          setCards([]);
          setUserProfile(createDefaultProfile());
          await clearStoredAppData();
          showToast("All data cleared.");
      }
  };

  const handleUpdateCard = (updatedCard: PaymentCard) => {
      const updatedCards = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
      setCards(updatedCards);
      void saveCards(updatedCards);
      showToast("Card details updated");
  };

  // Start "Add Card" flow - Open modal with blank card
  const handleAddNewCardStart = () => {
      const newCardTemplate: PaymentCard = {
          id: 'new', // Flag as new
          name: '',
          type: 'Visa',
          last4Digits: '',
          color: '#1e293b'
      };
      setAddingCard(newCardTemplate);
  };

  // Save new or existing card from modal
  const handleSaveCardFromModal = (card: PaymentCard) => {
      if (card.id === 'new') {
          // Create new
          const realNewCard = { ...card, id: crypto.randomUUID() };
          const newCards = [...cards, realNewCard];
          setCards(newCards);
          void saveCards(newCards);
          showToast("New card added");
      } else {
          // Update existing
          handleUpdateCard(card);
      }
      setAddingCard(null);
  };

  const getUpcomingNotifications = () => {
      return subscriptions
          .filter(s => s.status === 'Active' && isUpcoming(s.nextPaymentDate, userProfile.notificationDays))
          .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
  };

  if (isAdding) {
    return (
      <AddSubscription 
        onSave={handleAddOrUpdateSubscription} 
        onCancel={handleCancelAdd} 
        initialData={editingSub}
        savedCards={cards}
      />
    );
  }

  const selectedSub = subscriptions.find(s => s.id === selectedSubId);
  const upcomingNotifications = getUpcomingNotifications();

  if (authChecking || (isSupabaseConfigured() && session && isLoading)) {
    return (
      <div className="min-h-screen bg-background text-textMain flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <AppLogo />
          </div>
          <p className="text-sm font-semibold">Loading SubTrack...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured() && !session) {
    return <AuthScreen onAuthenticated={() => setAuthChecking(true)} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-textMain flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <AppLogo />
          </div>
          <p className="text-sm font-semibold">Loading SubTrack...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-textMain font-sans selection:bg-primary selection:text-white transition-colors duration-300">
      {/* Header */}
      <header className="fixed top-0 w-full z-20 bg-background/90 backdrop-blur-md border-b border-border px-6 py-4 flex justify-between items-center transition-colors duration-300">
        <div className="flex items-center space-x-3">
             <AppLogo />
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
               {userProfile.name ? `${userProfile.name}'s SubTrack` : 'SubTrack'}
            </h1>
        </div>
        <div className="flex items-center space-x-3 relative" ref={notificationRef}>
            <button 
            onClick={toggleTheme}
            className="p-2 rounded-full text-secondary hover:text-textMain transition-colors"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className={`p-2 rounded-full transition-colors relative ${showNotifications || upcomingNotifications.length > 0 ? 'text-primary' : 'text-secondary hover:text-textMain'}`}
            title="Notifications"
            >
            <Bell size={20} />
            {upcomingNotifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background"></span>
            )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
                <div className="absolute top-12 right-0 w-72 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-scale-in">
                    <div className="bg-background px-4 py-3 border-b border-border flex justify-between items-center">
                        <span className="text-sm font-bold text-textMain">Upcoming Bills</span>
                        <span className="text-[10px] text-secondary bg-background border border-border px-2 py-0.5 rounded-full">{upcomingNotifications.length}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {upcomingNotifications.length > 0 ? (
                            upcomingNotifications.map(sub => {
                                const urgency = getUrgencyLevel(sub.nextPaymentDate);
                                return (
                                    <div key={sub.id} className="p-3 border-b border-border/50 hover:bg-background/50 transition-colors flex items-center space-x-3">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: urgency === 'critical' ? '#ef4444' : '#f59e0b' }}></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-textMain truncate">{sub.name}</p>
                                            <p className="text-xs text-secondary">Due {new Date(sub.nextPaymentDate).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold">{sub.price.toFixed(2)}</p>
                                            <p className="text-[10px] text-secondary">{sub.currency}</p>
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-6 text-center text-secondary">
                                <CheckCircle size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">All bills paid for now!</p>
                            </div>
                        )}
                    </div>
                    {upcomingNotifications.length > 0 && (
                        <div className="p-2 bg-background border-t border-border text-center">
                            <p className="text-[10px] text-secondary">Alerts set to {userProfile.notificationDays} days before due.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 px-4 pb-24 max-w-2xl mx-auto">
        {activeTab === Tab.Dashboard && (
          <Dashboard 
            subscriptions={subscriptions} 
            cards={cards}
            baseCurrency={userProfile.currency}
            onCurrencyChange={handleCurrencyChange}
            onUpdateCard={handleUpdateCard}
            onAddCard={handleAddNewCardStart}
          />
        )}
        
        {activeTab === Tab.Subscriptions && (
            <SubscriptionList 
            subscriptions={subscriptions} 
            baseCurrency={userProfile.currency}
            onCurrencyChange={handleCurrencyChange}
            onDelete={handleDelete}
            onSelect={(sub) => setSelectedSubId(sub.id)}
          />
        )}

        {activeTab === Tab.Settings && (
            <Settings 
                currentProfile={userProfile}
                onUpdateProfile={handleUpdateProfile}
                onToggleTheme={toggleTheme}
                isDark={isDark}
                onClearData={handleClearData}
                onSignOut={handleSignOut}
                subscriptions={subscriptions}
            />
        )}
      </main>

      {/* Navigation Tabs */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-xl border border-border/50 shadow-2xl rounded-full px-6 py-3 flex space-x-8 z-40">
        <button 
          onClick={() => setActiveTab(Tab.Dashboard)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Dashboard ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Dashboard ? 'bg-primary/10' : 'bg-transparent'}`}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Subscriptions)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Subscriptions ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
           <div className={`p-1 rounded-lg ${activeTab === Tab.Subscriptions ? 'bg-primary/10' : 'bg-transparent'}`}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15V6" /><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path d="M12 12H3" /><path d="M16 6H3" /><path d="M12 18H3" /></svg>
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Settings)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Settings ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
           <div className={`p-1 rounded-lg ${activeTab === Tab.Settings ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
        </button>
      </nav>

      {/* Floating Add Button (Dashboard and Subscriptions) */}
      {(activeTab === Tab.Dashboard || activeTab === Tab.Subscriptions) && (
        <button 
          onClick={() => { setIsAdding(true); setEditingSub(undefined); }}
          className="fixed bottom-24 right-6 bg-primary hover:bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 z-30"
          aria-label="Add subscription"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Detail Modal */}
      {selectedSub && (
          <SubscriptionDetail 
              subscription={selectedSub}
              friends={userProfile.friends}
              onUpdate={(updated) => {
                  const updatedList = subscriptions.map(s => s.id === updated.id ? updated : s);
                  setSubscriptions(updatedList);
                  void saveSubscriptions(updatedList);
              }}
              onDelete={handleDelete}
              onEdit={handleStartEdit}
              onClone={handleCloneSubscription}
              onClose={() => setSelectedSubId(null)}
              onShowToast={showToast}
          />
      )}

      {/* Card Detail / Add Modal */}
      {addingCard && (
          <CardDetail 
              card={addingCard}
              subscriptions={subscriptions}
              baseCurrency={userProfile.currency}
              onUpdate={handleSaveCardFromModal}
              onClose={() => setAddingCard(null)}
          />
      )}

      {/* Toast Notification */}
      {toastMessage && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-surface border border-primary/20 text-textMain px-4 py-2 rounded-full shadow-lg z-50 animate-slide-up flex items-center">
              <CheckCircle size={16} className="text-primary mr-2" />
              <span className="text-sm font-bold">{toastMessage}</span>
          </div>
      )}
    </div>
  );
}

export default App;
