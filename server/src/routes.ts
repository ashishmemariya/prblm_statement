import { Router } from 'express';
import { getDb, commit, resetDb, nowStamp } from './store.js';
import {
  HttpError,
  checkDelivery,
  dashboardSummary,
  findProduct,
  freeToUse,
  postAdjustment,
  postDelivery,
  postReceipt,
  postTransfer,
  productStatus,
  requiresDualSignoff,
  stockAt,
  totalStock,
} from './engine.js';
import {
  ADJUSTMENT_FLOW,
  DELIVERY_FLOW,
  RECEIPT_FLOW,
  TRANSFER_FLOW,
  adjustmentView,
  deliveryView,
  receiptView,
  transferView,
} from './status.js';
import { runScenarioStep, scenarioState, startDrill } from './scenario.js';
import {
  SESSION_TTL_MS,
  activeSessionCount,
  attachUser,
  currentUser,
  destroySession,
  login,
  permissionsFor,
  requireAuth,
  requirePermission,
} from './auth.js';
import type { Product, User } from './types.js';

export const api = Router();

// Resolve `req.user` when a token is present. Read endpoints stay open so the
// sign-in screen and demo directory can load; mutations below require a session.
api.use(attachUser);

/* ---------------------------- meta ---------------------------- */

api.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

api.get('/snapshot', (req, res) => {
  const { credentials, ...safe } = getDb();
  const now = Date.now();
  res.json({
    ...safe,
    products: safe.products.map(productView),
    // documents carry the derived attention flag + step position
    receipts: safe.receipts.map((r) => receiptView(r, now)),
    deliveries: safe.deliveries.map((d) => deliveryView(d, now)),
    transfers: safe.transfers.map((t) => transferView(t, now)),
    adjustments: safe.adjustments.map((a) => adjustmentView(a, now)),
    dashboard: dashboardSummary(),
    scenario: scenarioState(),
    me: req.user ? { user: req.user, permissions: permissionsFor(req.user.role) } : null,
  });
});

/* ---------------------------- auth ---------------------------- */

api.post('/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    throw new HttpError(400, 'Enter both your email address and password.');
  }
  const result = login(email, password);
  res.json({ ...result, expiresInMs: SESSION_TTL_MS });
});

api.post('/auth/logout', (req, res) => {
  const token = req.get('authorization')?.slice(7).trim();
  if (token) destroySession(token);
  res.json({ ok: true });
});

api.get('/auth/session', requireAuth, (req, res) => {
  const user = currentUser(req);
  res.json({ user, permissions: permissionsFor(user.role) });
});

/** Demo helper: the directory shown on the sign-in screen. Passwords are never returned. */
api.get('/auth/directory', (_req, res) => {
  res.json(
    getDb()
      .users.filter((u) => u.active)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: u.title,
        initials: u.initials,
      })),
  );
});

api.post('/reset', requirePermission('demo.reset'), (_req, res) => {
  // Seeded user IDs are stable, so existing sessions stay valid across a reset.
  resetDb();
  res.json({ ok: true, message: 'Seed data restored' });
});

/* ---------------------------- users / settings ---------------------------- */

api.get('/users', (_req, res) => res.json(getDb().users));

api.get('/settings', (_req, res) => res.json(getDb().settings));

/**
 * Admin-only operational view. This is the ONLY place backend guardrails are
 * described in technical terms; the rest of the UI speaks business language.
 */
api.get('/diagnostics', requirePermission('diagnostics.view'), (_req, res) => {
  const db = getDb();
  res.json({
    runtime: {
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      storage: 'Single-file JSON document store',
      seedVersion: db.version,
    },
    counts: {
      products: db.products.length,
      locations: db.locations.length,
      warehouses: db.warehouses.length,
      receipts: db.receipts.length,
      deliveries: db.deliveries.length,
      transfers: db.transfers.length,
      adjustments: db.adjustments.length,
      ledgerEntries: db.ledger.length,
      activeSessions: activeSessionCount(),
    },
    guardrails: [
      { id: 'zero-floor', label: 'Negative stock prevention', active: db.settings.preventNegativeStock },
      { id: 'dual-signoff', label: 'Dual approval on count variance', active: db.settings.dualSignoffVariancePct > 0, thresholdPct: db.settings.dualSignoffVariancePct },
      { id: 'transfer-zero', label: 'Transfers are net-zero across the network', active: true },
      { id: 'append-only', label: 'Stock ledger is append-only', active: true },
      { id: 'hierarchy', label: 'Container locations roll up to their parent', active: true },
    ],
  });
});

