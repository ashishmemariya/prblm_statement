import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../store';
import { Drawer, Modal } from '../components/overlays';
import {
  Badge,
  Card,
  Delta,
  Empty,
  Field,
  Icon,
  PageHeader,
  Ref,
  Segmented,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import type { Product, Snapshot } from '../types';

const STATUS_RING: Record<string, string> = {
  IN_STOCK: 'ring-success/25',
  LOW: 'ring-warning/30',
  OUT: 'ring-error/30',
};

const stockTone = (p: Product): string => {
  if (p.total === 0) return 'text-error';
  if (p.status === 'LOW') return 'text-warning';
  return 'text-on-surface';
};

/** Book quantity held in a location subtree, mirroring the server's roll-up. */
function bookQtyIn(p: Product, code: string, snap: Snapshot): number {
  if (!code) return p.total;
  if (!snap.locations.some((l) => l.code === code)) return p.total;
  const scope = new Set<string>([code]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of snap.locations) {
      if (l.parent && scope.has(l.parent) && !scope.has(l.code)) {
        scope.add(l.code);
        grew = true;
      }
    }
  }
  return [...scope].reduce((a, k) => a + (p.stock[k] ?? 0), 0);
}

/* ------------------------------------------------------------------ *
 * List page
 * ------------------------------------------------------------------ */

