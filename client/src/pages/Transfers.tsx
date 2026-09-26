import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp, useUser } from '../store';
import { Drawer } from '../components/overlays';
import {
  Badge,
  Card,
  Empty,
  Field,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  StatusBadge,
} from '../components/ui';

export default function Transfers() {
  const { snap, run, busy } = useApp();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');

  if (!snap) return null;

  const roots = snap.locations.filter((l) => !l.parent);
  const product = snap.products.find((p) => p.sku === sku);

  /** Mirrors the server roll-up so the drawer never promises stock that isn't there. */
  const availableAt = (code: string): number => {
    if (!product || !code) return 0;
    if (!snap.locations.some((l) => l.code === code)) return 0;
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
    return [...scope].reduce((a, k) => a + (product.stock[k] ?? 0), 0);
  };

  const avail = availableAt(from);
  const netZero = !!product && !!from && !!to;
  const overdraw = Number(qty) > avail;

  const submit = async () => {
    if (!from || !to || !sku || !qty) return;
    const res = await run(
      `Transfer request ${sku}`,
      () => api.createTransfer({ from, to, sku, qty: Number(qty)}),
      { success: 'Transfer drafted' },
    );
    if (res) {
      setOpen(false);
      setQty('');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Internal logistics"
        title="Transfers"
        subtitle="Relocate stock between bins and warehouses. A transfer moves quantity without changing the enterprise balance, so it is logged with Δ 0 and its own audited trail."
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Icon name="add" size={16} /> New transfer
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Scheduled', value: snap.dashboard.scheduledTransfers, icon: 'schedule', tone: 'text-primary' },
          { label: 'Completed', value: snap.transfers.filter((t) => t.status === 'Done').length, icon: 'task_alt', tone: 'text-success' },
          { label: 'Awaiting execution', value: snap.transfers.filter((t) => t.status !== 'Done').length, icon: 'pending', tone: 'text-warning' },
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

      {snap.transfers.length === 0 ? (
        <Card>
          <Empty icon="swap_horiz" title="No transfers yet" detail="Draft one to move stock between locations without touching the global balance." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-outline-variant px-4 py-2.5">
            <SectionTitle icon="compare_arrows">Transfer orders</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-outline-variant bg-surface-low">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Route</th>
                  <th className="th">SKU</th>
                  <th className="th text-right">Qty</th>
                  <th className="th">Requested by</th>
                  <th className="th">Created</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Effect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {snap.transfers.map((t) => (
                  <tr key={t.ref} className="row">
                    <td className="td">
                      <Ref className="text-[11.5px]">{t.ref}</Ref>
                    </td>
                    <td className="td max-w-72">
                      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold">
                        <Ref className="text-[10.5px]">{t.from}</Ref>
                        <Icon name="arrow_forward" size={13} className="text-outline" />
                        <Ref className="text-[10.5px]">{t.to}</Ref>
                      </span>
                    </td>
                    <td className="td">
                      <Link to={`/products/${t.sku}`} className="ref text-[11px] hover:text-primary hover:underline">
                        {t.sku}
                      </Link>
                    </td>
                    <td className="td tnum text-right font-mono font-bold">{t.qty}</td>
                    <td className="td text-[11.5px]">{t.requestedBy}</td>
                    <td className="td font-mono text-[10.5px] whitespace-nowrap">{t.createdAt}</td>
                    <td className="td">
                      <StatusBadge value={t.status} dot />
                    </td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone="teal">Δ 0</Badge>
                        {t.status !== 'Done' && (
                          <button
                            className="btn btn-primary !px-2 !py-1"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                `Transfer ${t.ref}`,
                                () => api.executeTransfer(t.ref, user.name),
                                { success: `${t.ref} executed` },
                              )
                            }
                          >
                            <Icon name="play_arrow" size={14} fill /> Execute
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New internal transfer"
        subtitle="Draft a relocation. Execute it from the list to post to the ledger."
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !from || !to || !sku || !qty || overdraw || from === to}
              onClick={() => void submit()}
            >
              <Icon name="save" size={16} /> Draft transfer
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="field">
                <option value="">Select…</option>
                {roots.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <select value={to} onChange={(e) => setTo(e.target.value)} className="field">
                <option value="">Select…</option>
                {roots
                  .filter((l) => l.code !== from)
                  .map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          <Field label="SKU">
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="field">
              <option value="">Select a product…</option>
              {snap.products.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Quantity"
            hint={product && from ? `${avail} ${product.unit} available in ${from}` : undefined}
          >
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="field tnum font-mono"
              placeholder="0"
            />
          </Field>

          {overdraw && (
            <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
              <Icon name="block" size={15} className="mt-px shrink-0" />
              Only {avail} {product?.unit} available in {from}. The server will reject an over-draw.
            </p>
          )}

          {netZero && (
            <div className="rounded-lg border border-tertiary/25 bg-tertiary-container p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-on-tertiary-container">
                <Icon name="functions" size={15} /> Net-zero guarantee
              </p>
              <ul className="mt-2 space-y-1 text-[11.5px] text-on-tertiary-container/85">
                <li className="flex justify-between gap-2">
                  <span>{from}</span>
                  <span className="tnum font-mono font-bold text-error">
                    −{qty || 0} {product?.unit}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{to}</span>
                  <span className="tnum font-mono font-bold text-success">
                    +{qty || 0} {product?.unit}
                  </span>
                </li>
                <li className="mt-1.5 flex justify-between gap-2 border-t border-on-tertiary-container/20 pt-1.5 font-bold">
                  <span>Enterprise balance</span>
                  <span className="tnum font-mono">Δ 0</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
