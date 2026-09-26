import { getDb, commit, nextLedgerId, nowStamp } from './store.js';
import { documentAttention } from './status.js';
import type {
  Adjustment,
  Delivery,
  DeliveryLine,
  LedgerEntry,
  Product,
  Receipt,
  Transfer,
} from './types.js';

/* ------------------------------------------------------------------ *
 * Location hierarchy
 *
 * Balances are stored per *leaf* bin, but operations reference any node.
 * `WH/Stock` is a container over `WH/Stock/Heavy-Rack-01` and
 * `WH/Stock/Bay-04`, so reading a container must roll up its children.
 * ------------------------------------------------------------------ */

/** All storage keys that physically sit inside `code` (itself + descendants). */
export function locationScope(code: string): string[] {
  const locations = getDb().locations;
  const scope = new Set<string>([code]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of locations) {
      if (l.parent && scope.has(l.parent) && !scope.has(l.code)) {
        scope.add(l.code);
        grew = true;
      }
    }
  }
  return [...scope];
}

export function isContainer(code: string): boolean {
  return getDb().locations.find((l) => l.code === code)?.container ?? false;
}

/**
 * Drain up to `qty` from the `preferred` subtree, FIFO by bin code, then from
 * the deepest remaining leaves network-wide. Never drives a bin below zero.
 * Returns the concrete leaves drawn from.
 */
export function drainFifo(
  p: Product,
  preferred: string,
  qty: number,
): { taken: Record<string, number>; total: number; unmet: number } {
  const inScope = locationScope(preferred);
  const rest = Object.keys(p.stock)
    .filter((k) => !inScope.includes(k) && (p.stock[k] ?? 0) > 0)
    .sort((a, b) => (p.stock[b] ?? 0) - (p.stock[a] ?? 0));
  const order = [...inScope.filter((k) => (p.stock[k] ?? 0) > 0).sort(), ...rest];

  const taken: Record<string, number> = {};
  let want = qty;
  for (const loc of order) {
    if (want <= 0) break;
    const take = Math.min(p.stock[loc] ?? 0, want);
    if (take <= 0) continue;
    const left = (p.stock[loc] ?? 0) - take;
    // Drop emptied bins so a product's map only ever lists locations that hold stock.
    if (left === 0) delete p.stock[loc];
    else p.stock[loc] = left;
    taken[loc] = (taken[loc] ?? 0) + take;
    want -= take;
  }
  return { taken, total: qty - want, unmet: want };
}

/* ------------------------------------------------------------------ *
 * Core inventory primitives
 * ------------------------------------------------------------------ */

export function totalStock(p: Product): number {
  return Object.values(p.stock).reduce((a, b) => a + b, 0);
}

/** Quantity physically available in a location subtree (0 when unknown). */
export function stockAt(p: Product, location: string): number {
  return locationScope(location).reduce((sum, key) => sum + (p.stock[key] ?? 0), 0);
}

/** On-hand minus soft reservations. Never negative. */
export function freeToUse(p: Product): number {
  return Math.max(0, totalStock(p) - p.reserved);
}

export function productStatus(p: Product): 'IN_STOCK' | 'LOW' | 'OUT' {
  const t = totalStock(p);
  if (t === 0) return 'OUT';
  if (t <= p.reorderPoint) return 'LOW';
  return 'IN_STOCK';
}

export function findProduct(sku: string): Product | undefined {
  return getDb().products.find((p) => p.sku === sku);
}

/**
 * FIFO: leaf bins inside `preferred`, ordered by bin code so consumption is
 * deterministic. Returns the concrete leaves that satisfy `qty`, or null.
 */
export function fifoPicks(p: Product, preferred: string, qty: number): string[] | null {
  const scope = locationScope(preferred).filter((k) => (p.stock[k] ?? 0) > 0).sort();
  const picks: string[] = [];
  let remaining = qty;
  for (const k of scope) {
    if (remaining <= 0) break;
    const avail = p.stock[k] ?? 0;
    const take = Math.min(avail, remaining);
    if (take <= 0) continue;
    picks.push(k);
    remaining -= take;
  }
  return remaining <= 0 ? picks : null;
}

/** Preferred source, else the subtree with the deepest holdings. */
export function pickSource(p: Product, preferred: string, qty: number): string | null {
  if (stockAt(p, preferred) >= qty) return preferred;
  const roots = getDb().locations.filter((l) => !l.parent).map((l) => l.code);
  const ranked = roots
    .map((code) => ({ code, qty: stockAt(p, code) }))
    .sort((a, b) => b.qty - a.qty);
  for (const r of ranked) if (r.qty >= qty) return r.code;
  return null;
}

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

