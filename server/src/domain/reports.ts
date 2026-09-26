/**
 * Reports.
 *
 * Every figure is computed from live state at request time — there is no stored
 * snapshot to go stale. Each report returns a title, a description, columns and
 * rows, which is exactly what the table renderer and the CSV exporter need.
 */
import { getDb } from '../store.js';
import { qty as round, dayOf } from '../datetime.js';
import type { Product } from '../types.js';
import {
  atLocation,
  available,
  childrenOf,
  health,
  occupants,
  onHand,
  reservedFor,
  utilisation,
  usedUnits,
  capacityOf,
  leavesUnder,
} from './stock.js';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;
}

export interface ReportResult {
  id: string;
  name: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
  /** Rendered as a small inline bar chart on the page. */
  chart?: { label: string; value: number }[];
}

export const REPORT_DEFINITIONS: { id: string; name: string; description: string }[] = [
  { id: 'inventory-summary', name: 'Inventory Summary', description: 'On hand, reserved, available and value for every product.' },
  { id: 'stock-movement', name: 'Stock Movement', description: 'Every movement in the ledger, newest first.' },
  { id: 'stock-valuation', name: 'Stock Valuation', description: 'Value of holding by product, category and warehouse.' },
  { id: 'low-stock', name: 'Low Stock', description: 'Items at or below their reorder level with a suggested quantity.' },
  { id: 'warehouse-performance', name: 'Warehouse Performance', description: 'Stock value, utilisation, inbound and outbound per warehouse.' },
  { id: 'receipt-performance', name: 'Receipt Performance', description: 'Every receipt with its expected versus received quantity.' },
  { id: 'delivery-performance', name: 'Delivery Performance', description: 'Every delivery with required, picked and dispatched quantity.' },
  { id: 'transfer-performance', name: 'Transfer Performance', description: 'Every internal transfer and whether it has been completed.' },
  { id: 'adjustment-variance', name: 'Adjustment Variance', description: 'Count variances with their value impact and approval state.' },
  { id: 'inventory-accuracy', name: 'Inventory Accuracy', description: 'How closely physical counts agreed with the book position.' },
];

export interface ReportFilter {
  from?: string;
  to?: string;
  warehouse?: string;
  category?: string;
  sku?: string;
}

function inRange(date: string, filter: ReportFilter): boolean {
  const day = dayOf(date);
  if (filter.from && day < filter.from) return false;
  if (filter.to && day > filter.to) return false;
  return true;
}

function money(value: number, currency: string): string {
  return `${currency}${Math.round(value).toLocaleString('en-IN')}`;
}

function matchesProduct(product: Product, filter: ReportFilter): boolean {
  if (filter.sku && product.sku !== filter.sku) return false;
  if (filter.category && product.category !== filter.category) return false;
  return true;
}

function scopeWarehouses(filter: ReportFilter): string[] {
  const all = getDb().warehouses.map((w) => w.code);
  return filter.warehouse && filter.warehouse !== 'All' ? [filter.warehouse] : all;
}

/** Products holding stock inside a warehouse root. */
function productsIn(warehouse: string, filter: ReportFilter): Product[] {
  return getDb().products.filter((p) => matchesProduct(p, filter) && atLocation(p, warehouse) > 0);
}

