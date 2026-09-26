/**
 * Service layer.
 *
 * Components never compute a business number. Every screen reads a view built
 * here from the same primitives the write path uses, which is what guarantees
 * that the dashboard, a product page, a warehouse card and a report can never
 * disagree about the same stock.
 */
import { getDb, commit } from './store.js';
import { daysFromToday, isLate, qty as round, now } from './datetime.js';
import { notFound } from './errors.js';
import type {
  Adjustment,
  Count,
  Database,
  Delivery,
  DomainEvent,
  Product,
  Receipt,
  Settings,
  Transfer,
  User,
} from './types.js';
import { ADJUSTMENT_REASONS, RECEIPT_STATUSES, DELIVERY_STATUSES, TRANSFER_STATUSES, ADJUSTMENT_STATUSES, COUNT_STATUSES, UNITS } from './types.js';
import {
  atLocation,
  available,
  capacityOf,
  childrenOf,
  findLocation,
  health,
  incomingFor,
  isNested,
  leavesUnder,
  locationScope,
  occupants,
  onHand,
  pathOf,
  reservedFor,
  requireLocation,
  requireProduct,
  skuCountAt,
  usedUnits,
  utilisation,
  RESERVING_STATUSES,
} from './domain/stock.js';
import {
  adjustmentApproval,
  createAdjustment,
  createCount,
  createDelivery,
  createReceipt,
  createTransfer,
  deliveryCheck,
  pendingCounts,
  raiseAdjustmentsFromCount,
  receiptImpact,
  recordCountLine,
  recordPick,
  setAdjustmentStatus,
  setCountStatus,
  setDeliveryStatus,
  setReceiptStatus,
  setTransferStatus,
  stockHealthSummary,
  transferPreview,
  updateAdjustment,
  updateReceipt,
} from './domain/operations.js';
import { emit, postLedger, recentEvents } from './domain/ledger.js';
import { buildNotifications, locationLowStock, notificationSummary, reorderRows } from './domain/notifications.js';
import { REPORT_DEFINITIONS, runReport, warehousePerformance } from './domain/reports.js';
import { search } from './domain/search.js';
import {
  ADJUSTMENT_FLOW,
  COUNT_FLOW,
  DELIVERY_FLOW,
  RECEIPT_FLOW,
  TRANSFER_FLOW,
  nextStatuses,
} from './domain/documents.js';
import { permissionsFor, ROLE_SUMMARY } from './auth.js';

/* ------------------------------------------------------------ small maps */

export function productView(product: Product) {
  const db = getDb();
  const onHandQty = onHand(product);
  const reserved = reservedFor(product.sku);
  return {
    ...product,
    onHand: onHandQty,
    reserved,
    available: available(product),
    incoming: incomingFor(product.sku),
    health: health(product),
    value: round(onHandQty * product.unitCost),
    locations: db.locations
      .filter((l) => !l.container)
      .map((l) => ({ code: l.code, name: l.name, warehouse: l.warehouse, qty: round(atLocation(product, l.code)) }))
      .filter((l) => l.qty > 0)
      .sort((a, b) => b.qty - a.qty),
  };
}

