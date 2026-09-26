/**
 * The four stock operations plus cycle counting.
 *
 * Every function here is the whole truth for its document: it validates, moves
 * quantity, writes the ledger row, emits the event, and returns what the caller
 * should tell the user. Nothing in this file trusts a number it was handed from
 * the browser unless the number is a user decision (a counted quantity, a typed
 * quantity on a receipt).
 */
import { getDb, commit, nextLineId, nextRef } from '../store.js';
import { now, qty as round, daysFromToday, isLate } from '../datetime.js';
import { badRequest, conflict, notFound } from '../errors.js';
import {
  ADJUSTMENT_REASONS,
  type Adjustment,
  type AdjustmentReason,
  type Count,
  type CountLine,
  type Delivery,
  type Health,
  type Product,
  type Receipt,
  type Transfer,
} from '../types.js';
import {
  atLocation,
  available,
  credit,
  debit,
  findProduct,
  health,
  isNested,
  occupants,
  onHand,
  reconcile,
  requireAddressable,
  requireLocation,
  requireProduct,
  reservedFor,
  leavesUnder,
  planDebit,
} from './stock.js';
import { emit, postLedger } from './ledger.js';
import {
  ADJUSTMENT_FLOW,
  COUNT_FLOW,
  DELIVERY_FLOW,
  RECEIPT_FLOW,
  TRANSFER_FLOW,
  assertTransition,
  type Transition,
} from './documents.js';

/* ------------------------------------------------------------- utilities */

function requireReceipt(ref: string): Receipt {
  const doc = getDb().receipts.find((r) => r.ref === ref);
  if (!doc) throw notFound(`Receipt ${ref} does not exist.`);
  return doc;
}

function requireDelivery(ref: string): Delivery {
  const doc = getDb().deliveries.find((d) => d.ref === ref);
  if (!doc) throw notFound(`Delivery ${ref} does not exist.`);
  return doc;
}

function requireTransfer(ref: string): Transfer {
  const doc = getDb().transfers.find((t) => t.ref === ref);
  if (!doc) throw notFound(`Transfer ${ref} does not exist.`);
  return doc;
}

function requireAdjustment(ref: string): Adjustment {
  const doc = getDb().adjustments.find((a) => a.ref === ref);
  if (!doc) throw notFound(`Adjustment ${ref} does not exist.`);
  return doc;
}

function requireCount(ref: string): Count {
  const doc = getDb().counts.find((c) => c.ref === ref);
  if (!doc) throw notFound(`Count ${ref} does not exist.`);
  return doc;
}

function positive(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw badRequest(`${label} must be a number greater than zero.`);
  }
  return round(n);
}

function nonNegative(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest(`${label} cannot be negative.`);
  }
  return round(n);
}

/** Emits a low-stock event for any SKU that crossed the threshold just now. */
function announceStockCrossings(before: Map<string, Health>, user: string): void {
  for (const product of getDb().products) {
    const prev = before.get(product.sku);
    if (!prev) continue;
    const current = health(product);
    if (prev === 'IN_STOCK' && (current === 'LOW' || current === 'OUT')) {
      emit({
        type: 'LOW_STOCK_TRIGGERED',
        ref: product.sku,
        summary: `${product.name} fell to ${current === 'OUT' ? 'out of stock' : 'low stock'}`,
        detail: `${onHand(product)} ${product.uom} on hand against a reorder level of ${product.reorder.reorderPoint} ${product.uom}.`,
        user,
        link: `/products/${product.sku}`,
        severity: current === 'OUT' ? 'critical' : 'warning',
      });
    }
  }
}

function snapshotHealth(): Map<string, Health> {
  return new Map(getDb().products.map((p) => [p.sku, health(p)]));
}

/* --------------------------------------------------------------- RECEIPTS */

export interface ReceiptInput {
  supplier: string;
  poRef?: string;
  bolRef?: string;
  contact?: string;
  destination: string;
  scheduledDate: string;
  carrier?: string;
  dockBay?: string;
  notes?: string;
  lines: { sku: string; expected: number; received?: number; bin?: string; lot?: string }[];
}

