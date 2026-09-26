/** Re-export of the ledger-facing types so `domain/ledger.ts` has no upward imports. */
export type { LedgerEntry, LedgerType, EventType, DomainEvent } from '../types.js';
export type Severity = 'info' | 'success' | 'warning' | 'critical';