export function productDetail(sku: string) {
  const db = getDb();
  const product = requireProduct(sku);
  const moves = db.ledger.filter((l) => l.sku === product.sku);
  const openOrders = [
    ...db.deliveries
      .filter((d) => d.status !== 'Done' && d.status !== 'Canceled')
      .flatMap((d) => d.lines.filter((l) => l.sku === product.sku).map((l) => ({
        ref: d.ref,
        kind: 'Delivery' as const,
        qty: l.qty,
        picked: l.picked,
        to: d.customer,
        scheduledDate: d.scheduledDate,
        status: d.status,
        link: `/deliveries/${d.ref}`,
      }))),
    ...db.receipts
      .filter((r) => r.status !== 'Done' && r.status !== 'Canceled')
      .flatMap((r) => r.lines.filter((l) => l.sku === product.sku).map((l) => ({
        ref: r.ref,
        kind: 'Receipt' as const,
        qty: l.expected,
        picked: 0,
        to: r.destination,
        scheduledDate: r.scheduledDate,
        status: r.status,
        link: `/receipts/${r.ref}`,
      }))),
    ...db.transfers
      .filter((t) => t.status !== 'Done' && t.status !== 'Canceled')
      .flatMap((t) => t.lines.filter((l) => l.sku === product.sku).map((l) => ({
        ref: t.ref,
        kind: 'Transfer' as const,
        qty: l.qty,
        picked: 0,
        to: t.to,
        scheduledDate: t.createdAt.slice(0, 10),
        status: t.status,
        link: `/transfers/${t.ref}`,
      }))),
  ];
  const byDay = new Map<string, number>();
  for (const move of moves) {
    const day = move.at.slice(0, 10);
    byDay.set(day, round((byDay.get(day) ?? 0) + move.delta));
  }
  return {
    ...productView(product),
    moves: moves.slice(0, 120),
    openOrders,
    dayFlow: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-21),
    reservedBy: db.deliveries
      .filter((d) => (RESERVING_STATUSES as readonly string[]).includes(d.status))
      .flatMap((d) => d.lines.filter((l) => l.sku === product.sku).map((l) => ({ ref: d.ref, customer: d.customer, qty: l.qty }))),
  };
}

export function receiptView(receipt: Receipt) {
  const db = getDb();
  const lines = receipt.lines.map((l) => {
    const product = requireProduct(l.sku);
    const bin = findLocation(l.bin);
    return {
      ...l,
      name: product.name,
      uom: product.uom,
      unitCost: product.unitCost,
      lineValue: Math.round(l.received * product.unitCost),
      variance: round(l.received - l.expected),
      binName: bin?.name ?? l.bin,
      binValid: !!bin,
      onHandAtBin: round(atLocation(product, l.bin)),
    };
  });
  return {
    ...receipt,
    lines,
    items: lines,
    totalExpected: round(lines.reduce((a, l) => a + l.expected, 0)),
    totalReceived: round(lines.reduce((a, l) => a + l.received, 0)),
    totalValue: Math.round(lines.reduce((a, l) => a + l.lineValue, 0)),
    destinationName: findLocation(receipt.destination)?.name ?? receipt.destination,
    overdue: receipt.status !== 'Done' && receipt.status !== 'Canceled' && isLate(receipt.scheduledDate),
    createdByUser: db.users.find((u) => u.name === receipt.createdBy) ?? null,
    transitions: nextStatuses(RECEIPT_FLOW, receipt.status),
  };
}

export function deliveryView(delivery: Delivery) {
  const check = deliveryCheck(delivery.ref);
  const lines = delivery.lines.map((l) => {
    const row = check.lines.find((c) => c.id === l.id);
    const product = requireProduct(l.sku);
    return {
      ...l,
      name: product.name,
      uom: product.uom,
      unitCost: product.unitCost,
      value: Math.round(l.qty * product.unitCost),
      availableAtSource: row?.availableAtSource ?? 0,
      availableTotal: row?.availableTotal ?? 0,
      pullFrom: row?.pullFrom ?? delivery.from,
      sufficient: row?.sufficient ?? false,
      shortfall: row?.shortfall ?? 0,
      reason: row?.reason ?? '',
      onHandAtSource: row ? row.availableAtSource : 0,
    };
  });
  return {
    ...delivery,
    lines,
    items: lines,
    check,
    totalQty: round(lines.reduce((a, l) => a + l.qty, 0)),
    totalValue: Math.round(lines.reduce((a, l) => a + l.value, 0)),
    sourceName: findLocation(delivery.from)?.name ?? delivery.from,
    overdue: check.overdue,
    daysLate: check.daysLate,
    transitions: nextStatuses(DELIVERY_FLOW, delivery.status),
  };
}

