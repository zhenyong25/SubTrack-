import React, { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../services/appDataService';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LineChart as LineChartIcon, Loader2, Lock, Mail } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignIn = mode === 'signIn';

  const switchMode = (next: 'signIn' | 'signUp') => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignIn) {
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#040714] px-4 text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[420px] w-[420px] rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[120px]" />

      <main
        className="relative z-10 w-full max-w-sm"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_0_48px_rgba(59,130,246,0.25)] backdrop-blur-xl">
            <LineChartIcon size={24} className="text-cyan-300" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">SubTrack</h1>
          <p className="mt-2 text-sm text-slate-400">Track the costs that sneak up on you.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-7"
        >
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3 pl-10 pr-3 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/50"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3 pl-10 pr-11 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/50"
                placeholder={isSignIn ? 'Your password' : 'At least 6 characters'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400 px-4 py-3.5 font-black text-white shadow-xl shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                {isSignIn ? 'Sign in' : 'Create account'}
                <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isSignIn ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(isSignIn ? 'signUp' : 'signIn')}
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
          >
            {isSignIn ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </main>
    </div>
  );
};

export default AuthScreen;
