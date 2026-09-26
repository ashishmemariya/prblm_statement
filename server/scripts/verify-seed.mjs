/**
 * Seed verifier. Run with `npm run verify` to print the derived stock position
 * and prove that the ledger running balance lands on the current on-hand.
 */
import { buildSeed } from '../src/seed.js';
import { locationScope } from '../src/domain/stock.js';

const db = buildSeed();
const bySku = new Map(db.products.map((p) => [p.sku, p]));

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
};

console.log('--- stock position -------------------------------------------------');
let total = 0;
for (const p of db.products) {
  const qty = Object.values(p.stock).reduce((a, b) => a + b, 0);
  total += qty;
  const dist = Object.entries(p.stock)
    .map(([l, v]) => `${l}=${v}`)
    .join('  ');
  console.log(`${p.sku.padEnd(13)} ${String(qty).padStart(5)} ${p.uom.padEnd(7)} ${p.statusHint ?? ''}${dist}`);
}
console.log(`total quantity on hand: ${total}`);

console.log('\n--- ledger reconciliation ------------------------------------------');
for (const p of db.products) {
  const entries = db.ledger.filter((l) => l.sku === p.sku);
  if (entries.length === 0) {
    console.log(`${p.sku.padEnd(13)} no history (starts at zero)`);
    continue;
  }
  const sum = entries.reduce((a, l) => a + l.delta, 0);
  const onHand = Object.values(p.stock).reduce((a, b) => a + b, 0);
  const last = entries[entries.length - 1];
  check(
    `${p.sku.padEnd(13)} ledger sum ${sum} === on hand ${onHand}`,
    Math.abs(sum - onHand) < 1e-9,
  );
  check(
    `${p.sku.padEnd(13)} final balanceAfter ${last?.balanceAfter} === on hand ${onHand}`,
    Math.abs((last?.balanceAfter ?? -1) - onHand) < 1e-9,
  );
  const monotonic = entries.every((l, i) => i === 0 || l.balanceAfter >= 0);
  check(`${p.sku.padEnd(13)} no negative running balance`, monotonic);
}

console.log('\n--- referential integrity ------------------------------------------');
const locationCodes = new Set(db.locations.map((l) => l.code));
const warehouseCodes = new Set(db.warehouses.map((w) => w.code));
for (const l of db.locations) {
  check(`location ${l.code} parent resolves`, !l.parent || locationCodes.has(l.parent));
  check(`location ${l.code} warehouse resolves`, warehouseCodes.has(l.warehouse));
  if (!l.container) check(`location ${l.code} has capacity`, l.capacityUnits > 0);
}
for (const r of db.receipts) {
  check(`${r.ref} destination resolves`, locationCodes.has(r.destination));
  for (const line of r.lines) {
    check(`${r.ref} bin resolves`, locationCodes.has(line.bin), line.bin);
    check(`${r.ref} sku ${line.sku} exists`, bySku.has(line.sku));
  }
}
for (const d of db.deliveries) {
  check(`${d.ref} from resolves`, locationCodes.has(d.from), d.from);
  for (const line of d.lines) check(`${d.ref} sku ${line.sku} exists`, bySku.has(line.sku));
}
for (const t of db.transfers) {
  check(`${t.ref} from resolves`, locationCodes.has(t.from), t.from);
  check(`${t.ref} to resolves`, locationCodes.has(t.to), t.to);
  for (const line of t.lines) check(`${t.ref} sku ${line.sku} exists`, bySku.has(line.sku));
}
for (const a of db.adjustments) {
  check(`${a.ref} location resolves`, locationCodes.has(a.location), a.location);
  check(`${a.ref} sku exists`, bySku.has(a.sku));
  if (a.countRef) check(`${a.ref} count ${a.countRef} exists`, db.counts.some((c) => c.ref === a.countRef));
}
for (const c of db.counts) {
  for (const line of c.lines) {
    check(`${c.ref} line ${line.sku} location resolves`, locationCodes.has(line.location), line.location);
  }
}
const docRefs = new Set([
  ...db.receipts.map((r) => r.ref),
  ...db.deliveries.map((d) => d.ref),
  ...db.transfers.map((t) => t.ref),
  ...db.adjustments.map((a) => a.ref),
  'OPEN-2026',
]);
for (const entry of db.ledger) {
  check(`ledger ${entry.id} ref ${entry.ref} resolves`, docRefs.has(entry.ref));
  for (const leg of entry.legs) {
    check(`ledger ${entry.id} leg ${leg.location} resolves`, locationCodes.has(leg.location));
  }
}

console.log('\n--- roll-up sanity --------------------------------------------------');
for (const p of db.products) {
  for (const loc of db.locations.filter((l) => l.container)) {
    const rolled = locationScope(loc.code).reduce((a, k) => a + (p.stock[k] ?? 0), 0);
    const direct = p.stock[loc.code] ?? 0;
    check(`${p.sku} @ ${loc.code} holds nothing at the container key`, direct === 0);
    if (rolled < 0) check(`${p.sku} @ ${loc.code} roll-up non-negative`, false);
  }
}

console.log('\n--- document summary ------------------------------------------------');
console.log(`receipts   ${db.receipts.length}`);
console.log(`deliveries ${db.deliveries.length}`);
console.log(`transfers  ${db.transfers.length}`);
console.log(`counts     ${db.counts.length}`);
console.log(`adjustments${db.adjustments.length}`);
console.log(`ledger     ${db.ledger.length}`);

console.log(failures === 0 ? '\nAll seed checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
