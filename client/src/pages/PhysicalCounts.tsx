import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp, useUser } from '../store';
import { Modal } from '../components/overlays';
import {
  Badge,
  Card,
  Delta,
  Empty,
  Field,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import type { Adjustment, AdjustmentReason } from '../types';

const REASONS: AdjustmentReason[] = [
  'Damaged in Transit',
  'Missing / Investigation',
  'Incorrect Entry / Counting Error',
  'Scrap / Wear & Tear',
  'Supplier Surplus',
  'Other',
];

export default function PhysicalCounts() {
  const { snap, run, busy } = useApp();
  const user = useUser();
  const [approving, setApproving] = useState<Adjustment | null>(null);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('Scrap / Wear & Tear');
  const [memo, setMemo] = useState('');

  if (!snap) return null;

  const open = approving;
  const impact = open ? (Number(counted || 0) - open.recorded) * (snap.products.find((p) => p.sku === open.sku)?.unitCost ?? 0) : 0;

  const startApproval = (a: Adjustment) => {
    setApproving(a);
    setCounted(String(a.counted));
    setReason(a.reason);
    setMemo(a.memo);
  };

  return (
    <>
      <PageHeader
        eyebrow="Stock integrity"
        title="Physical Counts"
        subtitle="Cycle counting and variance reconciliation. A count moves nothing until it is approved — approval writes one immutable ledger row signed by the approver."
        actions={
          <Link to="/products" className="btn btn-outline">
            <Icon name="inventory_2" size={16} /> Start from a SKU
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Pending approval', value: snap.adjustments.filter((a) => a.state === 'Pending Approval').length, icon: 'pending_actions', tone: 'text-warning' },
          { label: 'Approved, not posted', value: snap.adjustments.filter((a) => a.state === 'Approved').length, icon: 'rule', tone: 'text-tertiary' },
          { label: 'Posted to ledger', value: snap.adjustments.filter((a) => a.state === 'Posted').length, icon: 'task_alt', tone: 'text-success' },
        ].map((k) => (
          <Card key={k.label} className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container">
              <Icon name={k.icon} size={18} className={k.tone} />
            </span>
            <div>
              <p className="tnum text-[20px] leading-none font-extrabold">{k.value}</p>
              <p className="text-[11px] text-on-surface/55">{k.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-outline-variant px-4 py-2.5">
            <SectionTitle icon="assignment">Count sheets</SectionTitle>
          </div>
          {snap.adjustments.length === 0 ? (
            <Empty icon="fact_check" title="No counts recorded" detail="Post a variance from any product page to open a count sheet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-outline-variant bg-surface-low">
                  <tr>
                    <th className="th">Ref</th>
                    <th className="th">SKU</th>
                    <th className="th">Location</th>
                    <th className="th text-right">Book</th>
                    <th className="th text-right">Counted</th>
                    <th className="th text-right">Δ</th>
                    <th className="th text-right">Impact</th>
                    <th className="th">State</th>
                    <th className="th text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {snap.adjustments.map((a) => (
                    <tr key={a.ref} className="row">
                      <td className="td">
                        <Ref className="text-[11.5px]">{a.ref}</Ref>
                      </td>
                      <td className="td max-w-56">
                        <Link to={`/products/${a.sku}`} className="block truncate text-[12px] font-semibold hover:text-primary hover:underline">
                          {a.sku}
                        </Link>
                        <span className="block truncate text-[10px] text-on-surface/50">{a.reason}</span>
                      </td>
                      <td className="td">
                        <Ref className="text-[11px]">{a.location}</Ref>
                      </td>
                      <td className="td tnum text-right font-mono text-[11.5px]">{a.recorded}</td>
                      <td className="td tnum text-right font-mono text-[11.5px] font-bold">{a.counted}</td>
                      <td className="td text-right">
                        <Delta value={a.delta} />
                      </td>
                      <td className="td tnum text-right font-mono text-[11.5px] font-semibold">
                        {snap.settings.currency}
                        {a.valuationImpact.toLocaleString('en-IN')}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge value={a.state} dot />
                          {a.dualSignoff && <Badge tone="warn">Dual sign-off</Badge>}
                        </div>
                      </td>
                      <td className="td text-right">
                        {a.state !== 'Posted' ? (
                          <button className="btn btn-primary !px-2.5 !py-1" onClick={() => startApproval(a)}>
                            <Icon name="approval" size={14} /> Approve
                          </button>
                        ) : (
                          <Link
                            to={`/products/${a.sku}`}
                            className="btn btn-outline !px-2 !py-1"
                            title="View SKU"
                          >
                            <Icon name="open_in_new" size={14} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle icon="policy">Dual sign-off policy</SectionTitle>
            <p className="text-[12px] leading-relaxed text-on-surface/70">
              A count needs a second approver when either threshold is crossed. The check runs on
              the server, so the UI cannot be bypassed.
            </p>
            <ul className="mt-3 space-y-2 text-[12px]">
              <li className="flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-2">
                <span className="text-on-surface/65">Absolute impact</span>
                <span className="tnum font-mono font-bold">
                  {snap.settings.currency}
                  {snap.settings.dualSignoffThreshold.toLocaleString('en-IN')}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg bg-surface-low px-3 py-2">
                <span className="text-on-surface/65">Variance %</span>
                <span className="tnum font-mono font-bold">{snap.settings.dualSignoffVariancePct}%</span>
              </li>
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-on-surface/55">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              Counts currently flagged: {snap.adjustments.filter((a) => a.dualSignoff).length}
            </p>
          </Card>

          <Card className="p-4">
            <SectionTitle icon="menu_book">Reasons</SectionTitle>
            <ul className="space-y-1.5">
              {REASONS.map((r) => (
                <li key={r} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-on-surface/70">{r}</span>
                  <span className="tnum font-mono text-[11px] text-outline">
                    {snap.adjustments.filter((a) => a.reason === r).length}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={!!open}
        onClose={() => setApproving(null)}
        title={`Approve count ${open?.ref ?? ''}`}
        width="max-w-xl"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setApproving(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !open}
              onClick={() => {
                if (!open) return;
                void run(
                  `Count ${open.ref}`,
                  () =>
                    api.postAdjustment({
                      ref: open.ref,
                      counted: Number(counted),
                      reason,
                      memo
                    }),
                  { success: `${open.ref} posted to the ledger` },
                ).then((r) => {
                  if (r) setApproving(null);
                });
              }}
            >
              <Icon name="publish" size={16} /> Post to ledger
            </button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="card bg-surface-low p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container/12 text-primary">
                  <Icon name="inventory_2" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold">{open.sku}</p>
                  <Ref className="text-[11px] text-on-surface/55">{open.location}</Ref>
                </div>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-on-surface/70">
                {open.memo}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-outline-variant bg-surface-low p-2.5 text-center">
                <p className="text-[10px] font-bold tracking-wide text-on-surface/50 uppercase">Book</p>
                <p className="tnum mt-0.5 font-mono text-[17px] font-extrabold">{open.recorded}</p>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface-low p-2.5 text-center">
                <p className="text-[10px] font-bold tracking-wide text-on-surface/50 uppercase">Counted</p>
                <p className="tnum mt-0.5 font-mono text-[17px] font-extrabold text-primary">
                  {counted || '—'}
                </p>
              </div>
              <div
                className={`rounded-lg border p-2.5 text-center ${
                  Number(counted) - open.recorded === 0
                    ? 'border-outline-variant bg-surface-low'
                    : Number(counted) > open.recorded
                      ? 'border-success/30 bg-success-container'
                      : 'border-error/30 bg-error-container'
                }`}
              >
                <p className="text-[10px] font-bold tracking-wide text-on-surface/50 uppercase">Variance</p>
                <p className="tnum mt-0.5 font-mono text-[17px] font-extrabold">
                  {Number(counted || 0) - open.recorded > 0 ? '+' : ''}
                  {Number(counted || 0) - open.recorded}
                </p>
              </div>
            </div>

            <Field label="Recount quantity" hint="Change this if the physical recount differs from the sheet.">
              <input
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                className="field tnum font-mono"
              />
            </Field>

            <Field label="Reason">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as AdjustmentReason)}
                className="field"
              >
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="Approval memo">
              <textarea
                rows={2}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="field resize-none"
              />
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-low px-3 py-2.5">
              <span className="text-[12px] font-semibold">Valuation impact</span>
              <span className="flex items-baseline gap-2">
                <span
                  className={`tnum font-mono text-[14px] font-bold ${impact < 0 ? 'text-error' : impact > 0 ? 'text-success' : ''}`}
                >
                  {snap.settings.currency}
                  {impact.toLocaleString('en-IN')}
                </span>
              </span>
            </div>

            {Math.abs(impact) >= snap.settings.dualSignoffThreshold && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-container px-3 py-2 text-[11.5px] text-on-warning-container">
                <Icon name="verified_user" size={16} className="mt-px shrink-0" />
                Posting as <b>{user.name}</b> ({user.role}). This variance exceeds the dual
                sign-off threshold — in a production rollout a second approver would be captured
                alongside this signature.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