api.patch('/settings', requirePermission('settings.manage'), (req, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  commit();
  res.json(db.settings);
});

/* ---------------------------- catalog ---------------------------- */

/** Roll a product's raw leaf balances up into every location node. */
function productView(p: Product) {
  const db = getDb();
  return {
    ...p,
    total: totalStock(p),
    free: freeToUse(p),
    status: productStatus(p),
    byLocation: db.locations
      .map((l) => ({ code: l.code, name: l.name, qty: stockAt(p, l.code), container: l.container }))
      .sort((a, b) => b.qty - a.qty),
  };
}

api.get('/products', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase();
  const category = String(req.query.category ?? 'All');
  const status = String(req.query.status ?? 'All');
  let list = getDb().products.map(productView);
  if (q) {
    list = list.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }
  if (category !== 'All') list = list.filter((p) => p.category === category);
  if (status !== 'All') list = list.filter((p) => p.status === status);
  res.json(list);
});

api.get('/products/:sku', (req, res) => {
  const p = findProduct(req.params.sku);
  if (!p) throw new HttpError(404, `SKU ${req.params.sku} not found`);
  const db = getDb();
  res.json({
    ...productView(p),
    moves: db.ledger.filter((l) => l.sku === p.sku).slice(0, 60),
    openOrders: [
      ...db.deliveries
        .filter((d) => d.status !== 'Done' && d.items.some((i) => i.sku === p.sku))
        .map((d) => ({ ref: d.ref, kind: 'Delivery' as const, qty: d.items.find((i) => i.sku === p.sku)?.qty ?? 0, to: d.to, status: d.status })),
      ...db.receipts
        .filter((r) => r.status !== 'Done' && r.items.some((i) => i.sku === p.sku))
        .map((r) => ({ ref: r.ref, kind: 'Receipt' as const, qty: r.items.find((i) => i.sku === p.sku)?.expected ?? 0, to: r.supplier, status: r.status })),
    ],
  });
});

api.get('/categories', (_req, res) => {
  const set = [...new Set(getDb().products.map((p) => p.category))].sort();
  res.json(['All', ...set]);
});

/* ---------------------------- receipts ---------------------------- */

api.get('/receipts', (req, res) => {
  const status = String(req.query.status ?? 'All');
  let list = getDb().receipts;
  if (status !== 'All') list = list.filter((r) => r.status === status);
  const now = Date.now();
  // `?attention=Overdue` filters on the derived flag rather than a stored status.
  if (String(req.query.attention ?? '') === 'Overdue') {
    list = list.filter((r) => receiptView(r, now).attention?.kind === 'Overdue');
  }
  res.json(list.map((r) => receiptView(r, now)));
});

// `ref` travels as a query param because refs contain slashes (RC-1001).
api.get('/receipt', (req, res) => {
  const ref = String(req.query.ref ?? '');
  const doc = getDb().receipts.find((r) => r.ref === ref);
  if (!doc) throw new HttpError(404, `Receipt ${ref} not found`);
  res.json({
    ...receiptView(doc),
    flow: RECEIPT_FLOW,
    ...doc,
    lines: doc.items.map((l) => {
      const p = findProduct(l.sku);
      return {
        ...l,
        name: p?.name ?? l.sku,
        unit: p?.unit ?? 'Units',
        unitCost: p?.unitCost ?? 0,
        lineValue: l.received * (p?.unitCost ?? 0),
        variance: l.received - l.expected,
      };
    }),
    totalValue: doc.items.reduce((a, l) => a + l.received * (findProduct(l.sku)?.unitCost ?? 0), 0),
  });
});

