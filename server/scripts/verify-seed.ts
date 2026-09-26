/**
 * Seed verifier — proves the canonical demo dataset is internally consistent.
 * Run with: npm run verify
 */
import { buildSeed } from '../src/seed.js';
import { locationScope } from '../src/domain/stock.js';

const db = buildSeed();
const bySku = new Map(db.products.map((p) => [p.sku, p]));
let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) failures += 1;
  if (!ok) console.log(`FAIL  ${label}${extra ? `  ${extra}` : ''}`);
};

console.log('--- stock position -------------------------------------------------');
let total = 0;
let value = 0;
for (const p of db.products) {
  const qty = Object.values(p.stock).reduce((a, b) => a + b, 0);
  total += qty;
  value += qty * p.unitCost;
  const dist = Object.entries(p.stock)
    .map(([l, v]) => `${l.replace('WH-CEN/Main-Storage/', 'MS/').replace('WH-PRD/', 'P/').replace('WH-DSP/', 'D/').replace('WH-SEC/', 'S/')} = ${v}`)
    .join('   ');
  console.log(`  ${p.sku.padEnd(13)} ${String(qty).padStart(5)} ${p.uom.padEnd(7)} ${dist}`);
}
console.log(`  total quantity on hand : ${total}`);
console.log(`  total inventory value : Rs ${Math.round(value).toLocaleString('en-IN')}`);

console.log('\n--- ledger reconciliation ------------------------------------------');
for (const p of db.products) {
  const entries = db.ledger.filter((l) => l.sku === p.sku);
  if (entries.length === 0) {
    console.log(`  ${p.sku.padEnd(13)} no history (demo starts at zero)`);
    continue;
  }
  const sum = entries.reduce((a, l) => a + l.delta, 0);
  const onHand = Object.values(p.stock).reduce((a, b) => a + b, 0);
  const last = entries[entries.length - 1];
  check(`${p.sku} ledger sum ${sum} === on hand ${onHand}`, Math.abs(sum - onHand) < 1e-9);
  check(`${p.sku} final balance ${last?.balanceAfter} === on hand ${onHand}`, Math.abs((last?.balanceAfter ?? -1) - onHand) < 1e-9);
  check(`${p.sku} timestamps ascend`, entries.every((l, i) => i === 0 || l.at >= entries[i - 1]!.at));
}
const ids = db.ledger.map((l) => l.id);
check('ledger ids are unique', new Set(ids).size === ids.length);
check(
  'ledger ids are contiguous and ordered',
  ids.every((id, i) => id === `LG-${String(i + 1).padStart(5, '0')}`),
);
check(
  'ledger is ordered oldest first',
  db.ledger.every((l, i) => i === 0 || l.at >= db.ledger[i - 1]!.at),
);

console.log('\n--- referential integrity ------------------------------------------');
const locCodes = new Set(db.locations.map((l) => l.code));
const whCodes = new Set(db.warehouses.map((w) => w.code));
for (const l of db.locations) {
  check(`${l.code} parent resolves`, !l.parent || locCodes.has(l.parent));
  check(`${l.code} warehouse resolves`, whCodes.has(l.warehouse));
  if (!l.container) check(`${l.code} has capacity`, l.capacityUnits > 0);
}
for (const r of db.receipts) {
  check(`${r.ref} destination resolves`, locCodes.has(r.destination), r.destination);
  for (const line of r.lines) {
    check(`${r.ref} bin resolves`, locCodes.has(line.bin), line.bin);
    check(`${r.ref} sku ${line.sku} exists`, bySku.has(line.sku));
    check(`${r.ref} uom never undefined`, !!bySku.get(line.sku)?.uom);
  }
}
for (const d of db.deliveries) {
  check(`${d.ref} from resolves`, locCodes.has(d.from), d.from);
  for (const line of d.lines) check(`${d.ref} sku ${line.sku} exists`, bySku.has(line.sku));
}
for (const t of db.transfers) {
  check(`${t.ref} from resolves`, locCodes.has(t.from), t.from);
  check(`${t.ref} to resolves`, locCodes.has(t.to), t.to);
  for (const line of t.lines) check(`${t.ref} sku ${line.sku} exists`, bySku.has(line.sku));
}
for (const a of db.adjustments) {
  check(`${a.ref} location resolves`, locCodes.has(a.location), a.location);
  check(`${a.ref} sku exists`, bySku.has(a.sku));
  if (a.countRef) check(`${a.ref} count resolves`, db.counts.some((c) => c.ref === a.countRef));
  if (a.status === 'Posted') {
    check(`${a.ref} has postedAt`, !!a.postedAt);
    check(`${a.ref} has an approver`, !!a.approvedBy);
  }
}
for (const c of db.counts) {
  check(`${c.ref} warehouse resolves`, whCodes.has(c.warehouse));
  for (const line of c.lines) {
    check(`${c.ref} line location resolves`, locCodes.has(line.location), line.location);
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
  check(`ledger ${entry.id} ref resolves`, docRefs.has(entry.ref), entry.ref);
  for (const leg of entry.legs) check(`ledger ${entry.id} leg resolves`, locCodes.has(leg.location));
}
for (const u of db.users) {
  check(`${u.name} has a credential`, db.credentials.some((c) => c.userId === u.id));
  check(`${u.name} never stores a plaintext password`, !JSON.stringify(u).toLowerCase().includes('password'));
}

console.log('\n--- leaf-only invariant --------------------------------------------');
for (const p of db.products) {
  for (const loc of db.locations.filter((l) => l.container)) {
    check(`${p.sku} holds nothing at container ${loc.code}`, (p.stock[loc.code] ?? 0) === 0);
  }
  for (const [code, value2] of Object.entries(p.stock)) {
    const loc = db.locations.find((l) => l.code === code);
    check(`${p.sku} balance sits on a known location`, !!loc, code);
    check(`${p.sku} balance is positive`, value2 > 0, code);
  }
  for (const loc of db.locations.filter((l) => !l.container)) {
    if (!(loc.code in p.stock)) {
      const occupied = locationScope(loc.code).some((k) => (p.stock[k] ?? 0) > 0);
      check(`${p.sku} empty leaves are not stored`, !occupied || (p.stock[loc.code] ?? 0) > 0);
    }
  }
}

console.log('\n--- document summary ------------------------------------------------');
const byStatus = (list: { status: string }[]) =>
  list.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }), {});
console.log(`  warehouses  ${db.warehouses.length}`);
console.log(`  locations   ${db.locations.length} (${db.locations.filter((l) => !l.container).length} storage bins)`);
console.log(`  products    ${db.products.length}`);
console.log(`  receipts    ${db.receipts.length}  ${JSON.stringify(byStatus(db.receipts))}`);
console.log(`  deliveries  ${db.deliveries.length}  ${JSON.stringify(byStatus(db.deliveries))}`);
console.log(`  transfers   ${db.transfers.length}  ${JSON.stringify(byStatus(db.transfers))}`);
console.log(`  adjustments ${db.adjustments.length}  ${JSON.stringify(db.adjustments.map((a) => a.status))}`);
console.log(`  counts      ${db.counts.length}  ${JSON.stringify(db.counts.map((c) => c.status))}`);
console.log(`  ledger rows ${db.ledger.length}`);

console.log(failures === 0 ? '\nAll seed checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
