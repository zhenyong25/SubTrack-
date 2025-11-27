
import React, { useState, useEffect } from 'react';
import { UserProfile, CURRENCIES, Friend } from '../types';
import { User, Trash2, Download, Moon, Sun, Monitor, Save, Users, Bell, LogIn, Plus, X, Search, Loader2, Check } from 'lucide-react';
import { exportSubscriptionsToCSV, getFriends, saveFriends } from '../services/storageService';

interface SettingsProps {
    currentProfile: UserProfile;
    onUpdateProfile: (p: UserProfile) => void;
    onToggleTheme: () => void;
    isDark: boolean;
    onClearData: () => void;
    subscriptions: any[];
}

const Settings: React.FC<SettingsProps> = ({ currentProfile, onUpdateProfile, onToggleTheme, isDark, onClearData, subscriptions }) => {
    const [name, setName] = useState(currentProfile.name);
    const [currency, setCurrency] = useState(currentProfile.currency);
    const [notificationDays, setNotificationDays] = useState(currentProfile.notificationDays || 3);
    const [saved, setSaved] = useState(false);

    // Friend Management State
    const [friends, setFriends] = useState<Friend[]>([]);
    const [friendInput, setFriendInput] = useState('');
    const [isSearchingFriend, setIsSearchingFriend] = useState(false);

    useEffect(() => {
        setName(currentProfile.name);
        setCurrency(currentProfile.currency);
        setNotificationDays(currentProfile.notificationDays || 3);
        setFriends(currentProfile.friends || getFriends());
    }, [currentProfile]);

    const handleSave = () => {
        const updatedFriends = friends;
        saveFriends(updatedFriends); // Persist separately
        
        onUpdateProfile({ 
            ...currentProfile, 
            name, 
            currency,
            notificationDays,
            friends: updatedFriends
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleGoogleLogin = () => {
        // Simulated Login
        if (!currentProfile.isLoggedIn) {
            onUpdateProfile({
                ...currentProfile,
                isLoggedIn: true,
                name: currentProfile.name || 'Demo User',
                email: 'demo.user@gmail.com',
                photoUrl: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
            });
            setName(name || 'Demo User');
        } else {
            // Logout
             onUpdateProfile({
                ...currentProfile,
                isLoggedIn: false,
                email: undefined,
                photoUrl: undefined
            });
        }
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
            saveFriends(updated);
            onUpdateProfile({ ...currentProfile, friends: updated });
        }, 800);
    };

    const removeFriend = (id: string) => {
        const updated = friends.filter(f => f.id !== id);
        setFriends(updated);
        saveFriends(updated);
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
                            <button onClick={handleGoogleLogin} className="text-xs text-red-500 font-bold hover:underline">Sign Out</button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleGoogleLogin}
                            className="w-full bg-white dark:bg-slate-800 border border-border text-textMain font-bold py-3 rounded-lg flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>
                    )}
                </div>
            </div>

            {/* Profile Settings */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                 <h3 className="font-bold text-lg text-textMain mb-4">Preferences</h3>
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
                         <select 
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-3 text-textMain focus:border-primary outline-none"
                         >
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
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


            {/* Appearance */}
            <div className="bg-surface rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center mb-4 text-primary">
                    <Monitor size={20} className="mr-2" />
                    <h3 className="font-bold text-lg">App Settings</h3>
                </div>
                
                <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium text-textMain">Theme Mode</span>
                    <button 
                        onClick={onToggleTheme}
                        className="bg-background border border-border p-2 rounded-lg text-secondary hover:text-textMain transition-colors flex items-center"
                    >
                        {isDark ? <><Moon size={16} className="mr-2" /> Dark</> : <><Sun size={16} className="mr-2" /> Light</>}
                    </button>
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
                    
                    <button 
                        onClick={onClearData}
                        className="w-full border border-red-200 bg-red-50 text-red-600 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400 font-medium py-3 rounded-lg flex items-center justify-center transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                    >
                        <Trash2 size={18} className="mr-2" /> Clear All Data
                    </button>
                    <p className="text-[10px] text-center text-secondary">
                        Version 1.2.0 • Storage: Local
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