api.post('/receipt/validate', requirePermission('receipt.post'), (req, res) => {
  const ref = String(req.query.ref ?? req.body?.ref ?? '');
  const { doc, entries } = postReceipt(ref, currentUser(req).name);
  res.json({ ok: true, receipt: doc, ledger: entries });
});

/* ---------------------------- deliveries ---------------------------- */

api.get('/deliveries', (req, res) => {
  const status = String(req.query.status ?? 'All');
  let list = getDb().deliveries;
  if (status !== 'All') list = list.filter((d) => d.status === status);
  const now = Date.now();
  if (String(req.query.attention ?? '') === 'Overdue') {
    list = list.filter((d) => deliveryView(d, now).attention?.kind === 'Overdue');
  }
  res.json(list.map((d) => deliveryView(d, now)));
});

api.get('/delivery', (req, res) => {
  const ref = String(req.query.ref ?? '');
  const doc = getDb().deliveries.find((d) => d.ref === ref);
  if (!doc) throw new HttpError(404, `Delivery ${ref} not found`);
  const check = checkDelivery(doc.ref);
  res.json({
    ...deliveryView(doc),
    flow: DELIVERY_FLOW,
    check,
    lines: doc.items.map((l) => {
      const p = findProduct(l.sku);
      const line = check?.lines.find((c) => c.sku === l.sku);
      return {
        ...l,
        name: p?.name ?? l.sku,
        unit: p?.unit ?? 'Units',
        unitCost: p?.unitCost ?? 0,
        availableAtSource: line?.availableAtSource ?? 0,
        availableTotal: line?.availableTotal ?? 0,
        pullFrom: line?.pullFrom ?? doc.from,
        reason: line?.reason ?? '',
        sufficient: line?.sufficient ?? false,
        shortfall: line?.shortfall ?? 0,
        value: l.qty * (p?.unitCost ?? 0),
      };
    }),
    totalValue: doc.items.reduce((a, l) => a + l.qty * (findProduct(l.sku)?.unitCost ?? 0), 0),
  });
});

api.post('/delivery/validate', requirePermission('delivery.post'), (req, res) => {
  const ref = String(req.query.ref ?? req.body?.ref ?? '');
  const { doc, entries } = postDelivery(ref, currentUser(req).name);
  res.json({ ok: true, delivery: doc, ledger: entries });
});

/* ---------------------------- transfers ---------------------------- */

api.get('/transfers', (req, res) => {
  const now = Date.now();
  let list = getDb().transfers;
  const status = String(req.query.status ?? 'All');
  if (status !== 'All') list = list.filter((t) => t.status === status);
  if (String(req.query.attention ?? '') === 'Overdue') {
    list = list.filter((t) => transferView(t, now).attention?.kind === 'Overdue');
  }
  res.json(list.map((t) => transferView(t, now)));
});

api.post('/transfers', requirePermission('transfer.create'), (req, res) => {
  const { from, to, sku, qty } = req.body ?? {};
  const db = getDb();
  const p = findProduct(String(sku));
  if (!p) throw new HttpError(404, `SKU ${sku} not found`);
  const amount = Number(qty);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Quantity must be > 0');
  if (db.settings.preventNegativeStock && stockAt(p, from) < amount) {
    throw new HttpError(422, `Only ${stockAt(p, from)} ${p.unit} available at ${from}`);
  }
  const max = db.transfers.reduce((m, t) => Math.max(m, Number(t.ref.split('-')[1] ?? 0)), 2000);
  const doc = {
    ref: `TR-${max + 1}`,
    from,
    to,
    sku: p.sku,
    qty: amount,
    requestedBy: currentUser(req).name,
    status: 'Draft' as const,
    scheduledDate: nowStamp(),
    createdAt: nowStamp(),
  };
  db.transfers.push(doc);
  commit();
  res.json(doc);
});