export function runReport(id: string, filter: ReportFilter): ReportResult {
  const db = getDb();
  const currency = db.settings.company.currency;
  const base = REPORT_DEFINITIONS.find((r) => r.id === id);
  const meta = { id, name: base?.name ?? id, description: base?.description ?? '' };

  switch (id) {
    case 'inventory-summary': {
      const rows = db.products.filter((p) => matchesProduct(p, filter)).map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        uom: p.uom,
        onHand: onHand(p),
        reserved: reservedFor(p.sku),
        available: available(p),
        reorderPoint: p.reorder.reorderPoint,
        health: health(p),
        value: Math.round(onHand(p) * p.unitCost),
      }));
      return {
        ...meta,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'category', label: 'Category' },
          { key: 'uom', label: 'UOM' },
          { key: 'onHand', label: 'On hand', align: 'right', numeric: true },
          { key: 'reserved', label: 'Reserved', align: 'right', numeric: true },
          { key: 'available', label: 'Available', align: 'right', numeric: true },
          { key: 'reorderPoint', label: 'Reorder at', align: 'right', numeric: true },
          { key: 'health', label: 'Health' },
          { key: 'value', label: `Value (${currency})`, align: 'right', numeric: true },
        ],
        rows,
        totals: {
          name: 'Total',
          onHand: round(rows.reduce((a, r) => a + (r.onHand as number), 0)),
          reserved: round(rows.reduce((a, r) => a + (r.reserved as number), 0)),
          available: round(rows.reduce((a, r) => a + (r.available as number), 0)),
          value: money(rows.reduce((a, r) => a + (r.value as number), 0), currency),
        },
        chart: rows
          .slice()
          .sort((a, b) => (b.onHand as number) - (a.onHand as number))
          .slice(0, 8)
          .map((r) => ({ label: String(r.sku), value: r.onHand as number })),
      };
    }

    case 'stock-movement': {
      const rows = db.ledger.filter((l) => inRange(l.at, filter)).map((l) => ({
        at: l.at.replace('T', ' '),
        entry: l.id,
        type: l.type,
        reference: l.ref,
        sku: l.sku,
        name: l.name,
        from: l.from,
        to: l.to,
        quantity: l.delta,
        balanceAfter: l.balanceAfter,
        user: l.user,
      }));
      return {
        ...meta,
        columns: [
          { key: 'at', label: 'When' },
          { key: 'entry', label: 'Entry' },
          { key: 'type', label: 'Operation' },
          { key: 'reference', label: 'Reference' },
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'quantity', label: 'Quantity', align: 'right', numeric: true },
          { key: 'balanceAfter', label: 'Balance', align: 'right', numeric: true },
          { key: 'user', label: 'User' },
        ],
        rows,
        totals: {
          reference: `${rows.length} movements`,
          quantity: round(rows.reduce((a, r) => a + (r.quantity as number), 0)),
        },
      };
    }

    case 'stock-valuation': {
      const rows = db.products.filter((p) => matchesProduct(p, filter)).map((p) => {
        const value = onHand(p) * p.unitCost;
        return {
          sku: p.sku,
          name: p.name,
          category: p.category,
          uom: p.uom,
          onHand: onHand(p),
          unitCost: p.unitCost,
          value: Math.round(value),
        };
      });
      const byCategory = new Map<string, number>();
      for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.value);
      return {
        ...meta,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'category', label: 'Category' },
          { key: 'uom', label: 'UOM' },
          { key: 'onHand', label: 'On hand', align: 'right', numeric: true },
          { key: 'unitCost', label: `Unit cost (${currency})`, align: 'right', numeric: true },
          { key: 'value', label: `Value (${currency})`, align: 'right', numeric: true },
        ],
        rows: rows.sort((a, b) => b.value - a.value),
        totals: {
          name: 'Total inventory value',
          value: money(rows.reduce((a, r) => a + r.value, 0), currency),
        },
        chart: [...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value: Math.round(value) })),
      };
    }

    case 'low-stock': {
      const rows = db.products
        .filter((p) => matchesProduct(p, filter) && health(p) !== 'IN_STOCK')
        .map((p) => {
          const rule = p.reorder;
          const gap = rule.reorderPoint * 2 - onHand(p);
          return {
            sku: p.sku,
            name: p.name,
            uom: p.uom,
            onHand: onHand(p),
            available: available(p),
            reorderPoint: rule.reorderPoint,
            minStock: rule.minStock,
            suggestedQty: Math.max(rule.reorderQty, Math.ceil(Math.max(0, gap) / 10) * 10),
            supplier: rule.preferredSupplier,
            leadTimeDays: rule.leadTimeDays,
            status: health(p),
          };
        });
      return {
        ...meta,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'uom', label: 'UOM' },
          { key: 'onHand', label: 'On hand', align: 'right', numeric: true },
          { key: 'available', label: 'Available', align: 'right', numeric: true },
          { key: 'reorderPoint', label: 'Reorder at', align: 'right', numeric: true },
          { key: 'suggestedQty', label: 'Suggested', align: 'right', numeric: true },
          { key: 'supplier', label: 'Preferred supplier' },
          { key: 'leadTimeDays', label: 'Lead time (days)', align: 'right', numeric: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        chart: rows.map((r) => ({ label: String(r.sku), value: r.onHand as number })),
      };
    }

    case 'warehouse-performance': {
      const rows = scopeWarehouses(filter).map((code) => {
        const warehouse = db.warehouses.find((w) => w.code === code)!;
        const products = productsIn(code, filter);
        const value = products.reduce((a, p) => a + onHand(p) * p.unitCost, 0);
        const used = usedUnits(code);
        const capacity = capacityOf(code);
        return {
          code,
          name: warehouse.name,
          locations: childrenOf(code).length,
          products: products.length,
          usedVolume: round(used),
          capacity,
          utilisation: capacity ? Math.round((used / capacity) * 100) : 0,
          value: Math.round(value),
          incoming: db.receipts
            .filter((r) => r.destination === code && r.status !== 'Done' && r.status !== 'Canceled')
            .flatMap((r) => r.lines)
            .reduce((a, l) => a + l.expected, 0),
          outgoing: db.deliveries
            .filter((d) => d.from === code && d.status !== 'Done' && d.status !== 'Canceled')
            .flatMap((d) => d.lines)
            .reduce((a, l) => a + l.qty, 0),
        };
      });
      return {
        ...meta,
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Warehouse' },
          { key: 'locations', label: 'Locations', align: 'right', numeric: true },
          { key: 'products', label: 'Products', align: 'right', numeric: true },
          { key: 'usedVolume', label: 'Used volume', align: 'right', numeric: true },
          { key: 'capacity', label: 'Capacity', align: 'right', numeric: true },
          { key: 'utilisation', label: 'Utilisation %', align: 'right', numeric: true },
          { key: 'incoming', label: 'Incoming', align: 'right', numeric: true },
          { key: 'outgoing', label: 'Outgoing', align: 'right', numeric: true },
          { key: 'value', label: `Value (${currency})`, align: 'right', numeric: true },
        ],
        rows,
        totals: {
          name: 'Total',
          value: money(rows.reduce((a, r) => a + r.value, 0), currency),
        },
        chart: rows.map((r) => ({ label: String(r.code), value: r.value as number })),
      };
    }

    case 'receipt-performance': {
      const rows = db.receipts
        .filter((r) => inRange(r.createdAt, filter) && (!filter.warehouse || r.destination === filter.warehouse))
        .map((r) => {
          const expected = round(r.lines.reduce((a, l) => a + l.expected, 0));
          const received = round(r.lines.reduce((a, l) => a + l.received, 0));
          return {
            ref: r.ref,
            supplier: r.supplier,
            warehouse: r.destination,
            scheduled: r.scheduledDate,
            expected,
            received,
            variance: round(received - expected),
            status: r.status,
            createdBy: r.createdBy,
            validatedAt: r.validatedAt ?? '—',
          };
        });
      return {
        ...meta,
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'warehouse', label: 'Warehouse' },
          { key: 'scheduled', label: 'Expected' },
          { key: 'expected', label: 'Expected qty', align: 'right', numeric: true },
          { key: 'received', label: 'Received qty', align: 'right', numeric: true },
          { key: 'variance', label: 'Variance', align: 'right', numeric: true },
          { key: 'status', label: 'Status' },
          { key: 'createdBy', label: 'Created by' },
          { key: 'validatedAt', label: 'Validated' },
        ],
        rows,
      };
    }

    case 'delivery-performance': {
      const rows = db.deliveries
        .filter((d) => inRange(d.createdAt, filter) && (!filter.warehouse || d.from === filter.warehouse))
        .map((d) => {
          const required = round(d.lines.reduce((a, l) => a + l.qty, 0));
          const picked = round(d.lines.reduce((a, l) => a + l.picked, 0));
          return {
            ref: d.ref,
            customer: d.customer,
            warehouse: d.from,
            scheduled: d.scheduledDate,
            required,
            picked,
            shipped: d.status === 'Done' ? required : 0,
            status: d.status,
            carrier: d.carrier,
            completedAt: d.completedAt ?? '—',
          };
        });
      return {
        ...meta,
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'customer', label: 'Customer' },
          { key: 'warehouse', label: 'From' },
          { key: 'scheduled', label: 'Scheduled' },
          { key: 'required', label: 'Required', align: 'right', numeric: true },
          { key: 'picked', label: 'Picked', align: 'right', numeric: true },
          { key: 'shipped', label: 'Shipped', align: 'right', numeric: true },
          { key: 'carrier', label: 'Carrier' },
          { key: 'status', label: 'Status' },
          { key: 'completedAt', label: 'Completed' },
        ],
        rows,
      };
    }

    case 'transfer-performance': {
      const rows = db.transfers
        .filter((t) => inRange(t.createdAt, filter) && (!filter.warehouse || t.from === filter.warehouse || t.to === filter.warehouse))
        .map((t) => ({
          ref: t.ref,
          from: t.from,
          to: t.to,
          lines: t.lines.length,
          quantity: round(t.lines.reduce((a, l) => a + l.qty, 0)),
          status: t.status,
          requestedBy: t.requestedBy,
          createdAt: t.createdAt,
          completedAt: t.completedAt ?? '—',
        }));
      return {
        ...meta,
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'lines', label: 'Lines', align: 'right', numeric: true },
          { key: 'quantity', label: 'Quantity moved', align: 'right', numeric: true },
          { key: 'status', label: 'Status' },
          { key: 'requestedBy', label: 'Requested by' },
          { key: 'createdAt', label: 'Created' },
          { key: 'completedAt', label: 'Completed' },
        ],
        rows,
        totals: { ref: 'Total moved', quantity: round(rows.reduce((a, r) => a + (r.quantity as number), 0)) },
      };
    }

    case 'adjustment-variance': {
      const rows = db.adjustments
        .filter((a) => inRange(a.createdAt, filter))
        .map((a) => {
          const product = db.products.find((p) => p.sku === a.sku);
          const pct = a.recorded === 0 ? 0 : (Math.abs(a.difference ?? 0) / a.recorded) * 100;
          return {
            ref: a.ref,
            sku: a.sku,
            name: product?.name ?? a.sku,
            uom: product?.uom ?? 'Units',
            location: a.location,
            recorded: a.recorded,
            counted: a.counted ?? '—',
            difference: a.difference ?? '—',
            variancePct: Math.round(pct * 100) / 100,
            impact: Math.round((a.difference ?? 0) * (product?.unitCost ?? 0)),
            reason: a.reason,
            status: a.status,
            user: a.approvedBy ?? a.createdBy,
            createdAt: a.createdAt,
          };
        });
      return {
        ...meta,
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'sku', label: 'SKU' },
          { key: 'location', label: 'Location' },
          { key: 'recorded', label: 'Book', align: 'right', numeric: true },
          { key: 'counted', label: 'Counted', align: 'right', numeric: true },
          { key: 'difference', label: 'Difference', align: 'right', numeric: true },
          { key: 'variancePct', label: 'Variance %', align: 'right', numeric: true },
          { key: 'impact', label: `Impact (${currency})`, align: 'right', numeric: true },
          { key: 'reason', label: 'Reason' },
          { key: 'status', label: 'Status' },
          { key: 'user', label: 'User' },
          { key: 'createdAt', label: 'Date' },
        ],
        rows,
        totals: {
          ref: 'Total impact',
          impact: money(rows.reduce((a, r) => a + (r.impact as number), 0), currency),
        },
        chart: rows
          .filter((r) => typeof r.difference === 'number')
          .map((r) => ({ label: String(r.ref), value: Math.abs(r.difference as number) })),
      };
    }

    case 'inventory-accuracy': {
      const counted = db.adjustments.filter((a) => a.counted !== null);
      const absolute = counted.reduce((a, x) => a + Math.abs(x.difference ?? 0), 0);
      const book = counted.reduce((a, x) => a + x.recorded, 0);
      const accuracy = book > 0 ? Math.max(0, 100 - (absolute / book) * 100) : 100;
      const byReason = new Map<string, { units: number; value: number }>();
      for (const a of counted) {
        const product = db.products.find((p) => p.sku === a.sku);
        const row = byReason.get(a.reason) ?? { units: 0, value: 0 };
        row.units += Math.abs(a.difference ?? 0);
        row.value += Math.abs((a.difference ?? 0) * (product?.unitCost ?? 0));
        byReason.set(a.reason, row);
      }
      const rows = [...byReason.entries()].map(([reason, v]) => ({
        reason,
        adjustments: counted.filter((a) => a.reason === reason).length,
        units: round(v.units),
        value: Math.round(v.value),
        share: book > 0 ? Math.round((v.units / absolute) * 100) : 0,
      }));
      return {
        ...meta,
        columns: [
          { key: 'reason', label: 'Reason' },
          { key: 'adjustments', label: 'Adjustments', align: 'right', numeric: true },
          { key: 'units', label: 'Units out of variance', align: 'right', numeric: true },
          { key: 'value', label: `Value (${currency})`, align: 'right', numeric: true },
          { key: 'share', label: 'Share of variance %', align: 'right', numeric: true },
        ],
        rows,
        totals: { reason: 'Inventory accuracy', share: Math.round(accuracy * 100) / 100 },
        chart: rows.map((r) => ({ label: String(r.reason), value: r.units as number })),
      };
    }

    default:
      return {
        ...meta,
        name: 'Unknown report',
        description: 'That report does not exist.',
        columns: [],
        rows: [],
      };
  }
}

