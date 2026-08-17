import React, { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../services/appDataService';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Landmark,
  LineChart as LineChartIcon,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

const featurePills = [
  'Recurring bills',
  'Live investments',
  'Shared spend',
];

const snapshotStats = [
  { label: 'Net revenue', value: '$42,680.50', tone: 'emerald' },
  { label: 'Records', value: '128', tone: 'blue' },
  { label: '50% share', value: '$21,340.25', tone: 'cyan' },
  { label: 'Avg / record', value: '$333.44', tone: 'amber' },
];

const chartBars = [
  28, 44, 24, 58, 36, 66, 48, 72, 52, 64, 80, 57,
];

const ambientBars = [
  { left: '3%', height: '18%', delay: '0s', width: '18px', glow: 'bg-cyan-400/15' },
  { left: '10%', height: '24%', delay: '1.2s', width: '16px', glow: 'bg-blue-400/10' },
  { left: '18%', height: '34%', delay: '0.6s', width: '14px', glow: 'bg-emerald-400/10' },
  { left: '32%', height: '22%', delay: '1.8s', width: '16px', glow: 'bg-sky-400/12' },
  { left: '40%', height: '28%', delay: '0.9s', width: '14px', glow: 'bg-cyan-400/15' },
  { left: '58%', height: '32%', delay: '1.5s', width: '18px', glow: 'bg-blue-400/10' },
  { left: '68%', height: '25%', delay: '0.4s', width: '16px', glow: 'bg-emerald-400/10' },
  { left: '78%', height: '30%', delay: '1.1s', width: '15px', glow: 'bg-sky-400/12' },
  { left: '87%', height: '38%', delay: '0.7s', width: '17px', glow: 'bg-cyan-400/15' },
  { left: '95%', height: '22%', delay: '1.4s', width: '14px', glow: 'bg-blue-400/10' },
];

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

  const isSignIn = mode === 'signIn';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040714] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_24%),radial-gradient(circle_at_center,_rgba(59,130,246,0.08),_transparent_42%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:84px_84px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />

      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.08" />
            <stop offset="45%" stopColor="#60a5fa" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 640 C 150 612, 210 742, 312 698 S 496 546, 592 618 S 760 762, 878 694 S 1036 528, 1160 586 S 1304 724, 1440 644"
          fill="none"
          stroke="url(#heroLine)"
          strokeWidth="3"
          strokeLinecap="round"
          className="animate-stock-flow"
        />
        <path
          d="M0 640 C 150 612, 210 742, 312 698 S 496 546, 592 618 S 760 762, 878 694 S 1036 528, 1160 586 S 1304 724, 1440 644 L 1440 900 L 0 900 Z"
          fill="url(#heroArea)"
          opacity="0.42"
        />
      </svg>

      <div className="absolute inset-x-0 top-[18%] hidden h-[430px] lg:block">
        {ambientBars.map(bar => (
          <div
            key={bar.left}
            className={`absolute bottom-0 rounded-full ${bar.glow} animate-float-slow`}
            style={{
              left: bar.left,
              width: bar.width,
              height: bar.height,
              animationDelay: bar.delay,
            }}
          />
        ))}
        <div className="absolute left-[25%] top-[26%] h-3 w-3 rounded-full bg-emerald-300/40 blur-[2px] animate-pulse-glow" />
        <div className="absolute right-[18%] top-[30%] h-4 w-4 rounded-full bg-cyan-300/30 blur-[2px] animate-pulse-glow" />
        <div className="absolute left-[66%] top-[14%] h-2.5 w-2.5 rounded-full bg-blue-300/30 blur-[2px] animate-pulse-glow" />
      </div>

      <div
        className="relative z-20 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/6 shadow-[0_0_40px_rgba(59,130,246,0.18)] backdrop-blur-xl">
              <LineChartIcon size={20} className="text-cyan-300" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">SubTrack</p>
              <p className="text-sm font-semibold text-white/90">Track the costs that sneak up on you.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setMode('signIn');
              setError(null);
              setMessage(null);
            }}
            className="rounded-2xl border border-white/10 bg-white/6 px-5 py-2.5 text-sm font-bold text-white/90 backdrop-blur-xl transition-colors hover:bg-white/10"
          >
            Sign in
          </button>
        </header>

        <main className="flex flex-1 items-start lg:items-center">
          <div className="grid w-full gap-8 py-6 sm:py-8 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 lg:py-12">
            <section className="order-2 max-w-2xl lg:order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-200">
                <Sparkles size={12} />
                Personal finance
              </div>

              <h1 className="mt-8 text-5xl font-black leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Money that moves.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                Keep subscriptions, expenses, cards, income, and investments in one place with a live finance view that feels calm, fast, and obvious.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    setError(null);
                    setMessage(null);
                  }}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_18px_50px_rgba(255,255,255,0.18)] transition-transform hover:-translate-y-0.5"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signUp');
                    setError(null);
                    setMessage(null);
                  }}
                  className="rounded-2xl border border-white/10 bg-white/6 px-5 py-3 text-sm font-bold text-white/90 backdrop-blur-xl transition-colors hover:bg-white/10"
                >
                  Create account
                </button>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {featurePills.map(pill => (
                  <div key={pill} className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur-xl">
                    {pill}
                  </div>
                ))}
              </div>

              <div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                  <ShieldCheck size={18} className="text-cyan-300" />
                  <p className="mt-3 text-sm font-semibold text-white">Secure access</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">Private sign-in, clean session handling.</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                  <BarChart3 size={18} className="text-blue-300" />
                  <p className="mt-3 text-sm font-semibold text-white">Live charts</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">View movement without digging through menus.</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                  <TrendingUp size={18} className="text-emerald-300" />
                  <p className="mt-3 text-sm font-semibold text-white">Profit / loss</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">See what’s up, what’s down, and why.</p>
                </div>
              </div>
            </section>

            <section className="relative order-1 self-start overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.06] shadow-[0_32px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl lg:order-2">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.08),_transparent_32%)]" />
              <div className="relative z-10 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Today</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Revenue Snapshot</h2>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/12 px-3 py-1 text-sm font-bold text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.16)]">
                    Live
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {snapshotStats.map(stat => (
                    <div key={stat.label} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-medium text-slate-400">{stat.label}</p>
                      <p
                        className={`mt-2 text-2xl font-black tracking-tight ${
                          stat.tone === 'emerald'
                            ? 'text-emerald-300'
                            : stat.tone === 'blue'
                              ? 'text-sky-300'
                              : stat.tone === 'cyan'
                                ? 'text-cyan-300'
                                : 'text-amber-300'
                        }`}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[24px] border border-white/10 bg-black/18 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Processed documents</p>
                    <p className="text-xs text-slate-400">Last 7 days</p>
                  </div>
                  <div className="mt-5 flex h-44 items-end gap-2">
                    {chartBars.map((height, index) => (
                      <div key={index} className="flex-1">
                        <div className="flex h-full items-end rounded-t-2xl bg-gradient-to-t from-blue-500/30 via-cyan-400/50 to-emerald-300/70 p-1">
                          <div className="w-full rounded-t-xl bg-white/18" style={{ height: `${height}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="my-6 h-px w-full bg-white/10" />

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-blue-500/25">
                    <Landmark size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Secure access</p>
                    <h3 className="text-xl font-black tracking-tight text-white">{isSignIn ? 'Welcome back.' : 'Create your account.'}</h3>
                  </div>
                </div>

                <div className="mt-5 flex rounded-2xl border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signIn');
                      setError(null);
                      setMessage(null);
                    }}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all ${isSignIn ? 'bg-primary text-white shadow-lg shadow-blue-500/25' : 'text-slate-300 hover:text-white'}`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signUp');
                      setError(null);
                      setMessage(null);
                    }}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all ${!isSignIn ? 'bg-primary text-white shadow-lg shadow-blue-500/25' : 'text-slate-300 hover:text-white'}`}
                  >
                    Create Account
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-3 pl-10 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/50"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-3 pl-10 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/50"
                        placeholder="At least 6 characters"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                      {error}
                    </div>
                  )}

                  {message && (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                        <span>{message}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400 px-4 py-3.5 font-black text-white shadow-2xl shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? (
                      <Loader2 size={18} className="mr-2 animate-spin" />
                    ) : isSignIn ? (
                      <Landmark size={18} className="mr-2" />
                    ) : (
                      <UserPlus size={18} className="mr-2" />
                    )}
                    {isSignIn ? 'Enter SubTrack' : 'Create my account'}
                    <ArrowRight size={18} className="ml-2 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>

                <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>Built for subscriptions, budgeting, and investments.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode(isSignIn ? 'signUp' : 'signIn');
                      setError(null);
                      setMessage(null);
                    }}
                    className="font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
                  >
                    {isSignIn ? 'Need an account?' : 'Already have one?'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthScreen;
