import { Link } from 'react-router-dom';
import { useApp } from '../store';
import { ScenarioBar } from '../components/chrome';
import { Badge, Card, Icon, PageHeader, Ref, SectionTitle, StatusBadge } from '../components/ui';

const money = (n: number, c = '₹') =>
  n >= 1e7 ? `${c}${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${c}${(n / 1e5).toFixed(2)} L` : `${c}${n.toLocaleString('en-IN')}`;

export default function Dashboard() {
  const { snap } = useApp();
  if (!snap) return null;
  const d = snap.dashboard;

  const kpis = [
    {
      label: 'Inventory value',
      value: money(d.valuation, snap.settings.currency),
      // Quantities span kg, units and rolls, so the total is deliberately not
      // labelled "units" — that would misstate eight of the ten SKUs.
      sub: `${d.catalogSkus} active SKUs · ${d.totalOnHand.toLocaleString('en-IN')} on hand (mixed UoM)`,
      icon: 'account_balance_wallet',
      tone: 'plum' as const,
      to: '/products',
    },
    {
      label: 'Free to allocate',
      value: d.freeToAllocate.toLocaleString('en-IN'),
      sub: `${d.reserved} reserved against open orders`,
      icon: 'inventory',
      tone: 'teal' as const,
      to: '/products',
    },
    {
      label: 'Outbound queue',
      value: d.pendingDeliveries.toString(),
      sub: `${d.readyDeliveries} ready · ${d.waitingDeliveries} waiting · ${d.overdueDeliveries} overdue`,
      icon: 'local_shipping',
      tone: d.overdueDeliveries > 0 ? ('error' as const) : ('neutral' as const),
      to: '/deliveries',
    },
    {
      label: 'Inbound queue',
      value: d.pendingReceipts.toString(),
      sub: `${d.lateReceipts} late · ${d.scheduledTransfers} transfers scheduled`,
      icon: 'move_to_inbox',
      tone: d.lateReceipts > 0 ? ('warn' as const) : ('neutral' as const),
      to: '/receipts',
    },
  ];

  const attention = [
    ...d.lowStock.slice(0, 4).map((p) => ({
      key: p.sku,
      to: `/products/${p.sku}`,
      icon: p.icon,
      title: p.name,
      meta: `${p.sku} · ${p.total} ${p.unit} on hand`,
      status: p.status,
      cta: p.total === 0 ? 'Replenish' : 'Review',
    })),
    ...snap.deliveries
      .filter((x) => x.attention?.kind === 'Overdue')
      .slice(0, 2)
      .map((x) => ({
        key: x.ref,
        to: `/deliveries/${encodeURIComponent(x.ref)}`,
        icon: 'warning',
        title: `${x.ref} overdue`,
        meta: `${x.items.length} line(s) to ${x.contact} · ${x.attention?.message ?? ''}`,
        status: x.status,
        cta: 'Reallocate',
      })),
    ...snap.receipts
      .filter((x) => x.attention?.kind === 'Overdue')
      .slice(0, 1)
      .map((x) => ({
        key: x.ref,
        to: `/receipts/${encodeURIComponent(x.ref)}`,
        icon: 'warning',
        title: `${x.ref} overdue`,
        meta: `${x.items.length} line(s) from ${x.supplier} · ${x.attention?.message ?? ''}`,
        status: x.status,
        cta: 'Chase',
      })),
    ...snap.adjustments
      .filter((a) => a.state === 'Pending Approval')
      .slice(0, 2)
      .map((a) => ({
        key: a.ref,
        to: '/counts',
        icon: 'fact_check',
        title: `${a.ref} awaiting approval`,
        meta: `${a.sku} at ${a.location} · ${a.delta >= 0 ? '+' : ''}${a.delta} ${a.reason}`,
        status: 'Pending Approval' as const,
        cta: 'Review',
      })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Enterprise Logistics & Inventory"
        title="Operations cockpit"
        subtitle="Live balances, document queues and the audit trail. Every number below is computed by the server, not the browser."
        actions={
          <>
            <Link to="/receipts?new=1" className="btn btn-outline">
              <Icon name="move_to_inbox" size={16} /> Receive
            </Link>
            <Link to="/deliveries?new=1" className="btn btn-primary">
              <Icon name="add" size={16} /> New delivery
            </Link>
          </>
        }
      />

      <ScenarioBar />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="card group p-4 transition hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-bold tracking-[0.08em] text-on-surface/50 uppercase">
                {k.label}
              </p>
              <Badge tone={k.tone}>
                <Icon name={k.icon} size={13} />
              </Badge>
            </div>
            <p className="tnum mt-1.5 text-[26px] leading-none font-extrabold tracking-tight">
              {k.value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-on-surface/55">{k.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div>
          <SectionTitle icon="priority_high" right={<Link to="/counts" className="btn btn-outline !py-1.5">Open counts</Link>}>
            Needs attention
          </SectionTitle>
          <Card className="divide-y divide-outline-variant">
            {attention.length === 0 && (
              <p className="px-4 py-8 text-center text-[12.5px] text-on-surface/50">
                Nothing is blocked right now.
              </p>
            )}
            {attention.map((a) => (
              <Link
                key={a.key}
                to={a.to}
                className="row flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
                  <Icon name={a.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{a.title}</span>
                  <span className="block truncate text-[11px] text-on-surface/50">{a.meta}</span>
                </span>
                <StatusBadge value={a.status} dot />
                <Icon name="chevron_right" size={17} className="text-outline" />
              </Link>
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle icon="receipt_long" right={<Link to="/ledger" className="btn btn-outline !py-1.5">Full ledger</Link>}>
            Latest stock moves
          </SectionTitle>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-outline-variant bg-surface-low">
                  <tr>
                    <th className="th">Ref</th>
                    <th className="th">SKU</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Δ Qty</th>
                    <th className="th text-right">Balance</th>
                    <th className="th">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {snap.ledger.slice(0, 8).map((l) => (
                    <tr key={l.id} className="row">
                      <td className="td">
                        <Ref className="text-[11.5px]">{l.ref}</Ref>
                      </td>
                      <td className="td max-w-40">
                        <span className="block truncate text-[12px]">{l.name}</span>
                        <span className="ref block text-[10px] text-on-surface/45">{l.sku}</span>
                      </td>
                      <td className="td">
                        <Badge tone={l.type === 'DELIVERY' ? 'error' : l.type === 'RECEIPT' ? 'success' : l.type === 'ADJUSTMENT' ? 'warn' : 'teal'}>
                          {l.type}
                        </Badge>
                      </td>
                      <td className="td text-right">
                        <span
                          className={`tnum font-mono text-[12px] font-bold ${
                            l.delta > 0 ? 'text-success' : l.delta < 0 ? 'text-error' : 'text-outline'
                          }`}
                        >
                          {l.delta > 0 ? '+' : ''}
                          {l.delta}
                        </span>
                      </td>
                      <td className="td tnum text-right font-mono text-[12px]">{l.balanceAfter}</td>
                      <td className="td max-w-28 truncate text-[11.5px] text-on-surface/60">{l.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-outline-variant bg-surface-low px-4 py-2 text-[10.5px] text-on-surface/50">
              Append-only. Transfers are recorded with Δ 0 because relocating stock never changes the
              enterprise balance.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <SectionTitle icon="deployed_code" >Network</SectionTitle>
          <ul className="space-y-2">
            {snap.warehouses.map((w) => (
              <li key={w.code} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-tertiary-container text-on-tertiary-container">
                  <Icon name="warehouse" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">{w.name}</span>
                  <span className="block text-[10.5px] text-on-surface/50">
                    {w.locationCount} locations · {w.capacityUsedPct}% utilised
                  </span>
                </span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className={`h-full rounded-full ${w.capacityUsedPct > 88 ? 'bg-error' : w.capacityUsedPct > 70 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${w.capacityUsedPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <SectionTitle icon="swap_horiz">Transfers in flight</SectionTitle>
          <ul className="space-y-2">
            {snap.transfers.map((t) => (
              <li key={t.ref} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-container text-primary">
                  <Icon name="compare_arrows" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <Ref className="text-[11px]">{t.ref}</Ref>
                    <span className="truncate text-on-surface/60">
                      {t.from} → {t.to}
                    </span>
                  </span>
                  <span className="block text-[10.5px] text-on-surface/50">
                    {t.qty} × {t.sku} · {t.requestedBy}
                  </span>
                </span>
                <StatusBadge value={t.status} dot />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <SectionTitle icon="shield_lock">Control settings</SectionTitle>
          <ul className="space-y-2 text-[12px]">
            <li className="flex items-center justify-between gap-2">
              <span className="text-on-surface/65">Negative stock</span>
              <StatusBadge
                value={snap.settings.preventNegativeStock ? 'Blocked' : 'Allowed'}
              />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-on-surface/65">Valuation</span>
              <Badge tone="teal">{snap.settings.valuationMethod}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-on-surface/65">Removal strategy</span>
              <Badge tone="teal">{snap.settings.removalStrategy}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-on-surface/65">Dual sign-off at</span>
              <span className="tnum font-mono text-[11.5px]">
                {snap.settings.currency}
                {snap.settings.dualSignoffThreshold.toLocaleString('en-IN')} or{' '}
                {snap.settings.dualSignoffVariancePct}%
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-on-surface/65">Ledger entries</span>
              <span className="tnum font-mono text-[11.5px]">{snap.ledger.length}</span>
            </li>
          </ul>
          <Link to="/settings" className="btn btn-outline mt-3 w-full justify-center !py-1.5">
            <Icon name="tune" size={15} /> Control settings
          </Link>
        </Card>
      </div>
    </>
  );
}
