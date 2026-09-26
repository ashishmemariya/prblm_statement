import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store';
import {
  Badge,
  Card,
  Delta,
  Empty,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  Segmented,
} from '../components/ui';
import type { LedgerType } from '../types';

const TYPE_TONE: Record<LedgerType, 'success' | 'error' | 'warn' | 'teal'> = {
  RECEIPT: 'success',
  DELIVERY: 'error',
  ADJUSTMENT: 'warn',
  TRANSFER: 'teal',
};

const TYPE_ICON: Record<LedgerType, string> = {
  RECEIPT: 'south_west',
  DELIVERY: 'north_east',
  ADJUSTMENT: 'rule',
  TRANSFER: 'compare_arrows',
};

export default function Ledger() {
  const { snap } = useApp();
  const [type, setType] = useState<'All' | LedgerType>('All');
  const [sku, setSku] = useState('');

  const rows = useMemo(() => {
    let list = snap?.ledger ?? [];
    if (type !== 'All') list = list.filter((l) => l.type === type);
    if (sku.trim()) list = list.filter((l) => l.sku.toLowerCase().includes(sku.trim().toLowerCase()));
    return list;
  }, [snap, type, sku]);

  if (!snap) return null;

  const counts = {
    RECEIPT: snap.ledger.filter((l) => l.type === 'RECEIPT').length,
    DELIVERY: snap.ledger.filter((l) => l.type === 'DELIVERY').length,
    TRANSFER: snap.ledger.filter((l) => l.type === 'TRANSFER').length,
    ADJUSTMENT: snap.ledger.filter((l) => l.type === 'ADJUSTMENT').length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Move History"
        subtitle="Append-only record of every stock movement. Rows are never edited or deleted — a mistake is corrected by posting a new compensating entry."
        actions={
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'All', label: `All ${snap.ledger.length}` },
              { value: 'RECEIPT', label: `In ${counts.RECEIPT}` },
              { value: 'DELIVERY', label: `Out ${counts.DELIVERY}` },
              { value: 'TRANSFER', label: `Move ${counts.TRANSFER}` },
              { value: 'ADJUSTMENT', label: `Var ${counts.ADJUSTMENT}` },
            ]}
          />
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="block min-w-56 flex-1">
          <span className="mb-1 block text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
            Filter by SKU
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-outline">
              <Icon name="search" size={16} />
            </span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. STL-ROD-12"
              className="field !pl-8 font-mono"
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-4 border-l border-outline-variant pl-4 text-[11.5px]">
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-on-surface">{rows.length}</b> rows shown
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-success">
              +{rows.reduce((a, l) => a + Math.max(0, l.delta), 0)}
            </b>{' '}
            in
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-error">
              {rows.reduce((a, l) => a + Math.min(0, l.delta), 0)}
            </b>{' '}
            out
          </span>
          <span className="text-on-surface/55">
            <b className="tnum block text-[15px] text-outline">
              {rows.filter((l) => l.delta === 0).length}
            </b>{' '}
            net-zero
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <Empty icon="receipt_long" title="No ledger rows match" detail="Clear the filters, or receive stock to generate the first movement." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-outline-variant px-4 py-2.5">
            <SectionTitle icon="lock">Immutable ledger · newest first</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead className="border-b border-outline-variant bg-surface-low">
                <tr>
                  <th className="th">Entry</th>
                  <th className="th">Timestamp</th>
                  <th className="th">Type</th>
                  <th className="th">Document</th>
                  <th className="th">SKU</th>
                  <th className="th">From → To</th>
                  <th className="th text-right">Δ Qty</th>
                  <th className="th text-right">Balance after</th>
                  <th className="th">Signed by</th>
                  <th className="th">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((l) => {
                  const docPath =
                    l.type === 'DELIVERY'
                      ? `/deliveries/${encodeURIComponent(l.ref)}`
                      : l.type === 'RECEIPT'
                        ? `/receipts/${encodeURIComponent(l.ref)}`
                        : l.type === 'ADJUSTMENT'
                          ? '/counts'
                          : '/transfers';
                  return (
                    <tr key={l.id} className="row">
                      <td className="td">
                        <Ref className="text-[11px] text-on-surface/50">{l.id}</Ref>
                      </td>
                      <td className="td font-mono text-[10.5px] whitespace-nowrap">{l.timestamp}</td>
                      <td className="td">
                        <Badge tone={TYPE_TONE[l.type]}>
                          <Icon name={TYPE_ICON[l.type]} size={12} />
                          {l.type}
                        </Badge>
                      </td>
                      <td className="td">
                        <Link to={docPath} className="ref text-[11.5px] hover:text-primary hover:underline">
                          {l.ref}
                        </Link>
                      </td>
                      <td className="td max-w-56">
                        <Link to={`/products/${l.sku}`} className="block">
                          <span className="block truncate text-[12px] font-semibold hover:text-primary hover:underline">
                            {l.name}
                          </span>
                          <Ref className="text-[10.5px] text-on-surface/50">{l.sku}</Ref>
                        </Link>
                      </td>
                      <td className="td max-w-72">
                        <span className="block truncate text-[11px] text-on-surface/65">
                          {l.from} <Icon name="arrow_right_alt" size={12} className="inline" /> {l.to}
                        </span>
                      </td>
                      <td className="td text-right">
                        <Delta value={l.delta} />
                      </td>
                      <td className="td tnum text-right font-mono text-[12px] font-bold">{l.balanceAfter}</td>
                      <td className="td max-w-28 truncate text-[11.5px]">{l.user}</td>
                      <td className="td max-w-72">
                        <span className="block truncate text-[11px] text-on-surface/55">{l.note}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="flex items-start gap-2 border-t border-outline-variant bg-surface-low px-4 py-2.5 text-[11px] text-on-surface/55">
            <Icon name="info" size={15} className="mt-px shrink-0" />
            A transfer shows Δ&nbsp;0 by design: moving stock between locations changes where it is,
            not how much the company owns. Use the per-SKU page to see a location-level breakdown.
          </p>
        </Card>
      )}
    </>
  );
}
