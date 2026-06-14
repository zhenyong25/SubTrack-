import React, { useState, useEffect } from 'react';
import { UserProfile, CURRENCIES, Friend, PaymentCard } from '../types';
import { User, Trash2, Download, Moon, Sun, Save, Users, Plus, X, Loader2, AlertTriangle, Settings as SettingsIcon, CreditCard, Pencil } from 'lucide-react';
import { exportSubscriptionsToCSV, getCurrencySymbol } from '../services/storageService';
import { saveFriends } from '../services/appDataService';
import CardLogo from './CardLogo';

interface SettingsProps {
    currentProfile: UserProfile;
    onUpdateProfile: (p: UserProfile) => void;
    onToggleTheme: () => void;
    isDark: boolean;
    onClearData: () => void;
    onSignOut: () => void;
    subscriptions: any[];
    cards: PaymentCard[];
    onAddCard: () => void;
    onEditCard: (card: PaymentCard) => void;
}

const Settings: React.FC<SettingsProps> = ({ currentProfile, onUpdateProfile, onToggleTheme, isDark, onClearData, onSignOut, subscriptions, cards, onAddCard, onEditCard }) => {
    const [name, setName] = useState(currentProfile.name);
    const [currency, setCurrency] = useState(currentProfile.currency);
    const [notificationDays, setNotificationDays] = useState(currentProfile.notificationDays || 3);
    
    const [saved, setSaved] = useState(false);

    // Friend Management State
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendInput, setFriendInput] = useState('');
    const [isSearchingFriend, setIsSearchingFriend] = useState(false);
    
    const [confirmClear, setConfirmClear] = useState(false);

    useEffect(() => {
        setName(currentProfile.name);
        setCurrency(currentProfile.currency);
        setNotificationDays(currentProfile.notificationDays || 3);
        setFriends(currentProfile.friends || []);
    }, [currentProfile]);

    const handleSave = () => {
        const updatedFriends = friends;
        void saveFriends(updatedFriends); // Persist separately
        
        onUpdateProfile({ 
            ...currentProfile, 
            name, 
            currency,
            notificationDays,
            friends: updatedFriends,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleAddFriend = () => {
        if (!friendInput.trim()) return;
        
        setIsSearchingFriend(true);

        // Simulate network delay for "Searching"
        setTimeout(() => {
            let friendName = friendInput.trim();
            let friendEmail = '';

            if (friendName.includes('@')) {
                // Input is email
                const parts = friendName.split('@');
                friendEmail = friendName;
                friendName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            } else {
                // Input is username
                friendEmail = `${friendName.toLowerCase().replace(/\s/g, '.')}@example.com`;
            }
            
            const newFriend: Friend = {
                id: crypto.randomUUID(),
                email: friendEmail,
                name: friendName,
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${friendName}`
            };

            const updated = [...friends, newFriend];
            setFriends(updated);
            setFriendInput('');
            setIsSearchingFriend(false);
            
            // Auto save friends
            void saveFriends(updated);
            onUpdateProfile({ ...currentProfile, friends: updated });
        }, 800);
    };

    const removeFriend = (id: string) => {
        const updated = friends.filter(f => f.id !== id);
        setFriends(updated);
        void saveFriends(updated);
        onUpdateProfile({ ...currentProfile, friends: updated });
    };

    return (
        <div className="pb-24 animate-fade-in space-y-6">
            
            {/* Account / Login Section */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center text-primary">
                        <User size={20} className="mr-2" />
                        <h3 className="font-bold text-lg">Account</h3>
                    </div>
                    {currentProfile.isLoggedIn && currentProfile.photoUrl && (
                        <img src={currentProfile.photoUrl} alt="Profile" className="w-8 h-8 rounded-full" />
                    )}
                </div>

                <div className="flex flex-col space-y-3">
                    {currentProfile.isLoggedIn ? (
                        <div className="bg-background p-3 rounded-lg border border-border flex justify-between items-center">
                            <div>
                                <p className="text-sm font-bold text-textMain">{currentProfile.name}</p>
                                <p className="text-xs text-secondary">{currentProfile.email}</p>
                            </div>
                            <button onClick={onSignOut} className="text-xs text-red-500 font-bold hover:underline">Sign Out</button>
                        </div>
                    ) : (
                        <div className="bg-background p-3 rounded-lg border border-border text-sm text-secondary">
                            Sign in from the login screen to connect this profile to Supabase.
                        </div>
                    )}
                </div>
            </div>

            {/* App Settings */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                 <div className="flex items-center mb-4 text-primary">
                    <SettingsIcon size={20} className="mr-2" />
                    <h3 className="font-bold text-lg">App Settings</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-secondary uppercase mb-1">Display Name</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none"
                            placeholder="Your Name"
                        />
                    </div>
                    <div>
                         <label className="block text-xs font-semibold text-secondary uppercase mb-1">Currency</label>
                         <div className="relative">
                            <select 
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none appearance-none"
                            >
                                {CURRENCIES.map(c => <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>)}
                            </select>
                         </div>
                    </div>
                     <div>
                         <label className="block text-xs font-semibold text-secondary uppercase mb-1">Notification Threshold (Days)</label>
                         <div className="flex items-center space-x-3">
                            <input 
                                type="range" 
                                min="1" max="7" 
                                value={notificationDays} 
                                onChange={(e) => setNotificationDays(parseInt(e.target.value))}
                                className="w-full accent-primary"
                            />
                            <span className="text-sm font-bold w-6">{notificationDays}</span>
                         </div>
                         <p className="text-[10px] text-secondary">Alert me when a bill is due in {notificationDays} days.</p>
                    </div>

                    <div className="flex justify-between items-center py-3 border-t border-border mt-2">
                        <span className="text-sm font-medium text-textMain">Theme Mode</span>
                        <button 
                            onClick={onToggleTheme}
                            className="bg-background border border-border p-2 rounded-lg text-secondary hover:text-textMain transition-colors flex items-center"
                        >
                            {isDark ? <><Moon size={16} className="mr-2" /> Dark</> : <><Sun size={16} className="mr-2" /> Light</>}
                        </button>
                    </div>

                    <button 
                        onClick={handleSave}
                        className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:opacity-90'}`}
                    >
                        {saved ? 'Saved!' : <><Save size={18} className="mr-2" /> Save Changes</>}
                    </button>
                </div>
            </div>

            {/* Friend List Manager */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center mb-4 text-primary">
                    <Users size={20} className="mr-2" />
                    <h3 className="font-bold text-lg">Friends</h3>
                </div>
                <p className="text-xs text-secondary mb-4">Add friends by username or email to split bills with them.</p>

                <div className="flex space-x-2 mb-4">
                    <div className="flex-1 relative">
                        <input 
                            type="text" 
                            value={friendInput}
                            onChange={e => setFriendInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                            placeholder="Username or Email"
                            disabled={isSearchingFriend}
                            className="w-full bg-background border border-border rounded-lg p-2 pl-3 pr-8 text-textMain text-sm focus:border-primary outline-none disabled:opacity-50"
                        />
                        {isSearchingFriend && (
                            <div className="absolute right-2 top-2.5">
                                <Loader2 size={16} className="animate-spin text-primary" />
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleAddFriend}
                        disabled={isSearchingFriend || !friendInput.trim()}
                        className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                    >
                        {isSearchingFriend ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                    </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {friends.map(friend => (
                        <div key={friend.id} className="flex items-center justify-between bg-background p-2 rounded-lg border border-border animate-fade-in">
                            <div className="flex items-center">
                                <img src={friend.avatar} alt={friend.name} className="w-8 h-8 rounded-full mr-3 border border-border" />
                                <div>
                                    <p className="text-sm font-bold text-textMain">{friend.name}</p>
                                    <p className="text-[10px] text-secondary">{friend.email}</p>
                                </div>
                            </div>
                            <button onClick={() => removeFriend(friend.id)} className="text-secondary hover:text-red-500 p-1">
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                    {friends.length === 0 && <p className="text-xs text-secondary text-center py-2">No friends added yet.</p>}
                </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center text-primary">
                        <CreditCard size={20} className="mr-2" />
                        <h3 className="font-bold text-lg">Payment Methods</h3>
                    </div>
                    <button
                        onClick={onAddCard}
                        className="bg-primary/10 text-primary px-3 py-2 rounded-lg hover:bg-primary hover:text-white transition-colors flex items-center text-sm font-semibold"
                    >
                        <Plus size={16} className="mr-1" /> Add
                    </button>
                </div>
                <p className="text-xs text-secondary mb-4">Add cards or bank accounts here, then select them when you create a subscription. For bank accounts, use the card type you prefer, or keep it as Other.</p>

                <div className="space-y-2">
                    {cards.map(card => (
                        <div key={card.id} className="bg-background p-3 rounded-lg border border-border flex items-center justify-between gap-3">
                            <div className="flex items-center min-w-0">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white mr-3 shrink-0" style={{ backgroundColor: card.color || '#1e293b' }}>
                                    <CardLogo type={card.type} name={card.name} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-textMain truncate">{card.name}</p>
                                    <p className="text-[10px] text-secondary truncate">{card.type} • •••• {card.last4Digits || '0000'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => onEditCard(card)}
                                className="text-xs font-bold text-primary hover:underline flex items-center shrink-0"
                            >
                                <Pencil size={14} className="mr-1" /> Edit
                            </button>
                        </div>
                    ))}
                    {cards.length === 0 && (
                        <div className="bg-background p-4 rounded-lg border border-dashed border-border text-center">
                            <p className="text-sm text-textMain font-medium">No payment methods yet</p>
                            <p className="text-xs text-secondary mt-1">Add a card or bank account to link subscriptions to it.</p>
                            <button onClick={onAddCard} className="mt-3 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
                                Add Payment Method
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Data Management */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                 <div className="flex items-center mb-4 text-primary">
                    <Download size={20} className="mr-2" />
                    <h3 className="font-bold text-lg">Data</h3>
                </div>
                
                <div className="space-y-3">
                    <button 
                        onClick={() => exportSubscriptionsToCSV(subscriptions)}
                        className="w-full border border-border bg-background hover:bg-surface text-textMain font-medium py-3 rounded-lg flex items-center justify-center transition-colors"
                    >
                        <Download size={18} className="mr-2" /> Export to CSV
                    </button>
                    
                    {!confirmClear ? (
                        <button 
                            onClick={() => setConfirmClear(true)}
                            className="w-full border border-red-200 bg-red-50 text-red-600 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400 font-medium py-3 rounded-lg flex items-center justify-center transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                        >
                            <Trash2 size={18} className="mr-2" /> Clear All Data
                        </button>
                    ) : (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 p-4 rounded-lg animate-scale-in">
                            <div className="flex items-center text-red-600 dark:text-red-400 mb-2">
                                <AlertTriangle size={20} className="mr-2" />
                                <span className="font-bold text-sm">Warning: Irreversible!</span>
                            </div>
                            <p className="text-xs text-secondary mb-3">This will delete all subscriptions, cards, and settings permanently.</p>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => setConfirmClear(false)}
                                    className="flex-1 bg-background border border-border py-2 rounded text-sm font-bold text-textMain"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={onClearData}
                                    className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-bold hover:bg-red-700"
                                >
                                    Confirm Delete
                                </button>
                            </div>
                        </div>
                    )}
                    <p className="text-[10px] text-center text-secondary">
                        Version 1.4.0 • Storage: Local
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
