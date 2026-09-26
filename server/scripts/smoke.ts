/**
 * End-to-end smoke test for the whole StockSense workflow.
 * Run with: npm run smoke   (requires the API on :4000)
 *
 * It drives the real HTTP API with a real session and asserts the numbers a
 * user would see — the demo spine is 0 → 100 → 80 → 77 kg of Steel Rods.
 */
const BASE = process.env.API ?? 'http://localhost:4000';
let failures = 0;
let token = '';

function check(label, ok, extra = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

const product = async (sku) => (await call('GET', `/products/${encodeURIComponent(sku)}`)).body;
const snapshot = async () => (await call('GET', '/snapshot')).body;
const steelAt = async (code) => {
  const p = await product('STL-ROD-12');
  return p.locations.find((l) => l.code === code)?.qty ?? 0;
};

console.log(`StockSense smoke test against ${BASE}\n`);

/* ------------------------------------------------------------------ auth */
{
  const bad = await call('POST', '/auth/login', { email: 'demo@stocksense.app', password: 'wrong' });
  check('wrong password is rejected', bad.status === 401, bad.body.error);

  const login = await call('POST', '/auth/login', { email: 'demo@stocksense.app', password: 'Demo@1234' });
  check('inventory manager signs in', login.status === 200 && !!login.body.token);
  token = login.body.token ?? '';

  const missing = await call('GET', '/profile');
  check('session restores a profile', missing.status === 200 && missing.body.user?.name === 'Rahul Sharma');

  const viewer = await call('POST', '/auth/login', { email: 'viewer@stocksense.app', password: 'Demo@1234' });
  const managerToken = token;
  token = viewer.body.token ?? '';
  const blocked = await call('POST', '/receipts', { supplier: 'X', destination: 'WH-CEN', scheduledDate: '2026-09-30', lines: [] });
  check('viewer cannot create a receipt', blocked.status === 403, blocked.body.error);
  const snapAsViewer = await snapshot();
  check('viewer still sees the dashboard', typeof snapAsViewer.dashboard?.totalStock === 'number');
  token = managerToken;
}

/* ----------------------------------------------------------------- reset */
{
  const reset = await call('POST', '/reset');
  check('demo data resets', reset.status === 200);
  const p = await product('STL-ROD-12');
  check('steel rods start at 0 kg', p.onHand === 0, `onHand=${p.onHand}`);
  check('steel rods is out of stock', p.health === 'OUT');
  check('steel rods has an explicit unit', p.uom === 'kg');
}

/* --------------------------------------------------------------- receipt */
{
  const before = await snapshot();
  const draft = await call('POST', '/receipts', {
    supplier: 'Apex Metallurgical Ltd',
    poRef: 'PO-SMOKE-1',
    destination: 'WH-CEN/Receiving',
    scheduledDate: '2026-09-27',
    dockBay: 'Dock 02',
    lines: [{ sku: 'STL-ROD-12', expected: 100 }],
  });
  check('receipt is created as a draft', draft.status === 201 && draft.body.status === 'Draft', draft.body.ref);
  const ref = draft.body.ref;
  const afterDraft = await product('STL-ROD-12');
  check('drafting a receipt does not move stock', afterDraft.onHand === 0, `onHand=${afterDraft.onHand}`);

  const missingQty = await call('POST', `/receipts/${ref}/status`, { to: 'Ready' });
  check('a draft cannot jump to Ready', missingQty.status >= 400, missingQty.body.error);

  await call('POST', `/receipts/${ref}/status`, { to: 'Waiting' });
  const ready = await call('POST', `/receipts/${ref}/status`, { to: 'Ready' });
  check('receipt reaches Ready', ready.status === 200 && ready.body.status === 'Ready');

  const zero = await call('POST', `/receipts/${ref}/status`, { to: 'Done' });
  check('validation is refused with no received quantity', zero.status >= 400, zero.body.error);

  const patched = await call('PATCH', `/receipts/${ref}`, { lines: [{ id: (await call('GET', `/receipts/${ref}`)).body.lines[0].id, received: 100 }] });
  check('received quantity is recorded', patched.status === 200 && patched.body.lines[0].received === 100);

  const validated = await call('POST', `/receipts/${ref}/status`, { to: 'Done' });
  check('receipt validates', validated.status === 200 && validated.body.status === 'Done');

  const afterReceive = await product('STL-ROD-12');
  check('receipt adds 100 kg', afterReceive.onHand === 100, `onHand=${afterReceive.onHand}`);
  const receiving = await steelAt('WH-CEN/Receiving');
  check('100 kg lands in the receiving bin', receiving === 100, `receiving=${receiving}`);

  const snapAfterReceive = await snapshot();
  check(
    'dashboard total stock moved by +100',
    snapAfterReceive.dashboard.totalStock === before.dashboard.totalStock + 100,
    `${before.dashboard.totalStock} -> ${snapAfterReceive.dashboard.totalStock}`,
  );
  check(
    'dashboard inventory value moved with it',
    Math.abs(snapAfterReceive.dashboard.inventoryValue - (before.dashboard.inventoryValue + 100 * 95)) < 1,
  );

  const again = await call('POST', `/receipts/${ref}/status`, { to: 'Done' });
  check('a validated receipt cannot be validated twice', again.status >= 400, again.body.error);
}

/* -------------------------------------------------------------- transfer */
{
  const nested = await call('POST', '/transfers', {
    from: 'WH-CEN',
    to: 'WH-CEN/Receiving',
    lines: [{ sku: 'STL-ROD-12', qty: 10 }],
  });
  check('a transfer into its own subtree is refused', nested.status >= 400, nested.body.error);

  const over = await call('POST', '/transfers', {
    from: 'WH-CEN',
    to: 'WH-PRD/Production-Rack',
    lines: [{ sku: 'STL-ROD-12', qty: 500 }],
  });
  check('over-drawing the source is refused', over.status >= 400, over.body.error);

  const doc = await call('POST', '/transfers', {
    from: 'WH-CEN',
    to: 'WH-PRD/Production-Rack',
    reason: 'Line-side replenishment.',
    lines: [{ sku: 'STL-ROD-12', qty: 100 }],
  });
  check('transfer is created as a draft', doc.status === 201 && doc.body.status === 'Draft', doc.body.ref);
  const ref = doc.body.ref;

  await call('POST', `/transfers/${ref}/status`, { to: 'Waiting' });
  await call('POST', `/transfers/${ref}/status`, { to: 'Ready' });
  const done = await call('POST', `/transfers/${ref}/status`, { to: 'Done' });
  check('transfer completes', done.status === 200 && done.body.status === 'Done');

  const p = await product('STL-ROD-12');
  check('company total is unchanged by a transfer', p.onHand === 100, `total=${p.onHand}`);
  check('source warehouse is emptied', (await steelAt('WH-CEN')) === 0);
  check('destination rack holds 100 kg', (await steelAt('WH-PRD/Production-Rack')) === 100);

  const moves = (await call('GET', '/moves')).body.filter((l) => l.sku === 'STL-ROD-12' && l.ref === ref);
  check('transfer writes a net-zero ledger row', moves.length === 1 && moves[0].delta === 0);
  check('ledger row shows both legs', moves[0].legs.length === 2, JSON.stringify(moves[0].legs));
}

/* -------------------------------------------------------------- delivery */
{
  const doc = await call('POST', '/deliveries', {
    customer: 'Laxmi Industrial Works',
    from: 'WH-PRD/Production-Rack',
    scheduledDate: '2026-09-26',
    carrier: 'BlueDart Express',
    lines: [{ sku: 'STL-ROD-12', qty: 20 }],
  });
  check('delivery is created as a draft', doc.status === 201, doc.body.ref);
  const ref = doc.body.ref;

  const early = await call('POST', `/deliveries/${ref}/status`, { to: 'Done' });
  check('a draft delivery cannot be completed', early.status >= 400, early.body.error);

  await call('POST', `/deliveries/${ref}/status`, { to: 'Waiting' });
  await call('POST', `/deliveries/${ref}/status`, { to: 'Ready' });

  const view = await call('GET', `/deliveries/${ref}`);
  check('ready delivery reserves the stock', view.body.lines[0].availableTotal === 100);
  const lineId = view.body.lines[0].id;

  const pick = await call('POST', `/deliveries/${ref}/pick`, { lineId, picked: 20 });
  check('picking records the quantity', pick.status === 200 && pick.body.lines[0].picked === 20);
  check('picking moves the document to Picking', pick.body.status === 'Picking');

  const reservedProduct = await product('STL-ROD-12');
  check('reserved stock reduces available stock', reservedProduct.reserved === 20 && reservedProduct.available === 80, `reserved=${reservedProduct.reserved} available=${reservedProduct.available}`);

  const pack = await call('POST', `/deliveries/${ref}/status`, { to: 'Packed' });
  check('delivery can be packed once every line is picked', pack.status === 200 && pack.body.status === 'Packed');

  const done = await call('POST', `/deliveries/${ref}/status`, { to: 'Done' });
  check('delivery completes', done.status === 200 && done.body.status === 'Done');

  const p = await product('STL-ROD-12');
  check('delivery removes 20 kg', p.onHand === 80, `total=${p.onHand}`);
  check('reservation is released on completion', p.reserved === 0, `reserved=${p.reserved}`);
  check('the production rack holds 80 kg', (await steelAt('WH-PRD/Production-Rack')) === 80);
}

/* ------------------------------------------------ blocked delivery guard */
{
  const doc = await call('POST', '/deliveries', {
    customer: 'Laxmi Industrial Works',
    from: 'WH-PRD/Production-Rack',
    scheduledDate: '2026-09-26',
    lines: [{ sku: 'MOU-WLS-01', qty: 9999 }],
  });
  await call('POST', `/deliveries/${doc.body.ref}/status`, { to: 'Waiting' });
  await call('POST', `/deliveries/${doc.body.ref}/status`, { to: 'Ready' });
  const view = await call('GET', `/deliveries/${doc.body.ref}`);
  check('an unfulfillable order is reported as blocked', view.body.check.blocked === true, view.body.check.blockers.join('; '));
  const attempt = await call('POST', `/deliveries/${doc.body.ref}/status`, { to: 'Done' });
  check('completing a blocked order is refused', attempt.status >= 400);
  check('the refusal explains what is short', (attempt.body.blockers ?? []).length > 0, (attempt.body.blockers ?? []).join('; '));
  const p = await product('MOU-WLS-01');
  check('a refused delivery leaves stock untouched', p.onHand === 48, `onHand=${p.onHand}`);
}

/* ------------------------------------------------------------ adjustment */
{
  const count = await call('POST', '/counts', {
    warehouse: 'WH-PRD',
    location: 'WH-PRD/Production-Rack',
    assignedTo: 'Priya Patel',
    dueDate: '2026-09-30',
  });
  check('count sheet is created', count.status === 201, count.body.ref);
  const countRef = count.body.ref;
  const line = count.body.lines.find((l) => l.sku === 'STL-ROD-12');
  check('count line snapshots the book quantity', line.systemQty === 80, `systemQty=${line.systemQty}`);

  await call('POST', `/counts/${countRef}/line`, { lineId: line.id, counted: 77, note: 'Weighed on the platform scale.' });
  const raise = await call('POST', `/counts/${countRef}/status`, { to: 'Completed' });
  check('count completes', raise.status === 200 && raise.body.status === 'Completed');

  const raised = await call('POST', `/counts/${countRef}/raise-adjustments`);
  check('variance raises an adjustment', raised.status === 200 && raised.body.length === 1, JSON.stringify(raised.body.map((a) => a.ref)));
  const adj = raised.body[0];
  check('difference is computed server-side', adj.difference === -3, `recorded=${adj.recorded} counted=${adj.counted} diff=${adj.difference}`);

  const beforePost = await product('STL-ROD-12');
  check('a draft adjustment does not move stock', beforePost.onHand === 80, `onHand=${beforePost.onHand}`);

  await call('POST', `/adjustments/${adj.ref}/status`, { to: 'Pending Approval' });
  const mid = await product('STL-ROD-12');
  check('pending approval does not move stock', mid.onHand === 80, `onHand=${mid.onHand}`);

  const approved = await call('POST', `/adjustments/${adj.ref}/status`, { to: 'Approved' });
  check('adjustment is approved', approved.body.status === 'Approved');
  const stillMid = await product('STL-ROD-12');
  check('approval alone does not move stock', stillMid.onHand === 80, `onHand=${stillMid.onHand}`);

  const posted = await call('POST', `/adjustments/${adj.ref}/status`, { to: 'Posted' });
  check('posting writes the variance to stock', posted.body.status === 'Posted');

  const final = await product('STL-ROD-12');
  check('final total is 77 kg', final.onHand === 77, `total=${final.onHand}`);
  check('the production rack holds 77 kg', (await steelAt('WH-PRD/Production-Rack')) === 77);
  check('central warehouse holds 0 kg', (await steelAt('WH-CEN')) === 0);
}

/* ---------------------------------------------------------------- ledger */
{
  const moves = (await call('GET', '/moves')).body.filter((l) => l.sku === 'STL-ROD-12');
  const deltas = moves.slice().reverse().map((m) => m.delta);
  check('the demo spine is +100, 0, -20, -3', JSON.stringify(deltas) === '[100,0,-20,-3]', JSON.stringify(deltas));
  check('the last row shows 77 kg', moves[0].balanceAfter === 77, `balance=${moves[0].balanceAfter}`);
  check('every row has a unit-bearing product name', moves.every((m) => !!m.name && m.name.length > 0));
  check('every row has a user', moves.every((m) => !!m.user));
  const entry = await call('GET', `/moves/${moves[0].id}`);
  check('movement detail opens', entry.status === 200 && entry.body.entry.id === moves[0].id);
}

/* -------------------------------------------------- search & notifications */
{
  const s = await call('GET', '/search?q=rod');
  check('search finds products by name', s.body.groups.some((g) => g.title.includes('Steel Rods')));
  const byRef = await call('GET', '/search?q=RC-1001');
  check('search finds documents by reference', byRef.body.groups.length > 0, JSON.stringify(byRef.body.groups.map((g) => g.title)));
  const byBarcode = await call('GET', '/search?q=8806092991184');
  check('search finds products by barcode', byBarcode.body.groups.length > 0);

  const n = await call('GET', '/notifications');
  check('notifications are derived from live state', Array.isArray(n.body.items) && n.body.items.length > 0, `${n.body.items.length} notifications`);
  check('every notification links somewhere', n.body.items.every((x) => x.link.startsWith('/')));
  await call('POST', `/notifications/${n.body.items[0].id}/read`);
  const after = await call('GET', '/notifications');
  check('a notification can be marked read', after.body.read.length === 1);
}

/* --------------------------------------------------------------- reports */
{
  for (const id of [
    'inventory-summary',
    'stock-movement',
    'stock-valuation',
    'low-stock',
    'warehouse-performance',
    'receipt-performance',
    'delivery-performance',
    'transfer-performance',
    'adjustment-variance',
    'inventory-accuracy',
  ]) {
    const r = await call('GET', `/reports/${id}`);
    check(`report ${id} runs`, r.status === 200 && Array.isArray(r.body.rows) && r.body.columns.length > 0, `${r.body.rows?.length} rows`);
    check(
      `report ${id} has no empty cells`,
      r.body.rows.every((row) => r.body.columns.every((col) => row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== '')),
    );
  }
}

/* ------------------------------------------------ warehouses, locations */
{
  const w = await call('GET', '/warehouses');
  check('four warehouses are live', w.body.length === 4, w.body.map((x) => x.name).join(', '));
  check('every warehouse reports utilisation', w.body.every((x) => typeof x.utilisation === 'number'));
  const detail = await call('GET', '/warehouses/WH-CEN');
  const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
  const tree = flatten(detail.body.locations);
  const named = tree.map((n) => n.name);
  const expectedNames = ['Receiving', 'Main Storage', 'Heavy Rack A', 'Rack B', 'Bay 04'];
  check(
    'warehouse detail lists the five named locations',
    expectedNames.every((n) => named.includes(n)),
    named.join(', '),
  );
  check('of which four are storage bins', tree.filter((n) => !n.container).length === 4, tree.filter((n) => !n.container).map((n) => n.name).join(', '));
  check('warehouse detail carries a tree', detail.body.locations.some((z) => (z.children ?? []).length > 0));
  check('a container never holds its own balance', tree.every((n) => (n.container ? n.ownBalance === 0 : true)));
  const mainStorage = await call('GET', `/locations/${encodeURIComponent('WH-CEN/Main-Storage')}`);
  const mainStorageChildren = [];
  for (const n of ['Heavy-Rack-A', 'Rack-B', 'Bay-04']) {
    mainStorageChildren.push(
      (await call('GET', `/locations/${encodeURIComponent(`WH-CEN/Main-Storage/${n}`)}`)).body,
    );
  }
  const childSum = mainStorageChildren.reduce((a, c) => a + c.totalUnits, 0);
  check('container rolls up its bins', mainStorage.body.totalUnits === childSum, `${mainStorage.body.totalUnits} vs ${childSum}`);
  check('container capacity is reported', mainStorage.body.capacity > 0, `capacity=${mainStorage.body.capacity}`);
  const leaf = mainStorageChildren[1];
  check('a bin has no children of its own', (await call('GET', `/locations/${encodeURIComponent(leaf.code)}`)).body.childCount === 0);
  const unknown = await call('GET', '/locations/NOPE');
  check('an unknown location is a clean 404', unknown.status === 404, unknown.body.error);
}

/* ------------------------------------------------------------ diagnostics */
{
  const denied = await call('GET', '/diagnostics');
  check('a manager cannot read diagnostics', denied.status === 403, denied.body.error);
  const admin = await call('POST', '/auth/login', { email: 'admin@stocksense.app', password: 'Admin@1234' });
  const managerToken = token;
  token = admin.body.token;
  const diag = await call('GET', '/diagnostics');
  check('an admin can read diagnostics', diag.status === 200 && diag.body.runtime.schemaVersion > 0);
  check('diagnostics reports demo mode', diag.body.runtime.demoMode === true);
  check(
    'repository url comes from configuration only',
    diag.body.environment.repositoryConfigured === Boolean(process.env.VITE_GITHUB_REPOSITORY_URL),
  );
  token = managerToken;
}

/* ------------------------------------------------------------- dashboard */
{
  const s = await snapshot();
  const d = s.dashboard;
  check('dashboard exposes every headline KPI', ['totalStock', 'inventoryValue', 'lowStockCount', 'outOfStockCount', 'pendingReceipts', 'pendingDeliveries', 'openTransfers', 'accuracy'].every((k) => d[k] !== undefined));
  check('dashboard has a needs-attention list', d.attention.length > 0, `${d.attention.length} items`);
  check('dashboard has an operations timeline', d.timeline.length > 0, `${d.timeline.length} events`);
  check('every attention item links somewhere', d.attention.every((a) => a.link.startsWith('/')));
  check('steel rods is still flagged', d.attention.some((a) => a.title.includes('Steel Rods')));
  check('domains are published for the client', !!s.domains?.receipt?.length && !!s.domains?.units?.length);
  const total = s.products.reduce((a, p) => a + p.onHand, 0);
  check('dashboard total matches the sum of products', d.totalStock === total, `${d.totalStock} vs ${total}`);
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
