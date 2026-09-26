/**
 * Append-only stock ledger and the event store.
 *
 * The ledger is the audit record; the event store is what a WebSocket / SSE
 * transport would publish. Both are append-only and both are the reason the
 * dashboard timeline and the balance column can never drift apart.
 */
import { getDb, nextEventId, nextLedgerId } from '../store.js';
import { now } from '../datetime.js';
import type { DomainEvent, EventType, LedgerEntry, LedgerType, Severity } from './ledger-types.js';
import { onHand, findProduct } from './stock.js';

export interface LedgerInput {
  type: LedgerType;
  ref: string;
  sku: string;
  delta: number;
  from: string;
  to: string;
  legs: { location: string; delta: number }[];
  user: string;
  note: string;
  at?: string;
}

/**
 * Writes one ledger row. `balanceAfter` is read from the product *after* the
 * caller has applied the legs, so the column is a fact and not a claim.
 */
export function postLedger(input: LedgerInput): LedgerEntry {
  const db = getDb();
  const product = findProduct(input.sku);
  const entry: LedgerEntry = {
    id: nextLedgerId(),
    at: input.at ?? now(),
    type: input.type,
    ref: input.ref,
    sku: input.sku,
    name: product?.name ?? input.sku,
    delta: input.delta,
    from: input.from,
    to: input.to,
    legs: input.legs,
    balanceAfter: product ? onHand(product) : 0,
    user: input.user,
    note: input.note,
  };
  db.ledger.unshift(entry);
  return entry;
}

export interface EventInput {
  type: EventType;
  ref: string;
  summary: string;
  detail: string;
  user: string;
  link?: string;
  severity: Severity;
  at?: string;
}

export function emit(input: EventInput): DomainEvent {
  const db = getDb();
  const event: DomainEvent = {
    id: nextEventId(),
    at: input.at ?? now(),
    type: input.type,
    ref: input.ref,
    summary: input.summary,
    detail: input.detail,
    user: input.user,
    link: input.link,
    severity: input.severity,
  };
  db.events.unshift(event);
  return event;
}

export function recentEvents(limit = 40): DomainEvent[] {
  return [...getDb().events]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, limit);
}
