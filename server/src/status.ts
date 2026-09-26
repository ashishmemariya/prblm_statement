import type { Adjustment, Delivery, Receipt, Transfer } from './types.js';

/**
 * Canonical document lifecycles.
 *
 * `Overdue` is deliberately *not* a status. A document that misses its slot does
 * not become a different kind of document — it stays in its own step and raises a
 * derived attention flag, so "Waiting" still means "waiting" whether or not the
 * appointment has slipped. See `attention()` below.
 */
export const RECEIPT_FLOW = ['Draft', 'Waiting', 'Ready', 'Done'] as const;
export const DELIVERY_FLOW = ['Draft', 'Waiting', 'Ready', 'Picking', 'Packed', 'Done'] as const;
export const TRANSFER_FLOW = ['Draft', 'Waiting', 'Ready', 'In Transit', 'Done'] as const;
export const ADJUSTMENT_FLOW = ['Draft', 'Pending Approval', 'Approved', 'Posted'] as const;

export type ReceiptStatus = (typeof RECEIPT_FLOW)[number];
export type DeliveryStatus = (typeof DELIVERY_FLOW)[number];
export type TransferStatus = (typeof TRANSFER_FLOW)[number];
export type AdjustmentStatus = (typeof ADJUSTMENT_FLOW)[number];

/** Anything still moving; the rest are settled. */
export const TERMINAL = new Set<string>(['Done', 'Posted', 'Canceled', 'Approved']);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}

/** 0-based position in the flow, or -1 when the status is not part of it. */
export function statusIndex(flow: readonly string[], status: string): number {
  return flow.indexOf(status);
}

/** The step after `status`, or null when it is terminal or unrecognised. */
export function nextStatus(flow: readonly string[], status: string): string | null {
  const i = statusIndex(flow, status);
  if (i < 0 || i === flow.length - 1) return null;
  return flow[i + 1] ?? null;
}

export function canTransition(flow: readonly string[], from: string, to: string): boolean {
  const i = statusIndex(flow, from);
  return i >= 0 && i + 1 < flow.length && flow[i + 1] === to;
}

/* ------------------------------------------------------------------ *
 * Derived attention flags
 * ------------------------------------------------------------------ */

export type AttentionKind = 'Overdue' | 'Awaiting approval' | 'Draft' | 'Blocked';

export interface Attention {
  kind: AttentionKind;
  /** business-readable sentence, safe to show a warehouse operator */
  message: string;
  /** whole days past the scheduled slot; 0 when not late */
  daysLate: number;
}

const MINUTE = 60_000;

/** Parses the repo's `YYYY-MM-DD HH:MM(:SS)` stamps without timezone surprises. */
function parseStamp(value: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value ?? '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
}

function lateBy(scheduled: string, now: number): number {
  const at = parseStamp(scheduled);
  if (at === null || at >= now) return 0;
  return Math.max(0, Math.floor((now - at) / (24 * 60 * MINUTE)));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What needs a human's attention on a scheduled document. Purely derived — it
 * never writes to the document, so it cannot put a record into a state its own
 * flow does not allow.
 */
export function documentAttention(
  doc: { status: string; scheduledDate: string },
  now: number = Date.now(),
): Attention | null {
  if (isTerminal(doc.status)) return null;

  const days = lateBy(doc.scheduledDate, now);
  if (days > 0) {
    return {
      kind: 'Overdue',
      message: `Past its scheduled slot by ${plural(days, 'day')} — still ${doc.status.toLowerCase()}.`,
      daysLate: days,
    };
  }
  if (doc.status === 'Draft') {
    return { kind: 'Draft', message: 'Not yet released to the floor.', daysLate: 0 };
  }
  return null;
}

/** A count sheet has no scheduled slot, so only its approval state can nag. */
export function adjustmentAttention(
  doc: Adjustment,
  now: number = Date.now(),
): Attention | null {
  if (doc.state === 'Posted' || doc.state === 'Canceled') return null;
  if (doc.state === 'Pending Approval') {
    return { kind: 'Awaiting approval', message: 'Waiting on a second pair of eyes.', daysLate: 0 };
  }
  const days = lateBy(doc.createdAt, now);
  if (days >= 1) {
    return { kind: 'Overdue', message: `Counted ${plural(days, 'day')} ago and still unreviewed.`, daysLate: days };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * View helpers
 * ------------------------------------------------------------------ */

export type DocumentView<T> = T & { attention: Attention | null; stepIndex: number; stepCount: number };

function shape<T extends { status: string }>(
  doc: T,
  flow: readonly string[],
  attention: Attention | null,
): DocumentView<T> {
  return {
    ...doc,
    attention,
    stepIndex: Math.max(0, statusIndex(flow, doc.status)),
    stepCount: flow.length,
  };
}

export function receiptView(doc: Receipt, now?: number): DocumentView<Receipt> {
  return shape(doc, RECEIPT_FLOW, documentAttention(doc, now));
}

export function deliveryView(doc: Delivery, now?: number): DocumentView<Delivery> {
  return shape(doc, DELIVERY_FLOW, documentAttention(doc, now));
}

export function transferView(doc: Transfer, now?: number): DocumentView<Transfer> {
  return shape(doc, TRANSFER_FLOW, documentAttention(doc, now));
}

export function adjustmentView(doc: Adjustment, now?: number): DocumentView<Adjustment> {
  return shape(
    { ...doc, status: doc.state } as Adjustment & { status: string },
    ADJUSTMENT_FLOW,
    adjustmentAttention(doc, now),
  );
}

/** Every status a given document kind can be in, for filter dropdowns. */
export function flowOptions(kind: 'receipt' | 'delivery' | 'transfer' | 'adjustment'): string[] {
  switch (kind) {
    case 'receipt':
      return [...RECEIPT_FLOW];
    case 'delivery':
      return [...DELIVERY_FLOW];
    case 'transfer':
      return [...TRANSFER_FLOW];
    case 'adjustment':
      return [...ADJUSTMENT_FLOW];
  }
}
