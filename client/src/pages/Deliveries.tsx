import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useApp, useUser } from '../store';
import {
  Badge,
  Card,
  Empty,
  Field,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  Segmented,
  StatusBadge,
} from '../components/ui';
import type { Delivery, DocStatus } from '../types';

const COLUMNS: { key: DocStatus; label: string; icon: string }[] = [
  { key: 'Draft', label: 'Draft', icon: 'edit_note' },
  { key: 'Waiting', label: 'Waiting', icon: 'hourglass_top' },
  { key: 'Ready', label: 'Ready', icon: 'inventory' },
  { key: 'Overdue', label: 'Overdue', icon: 'warning' },
  { key: 'Done', label: 'Completed', icon: 'task_alt' },
];

export default function Deliveries() {
  const { snap } = useApp();
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [status, setStatus] = useState('All');

  if (!snap) return null;

  const rows = status === 'All' ? snap.deliveries : snap.deliveries.filter((d) => d.status === status);

  return (
    <>
      <PageHeader
        eyebrow="Outbound operations"
        title="Deliveries"
        subtitle="Sales orders released to the warehouse. Validation is checked against live stock at the moment of dispatch — shortages are refused, not warned about."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List', icon: 'view_list' },
              { value: 'kanban', label: 'Kanban', icon: 'view_kanban' },
            ]}
          />
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="Status" className="min-w-44">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field">
            {['All', ...COLUMNS.map((c) => c.key)].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-4 border-l border-outline-variant pl-4 text-[11.5px]">
          {COLUMNS.map((c) => {
            const n = snap.deliveries.filter((d) => d.status === c.key).length;
            return (
              <span key={c.key} className="text-on-surface/55">
                <b className="tnum block text-[15px] text-on-surface">{n}</b>
                {c.label}
              </span>
            );
          })}
        </div>
        <Link to="/receipts" className="btn btn-outline ml-auto">
          <Icon name="move_to_inbox" size={16} /> Inbound receipts
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty icon="local_shipping" title="No deliveries with this status" />
        </Card>
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead className="border-b border-outline-variant bg-surface-low">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Customer</th>
                  <th className="th">From</th>
                  <th className="th">Lines</th>
                  <th className="th">Carrier</th>
                  <th className="th">Scheduled</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((d) => (
                  <tr key={d.ref} className="row">
                    <td className="td">
                      <Link to={`/deliveries/${encodeURIComponent(d.ref)}`} className="ref text-[11.5px] hover:text-primary hover:underline">
                        {d.ref}
                      </Link>
                    </td>
                    <td className="td max-w-52">
                      <span className="block truncate text-[12px] font-semibold">{d.to}</span>
                      <span className="block truncate text-[10.5px] text-on-surface/50">{d.contact}</span>
                    </td>
                    <td className="td">
                      <Ref className="text-[11px]">{d.from}</Ref>
                    </td>
                    <td className="td tnum text-right font-mono text-[11.5px]">{d.items.length}</td>
                    <td className="td max-w-56">
                      <span className="block truncate text-[11px] text-on-surface/60">{d.carrier}</span>
                    </td>
                    <td className="td font-mono text-[11px] whitespace-nowrap">{d.scheduledDate}</td>
                    <td className="td">
                      <StatusBadge value={d.status} dot />
                    </td>
                    <td className="td text-right">
                      <Link to={`/deliveries/${encodeURIComponent(d.ref)}`} className="btn btn-outline !px-2 !py-1">
                        <Icon name="chevron_right" size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = rows.filter((d) => d.status === col.key);
            return (
              <div key={col.key} className="flex min-h-40 flex-col rounded-xl border border-outline-variant bg-surface-low p-2">
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <Icon name={col.icon} size={15} className="text-primary" />
                  <span className="text-[11.5px] font-bold">{col.label}</span>
                  <span className="tnum ml-auto rounded-full bg-surface-lowest px-1.5 text-[10.5px] font-bold text-outline">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {items.map((d) => (
                    <Link
                      key={d.ref}
                      to={`/deliveries/${encodeURIComponent(d.ref)}`}
                      className="card p-2.5 transition hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Ref className="text-[11px]">{d.ref}</Ref>
                        <StatusBadge value={d.status} />
                      </div>
                      <p className="mt-1.5 truncate text-[12px] font-semibold">{d.to}</p>
                      <p className="truncate text-[10.5px] text-on-surface/50">{d.contact}</p>
                      <div className="mt-2 flex items-center justify-between border-t border-outline-variant pt-1.5 text-[10px]">
                        <span className="tnum text-on-surface/55">{d.items.length} lines</span>
                        <span className="font-mono text-on-surface/45">{d.scheduledDate}</span>
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-outline-variant px-2 py-4 text-center text-[10.5px] text-on-surface/40">
                      empty
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Detail — the screen that enforces the zero-floor rule
 * ------------------------------------------------------------------ */

export function DeliveryDetail() {
  const { ref = '' } = useParams();
  const decoded = decodeURIComponent(ref);
  const { snap, run, busy } = useApp();
  const user = useUser();
  const [doc, setDoc] = useState<Delivery | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      setDoc(await api.delivery(decoded));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load the delivery');
    }
  };

  useEffect(() => {
    void load();
  }, [decoded, snap?.ledger.length, snap?.deliveries]);

  const back = (
    <Link to="/deliveries" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-on-surface/60 hover:text-primary">
      <Icon name="arrow_back" size={15} /> Deliveries
    </Link>
  );

  if (err) {
    return (
      <>
        {back}
        <Card>
          <Empty icon="error" title={err} detail="Check the reference and try again." />
        </Card>
      </>
    );
  }

  if (!doc) {
    return (
      <>
        {back}
        <Card>
          <Empty icon="hourglass_top" title="Loading delivery…" />
        </Card>
      </>
    );
  }

  const lines = doc.lines ?? [];
  const blocked = doc.check?.blocked ?? false;
  const posted = doc.status === 'Done';

  return (
    <>
      {back}

      <PageHeader
        eyebrow={`${doc.operationType} · created by ${doc.createdBy}`}
        title={doc.ref}
        subtitle={`${doc.items.length} line(s) · ${doc.to} · scheduled ${doc.scheduledDate}`}
        actions={
          <>
            <StatusBadge value={doc.status} dot />
            <button
              className="btn btn-primary"
              disabled={busy || blocked || posted}
              onClick={() =>
                void run(
                  `Dispatch ${doc.ref}`,
                  () => api.validateDelivery(doc.ref, user.name),
                  { success: `${doc.ref} validated and posted` },
                ).then(() => load())
              }
              title={blocked ? 'Resolve the shortages first' : posted ? 'Already posted' : 'Validate and post'}
            >
              <Icon name={posted ? 'task_alt' : blocked ? 'block' : 'play_arrow'} size={16} fill />
              {posted ? 'Posted' : blocked ? 'Validation blocked' : 'Validate & post'}
            </button>
          </>
        }
      />

      {blocked && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error-container p-4">
          <div className="flex items-start gap-2.5">
            <Icon name="report" size={20} fill className="mt-px shrink-0 text-on-error-container" />
            <div>
              <p className="text-[13px] font-extrabold text-on-error-container">
                Stock deficit — dispatch cannot be validated
              </p>
              <p className="mt-1 text-[12px] text-on-error-container/85">
                The server refuses to let on-hand stock fall below zero. Receive or transfer stock in
                first, then re-validate. Every shortfall is listed below.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {lines
                  .filter((l) => !l.sufficient)
                  .map((l) => (
                    <li
                      key={l.sku}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-on-surface/[0.07] px-3 py-2 font-mono text-[11px] text-on-error-container"
                    >
                      <Icon name="error" size={14} className="shrink-0" />
                      <b>{l.sku}</b>
                      <span>needs {l.qty} {l.unit}</span>
                      <span className="opacity-75">· {l.reason}</span>
                      <Link
                        to={`/products/${l.sku}`}
                        className="ml-auto inline-flex items-center gap-1 font-sans text-[11px] font-bold underline"
                      >
                        Inspect SKU <Icon name="open_in_new" size={12} />
                      </Link>
                    </li>
                  ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/receipts" className="btn btn-danger !py-1.5">
                  <Icon name="move_to_inbox" size={15} /> Go to receipts
                </Link>
                <Link to="/transfers" className="btn btn-outline !py-1.5">
                  <Icon name="swap_horiz" size={15} /> Reallocate via transfer
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {posted && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-container px-4 py-3 text-on-success-container">
          <Icon name="verified" size={20} fill />
          <div>
            <p className="text-[12.5px] font-extrabold">Dispatch posted to the ledger</p>
            <p className="text-[11.5px] opacity-85">
              Signed by {user.name} at {doc.postedAt}. This document is now read-only.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-outline-variant px-4 py-2.5">
              <SectionTitle icon="format_list_bulleted">Lines &amp; live availability</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-outline-variant bg-surface-low">
                  <tr>
                    <th className="th">SKU</th>
                    <th className="th">Bin</th>
                    <th className="th text-right">Demand</th>
                    <th className="th text-right">At source</th>
                    <th className="th text-right">Network</th>
                    <th className="th text-right">Value</th>
                    <th className="th">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {lines.map((l) => (
                    <tr key={l.sku} className={`row ${l.sufficient ? '' : 'bg-error-container/25'}`}>
                      <td className="td max-w-64">
                        <Link to={`/products/${l.sku}`} className="block">
                          <span className="block truncate text-[12px] font-semibold hover:text-primary hover:underline">
                            {l.name}
                          </span>
                          <Ref className="text-[10.5px] text-on-surface/50">{l.sku}</Ref>
                        </Link>
                      </td>
                      <td className="td">
                        <Ref className="text-[11px]">{l.bin}</Ref>
                        {l.pullFrom !== doc.from && l.sufficient && (
                          <span className="mt-0.5 block text-[10px] text-tertiary">
                            will pull from {l.pullFrom}
                          </span>
                        )}
                      </td>
                      <td className="td tnum text-right font-mono font-bold">{l.qty} {l.unit}</td>
                      <td className={`td tnum text-right font-mono ${l.availableAtSource >= l.qty ? '' : 'text-error'}`}>
                        {l.availableAtSource}
                      </td>
                      <td className={`td tnum text-right font-mono font-semibold ${l.sufficient ? '' : 'text-error'}`}>
                        {l.availableTotal}
                      </td>
                      <td className="td tnum text-right font-mono text-[11.5px]">
                        {snap?.settings.currency}
                        {l.value.toLocaleString('en-IN')}
                      </td>
                      <td className="td max-w-72">
                        {l.sufficient ? (
                          <span className="flex items-center gap-1.5 text-[11.5px] text-success">
                            <Icon name="check_circle" size={15} fill /> {l.reason}
                          </span>
                        ) : (
                          <span className="flex items-start gap-1.5 text-[11.5px] font-semibold text-error">
                            <Icon name="cancel" size={15} fill className="mt-px shrink-0" /> {l.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-outline-variant bg-surface-low">
                  <tr>
                    <td className="td font-bold" colSpan={5}>
                      Order value
                    </td>
                    <td className="td tnum text-right font-mono font-extrabold">
                      {snap?.settings.currency}
                      {(doc.totalValue ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle icon="sticky_note_2">Notes</SectionTitle>
            <p className="text-[12.5px] leading-relaxed text-on-surface/75">{doc.notes}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle icon="local_shipping">Ship-to</SectionTitle>
            <dl className="space-y-2.5 text-[12px]">
              <Meta label="Customer" value={doc.to} />
              <Meta label="Contact" value={doc.contact} />
              <Meta label="Address" value={doc.address} />
              <Meta label="Source warehouse" value={doc.from} mono />
              <Meta label="Carrier" value={doc.carrier} />
              <Meta label="Scheduled" value={doc.scheduledDate} mono />
              <Meta label="Raised" value={doc.createdAt} mono />
            </dl>
          </Card>

          <Card className="p-4">
            <SectionTitle icon="fact_check">Validation checklist</SectionTitle>
            <ul className="space-y-2 text-[12px]">
              {[
                { ok: lines.every((l) => l.sufficient), label: 'All lines covered by on-hand stock' },
                { ok: lines.every((l) => l.sufficient), label: 'No line drives a bin below zero' },
                { ok: lines.every((l) => l.sufficient), label: 'Reservations released on posting' },
                { ok: doc.carrier !== 'Unassigned', label: 'Carrier assigned' },
                { ok: doc.to.length > 0, label: 'Ship-to address present' },
              ].map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  <Icon
                    name={c.ok ? 'check_circle' : 'radio_button_unchecked'}
                    size={16}
                    fill={c.ok}
                    className={`mt-px shrink-0 ${c.ok ? 'text-success' : 'text-warning'}`}
                  />
                  <span className={c.ok ? '' : 'text-warning'}>{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-outline-variant pt-3 text-[11px] text-on-surface/55">
              <Badge tone="teal">FIFO</Badge>
              Consume from the source bay first, then the deepest other holding bin.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-on-surface/50">{label}</dt>
      <dd className={`text-right font-semibold ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</dd>
    </div>
  );
}