export function postLedger(input: {
  type: LedgerEntry['type'];
  ref: string;
  sku: string;
  delta: number;
  from: string;
  to: string;
  user: string;
  note: string;
}): LedgerEntry {
  const db = getDb();
  const p = db.products.find((x) => x.sku === input.sku);
  const entry: LedgerEntry = {
    id: nextLedgerId(),
    timestamp: nowStamp(),
    type: input.type,
    ref: input.ref,
    sku: input.sku,
    name: p?.name ?? input.sku,
    delta: input.delta,
    from: input.from,
    to: input.to,
    balanceAfter: p ? totalStock(p) : 0,
    user: input.user,
    note: input.note,
  };
  db.ledger.unshift(entry);
  return entry;
}

/* ------------------------------------------------------------------ *
 * Delivery validation — the "zero-floor + shortage lock" rule
 * ------------------------------------------------------------------ */

export interface LineAvailability {
  sku: string;
  name: string;
  unit: string;
  demand: number;
  availableAtSource: number;
  availableTotal: number;
  bin: string;
  sufficient: boolean;
  shortfall: number;
  /** source location the stock would actually be pulled from (FIFO-ish) */
  pullFrom: string;
  reason: string;
}

export interface DeliveryCheck {
  ref: string;
  lines: LineAvailability[];
  blocked: boolean;
  blockers: string[];
  alreadyPosted: boolean;
}

export function checkDelivery(ref: string): DeliveryCheck | null {
  const db = getDb();
  const doc = db.deliveries.find((d) => d.ref === ref);
  if (!doc) return null;

  const lines: LineAvailability[] = doc.items.map((line) => {
    const p = findProduct(line.sku);
    const atSource = p ? stockAt(p, doc.from) : 0;
    const total = p ? totalStock(p) : 0;
    const pullFrom = p ? pickSource(p, doc.from, line.qty) : null;
    const sufficient = total >= line.qty;
    return {
      sku: line.sku,
      name: p?.name ?? line.sku,
      unit: p?.unit ?? 'Units',
      demand: line.qty,
      availableAtSource: atSource,
      availableTotal: total,
      bin: line.bin,
      sufficient,
      shortfall: Math.max(0, line.qty - total),
      pullFrom: pullFrom ?? doc.from,
      reason: !p
        ? 'SKU not present in catalog'
        : total < line.qty
          ? `Short ${line.qty - total} ${p.unit} against global on-hand`
          : atSource < line.qty
            ? `Insufficient at ${doc.from}; ${total} ${p.unit} available network-wide`
            : 'Fully covered at source bay',
    };
  });

  const blockers = lines
    .filter((l) => !l.sufficient)
    .map((l) => `${l.sku}: needs ${l.demand} ${l.unit}, only ${l.availableTotal} on hand`);

  return {
    ref: doc.ref,
    lines,
    blocked: blockers.length > 0,
    blockers,
    alreadyPosted: doc.status === 'Done',
  };
}

/** Validate (post) a delivery. Applies zero-floor guardrail. Throws on violation. */
export function postDelivery(ref: string, user: string): { doc: Delivery; entries: LedgerEntry[] } {
  const db = getDb();
  const doc = db.deliveries.find((d) => d.ref === ref);
  if (!doc) throw new HttpError(404, `Delivery ${ref} not found`);
  if (doc.status === 'Done') throw new HttpError(409, `${ref} has already been validated`);

  const check = checkDelivery(ref);
  if (!check) throw new HttpError(404, `Delivery ${ref} not found`);

  const zeroFloor = db.settings.preventNegativeStock;
  if (check.blocked) {
    if (zeroFloor) {
      throw new HttpError(422, `Validation blocked — ${check.blockers.join('; ')}`, {
        blockers: check.blockers,
      });
    }
    // Guardrail disabled: clamp instead of failing.
  }

  const entries: LedgerEntry[] = [];
  for (const line of doc.items) {
    const p = findProduct(line.sku);
    if (!p) continue;

    // The pre-check already resolved where this line can be served from, so
    // the post and the on-screen preview always agree.
    const plan = check.lines.find((c) => c.sku === line.sku);
    const preferred = plan?.pullFrom ?? doc.from;
    const { taken, unmet } = drainFifo(p, preferred, line.qty);

    if (unmet > 0 && zeroFloor) {
      throw new HttpError(
        422,
        `Validation blocked — ${line.sku}: short ${unmet} ${p.unit} at posting time`,
      );
    }

    p.reserved = Math.max(0, p.reserved - line.qty);
    doc.postedAt = nowStamp();
    entries.push(
      postLedger({
        type: 'DELIVERY',
        ref: doc.ref,
        sku: p.sku,
        delta: -(line.qty - unmet),
        from:
          Object.entries(taken)
            .map(([k, v]) => `${k} (-${v})`)
            .join(' + ') || doc.from,
        to: `${doc.to} (${doc.contact})`,
        user,
        note:
          unmet > 0
            ? `Dispatch validated with ${unmet} ${p.unit} unmet (negative-stock guardrail off).`
            : `Dispatch validated against ${doc.operationType}.`,
      }),
    );
  }

  doc.status = 'Done';
  commit();
  return { doc, entries };
}