api.post('/transfer/execute', requirePermission('transfer.post'), (req, res) => {
  const { doc, entry } = postTransfer(String(req.query.ref ?? ''), currentUser(req).name);
  res.json({ ok: true, transfer: doc, ledger: entry });
});

/* ---------------------------- physical counts ---------------------------- */

api.get('/adjustments', (req, res) => {
  const now = Date.now();
  let list = getDb().adjustments;
  const state = String(req.query.status ?? 'All');
  if (state !== 'All') list = list.filter((a) => a.state === state);
  res.json(
    list.map((a) => ({ ...adjustmentView(a, now), dualSignoff: requiresDualSignoff(a) })),
  );
});

api.post('/adjustments', requirePermission('adjustment.create'), (req, res) => {
  const { sku, location, recorded, counted, reason, memo } = req.body ?? {};
  const db = getDb();
  const p = findProduct(String(sku));
  if (!p) throw new HttpError(404, `SKU ${sku} not found`);
  const max = db.adjustments.reduce((m, a) => Math.max(m, Number(a.ref.split('-')[1] ?? 0)), 4000);
  const doc = {
    ref: `ADJ-${max + 1}`,
    sku: p.sku,
    location,
    recorded: Number(recorded),
    counted: Number(counted),
    delta: Number(counted) - Number(recorded),
    reason: reason ?? 'Other',
    memo: memo ?? '',
    auditor: currentUser(req).name,
    state: 'Pending Approval' as const,
    valuationImpact: (Number(counted) - Number(recorded)) * p.unitCost,
    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
  db.adjustments.push(doc);
  commit();
  res.json(doc);
});

api.post('/adjustment/post', requirePermission('adjustment.approve'), (req, res) => {
  const { doc, entry } = postAdjustment({
    ref: String(req.query.ref ?? ''),
    counted: Number(req.body?.counted ?? 0),
    reason: req.body?.reason,
    memo: req.body?.memo ?? '',
    user: currentUser(req).name,
  });
  res.json({ ok: true, adjustment: doc, ledger: entry });
});

/* ---------------------------- ledger ---------------------------- */

api.get('/ledger', (req, res) => {
  const type = String(req.query.type ?? 'All');
  const sku = String(req.query.sku ?? '');
  let list = getDb().ledger;
  if (type !== 'All') list = list.filter((l) => l.type === type);
  if (sku) list = list.filter((l) => l.sku.toLowerCase().includes(sku.toLowerCase()));
  res.json(list);
});

/* ---------------------------- warehouse ---------------------------- */

api.get('/warehouses', (_req, res) => res.json(getDb().warehouses));

api.get('/locations', (_req, res) => res.json(getDb().locations));

/**
 * The canonical lifecycles, so the client renders steppers and filter chips from
 * the same definition the engine validates against.
 */
api.get('/status-flows', (_req, res) =>
  res.json({
    receipt: RECEIPT_FLOW,
    delivery: DELIVERY_FLOW,
    transfer: TRANSFER_FLOW,
    adjustment: ADJUSTMENT_FLOW,
  }),
);

/* ---------------------------- scenario ---------------------------- */

api.get('/scenario', (_req, res) => res.json(scenarioState()));

api.post('/scenario/run', requirePermission('transfer.post'), (req, res) => {
  const result = runScenarioStep(currentUser(req).name);
  res.json({ ...result, snapshot: { products: getDb().products.map((p) => ({ ...p, total: totalStock(p) })), ledger: getDb().ledger, dashboard: dashboardSummary() } });
});

/**
 * Rewinds the drill to an empty rack so the four steps can be executed by hand.
 * Writes counter-moving ledger rows rather than deleting any.
 */
api.post('/scenario/start-drill', requirePermission('demo.reset'), (req, res) => {
  res.json(startDrill(currentUser(req).name));
});

/** Restores the canonical seeded system — the live state with 77 kg on hand. */
api.post('/scenario/reset', requirePermission('demo.reset'), (_req, res) => {
  // Seeded user IDs are stable across a reseed, so open sessions stay valid here too.
  resetDb();
  res.json(scenarioState());
});

export type { User };