export function transferView(transfer: Transfer) {
  const db = getDb();
  const lines = transfer.lines.map((l) => {
    const product = requireProduct(l.sku);
    return {
      ...l,
      name: product.name,
      uom: product.uom,
      availableAtSource: round(atLocation(product, transfer.from)),
      remainingAfter: round(atLocation(product, transfer.from) - l.qty),
      availableAtDestination: round(atLocation(product, transfer.to)),
      onHand: onHand(product),
    };
  });
  return {
    ...transfer,
    lines,
    totalQty: round(lines.reduce((a, l) => a + l.qty, 0)),
    enterpriseTotal: lines[0]?.onHand ?? 0,
    fromName: findLocation(transfer.from)?.name ?? transfer.from,
    toName: findLocation(transfer.to)?.name ?? transfer.to,
    nested: isNested(transfer.from, transfer.to) || isNested(transfer.to, transfer.from),
    transitions: nextStatuses(TRANSFER_FLOW, transfer.status),
    createdByUser: db.users.find((u) => u.name === transfer.requestedBy) ?? null,
  };
}

export function adjustmentView(adjustment: Adjustment) {
  const db = getDb();
  const product = requireProduct(adjustment.sku);
  const approval = adjustmentApproval(adjustment);
  const count = adjustment.countRef ? db.counts.find((c) => c.ref === adjustment.countRef) : undefined;
  return {
    ...adjustment,
    name: product.name,
    uom: product.uom,
    unitCost: product.unitCost,
    locationName: findLocation(adjustment.location)?.name ?? adjustment.location,
    impact: approval.impact,
    variancePct: approval.variancePct,
    approvalRequired: approval.required,
    approvalReason: approval.reason,
    currentOnHand: round(atLocation(product, adjustment.location)),
    postedOnHand: adjustment.status === 'Posted' ? round(atLocation(product, adjustment.location)) : null,
    transitions: nextStatuses(ADJUSTMENT_FLOW, adjustment.status),
    count: count ? { ref: count.ref, assignedTo: count.assignedTo, status: count.status } : null,
  };
}

export function countView(count: Count) {
  const db = getDb();
  const lines = count.lines.map((l) => {
    const product = requireProduct(l.sku);
    return {
      ...l,
      name: product.name,
      uom: product.uom,
      locationName: findLocation(l.location)?.name ?? l.location,
      difference: l.counted === null ? null : round(l.counted - l.systemQty),
      currentOnHand: round(atLocation(product, l.location)),
    };
  });
  const counted = lines.filter((l) => l.counted !== null);
  return {
    ...count,
    lines,
    totalLines: lines.length,
    countedLines: counted.length,
    progress: lines.length ? Math.round((counted.length / lines.length) * 100) : 0,
    variances: counted.filter((l) => l.difference !== 0).length,
    absoluteVariance: round(counted.reduce((a, l) => a + Math.abs(l.difference ?? 0), 0)),
    adjustments: db.adjustments.filter((a) => a.countRef === count.ref).map((a) => ({ ref: a.ref, sku: a.sku, status: a.status, difference: a.difference })),
    overdue: count.status !== 'Completed' && count.status !== 'Canceled' && daysFromToday(count.dueDate) < 0,
    daysToDue: daysFromToday(count.dueDate),
    transitions: nextStatuses(COUNT_FLOW, count.status),
  };
}