export function createReceipt(input: ReceiptInput, user: string): Receipt {
  if (!input.supplier?.trim()) throw badRequest('Choose the supplier this delivery is coming from.');
  requireAddressable(input.destination);
  if (!input.scheduledDate) throw badRequest('Give an expected arrival date.');
  if (!input.lines?.length) throw badRequest('Add at least one product to the receipt.');

  const doc: Receipt = {
    ref: nextRef('receipt'),
    supplier: input.supplier.trim(),
    poRef: input.poRef?.trim() || '—',
    bolRef: input.bolRef?.trim() || '—',
    contact: input.contact?.trim() || '—',
    destination: input.destination,
    scheduledDate: input.scheduledDate,
    carrier: input.carrier?.trim() || '—',
    dockBay: input.dockBay?.trim() || 'Unassigned',
    status: 'Draft',
    lines: input.lines.map((l) => {
      const product = requireProduct(l.sku);
      return {
        id: nextLineId('RL'),
        sku: product.sku,
        expected: nonNegative(l.expected, 'Expected quantity'),
        received: l.received === undefined ? 0 : nonNegative(l.received, 'Received quantity'),
        bin: l.bin ? requireLocation(l.bin).code : requireLocation(input.destination).code,
        lot: l.lot?.trim() || 'PENDING',
        barcode: product.barcode,
      };
    }),
    notes: input.notes?.trim() || '',
    createdAt: now(),
    createdBy: user,
  };
  getDb().receipts.unshift(doc);
  emit({
    type: 'DOCUMENT_CREATED',
    ref: doc.ref,
    summary: `Receipt ${doc.ref} drafted`,
    detail: `${doc.supplier} · ${doc.lines.length} line(s) into ${doc.destination}`,
    user,
    link: `/receipts/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

export function updateReceipt(
  ref: string,
  patch: Partial<Pick<Receipt, 'supplier' | 'poRef' | 'bolRef' | 'contact' | 'carrier' | 'dockBay' | 'notes' | 'destination' | 'scheduledDate'>> & {
    lines?: { id: string; received?: number; expected?: number; bin?: string; lot?: string }[];
    add?: { sku: string; expected: number; bin?: string; lot?: string }[];
  },
  user: string,
): Receipt {
  const doc = requireReceipt(ref);
  if (doc.status === 'Done' || doc.status === 'Canceled') {
    throw conflict(`${ref} is ${doc.status.toLowerCase()} and can no longer be edited.`);
  }
  if (patch.supplier !== undefined) doc.supplier = patch.supplier.trim() || doc.supplier;
  if (patch.poRef !== undefined) doc.poRef = patch.poRef.trim() || '—';
  if (patch.bolRef !== undefined) doc.bolRef = patch.bolRef.trim() || '—';
  if (patch.contact !== undefined) doc.contact = patch.contact.trim() || '—';
  if (patch.carrier !== undefined) doc.carrier = patch.carrier.trim() || '—';
  if (patch.dockBay !== undefined) doc.dockBay = patch.dockBay.trim() || '—';
  if (patch.notes !== undefined) doc.notes = patch.notes;
  if (patch.destination !== undefined) {
    requireAddressable(patch.destination);
    doc.destination = patch.destination;
  }
  if (patch.scheduledDate !== undefined) doc.scheduledDate = patch.scheduledDate;
  for (const change of patch.lines ?? []) {
    const line = doc.lines.find((l) => l.id === change.id);
    if (!line) continue;
    if (change.received !== undefined) line.received = nonNegative(change.received, 'Received quantity');
    if (change.expected !== undefined) line.expected = nonNegative(change.expected, 'Expected quantity');
    if (change.bin !== undefined) line.bin = requireLocation(change.bin).code;
    if (change.lot !== undefined) line.lot = change.lot.trim() || 'PENDING';
  }
  for (const add of patch.add ?? []) {
    const product = requireProduct(add.sku);
    doc.lines.push({
      id: nextLineId('RL'),
      sku: product.sku,
      expected: nonNegative(add.expected, 'Expected quantity'),
      received: 0,
      bin: add.bin ? requireLocation(add.bin).code : doc.destination,
      lot: add.lot?.trim() || 'PENDING',
      barcode: product.barcode,
    });
  }
  if (doc.lines.length === 0) throw badRequest('A receipt needs at least one product line.');
  void user;
  commit();
  return doc;
}

export interface ReceiptImpact {
  sku: string;
  name: string;
  uom: string;
  bin: string;
  before: number;
  receiving: number;
  after: number;
}

export function receiptImpact(ref: string): ReceiptImpact[] {
  const doc = requireReceipt(ref);
  return doc.lines.map((line) => {
    const product = requireProduct(line.sku);
    const before = atLocation(product, line.bin);
    return {
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      bin: line.bin,
      before: round(before),
      receiving: round(line.received),
      after: round(before + line.received),
    };
  });
}

function validateReceipt(ref: string, user: string): Receipt {
  const doc = requireReceipt(ref);
  const receivable = doc.lines.filter((l) => l.received > 0);
  if (receivable.length === 0) {
    throw badRequest('Enter at least one received quantity before validating this receipt.');
  }
  const before = snapshotHealth();
  const summary: string[] = [];
  for (const line of receivable) {
    const product = requireProduct(line.sku);
    const legs = credit(product, line.bin, line.received);
    postLedger({
      type: 'RECEIPT',
      ref: doc.ref,
      sku: product.sku,
      delta: line.received,
      from: doc.supplier,
      to: line.bin,
      legs,
      user,
      note:
        line.received === line.expected
          ? `Goods received in full against ${doc.poRef}.`
          : `Goods received short of the expected quantity (${round(line.expected - line.received)} ${product.uom} short).`,
    });
    summary.push(`${line.received} ${product.uom} ${product.name}`);
  }
  doc.status = 'Done';
  doc.validatedAt = now();
  doc.validatedBy = user;
  emit({
    type: 'RECEIPT_VALIDATED',
    ref: doc.ref,
    summary: `Receipt ${doc.ref} validated`,
    detail: `${summary.join(', ')} booked into ${doc.destination}.`,
    user,
    link: `/receipts/${doc.ref}`,
    severity: 'success',
  });
  emit({
    type: 'STOCK_RECEIVED',
    ref: doc.ref,
    summary: `Stock received — ${summary[0] ?? ''}`,
    detail: `Total on hand for this receipt is now ${doc.lines.reduce((a, l) => a + l.received, 0)} units.`,
    user,
    link: `/receipts/${doc.ref}`,
    severity: 'success',
  });
  announceStockCrossings(before, user);
  commit();
  return doc;
}

export function setReceiptStatus(ref: string, to: Receipt['status'], user: string): Receipt {
  const doc = requireReceipt(ref);
  const move: Transition<Receipt['status']> = assertTransition(RECEIPT_FLOW, doc.status, to);
  if (to === 'Canceled') {
    emit({
      type: 'DOCUMENT_CANCELLED',
      ref: doc.ref,
      summary: `Receipt ${doc.ref} cancelled`,
      detail: `${doc.supplier} · expected arrival ${doc.scheduledDate}`,
      user,
      link: `/receipts/${doc.ref}`,
      severity: 'warning',
    });
  }
  if (move.posts) {
    validateReceipt(ref, user);
    return doc;
  }
  doc.status = to;
  commit();
  return doc;
}

/* ------------------------------------------------------------- DELIVERIES */

export interface DeliveryInput {
  customer: string;
  contact?: string;
  address?: string;
  from: string;
  scheduledDate: string;
  carrier?: string;
  notes?: string;
  lines: { sku: string; qty: number; bin?: string }[];
}

export function createDelivery(input: DeliveryInput, user: string): Delivery {
  if (!input.customer?.trim()) throw badRequest('Name the customer this order is for.');
  requireAddressable(input.from);
  if (!input.scheduledDate) throw badRequest('Give a dispatch date.');
  if (!input.lines?.length) throw badRequest('Add at least one product to the delivery.');

  const doc: Delivery = {
    ref: nextRef('delivery'),
    customer: input.customer.trim(),
    contact: input.contact?.trim() || '—',
    address: input.address?.trim() || '—',
    from: input.from,
    scheduledDate: input.scheduledDate,
    carrier: input.carrier?.trim() || 'Unassigned',
    status: 'Draft',
    lines: input.lines.map((l) => {
      const product = requireProduct(l.sku);
      return {
        id: nextLineId('DL'),
        sku: product.sku,
        qty: positive(l.qty, 'Quantity'),
        picked: 0,
        bin: l.bin?.trim() || requireLocation(input.from).name,
        packed: false,
      };
    }),
    notes: input.notes?.trim() || '',
    createdAt: now(),
    createdBy: user,
  };
  getDb().deliveries.unshift(doc);
  emit({
    type: 'DOCUMENT_CREATED',
    ref: doc.ref,
    summary: `Delivery ${doc.ref} drafted`,
    detail: `${doc.customer} · ${doc.lines.length} line(s) from ${doc.from}`,
    user,
    link: `/deliveries/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

export interface LineAvailability {
  id: string;
  sku: string;
  name: string;
  uom: string;
  bin: string;
  required: number;
  picked: number;
  availableAtSource: number;
  availableTotal: number;
  pullFrom: string;
  shortfall: number;
  sufficient: boolean;
  reason: string;
}

export interface DeliveryCheck {
  ref: string;
  status: Delivery['status'];
  lines: LineAvailability[];
  blocked: boolean;
  blockers: string[];
  totalRequired: number;
  totalAvailable: number;
  pickedLines: number;
  pickProgress: number;
  overdue: boolean;
  daysLate: number;
}

export function deliveryCheck(ref: string): DeliveryCheck {
  const doc = requireDelivery(ref);
  const lines: LineAvailability[] = doc.lines.map((line) => {
    const product = findProduct(line.sku);
    if (!product) {
      return {
        id: line.id,
        sku: line.sku,
        name: line.sku,
        uom: 'Units',
        bin: line.bin,
        required: line.qty,
        picked: line.picked,
        availableAtSource: 0,
        availableTotal: 0,
        pullFrom: doc.from,
        shortfall: line.qty,
        sufficient: false,
        reason: 'This product is no longer in the catalogue.',
      };
    }
    const atSource = atLocation(product, doc.from);
    const total = onHand(product);
    // Prefer the ordered source; fall back to whichever warehouse can cover it.
    const alternatives = getDb()
      .warehouses
      .map((w) => w.code)
      .filter((code) => code !== doc.from)
      .map((code) => ({ code, qty: atLocation(product, code) }))
      .sort((a, b) => b.qty - a.qty);
    const pullFrom =
      atSource >= line.qty ? doc.from : (alternatives.find((a) => a.qty >= line.qty)?.code ?? doc.from);
    const sufficient = total >= line.qty;
    return {
      id: line.id,
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      bin: line.bin,
      required: round(line.qty),
      picked: round(line.picked),
      availableAtSource: round(atSource),
      availableTotal: round(total),
      pullFrom,
      shortfall: round(Math.max(0, line.qty - total)),
      sufficient,
      reason: sufficient
        ? pullFrom === doc.from
          ? 'Covered from the dispatch location'
          : `Covered from ${pullFrom}`
        : `Short ${round(line.qty - total)} ${product.uom} — only ${round(total)} on hand`,
    };
  });

  const blockers = lines.filter((l) => !l.sufficient).map((l) => `${l.sku}: needs ${l.required} ${l.uom}, ${l.availableTotal} on hand`);
  const pickedLines = lines.filter((l) => l.picked >= l.required).length;
  const daysLate = -daysFromToday(doc.scheduledDate);

  return {
    ref: doc.ref,
    status: doc.status,
    lines,
    blocked: blockers.length > 0,
    blockers,
    totalRequired: round(lines.reduce((a, l) => a + l.required, 0)),
    totalAvailable: round(lines.reduce((a, l) => a + Math.min(l.required, l.availableTotal), 0)),
    pickedLines,
    pickProgress: lines.length ? Math.round((pickedLines / lines.length) * 100) : 0,
    overdue: !['Done', 'Canceled'].includes(doc.status) && isLate(doc.scheduledDate),
    daysLate: daysLate > 0 ? daysLate : 0,
  };
}

export function recordPick(ref: string, lineId: string, picked: number, user: string): Delivery {
  const doc = requireDelivery(ref);
  if (doc.status === 'Done' || doc.status === 'Canceled') {
    throw conflict(`${ref} is ${doc.status.toLowerCase()} — picking is closed.`);
  }
  const line = doc.lines.find((l) => l.id === lineId);
  if (!line) throw notFound('That delivery line no longer exists.');
  line.picked = Math.min(round(Math.max(0, Number(picked) || 0)), line.qty);
  if (doc.status === 'Ready') doc.status = 'Picking';
  void user;
  commit();
  return doc;
}

export function setDeliveryStatus(ref: string, to: Delivery['status'], user: string): Delivery {
  const doc = requireDelivery(ref);
  const move: Transition<Delivery['status']> = assertTransition(DELIVERY_FLOW, doc.status, to);
  if (move.posts) {
    completeDelivery(ref, user);
    return doc;
  }
  if (to === 'Packed') {
    const check = deliveryCheck(ref);
    const unpacked = check.lines.filter((l) => l.picked < l.required);
    if (unpacked.length > 0) {
      throw badRequest(
        `Confirm every line before packing. ${unpacked.length} line(s) are still short on the pick.`,
      );
    }
    for (const line of doc.lines) line.packed = true;
  }
  if (to === 'Canceled') {
    emit({
      type: 'DOCUMENT_CANCELLED',
      ref: doc.ref,
      summary: `Delivery ${doc.ref} cancelled`,
      detail: `${doc.customer} · ${doc.lines.length} line(s) released back to available stock.`,
      user,
      link: `/deliveries/${doc.ref}`,
      severity: 'warning',
    });
  }
  doc.status = to;
  commit();
  return doc;
}

export function completeDelivery(ref: string, user: string): Delivery {
  const doc = requireDelivery(ref);
  if (doc.status === 'Done') throw conflict(`${ref} has already been completed.`);
  if (doc.status === 'Canceled') throw conflict(`${ref} was cancelled and cannot be completed.`);
  if (doc.status === 'Draft' || doc.status === 'Waiting') {
    throw badRequest('Release the order and reserve stock before completing it.');
  }

  const check = deliveryCheck(ref);
  const db = getDb();
  const guard = db.settings.preventNegativeStock;
  const problems: string[] = [];

  for (const line of check.lines) {
    const product = findProduct(line.sku);
    if (!product) {
      problems.push(`${line.sku} is not in the catalogue.`);
      continue;
    }
    const plan = planDebit(product, line.pullFrom, line.required);
    if (!plan) {
      problems.push(
        `${product.name}: needs ${line.required} ${product.uom}, only ${round(atLocation(product, line.pullFrom))} at ${line.pullFrom}.`,
      );
    }
  }
  if (problems.length > 0 && guard) {
    throw conflict(
      `${ref} cannot be completed — there is not enough stock to fulfil it.`,
      problems,
    );
  }

  const before = snapshotHealth();
  const moved: string[] = [];
  for (const line of doc.lines) {
    const product = findProduct(line.sku);
    if (!product) continue;
    let legs: { location: string; delta: number }[];
    try {
      legs = debit(product, line.pullFrom, line.qty);
    } catch {
      if (guard) throw conflict(`${ref} cannot be completed.`, [`${product.name} is short at ${line.pullFrom}.`]);
      legs = [];
    }
    postLedger({
      type: 'DELIVERY',
      ref: doc.ref,
      sku: product.sku,
      delta: -round(line.qty),
      from: line.pullFrom,
      to: doc.customer,
      legs,
      user,
      note: `Dispatched to ${doc.customer}${doc.carrier !== 'Unassigned' ? ` on ${doc.carrier}` : ''}.`,
    });
    moved.push(`${line.qty} ${product.uom} ${product.name}`);
  }

  doc.status = 'Done';
  doc.completedAt = now();
  doc.completedBy = user;
  for (const line of doc.lines) {
    line.picked = line.qty;
    line.packed = true;
  }
  emit({
    type: 'DELIVERY_COMPLETED',
    ref: doc.ref,
    summary: `Delivery ${doc.ref} completed`,
    detail: `${moved.join(', ')} left the network for ${doc.customer}.`,
    user,
    link: `/deliveries/${doc.ref}`,
    severity: 'success',
  });
  emit({
    type: 'STOCK_DELIVERED',
    ref: doc.ref,
    summary: `Stock delivered — ${moved[0] ?? ''}`,
    detail: `On hand for this order is now ${moved.length} line(s) lower.`,
    user,
    link: `/deliveries/${doc.ref}`,
    severity: 'info',
  });
  announceStockCrossings(before, user);
  commit();
  return doc;
}

/* -------------------------------------------------------------- TRANSFERS */

export interface TransferInput {
  from: string;
  to: string;
  lines: { sku: string; qty: number }[];
  reason?: string;
}

export interface TransferPreviewLine {
  sku: string;
  name: string;
  uom: string;
  qty: number;
  availableAtSource: number;
  remainingAtSource: number;
  canMove: boolean;
}

export function transferPreview(from: string, to: string, lines: { sku: string; qty: number }[]) {
  const rows: TransferPreviewLine[] = lines.map((l) => {
    const product = requireProduct(l.sku);
    const available$ = atLocation(product, from);
    return {
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      qty: round(l.qty),
      availableAtSource: available$,
      remainingAtSource: round(available$ - l.qty),
      canMove: available$ >= l.qty,
    };
  });
  const product = lines[0] ? findProduct(lines[0].sku) : undefined;
  return {
    lines: rows,
    enterpriseBefore: product ? onHand(product) : 0,
    enterpriseAfter: product ? onHand(product) : 0,
  };
}

export function createTransfer(input: TransferInput, user: string): Transfer {
  requireAddressable(input.from);
  requireAddressable(input.to);
  if (input.from === input.to) throw badRequest('Source and destination are the same location.');
  if (isNested(input.to, input.from) || isNested(input.from, input.to)) {
    throw badRequest(
      'Source and destination are inside each other. Pick two locations that sit side by side.',
    );
  }
  if (!input.lines?.length) throw badRequest('Add at least one product to the transfer.');

  const doc: Transfer = {
    ref: nextRef('transfer'),
    from: input.from,
    to: input.to,
    lines: input.lines.map((l) => ({
      id: nextLineId('TL'),
      sku: requireProduct(l.sku).sku,
      qty: positive(l.qty, 'Quantity'),
    })),
    status: 'Draft',
    reason: input.reason?.trim() || 'Internal relocation.',
    requestedBy: user,
    createdAt: now(),
  };
  getDb().transfers.unshift(doc);
  emit({
    type: 'DOCUMENT_CREATED',
    ref: doc.ref,
    summary: `Transfer ${doc.ref} drafted`,
    detail: `${doc.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ')} from ${doc.from} to ${doc.to}.`,
    user,
    link: `/transfers/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

export function setTransferStatus(ref: string, to: Transfer['status'], user: string): Transfer {
  const doc = requireTransfer(ref);
  const move: Transition<Transfer['status']> = assertTransition(TRANSFER_FLOW, doc.status, to);
  if (move.posts) {
    completeTransfer(ref, user);
    return doc;
  }
  if (to === 'Canceled') {
    emit({
      type: 'DOCUMENT_CANCELLED',
      ref: doc.ref,
      summary: `Transfer ${doc.ref} cancelled`,
      detail: `${doc.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ')} — nothing was moved.`,
      user,
      link: `/transfers/${doc.ref}`,
      severity: 'warning',
    });
  }
  doc.status = to;
  commit();
  return doc;
}

export function completeTransfer(ref: string, user: string): Transfer {
  const doc = requireTransfer(ref);
  if (doc.status === 'Done') throw conflict(`${ref} has already been completed.`);
  if (doc.status === 'Canceled') throw conflict(`${ref} was cancelled.`);
  if (doc.status === 'Draft' || doc.status === 'Waiting') {
    throw badRequest('Approve the transfer for movement before completing it.');
  }

  const before = new Map(doc.lines.map((l) => [l.sku, onHand(requireProduct(l.sku))]));
  const summary: string[] = [];

  for (const line of doc.lines) {
    const product = requireProduct(line.sku);
    // A transfer can only move what exists, so this guard never relaxes.
    const outLegs = planDebit(product, doc.from, line.qty);
    if (!outLegs) {
      throw conflict(`${ref} cannot be completed — the source does not hold enough stock.`, [
        `${product.name}: needs ${line.qty} ${product.uom}, only ${round(atLocation(product, doc.from))} at ${doc.from}.`,
      ]);
    }
    applyLegsLocal(product, outLegs);
    const inLegs = credit(product, doc.to, line.qty);
    postLedger({
      type: 'TRANSFER',
      ref: doc.ref,
      sku: product.sku,
      delta: 0,
      from: outLegs?.map((l) => l.location).join(', ') || doc.from,
      to: doc.to,
      legs: [...outLegs, ...inLegs],
      user,
      note: 'Internal relocation — total company stock is unchanged.',
    });
    summary.push(`${line.qty} ${product.uom} ${product.name}`);
  }

  for (const [sku, prior] of before) {
    const product = requireProduct(sku);
    if (Math.abs(onHand(product) - prior) > 1e-9) {
      throw conflict(`The transfer could not be completed because the total balance would change.`);
    }
  }

  doc.status = 'Done';
  doc.completedAt = now();
  doc.completedBy = user;
  emit({
    type: 'TRANSFER_COMPLETED',
    ref: doc.ref,
    summary: `Transfer ${doc.ref} completed`,
    detail: `${summary.join(', ')} moved from ${doc.from} to ${doc.to}. Total company stock unchanged.`,
    user,
    link: `/transfers/${doc.ref}`,
    severity: 'success',
  });
  emit({
    type: 'STOCK_TRANSFERRED',
    ref: doc.ref,
    summary: `Stock moved — ${summary[0] ?? ''}`,
    detail: `${doc.from} reduced, ${doc.to} increased.`,
    user,
    link: `/transfers/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

/* ------------------------------------------------------------ ADJUSTMENTS */

export interface AdjustmentInput {
  sku: string;
  location: string;
  counted: number;
  reason: AdjustmentReason;
  notes?: string;
  countRef?: string;
}

export function requiresApproval(
  valuationImpact: number,
  recorded: number,
  difference: number,
): boolean {
  const s = getDb().settings;
  if (!s.approvalRequired) return false;
  const pct = recorded === 0 ? (difference === 0 ? 0 : 100) : (Math.abs(difference) / recorded) * 100;
  return Math.abs(valuationImpact) >= s.approvalValueThreshold || pct >= s.approvalVariancePct;
}

export function createAdjustment(input: AdjustmentInput, user: string): Adjustment {
  const product = requireProduct(input.sku);
  requireLocation(input.location);
  if (!(ADJUSTMENT_REASONS as readonly string[]).includes(input.reason)) {
    throw badRequest('Choose a reason for the adjustment.');
  }
  const counted = nonNegative(input.counted, 'Physical count');
  const recorded = atLocation(product, input.location);
  const doc: Adjustment = {
    ref: nextRef('adjustment'),
    sku: product.sku,
    location: input.location,
    recorded,
    counted,
    difference: round(counted - recorded),
    reason: input.reason,
    notes: input.notes?.trim() || '',
    status: 'Draft',
    countRef: input.countRef,
    createdAt: now(),
    createdBy: user,
  };
  getDb().adjustments.unshift(doc);
  emit({
    type: 'DOCUMENT_CREATED',
    ref: doc.ref,
    summary: `Adjustment ${doc.ref} raised`,
    detail: `${product.name} at ${input.location} · book ${recorded} ${product.uom} · counted ${counted} ${product.uom}.`,
    user,
    link: `/adjustments/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

export function updateAdjustment(
  ref: string,
  patch: { counted?: number; reason?: AdjustmentReason; notes?: string; location?: string },
): Adjustment {
  const doc = requireAdjustment(ref);
  if (doc.status !== 'Draft') {
    throw conflict(`${ref} is ${doc.status.toLowerCase()} and can no longer be edited.`);
  }
  const product = requireProduct(doc.sku);
  if (patch.location !== undefined) {
    requireLocation(patch.location);
    doc.location = patch.location;
  }
  if (patch.reason !== undefined) doc.reason = patch.reason;
  if (patch.notes !== undefined) doc.notes = patch.notes;
  doc.recorded = atLocation(product, doc.location);
  if (patch.counted !== undefined) {
    doc.counted = nonNegative(patch.counted, 'Physical count');
    doc.difference = round(doc.counted - doc.recorded);
  } else if (doc.counted !== null) {
    doc.difference = round(doc.counted - doc.recorded);
  }
  commit();
  return doc;
}

export function adjustmentApproval(ad: Adjustment): {
  required: boolean;
  reason: string;
  impact: number;
  variancePct: number;
} {
  const db = getDb();
  const product = findProduct(ad.sku);
  const impact = (ad.difference ?? 0) * (product?.unitCost ?? 0);
  const recorded = ad.recorded;
  const pct =
    recorded === 0 ? ((ad.difference ?? 0) === 0 ? 0 : 100) : (Math.abs(ad.difference ?? 0) / recorded) * 100;
  const reasons: string[] = [];
  if (Math.abs(impact) >= db.settings.approvalValueThreshold) {
    reasons.push(
      `value impact of ${db.settings.company.currency}${Math.round(impact).toLocaleString('en-IN')}`,
    );
  }
  if (pct >= db.settings.approvalVariancePct) reasons.push(`variance of ${pct.toFixed(1)}%`);
  return {
    required: requiresApproval(impact, recorded, ad.difference ?? 0),
    reason: reasons.join(' · '),
    impact: round(impact),
    variancePct: Math.round(pct * 100) / 100,
  };
}

function postAdjustment(ref: string, user: string): Adjustment {
  const doc = requireAdjustment(ref);
  const product = requireProduct(doc.sku);
  if (doc.counted === null || doc.difference === null) {
    throw badRequest('Enter the physical count before posting this adjustment.');
  }
  const before = snapshotHealth();
  const beforeOnHand = onHand(product);
  const legs = reconcile(product, doc.location, doc.difference);
  const after = onHand(product);
  if (Math.abs(after - (beforeOnHand + doc.difference)) > 1e-9) {
    throw conflict('The adjustment could not be applied because the balance would not reconcile.');
  }
  postLedger({
    type: 'ADJUSTMENT',
    ref: doc.ref,
    sku: product.sku,
    delta: doc.difference,
    from: doc.location,
    to: doc.difference < 0 ? 'Written off' : 'Count surplus',
    legs,
    user,
    note: `${doc.reason} — physical count of ${doc.counted} ${product.uom} against a book position of ${doc.recorded} ${product.uom}.`,
  });
  doc.status = 'Posted';
  doc.postedAt = now();
  emit({
    type: 'STOCK_ADJUSTED',
    ref: doc.ref,
    summary: `Adjustment ${doc.ref} posted`,
    detail: `${product.name} at ${doc.location} ${doc.difference > 0 ? '+' : ''}${doc.difference} ${product.uom}. On hand is now ${after} ${product.uom}.`,
    user,
    link: `/adjustments/${doc.ref}`,
    severity: doc.difference < 0 ? 'warning' : 'success',
  });
  announceStockCrossings(before, user);
  commit();
  return doc;
}

function applyLegsLocal(product: Product, legs: { location: string; delta: number }[]): void {
  for (const leg of legs) {
    const next = round((product.stock[leg.location] ?? 0) + leg.delta);
    if (next <= 0) delete product.stock[leg.location];
    else product.stock[leg.location] = next;
  }
}

export function setAdjustmentStatus(
  ref: string,
  to: Adjustment['status'],
  user: string,
): Adjustment {
  const doc = requireAdjustment(ref);
  const move: Transition<Adjustment['status']> = assertTransition(ADJUSTMENT_FLOW, doc.status, to);
  if (to === 'Pending Approval') {
    if (doc.counted === null) throw badRequest('Enter the physical count before submitting for approval.');
    doc.submittedBy = user;
  }
  if (to === 'Approved') {
    doc.approvedBy = user;
  }
  if (move.posts) {
    postAdjustment(ref, user);
    emit({
      type: 'ADJUSTMENT_APPROVED',
      ref: doc.ref,
      summary: `Adjustment ${doc.ref} approved and posted`,
      detail: `${doc.difference! > 0 ? '+' : ''}${doc.difference} ${requireProduct(doc.sku).uom} written to the stock ledger.`,
      user,
      link: `/adjustments/${doc.ref}`,
      severity: 'success',
    });
    return doc;
  }
  doc.status = to;
  commit();
  return doc;
}

/* ----------------------------------------------------------------- COUNTS */

export function createCount(
  input: {
    warehouse: string;
    location?: string;
    category?: string;
    assignedTo: string;
    dueDate: string;
    notes?: string;
  },
  user: string,
): Count {
  if (!input.warehouse) throw badRequest('Choose the warehouse to count.');
  if (!input.assignedTo) throw badRequest('Assign the count to a member of staff.');
  if (!input.dueDate) throw badRequest('Give the count a due date.');
  const scope = input.location && input.location !== input.warehouse ? input.location : input.warehouse;
  requireAddressable(scope);
  const db = getDb();
  if (!db.users.some((u) => u.name === input.assignedTo && u.active)) {
    throw badRequest('Assign the count to an active member of staff.');
  }

  const lines: CountLine[] = [];
  const seen = new Set<string>();
  for (const occupant of occupants(scope)) {
    const product = requireProduct(occupant.sku);
    if (input.category && product.category !== input.category) continue;
    // Snapshot the figure at the leaf that actually holds the stock.
    for (const leaf of leavesUnder(scope)) {
      const systemQty = product.stock[leaf.code] ?? 0;
      if (systemQty <= 0) continue;
      const key = `${product.sku}@${leaf.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({
        id: nextLineId('CL'),
        sku: product.sku,
        location: leaf.code,
        systemQty: round(systemQty),
        counted: null,
        note: '',
      });
    }
  }
  if (lines.length === 0) {
    throw badRequest('There is no stock in that scope to count.');
  }

  const doc: Count = {
    ref: nextRef('count'),
    warehouse: input.warehouse,
    location: input.location || input.warehouse,
    category: input.category || '',
    assignedTo: input.assignedTo,
    dueDate: input.dueDate,
    status: 'Scheduled',
    lines,
    notes: input.notes?.trim() || '',
    createdAt: now(),
    createdBy: user,
  };
  db.counts.unshift(doc);
  emit({
    type: 'DOCUMENT_CREATED',
    ref: doc.ref,
    summary: `Count ${doc.ref} scheduled`,
    detail: `${lines.length} line(s) in ${doc.location} assigned to ${doc.assignedTo}.`,
    user,
    link: `/counts/${doc.ref}`,
    severity: 'info',
  });
  commit();
  return doc;
}

export function recordCountLine(
  ref: string,
  lineId: string,
  counted: number | null,
  note: string,
): Count {
  const doc = requireCount(ref);
  if (doc.status === 'Completed' || doc.status === 'Canceled') {
    throw conflict(`${ref} is ${doc.status.toLowerCase()}.`);
  }
  const line = doc.lines.find((l) => l.id === lineId);
  if (!line) throw notFound('That count line no longer exists.');
  line.counted = counted === null ? null : nonNegative(counted, 'Counted quantity');
  line.note = note.trim();
  if (doc.status === 'Scheduled') doc.status = 'In Progress';
  commit();
  return doc;
}

export function setCountStatus(ref: string, to: Count['status'], user: string): Count {
  const doc = requireCount(ref);
  const move: Transition<Count['status']> = assertTransition(COUNT_FLOW, doc.status, to);
  if (to === 'Completed') {
    const pending = doc.lines.filter((l) => l.counted === null);
    if (pending.length > 0) {
      throw badRequest(
        `${pending.length} line(s) have not been counted yet. Enter every quantity, or remove the line.`,
      );
    }
    doc.completedAt = now();
    emit({
      type: 'COUNT_COMPLETED',
      ref: doc.ref,
      summary: `Count ${doc.ref} completed`,
      detail: `${doc.lines.length} line(s) counted in ${doc.location} by ${doc.assignedTo}.`,
      user,
      link: `/counts/${doc.ref}`,
      severity: 'success',
    });
  }
  void move;
  doc.status = to;
  commit();
  return doc;
}

/** Turns the variances on a completed count into draft adjustments. */
export function raiseAdjustmentsFromCount(ref: string, user: string): Adjustment[] {
  const count = requireCount(ref);
  if (count.status !== 'Completed') {
    throw badRequest('Complete the count before raising adjustments.');
  }
  const db = getDb();
  const existing = new Set(db.adjustments.filter((a) => a.countRef === ref).map((a) => a.sku));
  const created: Adjustment[] = [];
  for (const line of count.lines) {
    if (line.counted === null) continue;
    const product = requireProduct(line.sku);
    if (existing.has(line.sku)) continue;
    const adjustment: Adjustment = {
      ref: nextRef('adjustment'),
      sku: product.sku,
      location: line.location,
      recorded: line.systemQty,
      counted: line.counted,
      difference: round(line.counted - line.systemQty),
      reason: line.counted < line.systemQty ? 'Counting Error' : 'Counting Error',
      notes: line.note || `Raised automatically from count ${ref}.`,
      status: 'Draft',
      countRef: ref,
      createdAt: now(),
      createdBy: user,
    };
    db.adjustments.unshift(adjustment);
    created.push(adjustment);
  }
  if (created.length === 0) {
    throw badRequest('Every variance on this count already has an adjustment.');
  }
  commit();
  return created;
}

/* ------------------------------------------------------- shared dashboards */

export function pendingCounts() {
  return getDb()
    .counts.filter((c) => c.status !== 'Completed' && c.status !== 'Canceled')
    .map((c) => ({
      ref: c.ref,
      assignedTo: c.assignedTo,
      dueDate: c.dueDate,
      status: c.status,
      warehouse: c.warehouse,
      location: c.location,
      lines: c.lines.length,
      counted: c.lines.filter((l) => l.counted !== null).length,
      daysToDue: daysFromToday(c.dueDate),
    }))
    .sort((a, b) => a.daysToDue - b.daysToDue);
}

export function stockHealthSummary(): {
  total: number;
  available: number;
  reserved: number;
  value: number;
  low: Product[];
  out: Product[];
} {
  const db = getDb();
  const products = db.products;
  return {
    total: round(products.reduce((a, p) => a + onHand(p), 0)),
    available: round(products.reduce((a, p) => a + available(p), 0)),
    reserved: round(products.reduce((a, p) => a + reservedFor(p.sku), 0)),
    value: round(products.reduce((a, p) => a + onHand(p) * p.unitCost, 0)),
    low: products.filter((p) => health(p) === 'LOW'),
    out: products.filter((p) => health(p) === 'OUT'),
  };
}
