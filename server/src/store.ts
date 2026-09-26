import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './types.js';
import { buildSeed, SEED_VERSION } from './seed.js';
import { now } from './datetime.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(here, '../data/db.json');

let db: Database;
let seq: Record<string, number> = {};
let ledgerSeq = 1;
let eventSeq = 1;
let lineSeq = 1;

function deriveSequences(target: Database): void {
  const maxOf = (refs: string[], prefix: string, fallback: number): number => {
    const nums = refs
      .map((r) => Number(r.slice(prefix.length).split('/')[0]))
      .filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) + 1 : fallback;
  };
  seq = {
    receipt: maxOf(target.receipts.map((r) => r.ref), 'RC-', 1001),
    delivery: maxOf(target.deliveries.map((d) => d.ref), 'DL-', 3001),
    transfer: maxOf(target.transfers.map((t) => t.ref), 'TR-', 2001),
    adjustment: maxOf(target.adjustments.map((a) => a.ref), 'ADJ-', 4001),
    count: maxOf(target.counts.map((c) => c.ref), 'CNT-', 5001),
  };
  const ledgerIds = target.ledger.map((l) => Number(l.id.slice(3)));
  ledgerSeq = (ledgerIds.length ? Math.max(...ledgerIds) : 0) + 1;
  const eventIds = target.events.map((e) => Number(e.id.slice(3)));
  eventSeq = (eventIds.length ? Math.max(...eventIds) : 0) + 1;
  const lineIds = [
    ...target.receipts.flatMap((r) => r.lines),
    ...target.deliveries.flatMap((d) => d.lines),
    ...target.transfers.flatMap((t) => t.lines),
    ...target.adjustments,
    ...target.counts.flatMap((c) => c.lines),
  ].map((l) => Number(String(l.id).replace(/\D/g, '')));
  lineSeq = (lineIds.length ? Math.max(...lineIds) : 0) + 1;
}

function load(): Database {
  if (existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Database;
      if (parsed.version !== SEED_VERSION) throw new Error('schema version mismatch');
      if (!Array.isArray(parsed.credentials) || parsed.credentials.length === 0) {
        throw new Error('missing credentials');
      }
      deriveSequences(parsed);
      return parsed;
    } catch {
      /* unreadable or stale — fall through to a fresh seed */
    }
  }
  const fresh = buildSeed();
  deriveSequences(fresh);
  persist(fresh);
  return fresh;
}

function persist(target: Database = db): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(target, null, 2), 'utf8');
}

export function getDb(): Database {
  return db;
}

export function commit(next: Database = db): Database {
  db = next;
  persist();
  return db;
}

export function resetDb(): Database {
  db = buildSeed();
  deriveSequences(db);
  persist();
  return db;
}

export function hardReset(): void {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  db = buildSeed();
  deriveSequences(db);
  persist();
}

export function nextRef(kind: 'receipt' | 'delivery' | 'transfer' | 'adjustment' | 'count'): string {
  const n = seq[kind] ?? 1;
  seq[kind] = n + 1;
  const prefix = { receipt: 'RC-', delivery: 'DL-', transfer: 'TR-', adjustment: 'ADJ-', count: 'CNT-' }[
    kind
  ];
  return `${prefix}${n}`;
}

export function nextLedgerId(): string {
  return `LG-${String(ledgerSeq++).padStart(5, '0')}`;
}

export function nextEventId(): string {
  return `EV-${String(eventSeq++).padStart(5, '0')}`;
}

export function nextLineId(prefix = 'LN'): string {
  return `${prefix}-${String(lineSeq++).padStart(4, '0')}`;
}

export function touchedAt(): string {
  return now();
}

// Boot last: `load()` needs `buildSeed`, and the sequence counters must already
// exist when the seed asks for its first id.
db = load();