export function locationView(code: string) {
  const db = getDb();
  const location = requireLocation(code);
  const scope = locationScope(code);
  const ownBalance = round(db.products.reduce((a, p) => a + (p.stock[code] ?? 0), 0));
  const stock = db.products
    .map((p) => ({ sku: p.sku, name: p.name, uom: p.uom, qty: round(atLocation(p, code)) }))
    .filter((s) => s.qty > 0)
    .sort((a, b) => b.qty - a.qty);
  const pendingMoves = [
    ...db.receipts
      .filter((r) => r.status !== 'Done' && r.status !== 'Canceled' && (r.destination === code || r.lines.some((l) => l.bin === code)))
      .flatMap((r) => r.lines.filter((l) => l.bin === code).map((l) => ({ ref: r.ref, kind: 'Inbound' as const, sku: l.sku, qty: l.expected, link: `/receipts/${r.ref}`, status: r.status }))),
    ...db.transfers
      .filter((t) => t.status !== 'Done' && t.status !== 'Canceled' && (t.from === code || t.to === code))
      .flatMap((t) => t.lines.map((l) => ({ ref: t.ref, kind: t.to === code ? ('Inbound' as const) : ('Outbound' as const), sku: l.sku, qty: l.qty, link: `/transfers/${t.ref}`, status: t.status }))),
    ...db.deliveries
      .filter((d) => d.status !== 'Done' && d.status !== 'Canceled' && d.from === code)
      .flatMap((d) => d.lines.map((l) => ({ ref: d.ref, kind: 'Outbound' as const, sku: l.sku, qty: l.qty, link: `/deliveries/${d.ref}`, status: d.status }))),
  ];
  const activity = db.ledger
    .flatMap((entry) => entry.legs.filter((leg) => leg.location === code).map((leg) => ({ entry, leg })))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at))
    .slice(0, 25)
    .map(({ entry, leg }) => ({
      at: entry.at,
      ref: entry.ref,
      type: entry.type,
      sku: entry.sku,
      name: entry.name,
      delta: leg.delta,
      user: entry.user,
      note: entry.note,
    }));
  return {
    ...location,
    ownBalance,
    breadcrumb: pathOf(code).map((l) => ({ code: l.code, name: l.name })),
    childCount: childrenOf(code).length,
    scopeSize: scope.length,
    stock,
    skuCount: stock.length,
    totalUnits: round(stock.reduce((a, s) => a + s.qty, 0)),
    stockValue: Math.round(stock.reduce((a, s) => a + s.qty * (db.products.find((p) => p.sku === s.sku)?.unitCost ?? 0), 0)),
    capacity: capacityOf(code),
    usedVolume: round(usedUnits(code)),
    utilisation: utilisation(code),
    pendingMoves,
    activity,
  };
}

export function warehousesView() {
  const db = getDb();
  return warehousePerformance().map((w) => ({
    ...w,
    receipts: db.receipts.filter((r) => r.destination === w.code).length,
    deliveries: db.deliveries.filter((d) => d.from === w.code).length,
    transfers: db.transfers.filter((t) => t.from === w.code || t.to === w.code).length,
    health: w.utilisation > 88 ? 'Critical' : w.utilisation > 70 ? 'Busy' : 'Healthy',
  }));
}

/* --------------------------------------------------------------- dashboard */

export interface AttentionItem {
  id: string;
  kind: 'low-stock' | 'out-of-stock' | 'blocked-delivery' | 'overdue-delivery' | 'receipt-ready' | 'receipt-overdue' | 'approval' | 'count-due' | 'transfer-ready';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  status: string;
  link: string;
  cta: string;
}

