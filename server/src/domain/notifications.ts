/**
 * Notifications are derived, not stored.
 *
 * A stale notification is worse than no notification, so every notification is
 * recomputed from live state on each read. `readNotifications` only remembers
 * which ids a person has opened.
 */
import { getDb } from '../store.js';
import { daysFromToday, isLate } from '../datetime.js';
import type { Notification } from '../types.js';
import { atLocation, available, health, onHand, reservedFor } from './stock.js';
import { deliveryCheck } from './operations.js';

export function buildNotifications(): Notification[] {
  const db = getDb();
  const out: Notification[] = [];
  const push = (n: Omit<Notification, 'id' | 'at'> & { at?: string }) => {
    out.push({ ...n, id: `ntf-${n.key}`, at: n.at ?? '0000-00-00T00:00' });
  };

  for (const product of db.products) {
    const state = health(product);
    const total = onHand(product);
    const rule = product.reorder;
    if (state === 'OUT') {
      push({
        type: 'Out of Stock',
        key: `out-${product.sku}`,
        title: `${product.name} is out of stock`,
        detail: `Nothing on hand in any location. Reorder level is ${rule.reorderPoint} ${product.uom}.`,
        ref: product.sku,
        link: `/products/${product.sku}`,
        severity: 'critical',
      });
    } else if (state === 'LOW') {
      push({
        type: 'Low Stock',
        key: `low-${product.sku}`,
        title: `${product.name} is running low`,
        detail: `${total} ${product.uom} on hand against a reorder level of ${rule.reorderPoint} ${product.uom}.`,
        ref: product.sku,
        link: `/low-stock`,
        severity: 'warning',
      });
    }
    if (total > 0 && total <= rule.minStock) {
      push({
        type: 'Reorder Alert',
        key: `reorder-${product.sku}`,
        title: `${product.name} is below the minimum level`,
        detail: `Raise ${rule.reorderQty} ${product.uom} from ${rule.preferredSupplier} (${rule.leadTimeDays} day lead time).`,
        ref: product.sku,
        link: '/reorder-rules',
        severity: 'warning',
      });
    }
  }

  for (const receipt of db.receipts) {
    if (receipt.status === 'Ready') {
      const expected = receipt.lines.reduce((a, l) => a + l.expected, 0);
      push({
        type: 'Receipt Ready',
        key: `receipt-ready-${receipt.ref}`,
        title: `Receipt ${receipt.ref} is ready to receive`,
        detail: `${receipt.supplier} · ${expected} units expected into ${receipt.destination}.`,
        ref: receipt.ref,
        link: `/receipts/${receipt.ref}`,
        severity: 'info',
        at: receipt.createdAt,
      });
    }
    if ((receipt.status === 'Waiting' || receipt.status === 'Ready') && isLate(receipt.scheduledDate)) {
      push({
        type: 'Receipt Ready',
        key: `receipt-late-${receipt.ref}`,
        title: `Receipt ${receipt.ref} is past its arrival date`,
        detail: `${receipt.supplier} · expected ${receipt.scheduledDate}.`,
        ref: receipt.ref,
        link: `/receipts/${receipt.ref}`,
        severity: 'warning',
        at: receipt.createdAt,
      });
    }
  }

  for (const delivery of db.deliveries) {
    if (delivery.status === 'Done' || delivery.status === 'Canceled') continue;
    const check = deliveryCheck(delivery.ref);
    if (check.blocked) {
      push({
        type: 'Delivery Blocked',
        key: `delivery-blocked-${delivery.ref}`,
        title: `Delivery ${delivery.ref} cannot be fulfilled`,
        detail: check.blockers.join('; '),
        ref: delivery.ref,
        link: `/deliveries/${delivery.ref}`,
        severity: 'critical',
        at: delivery.createdAt,
      });
    } else if (check.overdue) {
      push({
        type: 'Delivery Blocked',
        key: `delivery-late-${delivery.ref}`,
        title: `Delivery ${delivery.ref} is ${check.daysLate} day(s) late`,
        detail: `${delivery.customer} · scheduled ${delivery.scheduledDate}.`,
        ref: delivery.ref,
        link: `/deliveries/${delivery.ref}`,
        severity: 'warning',
        at: delivery.createdAt,
      });
    } else if (delivery.status === 'Picking' && check.pickProgress < 100) {
      push({
        type: 'Delivery Blocked',
        key: `delivery-pick-${delivery.ref}`,
        title: `Delivery ${delivery.ref} is waiting on picking`,
        detail: `${check.pickedLines} of ${check.lines.length} line(s) picked.`,
        ref: delivery.ref,
        link: `/deliveries/${delivery.ref}`,
        severity: 'info',
        at: delivery.createdAt,
      });
    }
  }

  for (const adjustment of db.adjustments) {
    if (adjustment.status === 'Pending Approval') {
      const product = db.products.find((p) => p.sku === adjustment.sku);
      push({
        type: 'Adjustment Approval',
        key: `adjustment-${adjustment.ref}`,
        title: `Adjustment ${adjustment.ref} is waiting for approval`,
        detail: `${product?.name ?? adjustment.sku} at ${adjustment.location} · ${adjustment.difference! > 0 ? '+' : ''}${adjustment.difference} ${product?.uom} (${adjustment.reason}).`,
        ref: adjustment.ref,
        link: `/adjustments/${adjustment.ref}`,
        severity: 'warning',
        at: adjustment.createdAt,
      });
    }
  }

  for (const count of db.counts) {
    if (count.status === 'Completed' || count.status === 'Canceled') continue;
    const due = daysFromToday(count.dueDate);
    if (due <= 7) {
      push({
        type: 'Count Due',
        key: `count-${count.ref}`,
        title: due < 0 ? `Count ${count.ref} is overdue` : `Count ${count.ref} is due in ${due} day(s)`,
        detail: `${count.assignedTo} · ${count.location} · due ${count.dueDate}.`,
        ref: count.ref,
        link: `/counts/${count.ref}`,
        severity: due < 0 ? 'warning' : 'info',
        at: count.createdAt,
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2, success: 3 } as const;
  return out.sort((a, b) => {
    const d = order[a.severity] - order[b.severity];
    return d !== 0 ? d : a.title.localeCompare(b.title);
  });
}

export function notificationSummary() {
  const all = buildNotifications();
  const read = new Set(getDb().readNotifications);
  return {
    total: all.length,
    unread: all.filter((n) => !read.has(n.id)).length,
    critical: all.filter((n) => n.severity === 'critical').length,
  };
}

/* -------------------------------------------------------- reorder requests */

export interface ReorderRow {
  sku: string;
  name: string;
  uom: string;
  supplier: string;
  onHand: number;
  available: number;
  reserved: number;
  minStock: number;
  reorderPoint: number;
  safetyStock: number;
  suggestedQty: number;
  leadTimeDays: number;
  unitCost: number;
  estimatedValue: number;
  status: 'Critical' | 'Reorder' | 'Healthy';
  /** Where the shortfall actually sits. */
  primaryLocation: string;
  primaryLocationQty: number;
}

export function reorderRows(): ReorderRow[] {
  const db = getDb();
  return db.products
    .map((product) => {
      const rule = product.reorder;
      const onHandQty = onHand(product);
      const avail = available(product);
      const status: ReorderRow['status'] =
        onHandQty <= rule.minStock || onHandQty === 0 ? 'Critical' : avail <= rule.reorderPoint ? 'Reorder' : 'Healthy';
      const shortfall = Math.max(0, rule.reorderPoint * 2 - onHandQty);
      const suggested = Math.max(rule.reorderQty, Math.ceil(shortfall / 10) * 10);
      const top = Object.entries(product.stock).sort((a, b) => b[1] - a[1])[0];
      return {
        sku: product.sku,
        name: product.name,
        uom: product.uom,
        supplier: rule.preferredSupplier,
        onHand: onHandQty,
        available: avail,
        reserved: reservedFor(product.sku),
        minStock: rule.minStock,
        reorderPoint: rule.reorderPoint,
        safetyStock: rule.safetyStock,
        suggestedQty: status === 'Healthy' ? 0 : suggested,
        leadTimeDays: rule.leadTimeDays,
        unitCost: product.unitCost,
        estimatedValue: Math.round((status === 'Healthy' ? 0 : suggested) * product.unitCost),
        status,
        primaryLocation: top?.[0] ?? '—',
        primaryLocationQty: top?.[1] ?? 0,
      };
    })
    .sort((a, b) => {
      const rank = { Critical: 0, Reorder: 1, Healthy: 2 } as const;
      return rank[a.status] - rank[b.status] || a.onHand - b.onHand;
    });
}

export function locationLowStock() {
  const db = getDb();
  return db.products
    .flatMap((product) =>
      Object.entries(product.stock).map(([code, qty]) => ({ product, code, qty })),
    )
    .filter((row) => row.qty <= row.product.reorder.reorderPoint)
    .map((row) => ({
      sku: row.product.sku,
      name: row.product.name,
      uom: row.product.uom,
      location: row.code,
      onHand: row.qty,
      reorderPoint: row.product.reorder.reorderPoint,
      suggestedQty: Math.max(row.product.reorder.reorderQty, row.product.reorder.reorderPoint * 2 - row.qty),
      status: row.qty === 0 ? 'Out of stock' : atLocation(row.product, row.code) > 0 ? 'Low stock' : 'Out of stock',
    }))
    .sort((a, b) => a.onHand - b.onHand);
}