export default function Products() {
  const { snap, busy } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [status, setStatus] = useState('All');
  const [view, setView] = useState<'grid' | 'ledger'>('grid');
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [history, setHistory] = useState<Product | null>(null);

  const categories = useMemo(
    () => ['All', ...new Set((snap?.products ?? []).map((p) => p.category))],
    [snap],
  );

  const rows = useMemo(() => {
    let list = snap?.products ?? [];
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s),
      );
    }
    if (cat !== 'All') list = list.filter((p) => p.category === cat);
    if (status !== 'All') list = list.filter((p) => p.status === status);
    return list;
  }, [snap, q, cat, status]);

  const totals = useMemo(
    () => ({
      units: rows.reduce((a, p) => a + p.total, 0),
      value: rows.reduce((a, p) => a + p.total * p.unitCost, 0),
      reserved: rows.reduce((a, p) => a + p.reserved, 0),
      flagged: rows.filter((p) => p.status !== 'IN_STOCK').length,
    }),
    [rows],
  );

  return (
    <>
      <PageHeader
        eyebrow="Inventory master"
        title="Products & Stock"
        subtitle="Per-SKU cockpit with warehouse breakdown, soft reservations and reorder thresholds. Adjustments post straight to the immutable ledger."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Cockpit', icon: 'grid_view' },
              { value: 'ledger', label: 'Stock ledger', icon: 'table_rows' },
            ]}
          />
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="Search" className="min-w-52 flex-1">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-outline">
              <Icon name="search" size={16} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or SKU…"
              className="field !pl-8"
            />
          </div>
        </Field>
        <Field label="Category" className="min-w-44">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="field">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Health" className="min-w-36">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field">
            {['All', 'IN_STOCK', 'LOW', 'OUT'].map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All health states' : s === 'IN_STOCK' ? 'In stock' : s === 'LOW' ? 'Low stock' : 'Out of stock'}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-4 border-l border-outline-variant pl-4 text-[11.5px]">
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-on-surface">{rows.length}</b> SKUs
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-on-surface">{totals.units.toLocaleString('en-IN')}</b> units
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-on-surface">
              {snap?.settings.currency}
              {(totals.value / 1e5).toFixed(1)}L
            </b>{' '}
            value
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-warning">{totals.reserved}</b> reserved
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-error">{totals.flagged}</b> flagged
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty icon="inventory_2" title="No products match these filters" detail="Try clearing the search box or resetting the health filter." />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <article
              key={p.sku}
              className={`card animate-in group flex flex-col p-4 ring-1 transition hover:border-primary/40 hover:shadow-md ${STATUS_RING[p.status] ?? ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container/12 text-primary">
                  <Icon name={p.icon} size={21} fill />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/products/${p.sku}`}
                    className="block truncate text-[13px] leading-tight font-bold hover:text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="ref mt-0.5 truncate text-[10.5px] text-on-surface/50">{p.sku}</p>
                </div>
                <StatusBadge value={p.status} dot />
              </div>

              <div className="mt-3 flex items-end gap-1.5">
                <span className={`tnum text-[28px] leading-none font-extrabold ${stockTone(p)}`}>
                  {p.total}
                </span>
                <span className="mb-0.5 text-[12px] text-on-surface/55">{p.unit}</span>
                <span className="mb-0.5 ml-auto font-mono text-[11px] text-on-surface/45">
                  {snap?.settings.currency}
                  {p.unitCost.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="mt-3 space-y-1">
                {(p.byLocation ?? [])
                  .filter((l) => l.qty > 0)
                  .slice(0, 3)
                  .map((l) => {
                    const pct = p.total > 0 ? (l.qty / p.total) * 100 : 0;
                    return (
                      <div key={l.code} className="flex items-center gap-2">
                        <span className="ref w-32 shrink-0 truncate text-[10px] text-on-surface/55">
                          {l.code}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container">
                          <div className="h-full rounded-full bg-tertiary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tnum w-8 shrink-0 text-right font-mono text-[10px] font-semibold">
                          {l.qty}
                        </span>
                      </div>
                    );
                  })}
                {p.total === 0 && (
                  <p className="flex items-center gap-1.5 rounded-md bg-error-container px-2 py-1 text-[10.5px] font-semibold text-on-error-container">
                    <Icon name="error" size={13} /> No stock in any location
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-outline-variant pt-2.5 text-[10.5px]">
                <Badge tone="neutral">RO {p.reorderPoint}</Badge>
                {p.reserved > 0 && <Badge tone="warn">Reserved {p.reserved}</Badge>}
                <Badge tone="teal">Free {p.free}</Badge>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setHistory(p)}
                    className="btn btn-outline !px-2 !py-1 !text-[10.5px]"
                    title="Movement history"
                  >
                    <Icon name="history" size={13} />
                  </button>
                  <button
                    onClick={() => setAdjust(p)}
                    className="btn btn-outline !px-2 !py-1 !text-[10.5px]"
                    title="Quick adjust"
                  >
                    <Icon name="edit_note" size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-outline-variant bg-surface-low">
                <tr>
                  <th className="th">SKU</th>
                  <th className="th">Product</th>
                  <th className="th">Category</th>
                  <th className="th text-right">On hand</th>
                  <th className="th text-right">Reserved</th>
                  <th className="th text-right">Free</th>
                  <th className="th text-right">RO</th>
                  <th className="th text-right">Unit cost</th>
                  <th className="th text-right">Value</th>
                  <th className="th">Health</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((p) => (
                  <tr key={p.sku} className="row">
                    <td className="td">
                      <Ref className="text-[11.5px]">{p.sku}</Ref>
                    </td>
                    <td className="td max-w-64">
                      <Link to={`/products/${p.sku}`} className="flex items-center gap-2 hover:text-primary">
                        <Icon name={p.icon} size={16} className="shrink-0 text-primary" />
                        <span className="truncate font-semibold">{p.name}</span>
                      </Link>
                    </td>
                    <td className="td text-[11.5px] text-on-surface/60">{p.category}</td>
                    <td className={`td tnum text-right font-mono font-bold ${stockTone(p)}`}>{p.total}</td>
                    <td className="td tnum text-right font-mono text-[11.5px] text-warning">
                      {p.reserved || '—'}
                    </td>
                    <td className="td tnum text-right font-mono text-[11.5px]">{p.free}</td>
                    <td className="td tnum text-right font-mono text-[11.5px] text-on-surface/50">{p.reorderPoint}</td>
                    <td className="td tnum text-right font-mono text-[11.5px]">
                      {snap?.settings.currency}
                      {p.unitCost.toLocaleString('en-IN')}
                    </td>
                    <td className="td tnum text-right font-mono text-[11.5px] font-semibold">
                      {snap?.settings.currency}
                      {(p.total * p.unitCost).toLocaleString('en-IN')}
                    </td>
                    <td className="td">
                      <StatusBadge value={p.status} dot />
                    </td>
                    <td className="td text-right">
                      <button onClick={() => setAdjust(p)} className="btn btn-outline !px-2 !py-1">
                        <Icon name="edit_note" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <QuickAdjustDrawer
        product={adjust}
        onClose={() => setAdjust(null)}
        busy={busy}
      />

      <HistoryModal product={history} onClose={() => setHistory(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Quick adjust drawer — creates a Pending Approval count, manager posts it
 * ------------------------------------------------------------------ */

function QuickAdjustDrawer({
  product,
  onClose,
  busy,
}: {
  product: Product | null;
  onClose: () => void;
  busy: boolean;
}) {
  const { snap, run } = useApp();
  const [loc, setLoc] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('Scrap / Wear & Tear');
  const [memo, setMemo] = useState('');

  const locations = snap?.locations.filter((l) => !l.container) ?? [];
  const p = product;
  const bookQty = p && snap ? bookQtyIn(p, loc, snap) : 0;

  const delta = counted === '' ? 0 : Number(counted) - bookQty;
  const impact = delta * (p?.unitCost ?? 0);
  const dualSignoff = Math.abs(impact) >= (snap?.settings.dualSignoffThreshold ?? 0);

  const submit = async () => {
    if (!p || !loc || counted === '') return;
    const res = await run(
      `Count for ${p.sku}`,
      async () => {
        const created = await api.createCount({
          sku: p.sku,
          location: loc,
          recorded: bookQty,
          counted: Number(counted),
          reason,
          memo});
        return api.postAdjustment({
          ref: created.ref,
          counted: Number(counted),
          reason: reason as never,
          memo
        });
      },
      { success: `Count posted for ${p.sku}` },
    );
    if (res) {
      setCounted('');
      setMemo('');
      onClose();
    }
  };

  return (
    <Drawer
      open={!!p}
      onClose={onClose}
      title="Post physical count"
      subtitle={p ? `${p.name} · ${p.sku}` : ''}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !loc || counted === '' || !p}
            onClick={() => void submit()}
          >
            <Icon name="publish" size={16} /> Post to ledger
          </button>
        </>
      }
    >
      {p && (
        <div className="space-y-4">
          <div className="card bg-surface-low p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-on-surface/60">Current on hand (all locations)</span>
              <span className="tnum font-mono font-bold">
                {p.total} {p.unit}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[12px]">
              <span className="text-on-surface/60">Value at unit cost</span>
              <span className="tnum font-mono font-bold">
                {snap?.settings.currency}
                {(p.total * p.unitCost).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <Field label="Count location">
            <select value={loc} onChange={(e) => setLoc(e.target.value)} className="field">
              <option value="">Select a bin…</option>
              {locations.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Book quantity">
              <input value={bookQty} readOnly className="field tnum font-mono opacity-70" />
            </Field>
            <Field label="Physical count">
              <input
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0"
                className="field tnum font-mono"
              />
            </Field>
          </div>

          <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
              delta === 0
                ? 'border-outline-variant bg-surface-low'
                : delta > 0
                  ? 'border-success/30 bg-success-container'
                  : 'border-error/30 bg-error-container'
            }`}
          >
            <span className="text-[12px] font-semibold">Variance</span>
            <span className="flex items-baseline gap-2">
              <Delta value={delta} className="!text-[15px]" />
              <span className="tnum text-[11px] text-on-surface/60">
                {snap?.settings.currency}
                {impact.toLocaleString('en-IN')}
              </span>
            </span>
          </div>

          {dualSignoff && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-container px-3 py-2 text-[11.5px] text-on-warning-container">
              <Icon name="verified_user" size={16} className="mt-px shrink-0" />
              Variance exceeds the {snap?.settings.currency}
              {snap?.settings.dualSignoffThreshold.toLocaleString('en-IN')} dual sign-off threshold —
              a second approver is required before the books close.
            </p>
          )}

          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="field">
              {[
                'Damaged in Transit',
                'Missing / Investigation',
                'Incorrect Entry / Counting Error',
                'Scrap / Wear & Tear',
                'Supplier Surplus',
                'Other',
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>

          <Field label="Memo" hint="Recorded verbatim on the ledger row.">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="field resize-none"
              placeholder="How was the count verified?"
            />
          </Field>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ *
 * Movement history modal
 * ------------------------------------------------------------------ */

function HistoryModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { snap } = useApp();
  const p = product;
  const moves = (snap?.ledger ?? []).filter((l) => l.sku === p?.sku).slice(0, 30);

  return (
    <Modal
      open={!!p}
      onClose={onClose}
      title={`Movement history · ${p?.sku ?? ''}`}
      width="max-w-3xl"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          {p && (
            <Link to={`/products/${p.sku}`} className="btn btn-primary" onClick={onClose}>
              Open full profile
            </Link>
          )}
        </>
      }
    >
      {moves.length === 0 ? (
        <Empty icon="history" title="No stock moves yet" detail="This SKU has never been received, delivered or adjusted." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant">
          <table className="w-full">
            <thead className="border-b border-outline-variant bg-surface-low">
              <tr>
                <th className="th">When</th>
                <th className="th">Ref</th>
                <th className="th">Type</th>
                <th className="th">From → To</th>
                <th className="th text-right">Δ</th>
                <th className="th text-right">Balance</th>
                <th className="th">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {moves.map((l) => (
                <tr key={l.id} className="row">
                  <td className="td font-mono text-[10.5px] whitespace-nowrap">{l.timestamp}</td>
                  <td className="td">
                    <Ref className="text-[11px]">{l.ref}</Ref>
                  </td>
                  <td className="td">
                    <Badge tone={l.type === 'DELIVERY' ? 'error' : l.type === 'RECEIPT' ? 'success' : l.type === 'ADJUSTMENT' ? 'warn' : 'teal'}>
                      {l.type}
                    </Badge>
                  </td>
                  <td className="td max-w-56">
                    <span className="block truncate text-[11px] text-on-surface/70">
                      {l.from} → {l.to}
                    </span>
                  </td>
                  <td className="td text-right">
                    <Delta value={l.delta} />
                  </td>
                  <td className="td tnum text-right font-mono text-[11.5px]">{l.balanceAfter}</td>
                  <td className="td max-w-24 truncate text-[11px] text-on-surface/60">{l.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Detail route
 * ------------------------------------------------------------------ */

export function ProductDetail() {
  const { sku = '' } = useParams();
  const { snap, run, busy } = useApp();
  const [loc, setLoc] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('Incorrect Entry / Counting Error');
  const [memo, setMemo] = useState('');

  const p = snap?.products.find((x) => x.sku === sku);
  if (!snap || !p) {
    return (
      <Card>
        <Empty icon="search_off" title={`SKU ${sku} not found`} detail="It may have been renamed or removed from the catalog." />
      </Card>
    );
  }

  const activeLoc = loc || ((p.byLocation ?? []).find((l) => l.qty > 0)?.code ?? snap.locations.find((l) => !l.container)?.code ?? 'WH/Stock1');
  const bookQty = bookQtyIn(p, activeLoc, snap);
  const delta = counted === '' ? 0 : Number(counted) - bookQty;
  const dualSignoff = Math.abs(delta) * p.unitCost >= snap.settings.dualSignoffThreshold;

  return (
    <>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-on-surface/60 hover:text-primary">
        <Icon name="arrow_back" size={15} /> Products
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-container/12 text-primary">
                <Icon name={p.icon} size={28} fill />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[19px] leading-tight font-extrabold tracking-tight">{p.name}</h1>
                  <StatusBadge value={p.status} dot />
                </div>
                <p className="ref mt-1 text-[12px] text-on-surface/55">{p.sku}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{p.category}</Badge>
                  <Badge tone="teal">Reorder at {p.reorderPoint}</Badge>
                  {p.reserved > 0 && <Badge tone="warn">{p.reserved} reserved</Badge>}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'On hand', value: p.total, unit: p.unit, tone: p.total === 0 ? 'text-error' : '' },
                { label: 'Free to use', value: p.free, unit: p.unit, tone: 'text-on-surface' },
                { label: 'Unit cost', value: `${snap.settings.currency}${p.unitCost.toLocaleString('en-IN')}`, unit: '', tone: '' },
                { label: 'Stock value', value: `${snap.settings.currency}${(p.total * p.unitCost).toLocaleString('en-IN')}`, unit: '', tone: '' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-outline-variant bg-surface-low p-2.5">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-on-surface/50 uppercase">{s.label}</p>
                  <p className={`tnum mt-0.5 text-[17px] leading-tight font-extrabold ${s.tone}`}>
                    {s.value}
                    {s.unit && <span className="ml-1 text-[11px] font-medium text-on-surface/50">{s.unit}</span>}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-outline-variant px-4 py-2.5">
              <SectionTitle icon="receipt_long">Move history · {snap.ledger.filter((l) => l.sku === p.sku).length} rows</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-outline-variant bg-surface-low">
                  <tr>
                    <th className="th">When</th>
                    <th className="th">Ref</th>
                    <th className="th">Type</th>
                    <th className="th">From → To</th>
                    <th className="th text-right">Δ</th>
                    <th className="th text-right">Balance</th>
                    <th className="th">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {(snap.ledger.filter((l) => l.sku === p.sku).length
                    ? snap.ledger.filter((l) => l.sku === p.sku)
                    : []
                  ).map((l) => (
                    <tr key={l.id} className="row">
                      <td className="td font-mono text-[10.5px] whitespace-nowrap">{l.timestamp}</td>
                      <td className="td">
                        <Ref className="text-[11px]">{l.ref}</Ref>
                      </td>
                      <td className="td">
                        <Badge tone={l.type === 'DELIVERY' ? 'error' : l.type === 'RECEIPT' ? 'success' : l.type === 'ADJUSTMENT' ? 'warn' : 'teal'}>
                          {l.type}
                        </Badge>
                      </td>
                      <td className="td max-w-64">
                        <span className="block truncate text-[11px] text-on-surface/70">{l.from} → {l.to}</span>
                      </td>
                      <td className="td text-right">
                        <Delta value={l.delta} />
                      </td>
                      <td className="td tnum text-right font-mono text-[11.5px]">{l.balanceAfter}</td>
                      <td className="td max-w-28 truncate text-[11px] text-on-surface/60">{l.user}</td>
                    </tr>
                  ))}
                  {snap.ledger.filter((l) => l.sku === p.sku).length === 0 && (
                    <tr>
                      <td colSpan={7} className="td text-center text-on-surface/45">
                        No stock moves recorded for this SKU.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle icon="warehouse">Where it sits</SectionTitle>
            <ul className="space-y-1.5">
              {(p.byLocation ?? [])
                .filter((l) => l.qty > 0)
                .map((l) => {
                  const pct = p.total > 0 ? (l.qty / p.total) * 100 : 0;
                  return (
                    <li key={l.code}>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="ref truncate">{l.code}</span>
                        <span className="tnum font-mono font-bold">
                          {l.qty} {p.unit}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
                        <div className="h-full rounded-full bg-tertiary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-on-surface/45">{l.name}</p>
                    </li>
                  );
                })}
              {p.total === 0 && (
                <li className="rounded-lg bg-error-container px-3 py-2.5 text-[11.5px] text-on-error-container">
                  <p className="flex items-center gap-1.5 font-bold">
                    <Icon name="error" size={15} /> Out of stock everywhere
                  </p>
                  <p className="mt-1">
                    Outbound orders for this SKU will fail validation until stock is received.
                  </p>
                </li>
              )}
            </ul>
          </Card>

          <Card className="p-4">
            <SectionTitle icon="edit_note">Post a physical count</SectionTitle>
            <div className="space-y-3">
              <Field label="Count location">
                <select value={activeLoc} onChange={(e) => setLoc(e.target.value)} className="field">
                  {snap.locations.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code} — {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Book qty at ${activeLoc}`}>
                  <input readOnly value={bookQty} className="field tnum font-mono opacity-70" />
                </Field>
                <Field label="Counted">
                  <input
                    type="number"
                    min={0}
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    className="field tnum font-mono"
                    placeholder="0"
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-low px-3 py-2">
                <span className="text-[12px] font-semibold">Variance</span>
                <span className="flex items-baseline gap-2">
                  <Delta value={delta} />
                  <span className="tnum text-[11px] text-on-surface/60">
                    {snap.settings.currency}
                    {(delta * p.unitCost).toLocaleString('en-IN')}
                  </span>
                </span>
              </div>
              {dualSignoff && (
                <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-container px-2.5 py-1.5 text-[11px] text-on-warning-container">
                  <Icon name="verified_user" size={14} className="mt-px shrink-0" /> Dual sign-off required.
                </p>
              )}
              <Field label="Reason">
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="field">
                  {[
                    'Damaged in Transit',
                    'Missing / Investigation',
                    'Incorrect Entry / Counting Error',
                    'Scrap / Wear & Tear',
                    'Supplier Surplus',
                    'Other',
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Memo">
                <textarea
                  rows={2}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="field resize-none"
                />
              </Field>
              <button
                className="btn btn-primary w-full justify-center"
                disabled={busy || counted === ''}
                onClick={() => {
                  if (counted === '') return;
                  void run(
                    `Count for ${p.sku}`,
                    async () => {
                      const created = await api.createCount({
                        sku: p.sku,
                        location: activeLoc,
                        recorded: bookQty,
                        counted: Number(counted),
                        reason,
                        memo});
                      return api.postAdjustment({
                        ref: created.ref,
                        counted: Number(counted),
                        reason: reason as never,
                        memo
                      });
                    },
                    { success: `Count posted for ${p.sku}` },
                  );
                }}
              >
                <Icon name="publish" size={16} /> Post variance
              </button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