export function dashboardSummary() {
  const db = getDb();
  const stock = stockHealthSummary();
  const currency = db.settings.company.currency;

  const openReceipts = db.receipts.filter((r) => r.status !== 'Done' && r.status !== 'Canceled');
  const openDeliveries = db.deliveries.filter((d) => d.status !== 'Done' && d.status !== 'Canceled');
  const openTransfers = db.transfers.filter((t) => t.status !== 'Done' && t.status !== 'Canceled');
  const pendingApproval = db.adjustments.filter((a) => a.status === 'Pending Approval' || a.status === 'Approved');

  const attention: AttentionItem[] = [
    ...stock.out.map((p) => ({
      id: `out-${p.sku}`,
      kind: 'out-of-stock' as const,
      severity: 'critical' as const,
      title: p.name,
      detail: `0 ${p.uom} on hand · reorder level ${p.reorder.reorderPoint} ${p.uom}`,
      status: 'OUT OF STOCK',
      link: `/low-stock`,
      cta: 'Reorder',
    })),
    ...stock.low.map((p) => ({
      id: `low-${p.sku}`,
      kind: 'low-stock' as const,
      severity: 'warning' as const,
      title: p.name,
      detail: `${onHand(p)} ${p.uom} remaining · reorder level ${p.reorder.reorderPoint} ${p.uom}`,
      status: 'LOW STOCK',
      link: `/low-stock`,
      cta: 'Reorder',
    })),
    ...openDeliveries
      .map((d) => ({ d, check: deliveryCheck(d.ref) }))
      .filter(({ check }) => check.blocked)
      .map(({ d, check }) => ({
        id: `blocked-${d.ref}`,
        kind: 'blocked-delivery' as const,
        severity: 'critical' as const,
        title: `Delivery ${d.ref}`,
        detail: check!.blockers.join('; '),
        status: 'BLOCKED',
        link: `/deliveries/${d.ref}`,
        cta: 'Resolve',
      })),
    ...openDeliveries
      .filter((d) => d.status !== 'Done' && isLate(d.scheduledDate))
      .map((d) => ({
        id: `late-${d.ref}`,
        kind: 'overdue-delivery' as const,
        severity: 'warning' as const,
        title: `Delivery ${d.ref}`,
        detail: `${d.customer} · was due ${d.scheduledDate} (${-daysFromToday(d.scheduledDate)} days ago)`,
        status: 'LATE',
        link: `/deliveries/${d.ref}`,
        cta: 'Review',
      })),
    ...openReceipts
      .filter((r) => r.status === 'Ready')
      .map((r) => ({
        id: `ready-${r.ref}`,
        kind: 'receipt-ready' as const,
        severity: 'info' as const,
        title: `Receipt ${r.ref}`,
        detail: `${r.supplier} · ${round(r.lines.reduce((a, l) => a + l.expected, 0))} units expected into ${r.destination}`,
        status: 'WAITING',
        link: `/receipts/${r.ref}`,
        cta: 'Review',
      })),
    ...openReceipts
      .filter((r) => (r.status === 'Waiting' || r.status === 'Ready') && isLate(r.scheduledDate))
      .map((r) => ({
        id: `late-receipt-${r.ref}`,
        kind: 'receipt-overdue' as const,
        severity: 'warning' as const,
        title: `Receipt ${r.ref}`,
        detail: `${r.supplier} · expected ${r.scheduledDate}, not yet arrived`,
        status: 'LATE',
        link: `/receipts/${r.ref}`,
        cta: 'Review',
      })),
    ...pendingApproval.map((a) => {
      const p = requireProduct(a.sku);
      return {
        id: `approval-${a.ref}`,
        kind: 'approval' as const,
        severity: (a.status === 'Approved' ? 'info' : 'warning') as 'info' | 'warning',
        title: `Adjustment ${a.ref}`,
        detail: `${p.name} at ${a.location} · ${(a.difference ?? 0) > 0 ? '+' : ''}${a.difference ?? 0} ${p.uom} (${a.reason})`,
        status: a.status === 'Approved' ? 'APPROVED' : 'PENDING APPROVAL',
        link: `/adjustments/${a.ref}`,
        cta: a.status === 'Approved' ? 'Post' : 'Review',
      };
    }),
    ...pendingCounts()
      .filter((c) => c.daysToDue <= 7)
      .map((c) => ({
        id: `count-${c.ref}`,
        kind: 'count-due' as const,
        severity: (c.daysToDue < 0 ? 'warning' : 'info') as 'warning' | 'info',
        title: `Count ${c.ref}`,
        detail: `${c.assignedTo} · ${c.location} · ${c.counted}/${c.lines} lines counted · due ${c.dueDate}`,
        status: c.daysToDue < 0 ? 'OVERDUE' : 'COUNT DUE',
        link: `/counts/${c.ref}`,
        cta: 'Count',
      })),
    ...openTransfers
      .filter((t) => t.status === 'Ready' || t.status === 'In Transit')
      .map((t) => ({
        id: `transfer-${t.ref}`,
        kind: 'transfer-ready' as const,
        severity: 'info' as const,
        title: `Transfer ${t.ref}`,
        detail: `${t.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ')} · ${t.from} → ${t.to}`,
        status: t.status === 'In Transit' ? 'IN TRANSIT' : 'READY',
        link: `/transfers/${t.ref}`,
        cta: t.status === 'In Transit' ? 'Confirm arrival' : 'Move stock',
      })),
  ];

  const ranked = { critical: 0, warning: 1, info: 2 } as const;
  attention.sort((a, b) => ranked[a.severity] - ranked[b.severity]);

  const countedAdjustments = db.adjustments.filter((a) => a.counted !== null && a.recorded > 0);
  const accuracyBase = countedAdjustments.reduce((a, x) => a + x.recorded, 0);
  const accuracy = accuracyBase
    ? Math.max(0, 100 - (countedAdjustments.reduce((a, x) => a + Math.abs(x.difference ?? 0), 0) / accuracyBase) * 100)
    : 100;

  return {
    currency,
    totalStock: stock.total,
    available: stock.available,
    reserved: stock.reserved,
    inventoryValue: stock.value,
    lowStockCount: stock.low.length + stock.out.length,
    outOfStockCount: stock.out.length,
    lowStockList: stock.low.map((p) => ({ sku: p.sku, name: p.name, uom: p.uom, onHand: onHand(p), available: available(p), reorderPoint: p.reorder.reorderPoint })),
    outOfStockList: stock.out.map((p) => ({ sku: p.sku, name: p.name, uom: p.uom, onHand: 0, reorderPoint: p.reorder.reorderPoint })),
    pendingReceipts: openReceipts.length,
    pendingDeliveries: openDeliveries.length,
    blockedDeliveries: openDeliveries.filter((d) => deliveryCheck(d.ref).blocked).length,
    openTransfers: openTransfers.length,
    pendingApprovals: pendingApproval.length,
    openCounts: pendingCounts().length,
    accuracy: Math.round(accuracy * 10) / 10,
    catalogSkus: db.products.length,
    warehouses: db.warehouses.length,
    locations: db.locations.filter((l) => !l.container).length,
    ledgerEntries: db.ledger.length,
    notifications: notificationSummary(),
    attention,
    timeline: recentEvents(14),
  };
}