/** Small operational roll-up used by the dashboard and the warehouse pages. */
export function warehousePerformance() {
  const db = getDb();
  return db.warehouses.map((w) => {
    const used = usedUnits(w.code);
    const capacity = capacityOf(w.code);
    const products = productsIn(w.code, {});
    return {
      code: w.code,
      name: w.name,
      kind: w.kind,
      manager: w.manager,
      address: w.address,
      locations: childrenOf(w.code).length,
      leafLocations: leavesUnder(w.code).length,
      products: products.length,
      stockValue: Math.round(products.reduce((a, p) => a + onHand(p) * p.unitCost, 0)),
      stockUnits: round(products.reduce((a, p) => a + onHand(p), 0)),
      utilisation: utilisation(w.code),
      usedVolume: round(used),
      capacity,
      incoming: db.receipts
        .filter((r) => r.destination === w.code && r.status !== 'Done' && r.status !== 'Canceled')
        .flatMap((r) => r.lines)
        .reduce((a, l) => a + l.expected, 0),
      outgoing: db.deliveries
        .filter((d) => d.from === w.code && d.status !== 'Done' && d.status !== 'Canceled')
        .flatMap((d) => d.lines)
        .reduce((a, l) => a + l.qty, 0),
      topProducts: occupants(w.code).slice(0, 4).map((o) => `${o.sku} · ${o.qty} ${o.uom}`),
    };
  });
}
