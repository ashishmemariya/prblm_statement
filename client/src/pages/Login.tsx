import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import type { DirectoryEntry } from '../types';

const DEMO_EMAIL = 'demo@stocksense.app';
const DEMO_PASSWORD = 'Demo@1234';

const HIGHLIGHTS = [
  {
    title: 'Every movement is auditable',
    body: 'Receipts, transfers, deliveries and count variances all land in one append-only ledger.',
  },
  {
    title: 'One number, everywhere',
    body: 'Stock, value and low-stock counts are derived from the same ledger, so pages can never disagree.',
  },
  {
    title: 'Roles that mean something',
    body: 'Warehouse staff, supervisors, managers and admins each get their own actions and screens.',
  },
];

export default function Login() {
  const { signIn, notify } = useApp();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .directory()
      .then((list) => {
        if (alive) setDirectory(list);
      })
      .catch(() => {
        /* the form still works without the shortcut list */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function attempt(nextEmail: string, nextPassword: string) {
    setBusy(true);
    setError('');
    const result = await signIn(nextEmail, nextPassword);
    setBusy(false);
    if (result.ok) {
      notify({ kind: 'success', title: 'Signed in', detail: nextEmail });
    } else {
      setError(result.error);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }
    void attempt(email.trim(), password);
  }

  const signingInAs = (who: DirectoryEntry) => {
    const pwd = who.role === 'Admin' ? 'Admin@1234' : DEMO_PASSWORD;
    setEmail(who.email);
    setPassword(pwd);
    void attempt(who.email, pwd);
  };

  return (
    <div className="min-h-screen w-full flex bg-background text-on-surface">
      {/* Brand panel */}
      <aside className="hidden lg:flex lg:w-1/2 border-r border-outline-variant bg-surface-lowest p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="w-11 h-11 rounded-card bg-primary text-on-primary flex items-center justify-center font-extrabold"
          >
            SS
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight">StockSense</div>
            <div className="text-xs text-outline font-medium">Enterprise Inventory Operations</div>
          </div>
        </div>

        <div className="my-auto max-w-lg space-y-8">
          <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight">
            Know exactly what you have, and where it is.
          </h2>
          <p className="text-sm text-outline leading-relaxed">
            StockSense keeps products, receipts, transfers, deliveries, physical counts and adjustments
            on a single reconciled ledger across every warehouse.
          </p>
          <ul className="grid gap-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="rounded-card border border-outline-variant bg-surface-low p-4">
                <div className="text-xs font-bold">{h.title}</div>
                <div className="text-xs text-outline mt-1 leading-relaxed">{h.body}</div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-outline border-t border-outline-variant pt-5">
          Signed actions are attributed to your account.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-3 lg:hidden justify-center">
            <div aria-hidden className="w-10 h-10 rounded-card bg-primary text-on-primary flex items-center justify-center font-extrabold">
              SS
            </div>
            <div className="text-lg font-extrabold tracking-tight">StockSense</div>
          </div>

          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Sign in</h1>
            <p className="text-xs text-outline mt-1">Use your account, or pick a demo role below.</p>
          </div>

          <button
            type="button"
            className="btn btn-primary w-full justify-center"
            disabled={busy}
            onClick={() => void attempt(DEMO_EMAIL, DEMO_PASSWORD)}
          >
            {busy ? 'Signing in…' : 'Continue as Inventory Manager'}
          </button>

          {directory.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-outline uppercase tracking-wider">Demo accounts</div>
              <div className="grid gap-1.5">
                {directory.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => signingInAs(u)}
                    className="flex items-center gap-3 rounded-control border border-outline-variant bg-surface-lowest px-3 py-2 text-left hover:border-primary disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container text-[11px] font-bold flex items-center justify-center"
                    >
                      {u.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold truncate">{u.name}</span>
                      <span className="block text-[11px] text-outline truncate">{u.role}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3" aria-hidden>
            <span className="flex-1 h-px bg-outline-variant" />
            <span className="text-[11px] font-semibold uppercase text-outline">or use email</span>
            <span className="flex-1 h-px bg-outline-variant" />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-control border border-error/30 bg-error-container text-on-error-container px-3.5 py-2.5 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-outline mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className="field"
                placeholder="you@stocksense.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-outline mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-[11px] text-outline text-center leading-relaxed">
            Demo password is <span className="ref">Demo@1234</span> for staff and manager accounts,{' '}
            <span className="ref">Admin@1234</span> for the administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