/* ---------------------------------------------------------------- snapshot */

export function snapshot(user: User | null) {
  const db = getDb();
  const { credentials, products, readNotifications, ...safe } = db;
  void credentials;
  return {
    ...safe,
    products: products.map(productView),
    readNotifications,
    generatedAt: now(),
    me: user ? { user, permissions: permissionsFor(user.role), roleSummary: ROLE_SUMMARY[user.role] } : null,
    dashboard: dashboardSummary(),
    notifications: buildNotifications(),
    reorder: reorderRows(),
    lowStockByLocation: locationLowStock(),
    warehouses: warehousesView(),
    reports: REPORT_DEFINITIONS,
    domains: {
      receipt: RECEIPT_STATUSES,
      delivery: DELIVERY_STATUSES,
      transfer: TRANSFER_STATUSES,
      adjustment: ADJUSTMENT_STATUSES,
      count: COUNT_STATUSES,
      reasons: ADJUSTMENT_REASONS,
      units: UNITS,
    },
  };
}

/* -------------------------------------------------------------- mutations */

export const services = {
  products: {
    list: () => getDb().products.map(productView),
    get: (sku: string) => productDetail(sku),
  },
  inventory: {
    byLocation: () =>
      getDb().locations
        .filter((l) => !l.container)
        .map((l) => ({
          code: l.code,
          name: l.name,
          warehouse: l.warehouse,
          type: l.type,
          state: l.state,
          capacity: l.capacityUnits,
          usedVolume: round(usedUnits(l.code)),
          utilisation: utilisation(l.code),
          skuCount: skuCountAt(l.code),
          totalUnits: round(occupants(l.code).reduce((a, o) => a + o.qty, 0)),
          value: Math.round(
            occupants(l.code).reduce((a, o) => a + o.qty * (getDb().products.find((p) => p.sku === o.sku)?.unitCost ?? 0), 0),
          ),
          products: occupants(l.code).map((o) => ({ ...o })),
        }))
        .sort((a, b) => b.totalUnits - a.totalUnits),
    location: (code: string) => {
      if (!findLocation(code)) throw notFound(`“${code}” is not a location in this network.`);
      return locationView(code);
    },
    leavesUnder: (code: string) => leavesUnder(code),
  },
  warehouses: {
    list: () => warehousesView(),
    get: (code: string) => {
      const summary = warehousesView().find((w) => w.code === code);
      if (!summary) throw notFound(`“${code}” is not a warehouse in this network.`);
      const db = getDb();
      const tree = (locCode: string): ReturnType<typeof locationView> & { children: unknown[] } => ({
        ...locationView(locCode),
        children: childrenOf(locCode).map((c) => tree(c.code)),
      });
      return {
        ...summary,
        locations: childrenOf(code).map((l) => tree(l.code)),
        leafCount: leavesUnder(code).length,
        receipts: db.receipts.filter((r) => r.destination === code).map(receiptView),
        deliveries: db.deliveries.filter((d) => d.from === code).map(deliveryView),
        transfers: db.transfers.filter((t) => t.from === code || t.to === code).map(transferView),
        counts: db.counts.filter((c) => c.warehouse === code).map(countView),
        activity: db.events.filter((e) => e.link?.includes(code)).slice(0, 25),
      };
    },
  },
  receipts: {
    list: () => getDb().receipts.map(receiptView),
    get: (ref: string) => ({ ...receiptView(requireOne(getDb().receipts, ref, 'Receipt')), impact: receiptImpact(ref) }),
    create: createReceipt,
    update: updateReceipt,
    setStatus: setReceiptStatus,
  },
  deliveries: {
    list: () => getDb().deliveries.map(deliveryView),
    get: (ref: string) => deliveryView(requireOne(getDb().deliveries, ref, 'Delivery')),
    create: createDelivery,
    setStatus: setDeliveryStatus,
    pick: recordPick,
  },
  transfers: {
    list: () => getDb().transfers.map(transferView),
    get: (ref: string) => transferView(requireOne(getDb().transfers, ref, 'Transfer')),
    create: createTransfer,
    setStatus: setTransferStatus,
    preview: (from: string, to: string, lines: { sku: string; qty: number }[]) => transferPreview(from, to, lines),
  },
  adjustments: {
    list: () => getDb().adjustments.map(adjustmentView),
    get: (ref: string) => adjustmentView(requireOne(getDb().adjustments, ref, 'Adjustment')),
    create: createAdjustment,
    update: updateAdjustment,
    setStatus: setAdjustmentStatus,
  },
  counts: {
    list: () => getDb().counts.map(countView),
    get: (ref: string) => countView(requireOne(getDb().counts, ref, 'Count')),
    create: createCount,
    record: recordCountLine,
    setStatus: setCountStatus,
    raiseAdjustments: raiseAdjustmentsFromCount,
    staff: () => getDb().users.filter((u) => u.active).map((u) => ({ name: u.name, role: u.role, title: u.title })),
  },
  ledger: {
    list: () => getDb().ledger,
    get: (id: string) => {
      const entry = getDb().ledger.find((l) => l.id === id);
      if (!entry) return null;
      const siblings = getDb().ledger.filter((l) => l.ref === entry.ref);
      const index = getDb().ledger.findIndex((l) => l.id === id);
      const before = getDb().ledger[index + 1];
      return { entry, siblings, beforeAfter: before ? { before: before.balanceAfter, after: entry.balanceAfter } : null };
    },
    counts: () => {
      const db = getDb();
      return {
        total: db.ledger.length,
        receipt: db.ledger.filter((l) => l.type === 'RECEIPT').length,
        delivery: db.ledger.filter((l) => l.type === 'DELIVERY').length,
        transfer: db.ledger.filter((l) => l.type === 'TRANSFER').length,
        adjustment: db.ledger.filter((l) => l.type === 'ADJUSTMENT').length,
        opening: db.ledger.filter((l) => l.type === 'OPENING').length,
      };
    },
  },
  notifications: {
    list: () => buildNotifications(),
    markRead: (id: string) => {
      const db = getDb();
      if (!db.readNotifications.includes(id)) db.readNotifications.push(id);
      commit();
      return db.readNotifications;
    },
    markAllRead: () => {
      const db = getDb();
      db.readNotifications = buildNotifications().map((n) => n.id);
      commit();
      return db.readNotifications;
    },
  },
  reports: {
    definitions: () => REPORT_DEFINITIONS,
    run: runReport,
  },
  search,
  user: {
    directory: () =>
      getDb().users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, initials: u.initials })),
    me: (id: string) => getDb().users.find((u) => u.id === id) ?? null,
  },
};

function requireOne<T extends { ref: string }>(list: T[], ref: string, label: string): T {
  const found = list.find((x) => x.ref === ref);
  if (!found) throw notFound(`${label} ${ref} does not exist.`);
  return found;
}

export { emit, postLedger, getDb, leavesUnder, requireProduct, skuCountAt };
export type { Database, Settings, DomainEvent };
