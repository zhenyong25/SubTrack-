
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, List, Plus, Bell, Sun, Moon, CheckCircle, Settings as SettingsIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import SubscriptionList from './components/SubscriptionList';
import AddSubscription from './components/AddSubscription';
import SubscriptionDetail from './components/SubscriptionDetail';
import Settings from './components/Settings';
import CardDetail from './components/CardDetail';
import { Subscription, BillingCycle, UserProfile, PaymentCard } from './types';
import { getSubscriptions, saveSubscriptions, calculateNextPayment, isUpcoming, getCards, saveCards } from './services/storageService';

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isDark, setIsDark] = useState(true);
  
  // Card Management State
  const [addingCard, setAddingCard] = useState<PaymentCard | null>(null);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>({ 
      name: '', 
      currency: 'USD', 
      isLoggedIn: false, 
      friends: [],
      notificationDays: 3 
  });
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load data and theme on mount
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

    // User Profile
    const savedProfile = localStorage.getItem('subtrack_profile');
    if (savedProfile) {
        setUserProfile(JSON.parse(savedProfile));
    } else {
        const savedCurrency = localStorage.getItem('subtrack_currency');
        if (savedCurrency) setUserProfile(prev => ({ ...prev, currency: savedCurrency || 'USD' }));
    }

    // Subscriptions
    const loadedSubs = getSubscriptions();
    const updated = loadedSubs.map(sub => {
      let next = sub.nextPaymentDate;
      if (!sub.status) sub.status = 'Active';

      if (new Date(next) < new Date() && sub.status === 'Active') {
         if (sub.billingCycle !== BillingCycle.FreeTrial) {
            next = calculateNextPayment(sub.firstPaymentDate, sub.billingCycle);
         }
      }
      return { ...sub, nextPaymentDate: next };
    });

    setSubscriptions(updated);
    saveSubscriptions(updated);

    // Cards
    const loadedCards = getCards();
    setCards(loadedCards);

    // Request Notification permission
    if ("Notification" in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      }
    }
  }, []);

  // Check notifications whenever subs or profile changes
  useEffect(() => {
      if (notificationsEnabled) {
          checkDueDates(subscriptions);
      }
  }, [subscriptions, userProfile.notificationDays, notificationsEnabled]);

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
      localStorage.setItem('subtrack_profile', JSON.stringify(profile));
      localStorage.setItem('subtrack_currency', profile.currency); // Keep sync
  };

  const handleCurrencyChange = (curr: string) => {
    handleUpdateProfile({ ...userProfile, currency: curr });
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      checkDueDates(subscriptions);
    }
  };

  const checkDueDates = (subs: Subscription[]) => {
    const threshold = userProfile.notificationDays || 3;
    const dueSoon = subs.filter(s => s.status === 'Active' && isUpcoming(s.nextPaymentDate, threshold));
    
    // Simple debounce check (in a real app, track sent notifications to avoid spam)
    if (dueSoon.length > 0) {
      // Logic to not spam if already notified today could go here
    }
  };

  const handleAddOrUpdateSubscription = (data: Omit<Subscription, 'id' | 'nextPaymentDate'>, newCard?: PaymentCard) => {
    // 1. Handle New Card Creation
    let updatedCards = [...cards];
    if (newCard) {
        // Avoid duplications if ID already exists
        if (!cards.find(c => c.id === newCard.id)) {
            updatedCards = [...cards, newCard];
            setCards(updatedCards);
            saveCards(updatedCards);
        }
    }

    // 2. Handle Subscription
    if (editingSub) {
        const updatedList = subscriptions.map(s => s.id === editingSub.id ? { ...data, id: editingSub.id, nextPaymentDate: editingSub.nextPaymentDate } : s);
        setSubscriptions(updatedList);
        saveSubscriptions(updatedList);
        showToast(`Updated ${data.name}`);
    } else {
        const newSub: Subscription = {
            ...data,
            id: crypto.randomUUID(),
            nextPaymentDate: calculateNextPayment(data.firstPaymentDate, data.billingCycle)
        };
        const updatedList = [...subscriptions, newSub];
        setSubscriptions(updatedList);
        saveSubscriptions(updatedList);
        showToast(`Added ${newSub.name}`);
    }
    
    setIsAdding(false);
    setEditingSub(undefined);
    if(editingSub) setSelectedSubId(editingSub.id);
    else setActiveTab(Tab.Subscriptions);
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
      saveSubscriptions(updated);
      setSelectedSubId(null);
      showToast("Subscription deleted.");
    }
  };

  const handleClearData = () => {
      if(confirm("This will wipe all your subscriptions and cards. Are you sure?")) {
          setSubscriptions([]);
          setCards([]);
          saveSubscriptions([]);
          saveCards([]);
          showToast("All data cleared.");
      }
  };

  const handleUpdateCard = (updatedCard: PaymentCard) => {
      const updatedCards = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
      setCards(updatedCards);
      saveCards(updatedCards);
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
          saveCards(newCards);
          showToast("New card added");
      } else {
          // Update existing
          handleUpdateCard(card);
      }
      setAddingCard(null);
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

  return (
    <div className="bg-background min-h-screen text-textMain font-sans selection:bg-primary selection:text-white transition-colors duration-300">
      {/* Header */}
      <header className="fixed top-0 w-full z-20 bg-background/90 backdrop-blur-md border-b border-border px-6 py-4 flex justify-between items-center transition-colors duration-300">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
          {userProfile.name ? `${userProfile.name}'s SubTrack` : 'SubTrack'}
        </h1>
        <div className="flex items-center space-x-3">
            <button 
            onClick={toggleTheme}
            className="p-2 rounded-full text-secondary hover:text-textMain transition-colors"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
            onClick={enableNotifications}
            className={`p-2 rounded-full transition-colors ${notificationsEnabled ? 'text-primary bg-primary/10' : 'text-secondary hover:text-textMain'}`}
            title={notificationsEnabled ? "Notifications On" : "Enable Notifications"}
            >
            <Bell size={20} />
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pt-24 px-4 max-w-2xl mx-auto min-h-screen pb-24">
        <div className="mb-6 flex items-center justify-between">
           <h2 className="text-3xl font-bold text-textMain">{activeTab}</h2>
           {activeTab === Tab.Subscriptions && (
             <span className="bg-surface px-3 py-1 rounded-full text-xs font-mono text-secondary border border-border">
               {subscriptions.filter(s => s.status === 'Active').length} Active
             </span>
           )}
        </div>

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
                subscriptions={subscriptions}
            />
        )}
      </main>

      {/* Floating Add Button */}
      {!selectedSubId && activeTab !== Tab.Settings && (
          <button
            onClick={() => setIsAdding(true)}
            className="fixed bottom-24 right-6 bg-primary hover:bg-indigo-500 text-white w-14 h-14 rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center z-30 transition-transform hover:scale-105 active:scale-95"
          >
            <Plus size={28} />
          </button>
      )}

      {/* Detail View Modal */}
      {selectedSub && (
          <SubscriptionDetail 
              subscription={selectedSub}
              onUpdate={(updated) => {
                  const newList = subscriptions.map(s => s.id === updated.id ? updated : s);
                  setSubscriptions(newList);
                  saveSubscriptions(newList);
              }}
              onEdit={handleStartEdit}
              onDelete={handleDelete}
              onClose={() => setSelectedSubId(null)}
              onShowToast={showToast}
          />
      )}

      {/* Add Card Modal */}
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
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-surface border border-emerald-500/20 shadow-xl rounded-full px-6 py-3 flex items-center space-x-3 z-50 animate-fade-in">
              <CheckCircle size={20} className="text-emerald-500" />
              <span className="text-sm font-bold text-textMain">{toastMessage}</span>
          </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-surface/90 backdrop-blur-lg border-t border-border pb-safe pt-2 z-20 transition-colors duration-300">
        <div className="flex justify-around items-center max-w-2xl mx-auto h-16">
          <button 
            onClick={() => setActiveTab(Tab.Dashboard)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === Tab.Dashboard ? 'text-primary' : 'text-secondary hover:text-textMain'}`}
          >
            <LayoutDashboard size={22} strokeWidth={activeTab === Tab.Dashboard ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          
          <button 
            onClick={() => setActiveTab(Tab.Subscriptions)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === Tab.Subscriptions ? 'text-primary' : 'text-secondary hover:text-textMain'}`}
          >
            <List size={22} strokeWidth={activeTab === Tab.Subscriptions ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Subscriptions</span>
          </button>

          <button 
            onClick={() => setActiveTab(Tab.Settings)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === Tab.Settings ? 'text-primary' : 'text-secondary hover:text-textMain'}`}
          >
            <SettingsIcon size={22} strokeWidth={activeTab === Tab.Settings ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
