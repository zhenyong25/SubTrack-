import React, { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../services/appDataService';
import { Mail, Lock, LogIn, UserPlus, Loader2 } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'signIn') {
        const { error: signInError } = await signInWithPassword(email.trim(), password);
        if (signInError) throw signInError;
        onAuthenticated();
        return;
      }

      const { data, error: signUpError } = await signUpWithPassword(email.trim(), password);
      if (signUpError) throw signUpError;

      if (data.session) {
        onAuthenticated();
      } else {
        setMessage('Account created. Check your email to confirm your sign-in.');
        setMode('signIn');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-textMain flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
            <LogIn size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">SubTrack</h1>
            <p className="text-sm text-secondary">Sign in to sync with Supabase</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-3.5 text-secondary" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-3 pl-10 text-textMain focus:border-primary outline-none"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase mb-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3.5 text-secondary" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-3 pl-10 text-textMain focus:border-primary outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-3">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin mr-2" />
            ) : mode === 'signIn' ? (
              <LogIn size={18} className="mr-2" />
            ) : (
              <UserPlus size={18} className="mr-2" />
            )}
            {mode === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setError(null);
            setMessage(null);
          }}
          className="mt-4 w-full text-sm text-secondary hover:text-textMain transition-colors"
        >
          {mode === 'signIn' ? "Need an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
