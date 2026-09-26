/* End-to-end check of the inventory engine guardrails. Run: node server/scripts/smoke.mjs */
const BASE = process.env.BASE ?? 'http://localhost:4000/api';

let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}${extra ? `  (${extra})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra ? `  (${extra})` : ''}`);
  }
}

let token = null;

async function call(path, init = {}) {
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
  // Only fall back to the ambient token when the caller did not supply one.
  if (token && !headers.authorization) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const steel = async () => (await call('/products/STL-ROD-12')).body;
const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const qtyOf = (p) => Object.values(p.stock).reduce((a, b) => a + b, 0);

console.log('\n== 0. Authentication ==');
const anon = await post('/reset');
ok('mutation without a token is refused', anon.status === 401, `status=${anon.status}`);
ok('refusal message is human readable', /sign in/i.test(anon.body.error ?? ''), anon.body.error);

const bad = await login('demo@stocksense.app', 'wrong-password');
ok('wrong password is rejected', bad.status === 401, `status=${bad.status}`);
ok('rejection does not reveal the user', !/no such user/i.test(bad.body.error ?? ''), bad.body.error);

const unknown = await login('nobody@stocksense.app', 'Demo@1234');
ok('unknown email is rejected the same way', unknown.status === 401, `status=${unknown.status}`);

const good = await login('demo@stocksense.app', 'Demo@1234');
ok('valid credentials return a session', good.status === 200 && !!good.body.token, `status=${good.status}`);
ok('session carries the signed-in user', good.body.user?.name === 'Rahul Sharma', good.body.user?.name);
ok('role permissions are returned', Array.isArray(good.body.permissions) && good.body.permissions.includes('receipt.post'));
token = good.body.token;

const dir = (await call('/auth/directory')).body;
ok('directory lists demo users', Array.isArray(dir) && dir.length >= 4, `count=${dir?.length}`);
ok('directory never exposes credentials', dir.every((u) => !('passwordHash' in u) && !('hash' in u) && !('salt' in u)));

const snap = (await call('/snapshot')).body;
ok('snapshot never exposes credentials', !('credentials' in snap) && !JSON.stringify(snap).includes('"salt"'));
ok('snapshot reports the signed-in user', snap.me?.user?.email === 'demo@stocksense.app');

console.log('\n== 0b. Role enforcement ==');
const staff = await login('priya@stocksense.app', 'Demo@1234');
const staffToken = staff.body.token;
const staffAttempt = await call('/adjustment/post?ref=ADJ-4002', {
  method: 'POST',
  headers: { authorization: `Bearer ${staffToken}` },
  body: JSON.stringify({ counted: 0 }),
});
ok('Warehouse Staff cannot post an adjustment', staffAttempt.status === 403, `status=${staffAttempt.status}`);
ok('403 names the role, not the function', /Warehouse Staff/.test(staffAttempt.body.error ?? ''), staffAttempt.body.error);
ok('no internal function names leak', !/postAdjustment|postDelivery|postTransfer/.test(staffAttempt.body.error ?? ''));

const staffDiag = await call('/diagnostics', { headers: { authorization: `Bearer ${staffToken}` } });
ok('diagnostics is admin-only (or absent)', staffDiag.status === 403 || staffDiag.status === 404, `status=${staffDiag.status}`);

const logout = await post('/auth/logout');
ok('logout succeeds', logout.status === 200, `status=${logout.status}`);
const afterLogout = await post('/reset');
ok('token is dead after logout', afterLogout.status === 401, `status=${afterLogout.status}`);

const relogin = await login('demo@stocksense.app', 'Demo@1234');
ok('can sign in again after logout', relogin.status === 200, `status=${relogin.status}`);
token = relogin.body.token;

console.log('\n== 1. Canonical seed: the live 2026 system ==');
await post('/reset');
const s0 = (await call('/snapshot')).body;
ok('catalogue holds exactly 10 SKUs', s0.products.length === 10, `count=${s0.products.length}`);

const expected = {
  'STL-ROD-12': 77,
  'DESK-CHR-01': 24,
  'SSD-SAM-1TB': 38,
  'RAM-KNG-16': 48,
  'MON-DEL-24': 9,
  'SCN-IND-2D': 27,
  'ACC-LOG-M18': 32,
  'CAB-CAT6-305': 20,
  'LBL-THM-406': 40,
  'COP-WIR-50': 16,
};
let qtyMismatch = [];
for (const [sku, want] of Object.entries(expected)) {
  const got = qtyOf(s0.products.find((p) => p.sku === sku) ?? { stock: {} });
  if (got !== want) qtyMismatch.push(`${sku}=${got} want ${want}`);
}
ok('every seeded on-hand quantity is canonical', qtyMismatch.length === 0, qtyMismatch.join(', '));

const totalQty = s0.products.reduce((a, p) => a + qtyOf(p), 0);
ok('total on-hand is 331', totalQty === 331, `total=${totalQty}`);

const valuation = s0.products.reduce((a, p) => a + qtyOf(p) * p.unitCost, 0);
ok('inventory valuation is Rs 9,96,950', valuation === 996950, `value=${valuation}`);

const low = s0.products.filter((p) => {
  const t = qtyOf(p);
  return t > 0 && t <= p.reorderPoint;
});
const out = s0.products.filter((p) => qtyOf(p) === 0);
ok('exactly 4 items are low stock', low.length === 4, `low=${low.length} [${low.map((p) => p.sku).join(', ')}]`);
ok('no item is out of stock', out.length === 0, `out=${out.length}`);

ok('no 2024 dates survive in the catalogue', !JSON.stringify(s0).includes('2024-'), 'seed is 2026');

const ledgerSeed = s0.ledger;
ok('ledger opens with a baseline row', ledgerSeed.some((l) => l.type === 'OPENING'));
ok('steel balance is 77 kg on load', qtyOf(s0.products.find((p) => p.sku === 'STL-ROD-12')) === 77);
ok(
  'ledger balanceAfter agrees with the derived on-hand',
  (() => {
    const newest = ledgerSeed.filter((l) => l.sku === 'STL-ROD-12')[0];
    return newest?.balanceAfter === 77;
  })(),
);

console.log('\n== 2. The lifecycle drill rewinds to zero ==');
const drillStart = await post('/scenario/start-drill');
ok('drill start succeeds', drillStart.status === 200, drillStart.body.message);
const s1 = await steel();
ok('STL-ROD-12 is back to 0 on hand', s1.total === 0, `total=${s1.total}`);
ok('the rack and staging areas are both empty', Object.keys(s1.stock).length === 0, JSON.stringify(s1.stock));
ok('drill reports itself incomplete', (await call('/scenario')).body.complete === false);

const revRows = (await call('/ledger?sku=STL-ROD-12')).body.filter((l) => l.type === 'REVERSAL');
ok('rewind wrote reversal rows rather than deleting', revRows.length === 5, `reversals=${revRows.length}`);
ok(
  'the original posted rows are still present',
  (await call('/ledger?sku=STL-ROD-12')).body.some((l) => l.ref === 'RC-1001' && l.type === 'RECEIPT'),
);

console.log('\n== 3. Zero-floor guardrail blocks an unstocked delivery ==');
const blocked = await post('/delivery/validate?ref=WH/OUT/0001');
ok('returns HTTP 422', blocked.status === 422, `status=${blocked.status}`);
ok('names the shortage', /only 0 on hand/.test(blocked.body.error ?? ''), blocked.body.error);
ok('no internal function names leak', !/postDelivery|validateDelivery/.test(blocked.body.error ?? ''));

console.log('\n== 4. Deliveries show per-line reasons in the preview ==');
const detail0 = (await call('/delivery?ref=WH/OUT/0001')).body;
ok('WH/OUT/0001 is blocked pre-receipt', detail0.check.blocked === true);
ok(
  'steel line reports a 20 kg shortfall',
  detail0.check.lines.find((l) => l.sku === 'STL-ROD-12')?.shortfall === 20,
);

console.log('\n== 5. Run the 4-step drill ==');
const r1 = await post('/scenario/run');
ok('step 1 = receive 100 kg', r1.body.action === 'receive', r1.body.message);
const s2 = await steel();
ok('steel total is now 100 kg', s2.total === 100, `total=${s2.total}`);
ok('stock landed in the heavy rack', s2.stock['WH/Stock/Heavy-Rack-01'] === 100, JSON.stringify(s2.stock));
ok('step 1 is attributed to the signed-in user', (await call('/ledger?sku=STL-ROD-12')).body[0]?.user === 'Rahul Sharma');

const r2 = await post('/scenario/run');
ok('step 2 = transfer to production', r2.body.action === 'transfer', r2.body.message);
const s3 = await steel();
ok('transfer is net-zero on the global balance', s3.total === 100, `total=${s3.total}`);
ok('the rack drained to 0', (s3.stock['WH/Stock/Heavy-Rack-01'] ?? 0) === 0);
ok('WH-Production holds 100', s3.stock['WH-Production'] === 100);

const r3 = await post('/scenario/run');
ok('step 3 = deliver 20 kg', r3.body.action === 'deliver', r3.body.message);
ok('steel total now 80 kg', (await steel()).total === 80);

const r4 = await post('/scenario/run');
ok('step 4 = post -3 kg variance', r4.body.action === 'adjust', r4.body.message);
const s4 = await steel();
ok('steel total now 77 kg', s4.total === 77, `total=${s4.total}`);
ok('drill reports itself complete', (await call('/scenario')).body.complete === true);

console.log('\n== 6. Ledger is append-only and attributed ==');
const ledger = (await call('/ledger?sku=STL-ROD-12')).body;
ok(
  'newest-first deltas are -3, -20, 0, +100',
  JSON.stringify(ledger.filter((l) => !['OPENING', 'REVERSAL'].includes(l.type)).map((l) => l.delta).slice(0, 4)) ===
    JSON.stringify([-3, -20, 0, 100]),
  JSON.stringify(ledger.map((l) => l.delta)),
);
ok('transfer row carries delta 0', ledger.filter((l) => l.type === 'TRANSFER').every((l) => l.delta === 0));
ok('every row is attributed to a user', ledger.every((l) => l.user && l.user.length > 0));
ok('balanceAfter never goes negative', ledger.every((l) => l.balanceAfter >= 0));
ok('no row carries a raw scrypt hash', !/scrypt|"salt"/.test(JSON.stringify(ledger)));

console.log('\n== 6b. Location hierarchy rolls up correctly ==');
const prod = (await call('/products/STL-ROD-12')).body;
const prd = prod.byLocation.find((l) => l.code === 'WH-Production');
const stockRollup = prod.byLocation.find((l) => l.code === 'WH/Stock');
ok('WH-Production rolled up to 77 (80 delivered, -3 scrapped)', prd?.qty === 77, `qty=${prd?.qty}`);
ok('container WH/Stock rolled up to 0', stockRollup?.qty === 0, `qty=${stockRollup?.qty}`);
ok(
  'leaf Heavy-Rack-01 drained to 0',
  prod.byLocation.find((l) => l.code === 'WH/Stock/Heavy-Rack-01')?.qty === 0,
);
ok('steel product carries no zero-valued buckets', Object.values((await steel()).stock).every((v) => v > 0));

console.log('\n== 7. The drill is repeatable ==');
await post('/scenario/start-drill');
ok('second rewind returns to 0', (await steel()).total === 0, `total=${(await steel()).total}`);
for (let i = 0; i < 4; i++) await post('/scenario/run');
ok('re-running the drill lands on 77 again', (await steel()).total === 77, `total=${(await steel()).total}`);

console.log('\n== 8. Over-draw is refused ==');
const huge = await call('/transfers', {
  method: 'POST',
  body: JSON.stringify({ from: 'WH-Rack-A', to: 'WH/Stock', sku: 'COP-WIR-50', qty: 9999 }),
});
ok('creating a 9999-roll transfer is rejected', huge.status === 422, `status=${huge.status} ${huge.body.error ?? ''}`);

console.log('\n== 9. Negative-stock toggle relaxes the block ==');
await post('/reset');
await post('/scenario/start-drill');
await call('/settings', { method: 'PATCH', body: JSON.stringify({ preventNegativeStock: false }) });
const relaxed = await post('/delivery/validate?ref=WH/OUT/0001');
ok('validation now proceeds (clamped, not failed)', relaxed.status === 200, `status=${relaxed.status} ${relaxed.body.error ?? ''}`);
const clamped = await steel();
ok('balance clamped at 0, never negative', clamped.total === 0, `total=${clamped.total}`);

console.log('\n== 10. Reset restores the canonical system ==');
await call('/settings', { method: 'PATCH', body: JSON.stringify({ preventNegativeStock: true }) });
// Reset twice in a row: the second one proves the seed itself was not mutated by
// the drill, which is what happens if the seed arrays are shared by reference.
await post('/reset');
await post('/scenario/start-drill');
for (let i = 0; i < 4; i++) await post('/scenario/run');
await post('/reset');
const restored = (await call('/snapshot')).body;
ok('reset brings back all 10 SKUs', restored.products.length === 10);
ok('reset restores the 77 kg steel balance', qtyOf(restored.products.find((p) => p.sku === 'STL-ROD-12')) === 77);
ok('reset restores the Rs 9,96,950 valuation', restored.products.reduce((a, p) => a + qtyOf(p) * p.unitCost, 0) === 996950);
ok('reset is idempotent (no reversal rows linger)', !restored.ledger.some((l) => l.type === 'REVERSAL'));
ok(
  'the seed was not mutated by the drill',
  restored.adjustments.find((a) => a.ref === 'ADJ-4001')?.state === 'Posted' &&
    restored.receipts.find((r) => r.ref === 'RC-1001')?.status === 'Done' &&
    restored.transfers.find((t) => t.ref === 'TR-2001')?.status === 'Done' &&
    restored.deliveries.find((d) => d.ref === 'WH/OUT/0001')?.status === 'Done',
  'documents returned to their seeded statuses',
);
const tw = await post('/reset');
ok('a second reset is a no-op', tw.status === 200 && qtyOf((await call('/snapshot')).body.products.find((p) => p.sku === 'STL-ROD-12')) === 77);

console.log('\n== 11. 404s are clean ==');
ok('unknown delivery -> 404', (await call('/delivery?ref=WH/OUT/9999')).status === 404);
ok('unknown SKU -> 404', (await call('/products/NOPE')).status === 404);
ok('unknown endpoint -> 404', (await call('/nope')).status === 404);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