/* ------------------------------------------------------------------ *
 * Receipt validation
 * ------------------------------------------------------------------ */

export function postReceipt(ref: string, user: string): { doc: Receipt; entries: LedgerEntry[] } {
  const db = getDb();
  const doc = db.receipts.find((r) => r.ref === ref);
  if (!doc) throw new HttpError(404, `Receipt ${ref} not found`);
  if (doc.status === 'Done') throw new HttpError(409, `${ref} has already been received`);

  const entries: LedgerEntry[] = [];
  for (const line of doc.items) {
    const p = findProduct(line.sku);
    if (!p) continue;
    const dest = line.bin || doc.destination;
    p.stock[dest] = (p.stock[dest] ?? 0) + line.received;
    doc.status = 'Done';
    doc.postedAt = nowStamp();
    entries.push(
      postLedger({
        type: 'RECEIPT',
        ref: doc.ref,
        sku: p.sku,
        delta: line.received,
        from: doc.supplier,
        to: dest,
        user,
        note: `Goods received against ${doc.poRef} / ${doc.bolRef}.`,
      }),
    );
  }
  if (doc.items.length === 0) doc.status = 'Done';
  commit();
  return { doc, entries };
}

/* ------------------------------------------------------------------ *
 * Internal transfer — source decrements, destination increments, net 0
 * ------------------------------------------------------------------ */

export function postTransfer(ref: string, user: string): { doc: Transfer; entry: LedgerEntry } {
  const db = getDb();
  const doc = db.transfers.find((t) => t.ref === ref);
  if (!doc) throw new HttpError(404, `Transfer ${ref} not found`);
  if (doc.status === 'Done') throw new HttpError(409, `${ref} already executed`);

  const p = findProduct(doc.sku);
  if (!p) throw new HttpError(404, `SKU ${doc.sku} not found`);

  if (doc.from === doc.to) throw new HttpError(400, 'Source and destination are identical');

  const available = stockAt(p, doc.from);
  if (db.settings.preventNegativeStock && available < doc.qty) {
    throw new HttpError(
      422,
      `Cannot move ${doc.qty} ${p.unit} — only ${available} available in ${doc.from}`,
    );
  }

  const before = totalStock(p);

  // Drain FIFO leaves inside the source subtree.
  const { taken, unmet } = drainFifo(p, doc.from, doc.qty);
  if (unmet > 0) {
    throw new HttpError(422, `Insufficient stock in ${doc.from} to execute ${ref}`);
  }

  // Land in the destination container's own key (roll-up makes it visible).
  p.stock[doc.to] = (p.stock[doc.to] ?? 0) + doc.qty;
  const after = totalStock(p);

  if (after !== before) {
    throw new HttpError(500, `Transfer invariant violated: global balance drifted ${before} → ${after}`);
  }

  doc.status = 'Done';
  const entry = postLedger({
    type: 'TRANSFER',
    ref: doc.ref,
    sku: p.sku,
    delta: 0,
    from: Object.keys(taken).join(', ') || doc.from,
    to: doc.to,
    user,
    note: 'Internal relocation — net-zero effect on enterprise balance.',
  });
  commit();
  return { doc, entry };
}

/* ------------------------------------------------------------------ *
 * Physical count reconciliation
 * ------------------------------------------------------------------ */

export function postAdjustment(
  input: {
    ref: string;
    counted: number;
    reason: Adjustment['reason'];
    memo: string;
    user: string;
  },
): { doc: Adjustment; entry: LedgerEntry } {
  const db = getDb();
  const doc = db.adjustments.find((a) => a.ref === input.ref);
  if (!doc) throw new HttpError(404, `Adjustment ${input.ref} not found`);
  if (doc.state === 'Posted') throw new HttpError(409, `${input.ref} already posted to ledger`);

  const p = findProduct(doc.sku);
  if (!p) throw new HttpError(404, `SKU ${doc.sku} not found`);

  const bookBefore = totalStock(p);
  const locQty = stockAt(p, doc.location);
  const delta = input.counted - locQty;

  if (db.settings.preventNegativeStock && input.counted < 0) {
    throw new HttpError(422, 'Physical count cannot be negative');
  }

  p.stock[doc.location] = Math.max(0, input.counted);
  doc.recorded = locQty;
  doc.counted = Math.max(0, input.counted);
  doc.delta = delta;
  doc.reason = input.reason;
  doc.memo = input.memo;
  doc.auditor = input.user;
  doc.state = 'Posted';
  doc.postedAt = nowStamp();
  doc.valuationImpact = delta * p.unitCost;

  const entry = postLedger({
    type: 'ADJUSTMENT',
    ref: doc.ref,
    sku: p.sku,
    delta,
    from: doc.location,
    to: delta < 0 ? 'Loss / Scrap' : 'Audit Reconciliation',
    user: input.user,
    note: `${input.reason} — physical count posted.`,
  });

  if (bookBefore + delta !== totalStock(p)) {
    throw new HttpError(500, 'Adjustment invariant violated');
  }
  commit();
  return { doc, entry };
}

