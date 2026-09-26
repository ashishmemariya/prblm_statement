import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useSnap } from '../store';
import { money, percent, qty as n, shortDate, signed, timeOnly } from '../lib/format';
import type { AttentionItem, Tone } from '../types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FlowChart,
  Icon,
  KpiCard,
  LiveDot,
  LinkButton,
  Modal,
  PageHeader,
  SectionCard,
  StatusBadge,
  Timeline,
  WarnNote,
} from '../components/design';
import { DemoModeBar } from '../components/AppShell';
import { demoService } from '../services';

const SEVERITY_TONE: Record<AttentionItem['severity'], Tone> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

const SEVERITY_ICON: Record<AttentionItem['kind'], string> = {
  'low-stock': 'trending_down',
  'out-of-stock': 'error',
  'blocked-delivery': 'block',
  'overdue-delivery': 'schedule',
  'receipt-ready': 'move_to_inbox',
  'receipt-overdue': 'event_busy',
  approval: 'approval',
  'count-due': 'fact_check',
  'transfer-ready': 'compare_arrows',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user, run, busy, can, refresh } = useApp();
  const snap = useSnap();
  const [attentionFilter, setAttentionFilter] = useState<'all' | AttentionItem['severity']>('all');
  const [resetOpen, setResetOpen] = useState(false);

  const d = snap.dashboard;
  const currency = d.currency;

  const attention = useMemo(
    () => (attentionFilter === 'all' ? d.attention : d.attention.filter((a) => a.severity === attentionFilter)),
    [d.attention, attentionFilter],
  );

  const criticalCount = d.attention.filter((a) => a.severity === 'critical').length;
  const firstName = user?.name.split(' ')[0] ?? 'there';

  const nextActions = [
    can('receipt.create') && d.pendingReceipts > 0
      ? { to: '/receipts', label: 'Work the inbound queue', icon: 'move_to_inbox', count: d.pendingReceipts }
      : null,
    can('delivery.pick') && d.pendingDeliveries > 0
      ? { to: '/deliveries', label: 'Pick and dispatch', icon: 'local_shipping', count: d.pendingDeliveries }
      : null,
    can('transfer.post') && d.openTransfers > 0
      ? { to: '/transfers', label: 'Move stock between locations', icon: 'swap_horiz', count: d.openTransfers }
      : null,
    can('adjustment.approve') && d.pendingApprovals > 0
      ? { to: '/adjustments', label: 'Approve count variances', icon: 'approval', count: d.pendingApprovals }
      : null,
    can('count.create') && d.openCounts > 0
      ? { to: '/counts', label: 'Finish the scheduled counts', icon: 'fact_check', count: d.openCounts }
      : null,
    d.lowStockCount > 0
      ? { to: '/low-stock', label: 'Replenish low stock', icon: 'trending_down', count: d.lowStockCount }
      : null,
  ].filter(Boolean) as { to: string; label: string; icon: string; count: number }[];

  return (
    <>
      <PageHeader
        eyebrow="Inventory Operations"
        title="StockSense"
        breadcrumb={[{ label: 'Overview' }, { label: 'Dashboard' }]}
        description={`${greeting()}, ${firstName}. Here is the current operational picture across your ${d.warehouses} warehouses.`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <LiveDot />
            <span className="text-[11.5px] text-text-muted">
              {d.catalogSkus} products · {d.locations} storage locations · {d.ledgerEntries} ledger rows
            </span>
          </div>
        }
        actions={
          <>
            <LinkButton to="/scanner" icon="qr_code_scanner">
              Scan
            </LinkButton>
            {canAnyNew() && (
              <LinkButton to="/receipts/new" variant="primary" icon="add">
                New operation
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-4">
        <DemoModeBar onReset={() => setResetOpen(true)} />
      </div>

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total stock"
          icon="inventory_2"
          tone="primary"
          value={n(d.totalStock).toLocaleString('en-IN')}
          sub={`${d.available.toLocaleString('en-IN')} available · ${d.reserved.toLocaleString('en-IN')} reserved`}
          to="/products"
        />
        <KpiCard
          label="Inventory value"
          icon="account_balance_wallet"
          tone="info"
          value={money(d.inventoryValue, currency, true)}
          sub={`At standard cost across ${d.catalogSkus} products`}
          to="/reports/stock-valuation"
        />
        <KpiCard
          label="Low stock"
          icon="trending_down"
          tone={d.lowStockCount > 0 ? 'warning' : 'success'}
          value={d.lowStockCount}
          sub={`${d.outOfStockCount} out of stock · ${d.lowStockCount - d.outOfStockCount} below reorder level`}
          to="/low-stock"
        />
        <KpiCard
          label="Inventory accuracy"
          icon="verified"
          tone={d.accuracy >= 99 ? 'success' : d.accuracy >= 97 ? 'warning' : 'danger'}
          value={percent(d.accuracy)}
          sub="Physical counts against the book position"
          to="/reports/inventory-accuracy"
        />
        <KpiCard
          label="Pending receipts"
          icon="move_to_inbox"
          tone="info"
          value={d.pendingReceipts}
          sub="Goods expected into the network"
          to="/receipts"
        />
        <KpiCard
          label="Pending deliveries"
          icon="local_shipping"
          tone={d.blockedDeliveries > 0 ? 'danger' : 'primary'}
          value={d.pendingDeliveries}
          sub={d.blockedDeliveries > 0 ? `${d.blockedDeliveries} blocked by a shortage` : 'All orders can be fulfilled'}
          to="/deliveries"
        />
        <KpiCard
          label="Transfers"
          icon="swap_horiz"
          tone={d.openTransfers > 0 ? 'warning' : 'neutral'}
          value={d.openTransfers}
          sub="Internal moves still to complete"
          to="/transfers"
        />
        <KpiCard
          label="Needs a decision"
          icon="priority_high"
          tone={criticalCount > 0 ? 'danger' : d.attention.length > 0 ? 'warning' : 'success'}
          value={d.attention.length}
          sub={`${d.pendingApprovals} awaiting approval · ${d.openCounts} counts open`}
          to="/dashboard#attention"
        />
      </div>

      {/* --------------------------------------- needs attention + timeline */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div id="attention" className="scroll-mt-20">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-[13px] font-bold">
                <Icon name="priority_high" size={17} className="text-danger" />
                Needs attention
                {criticalCount > 0 && (
                  <Badge tone="danger" className="ml-1">
                    {criticalCount} critical
                  </Badge>
                )}
              </h2>
              <div className="flex gap-1">
                {(['all', 'critical', 'warning', 'info'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setAttentionFilter(key)}
                    className={`rounded-control px-2 py-1 text-[11.5px] font-semibold capitalize ${
                      attentionFilter === key ? 'bg-primary-soft text-primary' : 'text-text-muted hover:bg-surface-muted'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {attention.length === 0 ? (
              <EmptyState
                icon="task_alt"
                title="Nothing needs you right now"
                detail="Every document is moving and no item has crossed its reorder level."
              />
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-muted">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        item.severity === 'critical'
                          ? 'bg-danger-soft text-danger'
                          : item.severity === 'warning'
                            ? 'bg-warning-soft text-warning'
                            : 'bg-info-soft text-info'
                      }`}
                    >
                      <Icon name={SEVERITY_ICON[item.kind] ?? 'info'} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold">{item.title}</p>
                      <p className="truncate text-[11.5px] text-text-muted">{item.detail}</p>
                    </div>
                    <span
                      className={`hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase sm:inline ${
                        item.severity === 'critical'
                          ? 'border-danger-border bg-danger-soft text-danger-ink'
                          : item.severity === 'warning'
                            ? 'border-warning-border bg-warning-soft text-warning-ink'
                            : 'border-info-border bg-info-soft text-info-ink'
                      }`}
                    >
                      {item.status}
                    </span>
                    <Link to={item.link} className="btn btn-secondary btn-sm shrink-0">
                      {item.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {nextActions.length > 0 && (
            <Card className="mt-4 p-4">
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold">
                <Icon name="arrow_forward" size={17} className="text-primary" />
                What to do next
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {nextActions.map((action) => (
                  <Link
                    key={action.to + action.label}
                    to={action.to}
                    className="flex min-h-11 items-center gap-2.5 rounded-card border border-border px-3 py-2.5 transition hover:border-primary/50"
                  >
                    <Icon name={action.icon} size={18} className="text-primary" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{action.label}</span>
                    <Badge tone="neutral">{action.count}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Operations timeline"
            icon="bolt"
            action={<LiveDot />}
          >
            <Timeline
              emptyLabel="No movements yet. Validate a receipt to start the timeline."
              items={d.timeline.map((event) => ({
                at: event.at,
                time: timeOnly(event.at),
                title: event.summary,
                detail: event.detail,
                tone: (event.severity === 'critical'
                  ? 'danger'
                  : event.severity === 'warning'
                    ? 'warning'
                    : event.severity === 'success'
                      ? 'success'
                      : 'info') as Tone,
                icon:
                  event.type === 'STOCK_RECEIVED'
                    ? 'south_west'
                    : event.type === 'STOCK_DELIVERED'
                      ? 'north_east'
                      : event.type === 'STOCK_TRANSFERRED'
                        ? 'compare_arrows'
                        : event.type === 'STOCK_ADJUSTED'
                          ? 'rule'
                          : event.type === 'LOW_STOCK_TRIGGERED'
                            ? 'trending_down'
                            : 'description',
                to: event.link,
              }))}
            />
            <Link to="/moves" className="btn btn-ghost btn-sm mt-2 w-full">
              Open the full move history
            </Link>
          </SectionCard>
        </div>
      </div>

      {/* ------------------------------------------ queues, stock, accuracy */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Low stock" icon="trending_down" action={<Link to="/low-stock" className="btn btn-ghost btn-sm">All items</Link>}>
          {d.outOfStockList.length + d.lowStockList.length === 0 ? (
            <EmptyState icon="check_circle" title="Everything is above its reorder level" compact />
          ) : (
            <ul className="space-y-2">
              {[...d.outOfStockList, ...d.lowStockList].slice(0, 6).map((item) => (
                <li key={item.sku} className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      item.onHand === 0 ? 'bg-danger' : 'bg-warning'
                    }`}
                  />
                  <Link to={`/products/${item.sku}`} className="min-w-0 flex-1 truncate text-[12px] font-semibold hover:text-primary">
                    {item.name}
                  </Link>
                  <span className="tnum shrink-0 font-mono text-[11.5px]">
                    {n(item.onHand)} / {n(item.reorderPoint)} {item.uom}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Stock value by warehouse" icon="warehouse" action={<Link to="/warehouses" className="btn btn-ghost btn-sm">Details</Link>}>
          <ul className="space-y-2.5">
            {snap.warehousesSummary.map((w) => {
              const max = Math.max(1, ...snap.warehousesSummary.map((x) => x.stockValue));
              return (
                <li key={w.code}>
                  <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <Link to={`/warehouses/${w.code}`} className="truncate font-semibold hover:text-primary">
                      {w.name}
                    </Link>
                    <span className="tnum shrink-0 font-mono font-bold">{money(w.stockValue, currency, true)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={`h-full rounded-full ${w.utilisation > 88 ? 'bg-danger' : w.utilisation > 70 ? 'bg-warning' : 'bg-primary'}`}
                      style={{ width: `${(w.stockValue / max) * 100}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-text-subtle">
                    {w.utilisation}% utilised · {w.products} products · in {n(w.incoming)} / out {n(w.outgoing)}
                  </p>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Recent stock movements" icon="receipt_long" action={<Link to="/moves" className="btn btn-ghost btn-sm">All moves</Link>}>
          {snap.ledger.length === 0 ? (
            <EmptyState icon="receipt_long" title="No movements yet" compact />
          ) : (
            <ul className="divide-y divide-border">
              {snap.ledger.slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex items-center gap-2.5 py-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      entry.delta > 0
                        ? 'bg-success-soft text-success'
                        : entry.delta < 0
                          ? 'bg-danger-soft text-danger'
                          : 'bg-info-soft text-info'
                    }`}
                  >
                    <Icon
                      name={entry.type === 'TRANSFER' ? 'compare_arrows' : entry.delta >= 0 ? 'south_west' : 'north_east'}
                      size={15}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">{entry.name}</p>
                    <p className="truncate text-[10.5px] text-text-subtle">
                      <span className="ref">{entry.ref}</span> · {shortDate(entry.at)} · {entry.user}
                    </p>
                  </div>
                  <span className="tnum shrink-0 font-mono text-[11.5px] font-bold">
                    {signed(entry.delta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="28-day stock flow" icon="show_chart" className="lg:col-span-2">
          <FlowChart
            data={buildFlow(snap.ledger)}
            format={(v) => n(v).toLocaleString('en-IN')}
          />
        </SectionCard>

        <SectionCard title="Open documents" icon="description">
          <ul className="space-y-2 text-[12px]">
            {[
              { label: 'Receipts waiting or ready', value: d.pendingReceipts, to: '/receipts' },
              { label: 'Deliveries in progress', value: d.pendingDeliveries, to: '/deliveries' },
              { label: 'Transfers to complete', value: d.openTransfers, to: '/transfers' },
              { label: 'Adjustments awaiting approval', value: d.pendingApprovals, to: '/adjustments' },
              { label: 'Counts to finish', value: d.openCounts, to: '/counts' },
            ].map((row) => (
              <li key={row.label}>
                <Link to={row.to} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                  <span className="text-text-muted">{row.label}</span>
                  <span className="tnum font-mono font-bold">{row.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset demo data?"
        subtitle="This returns the whole application to the canonical scenario."
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon="restart_alt"
              loading={busy}
              onClick={() => {
                void run(
                  'Reset demo data',
                  () => demoService.reset(),
                  { success: 'Demo data restored', detail: 'Stock, documents, ledger and notifications are back to their starting values.' },
                ).then((res) => {
                  if (res.ok) {
                    setResetOpen(false);
                    void refresh();
                  }
                });
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <WarnNote tone="warning">
          Every receipt, delivery, transfer, count, adjustment, ledger row and notification you have created will be
          discarded and replaced with the original dataset. Steel Rods will return to 0 kg.
        </WarnNote>
      </Modal>
    </>
  );

  function canAnyNew(): boolean {
    return can('receipt.create') || can('delivery.create') || can('transfer.create');
  }
}

/** Last 28 days of net movement, oldest first — real ledger data only. */
function buildFlow(ledger: { at: string; delta: number }[]): [string, number][] {
  const days: [string, number][] = [];
  const now = new Date();
  const index = new Map<string, number>();
  for (let i = 27; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    index.set(key, days.length);
    days.push([key, 0]);
  }
  for (const entry of ledger) {
    const key = entry.at.slice(0, 10);
    const at = index.get(key);
    if (at !== undefined) days[at]![1] += entry.delta;
  }
  return days;
}

export { StatusBadge };
