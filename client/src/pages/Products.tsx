import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, useSnap } from '../store';
import { adjustmentService } from '../services';
import { money, qty as n, shortDate, signed, stamp } from '../lib/format';
import { downloadCsv, stampForFile, toCsv } from '../lib/csv';
import { useTable } from '../lib/hooks';
import type { AdjustmentReason, Product } from '../types';
import {
  Badge,
  Button,
  Card,
  Delta,
  EmptyState,
  ErrorState,
  Field,
  FlowChart,
  Icon,
  IconButton,
  KeyValue,
  LinkButton,
  Meter,
  Modal,
  PageHeader,
  Pagination,
  QuantityInput,
  SearchInput,
  SectionCard,
  Segmented,
  Select,
  StatRow,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  Timeline,
  Toolbar,
  WarnNote,
} from '../components/design';
import { LEDGER_ICON, LEDGER_LABEL } from '../lib/format';

/* ============================================================ products list */

type View = 'table' | 'cards' | 'locations';

export default function Products() {
  const { snap, can, notify } = useApp();
  const [view, setView] = useState<View>('table');
  const [adjust, setAdjust] = useState<Product | null>(null);

  const categories = useMemo(() => ['All', ...new Set(snap.products.map((p) => p.category))].sort(), [snap.products]);

  const table = useTable(snap.products, {
    search: (p, term) =>
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      p.barcode.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term),
    filters: {
      category: (p) => p.category === table.filters.category,
      health: (p) => p.health === table.filters.health,
      warehouse: (p) =>
        table.filters.warehouse === 'All' ||
        table.filters.warehouse === '' ||
        p.locations.some((l) => l.warehouse === table.filters.warehouse),
    },
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      onHand: (a, b) => a.onHand - b.onHand,
      value: (a, b) => a.value - b.value,
      available: (a, b) => a.available - b.available,
    },
    pageSize: 12,
  });

  const exportCsv = () => {
    const columns = [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'uom', label: 'Unit' },
      { key: 'onHand', label: 'On hand' },
      { key: 'reserved', label: 'Reserved' },
      { key: 'available', label: 'Available' },
      { key: 'reorderPoint', label: 'Reorder level' },
      { key: 'health', label: 'Health' },
      { key: 'value', label: `Value (${snap.settings.company.currency})` },
    ];
    const rows = table.allRows.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      uom: p.uom,
      onHand: p.onHand,
      reserved: p.reserved,
      available: p.available,
      reorderPoint: p.reorder.reorderPoint,
      health: p.health,
      value: p.value,
    }));
    downloadCsv(`stocksense-products-${stampForFile()}`, toCsv(columns, rows));
    notify({ tone: 'success', title: 'Products exported', detail: `${rows.length} rows written to CSV.` });
  };

  const totals = table.allRows.reduce(
    (acc, p) => ({
      units: acc.units + p.onHand,
      value: acc.value + p.value,
      reserved: acc.reserved + p.reserved,
      flagged: acc.flagged + (p.health === 'IN_STOCK' ? 0 : 1),
    }),
    { units: 0, value: 0, reserved: 0, flagged: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Inventory master"
        title="Products & Stock"
        breadcrumb={[{ label: 'Overview' }, { label: 'Products & Stock' }]}
        description="On hand, reserved, available and value for every product, with the locations that hold it."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              ariaLabel="Choose a view"
              options={[
                { value: 'table', label: 'Table', icon: 'table_rows' },
                { value: 'cards', label: 'Cards', icon: 'grid_view' },
                { value: 'locations', label: 'By location', icon: 'shelves' },
              ]}
            />
            {can('ledger.export') && (
              <Button icon="download" onClick={exportCsv}>
                Export CSV
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        <Field label="Search" className="min-w-52 flex-1">
          <SearchInput
            value={table.term}
            onChange={table.setTerm}
            placeholder="Name, SKU, barcode or category…"
          />
        </Field>
        <Field label="Category" className="min-w-40">
          <Select value={table.filters.category ?? 'All'} onChange={(e) => table.setFilter('category', e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Health" className="min-w-36">
          <Select value={table.filters.health ?? 'All'} onChange={(e) => table.setFilter('health', e.target.value)}>
            <option value="All">All health states</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW">Low stock</option>
            <option value="OUT">Out of stock</option>
          </Select>
        </Field>
        <Field label="Warehouse" className="min-w-40">
          <Select value={table.filters.warehouse ?? 'All'} onChange={(e) => table.setFilter('warehouse', e.target.value)}>
            <option value="All">All warehouses</option>
            {snap.warehouses.map((w) => (
              <option key={w.code} value={w.code}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ml-auto flex flex-wrap items-end gap-4">
          <Counter label="Products" value={table.allRows.length} />
          <Counter label="Units on hand" value={n(totals.units)} />
          <Counter label="Value" value={money(totals.value, snap.settings.company.currency, true)} />
          <Counter label="Flagged" value={totals.flagged} tone={totals.flagged > 0 ? 'warning' : undefined} />
          {(table.activeFilters.length > 0 || table.term) && (
            <Button size="sm" variant="ghost" icon="filter_alt_off" onClick={table.clearFilters}>
              Clear all
            </Button>
          )}
        </div>
      </Toolbar>

      {table.allRows.length === 0 ? (
        <Card>
          <EmptyState
            icon="inventory_2"
            title="No products match these filters"
            detail="Try a different search term, or clear the filters to see the whole catalogue."
            action={
              <Button icon="filter_alt_off" onClick={table.clearFilters}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : view === 'table' ? (
        <Card className="overflow-hidden">
          <Table>
            <thead className="border-b border-border">
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Category</Th>
                <Th>UOM</Th>
                <Th align="right" sortable sorted={table.sort?.key === 'onHand' ? table.sort.dir : null} onSort={() => table.toggleSort('onHand')}>
                  On hand
                </Th>
                <Th align="right">Reserved</Th>
                <Th align="right" sortable sorted={table.sort?.key === 'available' ? table.sort.dir : null} onSort={() => table.toggleSort('available')}>
                  Available
                </Th>
                <Th align="right">Reorder level</Th>
                <Th>Health</Th>
                <Th>Locations</Th>
                <Th align="right" sortable sorted={table.sort?.key === 'value' ? table.sort.dir : null} onSort={() => table.toggleSort('value')}>
                  Value
                </Th>
                <Th>Last updated</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.map((p) => (
                <tr key={p.sku} className="row">
                  <Td>
                    <Link to={`/products/${p.sku}`} className="flex items-center gap-2 hover:text-primary">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <Icon name={p.icon} size={15} fill />
                      </span>
                      <span className="min-w-0 truncate font-semibold">{p.name}</span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="ref text-[11.5px]">{p.sku}</span>
                  </Td>
                  <Td className="text-[11.5px] text-text-muted">{p.category}</Td>
                  <Td className="text-[11.5px] font-semibold">{p.uom}</Td>
                  <Td align="right">
                    <span className={`tnum font-mono font-bold ${p.onHand === 0 ? 'text-danger' : p.health === 'LOW' ? 'text-warning' : ''}`}>
                      {n(p.onHand).toLocaleString('en-IN')}
                    </span>
                  </Td>
                  <Td align="right" className="tnum font-mono text-[11.5px] text-warning">
                    {p.reserved > 0 ? n(p.reserved) : '—'}
                  </Td>
                  <Td align="right" className="tnum font-mono text-[12px] font-semibold">
                    {n(p.available).toLocaleString('en-IN')}
                  </Td>
                  <Td align="right" className="tnum font-mono text-[11.5px] text-text-muted">
                    {n(p.reorder.reorderPoint)}
                  </Td>
                  <Td>
                    <StatusBadge value={p.health} />
                  </Td>
                  <Td className="tnum font-mono text-[11.5px]">{p.locations.length}</Td>
                  <Td align="right" className="tnum font-mono text-[11.5px] font-semibold">
                    {money(p.value, snap.settings.company.currency)}
                  </Td>
                  <Td className="whitespace-nowrap text-[11.5px] text-text-muted">{shortDate(p.updatedAt)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <IconButton label={`View ${p.name}`} icon="visibility" size="sm" onClick={() => window.location.assign(`#/products/${p.sku}`)} />
                      <Link to={`/receipts/new?sku=${p.sku}`} className="btn btn-ghost btn-sm btn-icon" title="Receive" aria-label={`Receive ${p.name}`}>
                        <Icon name="south_west" size={15} />
                      </Link>
                      <Link to={`/transfers/new?sku=${p.sku}`} className="btn btn-ghost btn-sm btn-icon" title="Transfer" aria-label={`Transfer ${p.name}`}>
                        <Icon name="swap_horiz" size={15} />
                      </Link>
                      {can('adjustment.create') && (
                        <IconButton label="Adjust" icon="rule" size="sm" onClick={() => setAdjust(p)} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} total={table.total} unit="products" />
        </Card>
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {table.rows.map((p) => (
            <article key={p.sku} className="card animate-in flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon name={p.icon} size={21} fill />
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/products/${p.sku}`} className="block truncate text-[13px] leading-tight font-bold hover:text-primary">
                    {p.name}
                  </Link>
                  <p className="ref mt-0.5 truncate text-[10.5px] text-text-muted">{p.sku}</p>
                </div>
                <StatusBadge value={p.health} />
              </div>

              <div className="mt-3 flex items-end gap-1.5">
                <span className={`tnum text-[26px] leading-none font-extrabold ${p.onHand === 0 ? 'text-danger' : p.health === 'LOW' ? 'text-warning' : ''}`}>
                  {n(p.onHand).toLocaleString('en-IN')}
                </span>
                <span className="mb-0.5 text-[12px] text-text-muted">{p.uom}</span>
                <span className="mb-0.5 ml-auto font-mono text-[11px] text-text-subtle">
                  {money(p.value, snap.settings.company.currency, true)}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                {p.locations.slice(0, 3).map((l) => (
                  <div key={l.code} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[10.5px] text-text-muted" title={l.name}>
                      {l.name}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.onHand > 0 ? (l.qty / p.onHand) * 100 : 0}%` }} />
                    </div>
                    <span className="tnum w-12 shrink-0 text-right font-mono text-[10.5px] font-semibold">{n(l.qty)}</span>
                  </div>
                ))}
                {p.locations.length === 0 && (
                  <p className="flex items-center gap-1.5 rounded-md bg-danger-soft px-2 py-1 text-[10.5px] font-semibold text-danger-ink">
                    <Icon name="error" size={13} /> No stock in any location
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[10.5px]">
                <Badge tone="neutral">Reorder at {n(p.reorder.reorderPoint)}</Badge>
                {p.reserved > 0 && <Badge tone="warning">Reserved {n(p.reserved)}</Badge>}
                {p.incoming > 0 && <Badge tone="info">Incoming {n(p.incoming)}</Badge>}
                <span className="ml-auto flex gap-1">
                  <Link to={`/products/${p.sku}`} className="btn btn-ghost btn-sm" aria-label={`Open ${p.name}`}>
                    View
                  </Link>
                  {can('adjustment.create') && (
                    <Button size="sm" variant="ghost" onClick={() => setAdjust(p)}>
                      Adjust
                    </Button>
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <StockByLocation products={table.allRows} warehouses={snap.warehouses} currency={snap.settings.company.currency} />
      )}

      {table.allRows.length > 12 && (
        <div className="mt-3">
          <Pagination page={table.page} pageCount={table.pageCount} onPage={table.setPage} total={table.total} unit="products" />
        </div>
      )}

      <QuickAdjustDialog product={adjust} onClose={() => setAdjust(null)} />
    </>
  );
}

function Counter({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[0.05em] text-text-muted uppercase">{label}</p>
      <p className={`tnum font-mono text-[15px] font-extrabold ${tone === 'warning' ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}

/** Product × location matrix, built from the same numbers the server reports. */
function StockByLocation({
  products,
  warehouses,
  currency,
}: {
  products: Product[];
  warehouses: { code: string; name: string }[];
  currency: string;
}) {
  const [warehouse, setWarehouse] = useState('All');
  const locations = useMemo(() => {
    const map = new Map<string, { code: string; name: string; warehouse: string }>();
    for (const p of products) {
      for (const l of p.locations) {
        if (!map.has(l.code)) {
          const loc = snapLocationName(l.code);
          map.set(l.code, { code: l.code, name: loc, warehouse: l.warehouse });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [products]);

  function snapLocationName(code: string): string {
    return code.split('/').pop()?.replace(/-/g, ' ') ?? code;
  }

  const rows = locations
    .filter((l) => warehouse === 'All' || l.warehouse === warehouse)
    .map((location) => {
      const held = products
        .map((p) => ({ p, qty: p.locations.find((l) => l.code === location.code)?.qty ?? 0 }))
        .filter((row) => row.qty > 0)
        .sort((a, b) => b.qty - a.qty);
      return {
        ...location,
        held,
        total: held.reduce((a, row) => a + row.qty, 0),
        value: held.reduce((a, row) => a + row.qty * row.p.unitCost, 0),
      };
    });

  return (
    <>
      <Toolbar>
        <Field label="Warehouse" className="min-w-48">
          <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="All">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.code} value={w.code}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="ml-auto text-[11.5px] text-text-muted">
          {rows.length} location(s) holding {products.length} product(s)
        </p>
      </Toolbar>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.code} className="overflow-hidden">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <Link to={`/locations/${row.code}`} className="block truncate text-[13px] font-bold hover:text-primary">
                  {row.name}
                </Link>
                <p className="ref mt-0.5 truncate text-[10.5px] text-text-muted">{row.code}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum font-mono text-[15px] font-extrabold">{n(row.total).toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-text-subtle">{money(row.value, currency, true)}</p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {row.held.map((h) => (
                <li key={h.p.sku}>
                  <Link to={`/products/${h.p.sku}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-muted">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{h.p.name}</span>
                    <span className="tnum shrink-0 font-mono text-[12px] font-bold">
                      {n(h.qty)} <span className="text-[10px] font-medium text-text-subtle">{h.p.uom}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ========================================================= quick adjust */

const REASONS: AdjustmentReason[] = ['Damaged', 'Missing', 'Expired', 'Counting Error', 'Incorrect Entry', 'Other'];

export function QuickAdjustDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { snap, run, busy } = useApp();
  const [location, setLocation] = useState('');
  const [counted, setCounted] = useState<number | null>(null);
  const [reason, setReason] = useState<AdjustmentReason>('Counting Error');
  const [notes, setNotes] = useState('');

  const leafLocations = snap.locations.filter((l) => !l.container);
  const active = location || leafLocations[0]?.code || '';
  const bookQty = product
    ? product.locations.find((l) => l.code === active)?.qty ?? 0
    : 0;
  const difference = counted === null ? null : n(counted - bookQty);
  const impact = (difference ?? 0) * (product?.unitCost ?? 0);
  const requiresApproval =
    Math.abs(impact) >= snap.settings.approvalValueThreshold ||
    (bookQty > 0 ? (Math.abs(difference ?? 0) / bookQty) * 100 : 0) >= snap.settings.approvalVariancePct;

  const submit = async () => {
    if (!product || counted === null) return;
    const res = await run(
      `Adjustment for ${product.sku}`,
      () => adjustmentService.create({ sku: product.sku, location: active, counted, reason, notes }),
      {
        success: `Adjustment raised for ${product.sku}`,
        detail: requiresApproval
          ? 'It now needs approval before stock changes.'
          : 'Submit it for approval to post the variance.',
        action: { label: 'Open adjustment', to: '/adjustments' },
      },
    );
    if (res.ok) {
      setCounted(null);
      setNotes('');
      onClose();
    }
  };

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Raise a count variance"
      subtitle={product ? `${product.name} · ${product.sku}` : ''}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="add" loading={busy} disabled={!product || counted === null} onClick={() => void submit()}>
            Raise adjustment
          </Button>
        </>
      }
    >
      {product && (
        <div className="space-y-4">
          <StatRow
            columns={3}
            items={[
              { label: 'On hand (all)', value: `${n(product.onHand)} ${product.uom}` },
              { label: 'Unit cost', value: money(product.unitCost, snap.settings.company.currency) },
              { label: 'Value', value: money(product.value, snap.settings.company.currency, true) },
            ]}
          />

          <Field label="Location" required htmlFor="adjust-location">
            <Select id="adjust-location" value={active} onChange={(e) => setLocation(e.target.value)}>
              {leafLocations.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.code}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Book quantity at ${active.split('/').pop()}`}>
              <Input value={bookQty} readOnly className="tnum bg-surface-muted font-mono opacity-70" />
            </Field>
            <Field label="Physical count" required htmlFor="adjust-count">
              <QuantityInput id="adjust-count" value={counted} onChange={setCounted} unit={product.uom} />
            </Field>
          </div>

          <div
            className={`flex items-center justify-between rounded-card border px-3.5 py-2.5 ${
              difference === null
                ? 'border-border bg-surface-muted'
                : difference === 0
                  ? 'border-border bg-surface-muted'
                  : difference > 0
                    ? 'border-success-border bg-success-soft'
                    : 'border-danger-border bg-danger-soft'
            }`}
          >
            <span className="text-[12px] font-bold">Difference</span>
            <span className="flex items-baseline gap-2.5">
              {difference === null ? (
                <span className="text-[12px] text-text-muted">Enter a count</span>
              ) : (
                <>
                  <Delta value={difference} className="text-[15px]" />
                  <span className="tnum font-mono text-[11.5px] text-text-muted">
                    {money(impact, snap.settings.company.currency)}
                  </span>
                </>
              )}
            </span>
          </div>

          {requiresApproval && (
            <WarnNote tone="warning">
              This variance crosses the approval threshold. It will need a manager to approve it before stock changes.
            </WarnNote>
          )}

          <Field label="Reason" required htmlFor="adjust-reason">
            <Select id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="adjust-notes" hint="Recorded verbatim on the ledger row.">
            <Textarea
              id="adjust-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was the count verified?"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ========================================================== product detail */

export function ProductDetail() {
  const { sku = '' } = useParams();
  const navigate = useNavigate();
  const { snap, can } = useApp();
  const [moveView, setMoveView] = useState<'timeline' | 'table' | 'chart'>('timeline');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const product = snap.products.find((p) => p.sku === sku);
  const ledger = useMemo(() => snap.ledger.filter((l) => l.sku === sku), [snap.ledger, sku]);
  const openOrders = useMemo(() => {
    const out: { ref: string; kind: string; qty: number; to: string; status: string; link: string; scheduledDate: string }[] = [];
    for (const d of snap.deliveries) {
      if (d.status === 'Done' || d.status === 'Canceled') continue;
      for (const line of d.lines) {
        if (line.sku === sku) out.push({ ref: d.ref, kind: 'Delivery', qty: line.qty, to: d.from, status: d.status, link: `/deliveries/${d.ref}`, scheduledDate: d.scheduledDate });
      }
    }
    for (const r of snap.receipts) {
      if (r.status === 'Done' || r.status === 'Canceled') continue;
      for (const line of r.lines) {
        if (line.sku === sku) out.push({ ref: r.ref, kind: 'Receipt', qty: line.expected, to: r.destination, status: r.status, link: `/receipts/${r.ref}`, scheduledDate: r.scheduledDate });
      }
    }
    for (const t of snap.transfers) {
      if (t.status === 'Done' || t.status === 'Canceled') continue;
      for (const line of t.lines) {
        if (line.sku === sku) out.push({ ref: t.ref, kind: t.to === sku ? 'Transfer in' : 'Transfer out', qty: line.qty, to: t.to, status: t.status, link: `/transfers/${t.ref}`, scheduledDate: t.createdAt.slice(0, 10) });
      }
    }
    return out;
  }, [snap.deliveries, snap.receipts, snap.transfers, sku]);

  const reservedBy = useMemo(() => {
    const out: { ref: string; customer: string; qty: number; link: string }[] = [];
    for (const d of snap.deliveries) {
      if (!['Ready', 'Picking', 'Packed'].includes(d.status)) continue;
      for (const line of d.lines) {
        if (line.sku === sku) out.push({ ref: d.ref, customer: d.customer, qty: line.qty, link: `/deliveries/${d.ref}` });
      }
    }
    return out;
  }, [snap.deliveries, sku]);

  if (!product) {
    return (
      <Card>
        <ErrorState
          title={`“${sku}” is not in the catalogue`}
          detail="It may have been renamed or removed. Search for it from the products page."
          onRetry={() => navigate('/products')}
          retryLabel="Back to products"
        />
      </Card>
    );
  }

  const dayFlow = buildFlow(ledger);
  const maxLocation = Math.max(1, ...product.locations.map((l) => l.qty));

  return (
    <>
      <PageHeader
        eyebrow={`${product.category} · ${product.uom}`}
        title={product.name}
        breadcrumb={[
          { label: 'Overview' },
          { label: 'Products', to: '/products' },
          { label: product.sku },
        ]}
        description={`${product.sku} · barcode ${product.barcode} · standard cost ${money(product.unitCost, snap.settings.company.currency)} per ${product.uom}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={product.health} />
            <Badge tone="neutral">Reorder at {n(product.reorder.reorderPoint)} {product.uom}</Badge>
            {product.reserved > 0 && <Badge tone="warning">{n(product.reserved)} {product.uom} reserved</Badge>}
            {product.incoming > 0 && <Badge tone="info">{n(product.incoming)} {product.uom} incoming</Badge>}
          </div>
        }
        actions={
          <>
            <LinkButton to={`/receipts/new?sku=${product.sku}`} icon="south_west">
              Receive
            </LinkButton>
            <LinkButton to={`/transfers/new?sku=${product.sku}`} icon="swap_horiz">
              Transfer
            </LinkButton>
            <LinkButton to={`/deliveries/new?sku=${product.sku}`} icon="north_east">
              Deliver
            </LinkButton>
      {can('adjustment.create') && (
        <Button variant="primary" icon="rule" onClick={() => setAdjustOpen(true)}>
          Adjust
        </Button>
      )}
        </>
      }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <StatRow
            columns={4}
            items={[
              { label: 'On hand', value: `${n(product.onHand)}`, tone: product.onHand === 0 ? 'danger' : product.health === 'LOW' ? 'warning' : undefined },
              { label: 'Reserved', value: `${n(product.reserved)}` },
              { label: 'Available', value: `${n(product.available)}`, tone: 'success' },
              { label: 'Incoming', value: `${n(product.incoming)}` },
            ]}
          />
          <StatRow
            columns={3}
            items={[
              { label: 'Reorder level', value: `${n(product.reorder.reorderPoint)}` },
              { label: `Value on hand`, value: money(product.value, snap.settings.company.currency, true) },
              { label: 'Last updated', value: shortDate(product.updatedAt) },
            ]}
          />

          <SectionCard
            title="Location distribution"
            icon="shelves"
            action={<Link to="/inventory" className="btn btn-ghost btn-sm">All locations</Link>}
          >
            {product.locations.length === 0 ? (
              <WarnNote tone="danger">
                {product.name} has no stock in any location. Outbound orders for this product will be blocked until it is
                received.
              </WarnNote>
            ) : (
              <ul className="space-y-2.5">
                {product.locations.map((l) => (
                  <li key={l.code}>
                    <div className="flex items-baseline justify-between gap-3 text-[12px]">
                      <Link to={`/locations/${l.code}`} className="min-w-0 truncate font-semibold hover:text-primary">
                        {l.name}
                        <span className="ref ml-1.5 text-[10.5px] text-text-subtle">{l.code}</span>
                      </Link>
                      <span className="tnum shrink-0 font-mono font-bold">
                        {n(l.qty)} <span className="text-[10px] font-medium text-text-subtle">{product.uom}</span>
                      </span>
                    </div>
                    <div className="mt-1">
                      <Meter value={l.qty} max={maxLocation} tone={l.qty / maxLocation < 0.2 ? 'warning' : 'primary'} />
                    </div>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-border pt-2.5 text-[12px] font-bold">
                  <span>Total</span>
                  <span className="tnum font-mono">{n(product.onHand)} {product.uom}</span>
                </li>
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Stock movement"
            icon="receipt_long"
            action={
              <Segmented
                value={moveView}
                onChange={setMoveView}
                ariaLabel="Movement view"
                options={[
                  { value: 'timeline', label: 'Timeline', icon: 'timeline' },
                  { value: 'table', label: 'Table', icon: 'table_rows' },
                  { value: 'chart', label: 'Chart', icon: 'show_chart' },
                ]}
              />
            }
          >
            {ledger.length === 0 ? (
              <EmptyState
                icon="history"
                title="No movements recorded yet"
                detail="This product has never been received, delivered, transferred or adjusted."
              />
            ) : moveView === 'timeline' ? (
              <Timeline
                items={ledger.map((entry) => ({
                  at: entry.at,
                  time: entry.at.slice(11, 16),
                  title: `${LEDGER_LABEL[entry.type]} · ${entry.ref}`,
                  detail: entry.note,
                  meta: (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-text-subtle">
                      <span>{entry.from} → {entry.to}</span>
                      <Delta value={entry.delta} />
                      <span>balance {n(entry.balanceAfter)} {product.uom}</span>
                      <span>· {entry.user}</span>
                    </p>
                  ),
                  tone: (entry.delta > 0 ? 'success' : entry.delta < 0 ? 'danger' : 'info') as 'success' | 'danger' | 'info',
                  icon: LEDGER_ICON[entry.type] ?? 'swap_horiz',
                }))}
              />
            ) : moveView === 'table' ? (
              <Table>
                <thead className="border-b border-border">
                  <tr>
                    <Th>When</Th>
                    <Th>Reference</Th>
                    <Th>Operation</Th>
                    <Th>From → To</Th>
                    <Th align="right">Change</Th>
                    <Th align="right">Balance</Th>
                    <Th>User</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="row">
                      <Td className="whitespace-nowrap font-mono text-[10.5px]">{stamp(entry.at)}</Td>
                      <Td>
                        <span className="ref text-[11.5px]">{entry.ref}</span>
                      </Td>
                      <Td>
                        <Badge tone={entry.type === 'DELIVERY' ? 'danger' : entry.type === 'RECEIPT' ? 'success' : entry.type === 'ADJUSTMENT' ? 'warning' : 'info'}>
                          {LEDGER_LABEL[entry.type]}
                        </Badge>
                      </Td>
                      <Td className="max-w-64">
                        <span className="block truncate text-[11px] text-text-muted">
                          {entry.from} <Icon name="arrow_right_alt" size={12} className="inline" /> {entry.to}
                        </span>
                      </Td>
                      <Td align="right">
                        <Delta value={entry.delta} />
                      </Td>
                      <Td align="right" className="tnum font-mono text-[12px] font-bold">
                        {n(entry.balanceAfter)}
                      </Td>
                      <Td className="max-w-28 truncate text-[11.5px] text-text-muted">{entry.user}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <FlowChart data={dayFlow} format={(v) => `${signed(v)} ${product.uom}`} />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Reorder rule" icon="rule">
            <KeyValue
              items={[
                { label: 'Minimum stock', value: `${n(product.reorder.minStock)} ${product.uom}` },
                { label: 'Reorder level', value: `${n(product.reorder.reorderPoint)} ${product.uom}` },
                { label: 'Safety stock', value: `${n(product.reorder.safetyStock)} ${product.uom}` },
                { label: 'Suggested order', value: `${n(product.reorder.reorderQty)} ${product.uom}` },
                { label: 'Preferred supplier', value: product.reorder.preferredSupplier },
                { label: 'Lead time', value: `${product.reorder.leadTimeDays} days` },
              ]}
            />
            <Link to="/reorder-rules" className="btn btn-secondary btn-sm mt-3 w-full">
              Edit reorder rules
            </Link>
          </SectionCard>

          <SectionCard title="Reserved for" icon="lock">
            {reservedBy.length === 0 ? (
              <p className="text-[12px] text-text-muted">Nothing is reserved for this product.</p>
            ) : (
              <ul className="space-y-1.5">
                {reservedBy.map((r) => (
                  <li key={r.ref}>
                    <Link to={r.link} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                      <span className="min-w-0 truncate text-[12px]">
                        <span className="ref">{r.ref}</span> · {r.customer}
                      </span>
                      <span className="tnum shrink-0 font-mono text-[12px] font-bold">{n(r.qty)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Open commitments" icon="event">
            {openOrders.length === 0 ? (
              <p className="text-[12px] text-text-muted">No open receipts, deliveries or transfers for this product.</p>
            ) : (
              <ul className="space-y-1.5">
                {openOrders.map((o) => (
                  <li key={`${o.ref}-${o.kind}`}>
                    <Link to={o.link} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                      <Badge tone={o.kind === 'Receipt' ? 'success' : o.kind === 'Delivery' ? 'danger' : 'info'}>{o.kind}</Badge>
                      <span className="ref min-w-0 flex-1 truncate text-[11.5px]">{o.ref}</span>
                      <span className="tnum shrink-0 font-mono text-[11.5px] font-bold">{n(o.qty)}</span>
                      <StatusBadge value={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Why the numbers look like this" icon="help">
            <ul className="space-y-2.5 text-[11.5px] leading-relaxed text-text-muted">
              <li>
                <b className="text-text">On hand</b> is everything held in every storage bin across the network.
              </li>
              <li>
                <b className="text-text">Reserved</b> is the quantity committed to deliveries that are ready, being
                picked or packed.
              </li>
              <li>
                <b className="text-text">Available</b> is on hand minus reserved — what a new order can promise.
              </li>
              <li>
                <b className="text-text">Incoming</b> is what confirmed receipts still have to deliver.
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>

      {transferOpen && (
        <Modal open onClose={() => setTransferOpen(false)} title="Move stock">
          <p className="text-[12.5px] text-text-muted">
            Use the transfer page for a full source → destination view with the before and after balances.
          </p>
          <Link to={`/transfers/new?sku=${product.sku}`} className="btn btn-primary mt-3">
            Open the transfer form
          </Link>
        </Modal>
      )}

      <QuickAdjustDialog product={adjustOpen ? product : null} onClose={() => setAdjustOpen(false)} />
    </>
  );
}

function buildFlow(ledger: { at: string; delta: number }[]): [string, number][] {
  const map = new Map<string, number>();
  for (const entry of ledger) {
    const key = entry.at.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + entry.delta);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-21);
}