export function requiresDualSignoff(a: Adjustment): boolean {
  const s = getDb().settings;
  const absImpact = Math.abs(a.valuationImpact);
  const pct = a.recorded === 0 ? 100 : (Math.abs(a.delta) / a.recorded) * 100;
  return absImpact >= s.dualSignoffThreshold || pct >= s.dualSignoffVariancePct;
}

/* ------------------------------------------------------------------ *
 * Reversals
 *
 * The ledger is append-only, so unwinding a posted document writes a
 * counter-moving REVERSAL row instead of editing or deleting the original.
 * That keeps "the ledger explains every balance" true even after a rewind.
 * ------------------------------------------------------------------ */

export interface ReversalLeg {
  sku: string;
  location: string;
  /** signed change to apply at `location` */
  delta: number;
  /** the document row being counter-moved */
  reverses: string;
  note: string;
}

export function postReversal(legs: ReversalLeg[], user: string): LedgerEntry[] {
  const db = getDb();
  const entries: LedgerEntry[] = [];

  for (const leg of legs) {
    const p = findProduct(leg.sku);
    if (!p) continue;

    const current = p.stock[leg.location] ?? 0;
    if (current + leg.delta < 0) {
      throw new HttpError(
        422,
        `Cannot reverse ${leg.reverses}: ${leg.sku} holds only ${current} ${p.unit} at ${leg.location}`,
      );
    }

    const next = current + leg.delta;
    if (next === 0) delete p.stock[leg.location];
    else p.stock[leg.location] = next;

    entries.push(
      postLedger({
        type: 'REVERSAL',
        ref: leg.reverses,
        sku: leg.sku,
        delta: leg.delta,
        from: leg.delta < 0 ? leg.location : 'Reversal',
        to: leg.delta < 0 ? 'Reversal' : leg.location,
        user,
        note: leg.note,
      }),
    );
  }

  commit();
  return entries;
}

/* ------------------------------------------------------------------ *
 * Dashboard rollup
 * ------------------------------------------------------------------ */

export function dashboardSummary() {
  const db = getDb();
  const onHand = db.products.reduce((a, p) => a + totalStock(p), 0);
  const free = db.products.reduce((a, p) => a + freeToUse(p), 0);
  const reserved = db.products.reduce((a, p) => a + p.reserved, 0);
  const valuation = db.products.reduce((a, p) => a + totalStock(p) * p.unitCost, 0);
  const lowStock = db.products.filter((p) => productStatus(p) !== 'IN_STOCK');

  const now = Date.now();
  const lateReceipts = db.receipts.filter((r) => documentAttention(r, now)?.kind === 'Overdue');
  const lateDeliveries = db.deliveries.filter((d) => documentAttention(d, now)?.kind === 'Overdue');
  const lateTransfers = db.transfers.filter((t) => documentAttention(t, now)?.kind === 'Overdue');

  return {
    catalogSkus: db.products.length,
    totalOnHand: onHand,
    freeToAllocate: free,
    reserved,
    valuation,
    lowStock,
    pendingReceipts: db.receipts.filter((r) => r.status !== 'Done').length,
    pendingDeliveries: db.deliveries.filter((d) => d.status !== 'Done').length,
    waitingDeliveries: db.deliveries.filter((d) => d.status === 'Waiting').length,
    readyDeliveries: db.deliveries.filter((d) => d.status === 'Ready').length,
    doneDeliveries: db.deliveries.filter((d) => d.status === 'Done').length,
    /** Derived, never a stored status: these are documents past their slot. */
    overdueDeliveries: lateDeliveries.length,
    lateReceipts: lateReceipts.length,
    lateTransfers: lateTransfers.length,
    overdueCount: lateReceipts.length + lateDeliveries.length + lateTransfers.length,
    scheduledTransfers: db.transfers.filter((t) => t.status !== 'Done').length,
    pendingAdjustments: db.adjustments.filter((a) => a.state === 'Pending Approval').length,
    ledgerEntries: db.ledger.length,
  };
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class HttpError extends Error {
  status: number;
  meta?: Record<string, unknown>;
  constructor(status: number, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}

export type { DeliveryLine };
