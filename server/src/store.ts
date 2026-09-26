import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './types.js';
import { buildSeed, SEED_VERSION } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(here, '../data/db.json');

let db: Database = load();
let ledgerSeq = db.ledger.length;
let docSeq = { receipt: 7, delivery: 7, transfer: 4, adjustment: 4 };

function load(): Database {
  if (existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Database;
      // A stale schema (e.g. before credentials existed) must not boot; reseed instead.
      if (parsed.version !== SEED_VERSION) throw new Error('schema version mismatch');
      if (!Array.isArray(parsed.credentials) || parsed.credentials.length === 0) {
        throw new Error('missing credentials');
      }
      ledgerSeq = parsed.ledger.length;
      docSeq = {
        receipt: maxRef(parsed.receipts.map((r) => r.ref)) + 1,
        delivery: maxRef(parsed.deliveries.map((d) => d.ref)) + 1,
        transfer: maxRef(parsed.transfers.map((t) => t.ref), 2000) + 1,
        adjustment: maxRef(parsed.adjustments.map((a) => a.ref), 4000) + 1,
      };
      return parsed;
    } catch {
      /* corrupt file — fall through to reseed */
    }
  }
  const fresh = buildSeed();
  persist(fresh);
  return fresh;
}

function maxRef(refs: string[], fallback = 0): number {
  const nums = refs
    .map((r) => Number(r.split('/').pop() ?? NaN))
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : fallback;
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
  ledgerSeq = db.ledger.length;
  docSeq = { receipt: 7, delivery: 7, transfer: 4, adjustment: 4 };
  persist();
  return db;
}

export function hardReset(): void {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  db = buildSeed();
  ledgerSeq = db.ledger.length;
  docSeq = { receipt: 7, delivery: 7, transfer: 4, adjustment: 4 };
  persist();
}

export function nextLedgerId(): string {
  ledgerSeq += 1;
  return `LG-${String(ledgerSeq).padStart(4, '0')}`;
}

export function nextReceiptRef(): string {
  return `WH/IN/${String(docSeq.receipt++).padStart(4, '0')}`;
}

export function nextDeliveryRef(): string {
  return `WH/OUT/${String(docSeq.delivery++).padStart(4, '0')}`;
}

export function nextTransferRef(): string {
  return `TR-${docSeq.transfer++}`;
}

export function nextAdjustmentRef(): string {
  return `ADJ-${docSeq.adjustment++}`;
}

export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}
