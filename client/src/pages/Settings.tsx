import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import {
  Badge,
  Card,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import type { Settings } from '../types';

export default function SettingsPage() {
  const { snap, run, busy } = useApp();
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (snap) setDraft(snap.settings);
  }, [snap?.settings]);

  if (!snap || !draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(snap.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Inventory policy. The negative-stock switch is the guardrail that decides whether a short dispatch is refused or allowed to clamp at zero."
        actions={
          <>
            <button
              className="btn btn-outline"
              disabled={!dirty || busy}
              onClick={() => setDraft(snap.settings)}
            >
              <Icon name="undo" size={16} /> Discard
            </button>
            <button
              className="btn btn-primary"
              disabled={!dirty || busy}
              onClick={() => void run('Settings', () => api.saveSettings(draft), { success: 'Settings saved' })}
            >
              <Icon name="save" size={16} /> Save settings
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon="shield_lock">Stock guardrails</SectionTitle>

          <Toggle
            on={draft.preventNegativeStock}
            onChange={(v) => set('preventNegativeStock', v)}
            title="Prevent negative stock"
            detail="When on, dispatching more than you hold is rejected with a 422 and the transaction is rolled back. When off, the shortage is clamped at zero and flagged on the ledger."
          />

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
                Valuation method
              </p>
              <div className="flex gap-2">
                {(['FIFO', 'AVCO'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set('valuationMethod', m)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition ${
                      draft.valuationMethod === m
                        ? 'border-primary bg-primary-container/10'
                        : 'border-outline-variant hover:bg-surface-low'
                    }`}
                  >
                    <span className="block text-[12.5px] font-bold">{m}</span>
                    <span className="mt-0.5 block text-[10.5px] text-on-surface/55">
                      {m === 'FIFO'
                        ? 'Oldest stock is consumed first'
                        : 'Weighted average cost'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
                Removal strategy
              </p>
              <div className="flex gap-2">
                {(['FIFO', 'FEFO'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set('removalStrategy', m)}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition ${
                      draft.removalStrategy === m
                        ? 'border-primary bg-primary-container/10'
                        : 'border-outline-variant hover:bg-surface-low'
                    }`}
                  >
                    <span className="block text-[12.5px] font-bold">{m}</span>
                    <span className="mt-0.5 block text-[10.5px] text-on-surface/55">
                      {m === 'FIFO' ? 'First in, first out' : 'First expiry, first out'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
                Reporting currency
              </p>
              <div className="flex gap-2">
                {['₹', '$', '€', '£'].map((c) => (
                  <button
                    key={c}
                    onClick={() => set('currency', c)}
                    className={`h-9 w-11 rounded-lg border font-mono text-[14px] font-bold transition ${
                      draft.currency === c
                        ? 'border-primary bg-primary-container/10 text-primary'
                        : 'border-outline-variant hover:bg-surface-low'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon="verified_user">Dual sign-off</SectionTitle>
          <p className="mb-4 text-[12px] leading-relaxed text-on-surface/65">
            Counts whose valuation impact or variance percentage crosses either threshold are
            flagged for a second approver.
          </p>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
              Absolute impact threshold
              <span className="tnum font-mono text-[12px] text-on-surface">
                {draft.currency}
                {draft.dualSignoffThreshold.toLocaleString('en-IN')}
              </span>
            </span>
            <input
              type="range"
              min={500}
              max={50000}
              step={500}
              value={draft.dualSignoffThreshold}
              onChange={(e) => set('dualSignoffThreshold', Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
              Variance percentage
              <span className="tnum font-mono text-[12px] text-on-surface">
                {draft.dualSignoffVariancePct}%
              </span>
            </span>
            <input
              type="range"
              min={0.5}
              max={25}
              step={0.5}
              value={draft.dualSignoffVariancePct}
              onChange={(e) => set('dualSignoffVariancePct', Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </label>

          <div className="mt-5 rounded-lg border border-outline-variant bg-surface-low p-3.5">
            <p className="text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
              Currently flagged
            </p>
            <ul className="mt-2 space-y-1.5">
              {snap.adjustments.map((a) => {
                const pct = a.recorded === 0 ? 100 : (Math.abs(a.delta) / a.recorded) * 100;
                const flagged =
                  Math.abs(a.valuationImpact) >= draft.dualSignoffThreshold ||
                  pct >= draft.dualSignoffVariancePct;
                return (
                  <li key={a.ref} className="flex items-center gap-2 text-[11.5px]">
                    <Ref className="text-[11px]">{a.ref}</Ref>
                    <span className="min-w-0 flex-1 truncate text-on-surface/60">{a.sku}</span>
                    <span className="tnum font-mono text-[10.5px]">
                      {a.delta > 0 ? '+' : ''}
                      {a.delta} · {pct.toFixed(1)}%
                    </span>
                    {flagged ? (
                      <Badge tone="warn">Flagged</Badge>
                    ) : (
                      <Badge tone="success">Clear</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon="manage_accounts">Team &amp; roles</SectionTitle>
          <p className="mb-3 text-[12px] text-on-surface/60">
            Switch the active user from the top bar. Every stock move is signed with whoever is
            logged in, so the audit trail reflects real accountability.
          </p>
          <ul className="divide-y divide-outline-variant">
            {snap.users.map((u) => (
              <li key={u.name} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tertiary text-[11px] font-bold text-on-tertiary">
                  {u.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold">{u.name}</span>
                  <span className="block text-[10.5px] text-on-surface/50">{u.role}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[10px] text-on-surface/45">Auditor ID</span>
                  <Ref className="text-[11px]">{u.auditorId}</Ref>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle icon="science">Demo data</SectionTitle>
          <p className="mb-3 text-[12px] leading-relaxed text-on-surface/65">
            Reset restores the seeded catalogue, the six receipts, six deliveries, three transfers
            and three count sheets — including the blocked <Ref>WH/OUT/0001</Ref> dispatch that
            demonstrates the zero-floor rule.
          </p>
          <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-3">
            {[
              ['Products', snap.dashboard.catalogSkus],
              ['Receipts', snap.receipts.length],
              ['Deliveries', snap.deliveries.length],
              ['Transfers', snap.transfers.length],
              ['Counts', snap.adjustments.length],
              ['Ledger rows', snap.ledger.length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-outline-variant bg-surface-low px-2.5 py-2">
                <p className="text-[10px] font-bold tracking-wide text-on-surface/50 uppercase">{k}</p>
                <p className="tnum mt-0.5 font-mono text-[16px] font-extrabold">{v}</p>
              </div>
            ))}
          </div>
          <button
            className="btn btn-danger mt-4 w-full justify-center"
            disabled={busy}
            onClick={() => void run('Demo reset', () => api.reset(), { success: 'Seed data restored' })}
          >
            <Icon name="restart_alt" size={16} /> Restore seed data
          </button>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle icon="info">How the backend enforces this</SectionTitle>
        <ul className="grid gap-2 text-[12px] sm:grid-cols-2">
          {[
            {
              icon: 'block',
              title: 'Zero-floor guardrail',
              body: 'postDelivery() throws 422 when a line cannot be fully covered and the switch is on. Nothing is written — the stock map and ledger are untouched.',
            },
            {
              icon: 'compare_arrows',
              title: 'Net-zero transfers',
              body: 'postTransfer() asserts the global balance is identical before and after the move, and refuses to commit if it drifted.',
            },
            {
              icon: 'functions',
              title: 'FIFO draining',
              body: 'drainFifo() walks the source subtree in bin-code order, then other leaves deepest-first, and never drives a bin below zero.',
            },
            {
              icon: 'lock',
              title: 'Append-only ledger',
              body: 'postLedger() only ever unshifts. There is no update or delete route anywhere in the API.',
            },
            {
              icon: 'account_tree',
              title: 'Hierarchical balances',
              body: 'stockAt() sums a location and every descendant, so containers always agree with their bins.',
            },
            {
              icon: 'person',
              title: 'Attribution',
              body: 'Each move records the acting user and a verbatim note, surfaced on every ledger row.',
            },
          ].map((r) => (
            <li key={r.title} className="flex gap-2.5 rounded-lg border border-outline-variant p-3">
              <Icon name={r.icon} size={17} className="mt-px shrink-0 text-primary" />
              <div>
                <p className="text-[12.5px] font-bold">{r.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-on-surface/60">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-outline-variant bg-surface-low px-4 py-3">
        <StatusBadge value={draft.preventNegativeStock ? 'Locked' : 'Active'} dot />
        <p className="text-[12px] text-on-surface/70">
          Negative stock is currently{' '}
          <b>{draft.preventNegativeStock ? 'blocked' : 'allowed (clamped at zero)'}</b>.{' '}
          {dirty && <span className="font-semibold text-warning">You have unsaved changes.</span>}
        </p>
      </div>
    </>
  );
}

function Toggle({
  on,
  onChange,
  title,
  detail,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-3.5 text-left transition hover:border-primary/40"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
          on ? 'justify-end bg-success' : 'justify-start bg-outline-variant'
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[12.5px] font-bold">{title}</span>
        <span className="mt-1 block text-[11.5px] leading-relaxed text-on-surface/60">{detail}</span>
        <span
          className={`mt-1.5 inline-block text-[10.5px] font-bold tracking-wide uppercase ${
            on ? 'text-success' : 'text-outline'
          }`}
        >
          {on ? 'Enforced' : 'Relaxed'}
        </span>
      </span>
    </button>
  );
}
