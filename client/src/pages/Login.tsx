import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../store';
import { authService } from '../services';
import { Button, Card, Field, Icon, Input, WarnNote } from '../components/design';
import type { DirectoryEntry } from '../types';

type Step = 'signin' | 'forgot' | 'otp';

const HIGHLIGHTS = [
  {
    icon: 'receipt_long',
    title: 'Every movement is auditable',
    body: 'Receipts, transfers, deliveries and count variances all land in one append-only ledger.',
  },
  {
    icon: 'hub',
    title: 'One number, everywhere',
    body: 'Stock, value and low-stock counts are derived from the same source, so pages cannot disagree.',
  },
  {
    icon: 'badge',
    title: 'Roles that mean something',
    body: 'Managers, warehouse staff, administrators and viewers each get their own actions.',
  },
];

export default function Login() {
  const { signIn, notify } = useApp();
  const [step, setStep] = useState<Step>('signin');
  const [email, setEmail] = useState('demo@stocksense.app');
  const [password, setPassword] = useState('Demo@1234');
  const [otp, setOtp] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    authService
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
    if (result.ok) notify({ tone: 'success', title: 'Signed in', detail: nextEmail });
    else setError(result.error);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }
    void attempt(email.trim(), password);
  }

  function quickSignIn(who: DirectoryEntry) {
    const pwd = who.role === 'Admin' ? 'Admin@1234' : 'Demo@1234';
    setEmail(who.email);
    setPassword(pwd);
    void attempt(who.email, pwd);
  }

  async function sendReset() {
    if (!email.trim()) {
      setError('Enter the email address on your account.');
      return;
    }
    setBusy(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setResetMessage(res.message);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a reset.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background lg:flex-row">
      <aside className="hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex lg:w-[46%] xl:w-1/2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-primary text-on-primary">
            <Icon name="deployed_code" size={24} fill />
          </span>
          <span>
            <span className="block text-[17px] font-extrabold tracking-tight">StockSense</span>
            <span className="block text-[12px] font-medium text-text-muted">Inventory Operations Platform</span>
          </span>
        </div>

        <div className="my-auto max-w-lg space-y-7">
          <h2 className="text-[32px] leading-[1.15] font-extrabold tracking-tight xl:text-[38px]">
            Know exactly what you have, and where it is.
          </h2>
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            StockSense keeps products, receipts, transfers, deliveries, physical counts and adjustments on a single
            reconciled ledger across every warehouse.
          </p>
          <ul className="grid gap-2.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="card flex items-start gap-3 p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon name={h.icon} size={17} />
                </span>
                <span>
                  <span className="block text-[12.5px] font-bold">{h.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-border pt-5 text-[11.5px] text-text-muted">
          RECEIVE → STORE → MOVE → PICK → DELIVER → COUNT → ADJUST → AUDIT
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm space-y-5">
          <div className="flex items-center gap-3 justify-center lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-primary text-on-primary">
              <Icon name="deployed_code" size={22} fill />
            </span>
            <span className="text-[17px] font-extrabold tracking-tight">StockSense</span>
          </div>

          {step === 'signin' && (
            <>
              <div>
                <h1 className="text-[20px] font-extrabold tracking-tight">Sign in</h1>
                <p className="mt-1 text-[12.5px] text-text-muted">
                  Use your account, or pick a demo role to explore with.
                </p>
              </div>

              <Button
                variant="primary"
                size="lg"
                block
                loading={busy}
                icon="login"
                onClick={() => void attempt('demo@stocksense.app', 'Demo@1234')}
              >
                Continue as Inventory Manager
              </Button>

              {directory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10.5px] font-bold tracking-wider text-text-subtle uppercase">Demo accounts</p>
                  <div className="grid gap-1.5">
                    {directory.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={busy}
                        onClick={() => quickSignIn(u)}
                        className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left transition hover:border-primary disabled:opacity-50"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                          {u.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold">{u.name}</span>
                          <span className="block truncate text-[11px] text-text-muted">{u.title}</span>
                        </span>
                        <span className="shrink-0 text-[10.5px] font-semibold text-text-subtle">{u.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10.5px] font-semibold text-text-subtle uppercase">or use email</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {error && <WarnNote tone="danger">{error}</WarnNote>}

              <form onSubmit={onSubmit} className="space-y-3" noValidate>
                <Field label="Email address" htmlFor="email" required>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@stocksense.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Password" htmlFor="password" required>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" block loading={busy}>
                  Sign in
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('forgot');
                    setError('');
                  }}
                  className="w-full text-center text-[12px] font-semibold text-primary hover:underline"
                >
                  Forgotten your password?
                </button>
              </form>

              <p className="text-center text-[11px] leading-relaxed text-text-subtle">
                Demo password is <span className="ref">Demo@1234</span> for manager, staff and viewer accounts,{' '}
                <span className="ref">Admin@1234</span> for the administrator.
              </p>
            </>
          )}

          {step === 'forgot' && (
            <>
              <div>
                <h1 className="text-[20px] font-extrabold tracking-tight">Reset your password</h1>
                <p className="mt-1 text-[12.5px] text-text-muted">
                  Enter your account email and we will prepare a one-time code.
                </p>
              </div>
              {error && <WarnNote tone="danger">{error}</WarnNote>}
              <Card className="space-y-3 p-4">
                <Field label="Email address" htmlFor="reset-email" required>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@stocksense.app"
                  />
                </Field>
                <Button variant="primary" block loading={busy} icon="send" onClick={() => void sendReset()}>
                  Send reset code
                </Button>
              </Card>
              <button
                onClick={() => {
                  setStep('signin');
                  setError('');
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
              >
                <Icon name="arrow_back" size={15} /> Back to sign in
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <div>
                <h1 className="text-[20px] font-extrabold tracking-tight">Enter your code</h1>
                <p className="mt-1 text-[12.5px] text-text-muted">We asked for a six-digit code for {email}.</p>
              </div>
              <WarnNote tone="info">{resetMessage}</WarnNote>
              {error && <WarnNote tone="danger">{error}</WarnNote>}
              <Card className="space-y-3 p-4">
                <Field label="One-time code" htmlFor="otp" hint="Any six digits work in this prototype.">
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="text-center font-mono text-[18px] tracking-[0.3em]"
                  />
                </Field>
                <Button
                  variant="primary"
                  block
                  loading={busy}
                  disabled={otp.length !== 6}
                  onClick={() => {
                    setError('This prototype does not issue real one-time codes. Sign in with your password instead.');
                  }}
                >
                  Verify and reset
                </Button>
              </Card>
              <button
                onClick={() => {
                  setStep('signin');
                  setError('');
                }}
                className="flex w-full items-center justify-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
              >
                <Icon name="arrow_back" size={15} /> Back to sign in
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
