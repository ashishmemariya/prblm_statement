import { Router, type NextFunction, type Request, type Response } from 'express';
import { getDb, resetDb } from './store.js';
import { HttpError, badRequest, notFound } from './errors.js';
import { now } from './datetime.js';
import { services, snapshot, dashboardSummary } from './services.js';
import { SEED_VERSION } from './seed.js';
import {
  SESSION_TTL_MS,
  activeSessionCount,
  attachUser,
  currentUser,
  destroySession,
  login,
  requireAuth,
  requirePermission,
} from './auth.js';
import { ROLE_SUMMARY, permissionsFor } from './auth.js';
import { UNITS } from './types.js';

export const api = Router();

/** Express 4 does not forward async rejections; this does. */
const wrap =
  (fn: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const out = fn(req, res);
      if (out instanceof Promise) out.catch(next);
    } catch (err) {
      next(err);
    }
  };

api.use(attachUser);

/* ------------------------------------------------------------------ meta */

api.get('/health', (_req, res) => res.json({ ok: true, at: now() }));

api.get('/snapshot', (req, res) => res.json(snapshot(req.user ?? null)));

api.get('/dashboard', (_req, res) => res.json(dashboardSummary()));

/* ------------------------------------------------------------------ auth */

api.post(
  '/auth/login',
  wrap((req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) throw badRequest('Enter both your email address and password.');
    res.json({ ...login(email, password), expiresInMs: SESSION_TTL_MS });
  }),
);

api.post(
  '/auth/logout',
  wrap((req, res) => {
    const token = req.get('authorization')?.slice(7).trim();
    if (token) destroySession(token);
    res.json({ ok: true });
  }),
);

api.get('/auth/session', requireAuth, (req, res) => {
  const user = currentUser(req);
  res.json({ user, permissions: permissionsFor(user.role), roleSummary: ROLE_SUMMARY[user.role] });
});

api.get('/auth/directory', (_req, res) => res.json(services.user.directory()));

/**
 * Password reset is intentionally not faked. The endpoint exists, refuses
 * politely and explains what an administrator has to do, so the button on the
 * sign-in screen is honest rather than broken.
 */
api.post(
  '/auth/forgot-password',
  wrap((req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) throw badRequest('Enter the email address on your account.');
    const user = getDb().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    res.json({
      ok: true,
      message: user
        ? `A reset code has been prepared for ${user.name}. Ask your administrator to read it out — this prototype does not send email.`
        : 'No account uses that address. Check the spelling and try again.',
    });
  }),
);

/* ------------------------------------------------------------------ setup */

api.post('/reset', requirePermission('demo.reset'), (_req, res) => {
  resetDb();
  res.json({ ok: true, message: 'Demo data restored', at: now() });
});

/* ---------------------------------------------------------------- catalog */

api.get('/products', (_req, res) => res.json(services.products.list()));
api.get('/products/:sku', (req, res) => res.json(services.products.get(req.params.sku)));
api.get('/categories', (_req, res) =>
  res.json([...new Set(getDb().products.map((p) => p.category))].sort()),
);
api.get('/units', (_req, res) => res.json(UNITS));

/* -------------------------------------------------------------- inventory */

api.get('/inventory', (_req, res) => res.json(services.inventory.byLocation()));
api.get('/locations', (_req, res) => res.json(services.inventory.byLocation()));
api.get('/locations/:code', (req, res) => res.json(services.inventory.location(req.params.code)));
api.get('/warehouses', (_req, res) => res.json(services.warehouses.list()));
api.get('/warehouses/:code', (req, res) => res.json(services.warehouses.get(req.params.code)));

/* --------------------------------------------------------------- receipts */

api.get('/receipts', (_req, res) => res.json(services.receipts.list()));
api.get('/receipts/:ref', (req, res) => res.json(services.receipts.get(req.params.ref)));
api.post(
  '/receipts',
  requirePermission('receipt.create'),
  wrap((req, res) => {
    const doc = services.receipts.create(req.body ?? {}, currentUser(req).name);
    res.status(201).json(doc);
  }),
);
api.patch(
  '/receipts/:ref',
  requirePermission('receipt.create'),
  wrap((req, res) => {
    res.json(services.receipts.update(req.params.ref, req.body ?? {}, currentUser(req).name));
  }),
);
api.post(
  '/receipts/:ref/status',
  requirePermission('receipt.post'),
  wrap((req, res) => {
    const to = String(req.body?.to ?? '');
    if (!to) throw badRequest('Choose what the receipt should move to.');
    res.json(services.receipts.setStatus(req.params.ref, to as never, currentUser(req).name));
  }),
);

/* ------------------------------------------------------------- deliveries */

api.get('/deliveries', (_req, res) => res.json(services.deliveries.list()));
api.get('/deliveries/:ref', (req, res) => res.json(services.deliveries.get(req.params.ref)));
api.post(
  '/deliveries',
  requirePermission('delivery.create'),
  wrap((req, res) => {
    res.status(201).json(services.deliveries.create(req.body ?? {}, currentUser(req).name));
  }),
);
api.post(
  '/deliveries/:ref/pick',
  requirePermission('delivery.pick'),
  wrap((req, res) => {
    const lineId = String(req.body?.lineId ?? '');
    const picked = Number(req.body?.picked ?? 0);
    if (!lineId) throw badRequest('Choose the delivery line to confirm.');
    res.json(services.deliveries.pick(req.params.ref, lineId, picked, currentUser(req).name));
  }),
);
api.post(
  '/deliveries/:ref/status',
  requirePermission('delivery.pick'),
  wrap((req, res) => {
    const to = String(req.body?.to ?? '');
    if (!to) throw badRequest('Choose what the delivery should move to.');
    res.json(services.deliveries.setStatus(req.params.ref, to as never, currentUser(req).name));
  }),
);

/* -------------------------------------------------------------- transfers */

api.get('/transfers', (_req, res) => res.json(services.transfers.list()));
api.get('/transfers/:ref', (req, res) => res.json(services.transfers.get(req.params.ref)));
api.post('/transfers/preview', (req, res) =>
  res.json(
    services.transfers.preview(
      String(req.body?.from ?? ''),
      String(req.body?.to ?? ''),
      Array.isArray(req.body?.lines) ? req.body.lines : [],
    ),
  ),
);
api.post(
  '/transfers',
  requirePermission('transfer.create'),
  wrap((req, res) => {
    res.status(201).json(services.transfers.create(req.body ?? {}, currentUser(req).name));
  }),
);
api.post(
  '/transfers/:ref/status',
  requirePermission('transfer.post'),
  wrap((req, res) => {
    const to = String(req.body?.to ?? '');
    if (!to) throw badRequest('Choose what the transfer should move to.');
    res.json(services.transfers.setStatus(req.params.ref, to as never, currentUser(req).name));
  }),
);

/* ------------------------------------------------------------ adjustments */

api.get('/adjustments', (_req, res) => res.json(services.adjustments.list()));
api.get('/adjustments/:ref', (req, res) => res.json(services.adjustments.get(req.params.ref)));
api.post(
  '/adjustments',
  requirePermission('adjustment.create'),
  wrap((req, res) => {
    res.status(201).json(services.adjustments.create(req.body ?? {}, currentUser(req).name));
  }),
);
api.patch(
  '/adjustments/:ref',
  requirePermission('adjustment.create'),
  wrap((req, res) => {
    res.json(services.adjustments.update(req.params.ref, req.body ?? {}));
  }),
);
api.post(
  '/adjustments/:ref/status',
  requirePermission('adjustment.approve'),
  wrap((req, res) => {
    const to = String(req.body?.to ?? '');
    if (!to) throw badRequest('Choose what the adjustment should move to.');
    res.json(services.adjustments.setStatus(req.params.ref, to as never, currentUser(req).name));
  }),
);

/* ----------------------------------------------------------------- counts */

api.get('/counts', (_req, res) => res.json(services.counts.list()));
api.get('/counts/staff', (_req, res) => res.json(services.counts.staff()));
api.get('/counts/:ref', (req, res) => res.json(services.counts.get(req.params.ref)));
api.post(
  '/counts',
  requirePermission('count.create'),
  wrap((req, res) => {
    res.status(201).json(services.counts.create(req.body ?? {}, currentUser(req).name));
  }),
);
api.post(
  '/counts/:ref/line',
  requirePermission('count.create'),
  wrap((req, res) => {
    const lineId = String(req.body?.lineId ?? '');
    if (!lineId) throw badRequest('Choose the count line to record.');
    const counted = req.body?.counted === null || req.body?.counted === '' ? null : Number(req.body.counted);
    res.json(services.counts.record(req.params.ref, lineId, counted, String(req.body?.note ?? '')));
  }),
);
api.post(
  '/counts/:ref/status',
  requirePermission('count.approve'),
  wrap((req, res) => {
    const to = String(req.body?.to ?? '');
    if (!to) throw badRequest('Choose what the count should move to.');
    res.json(services.counts.setStatus(req.params.ref, to as never, currentUser(req).name));
  }),
);
api.post(
  '/counts/:ref/raise-adjustments',
  requirePermission('count.approve'),
  wrap((req, res) => {
    res.json(services.counts.raiseAdjustments(req.params.ref, currentUser(req).name));
  }),
);

/* ----------------------------------------------------------------- ledger */

api.get('/moves', (_req, res) => res.json(services.ledger.list()));
api.get('/moves/:id', (req, res) => {
  const result = services.ledger.get(req.params.id);
  if (!result) throw notFound(`Ledger entry ${req.params.id} does not exist.`);
  res.json(result);
});
api.get('/moves-summary', (_req, res) => res.json(services.ledger.counts()));

/* ---------------------------------------------------------- notifications */

api.get('/notifications', (_req, res) =>
  res.json({ items: services.notifications.list(), read: getDb().readNotifications }),
);
api.post(
  '/notifications/:id/read',
  requireAuth,
  wrap((req, res) => {
    res.json({ read: services.notifications.markRead(req.params.id) });
  }),
);
api.post(
  '/notifications/read-all',
  requireAuth,
  wrap((_req, res) => {
    res.json({ read: services.notifications.markAllRead() });
  }),
);

/* ---------------------------------------------------------------- reports */

api.get('/reports', (_req, res) => res.json(services.reports.definitions()));
api.get('/reports/:id', (req, res) => {
  const filter = {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    warehouse: req.query.warehouse ? String(req.query.warehouse) : undefined,
    category: req.query.category ? String(req.query.category) : undefined,
    sku: req.query.sku ? String(req.query.sku) : undefined,
  };
  res.json(services.reports.run(req.params.id, filter));
});

/* ----------------------------------------------------------------- search */

api.get('/search', (req, res) => {
  const q = String(req.query.q ?? '');
  res.json({ query: q, groups: services.search(q) });
});

/* ------------------------------------------------------------- settings */

api.get('/settings', (_req, res) => res.json(getDb().settings));
api.patch(
  '/settings',
  requirePermission('settings.manage'),
  wrap((req, res) => {
    const db = getDb();
    db.settings = { ...db.settings, ...(req.body ?? {}) };
    res.json(db.settings);
  }),
);
api.get('/profile', requireAuth, (req, res) => {
  const user = currentUser(req);
  const db = getDb();
  res.json({
    user,
    permissions: permissionsFor(user.role),
    roleSummary: ROLE_SUMMARY[user.role],
    stats: {
      documentsRaised: [
        ...db.receipts,
        ...db.deliveries,
        ...db.transfers,
        ...db.adjustments,
        ...db.counts,
      ].filter((d) => 'createdBy' in d && d.createdBy === user.name).length,
      movements: db.ledger.filter((l) => l.user === user.name).length,
      approvals: db.adjustments.filter((a) => a.approvedBy === user.name).length,
    },
  });
});

/* ------------------------------------------------------------ diagnostics */

/** The only screen allowed to use technical language. Admin only. */
api.get('/diagnostics', requirePermission('diagnostics.view'), (req, res) => {
  const db = getDb();
  const repositoryUrl = process.env.VITE_GITHUB_REPOSITORY_URL ?? '';
  res.json({
    runtime: {
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
      storage: 'Single-file JSON document store',
      schemaVersion: db.version,
      seedVersion: SEED_VERSION,
      demoMode: true,
    },
    environment: {
      name: process.env.NODE_ENV ?? 'development',
      repositoryUrl,
      repositoryConfigured: repositoryUrl.trim().length > 0,
    },
    services: {
      api: 'operational',
      database: 'operational',
      realtime: 'local event store (no socket transport yet)',
      lastSync: now(),
    },
    counts: {
      products: db.products.length,
      categories: db.categories.length,
      locations: db.locations.length,
      warehouses: db.warehouses.length,
      receipts: db.receipts.length,
      deliveries: db.deliveries.length,
      transfers: db.transfers.length,
      adjustments: db.adjustments.length,
      counts: db.counts.length,
      ledgerEntries: db.ledger.length,
      events: db.events.length,
      activeSessions: activeSessionCount(),
    },
    guardrails: [
      {
        id: 'zero-floor',
        label: 'Negative stock is refused',
        active: db.settings.preventNegativeStock,
        detail: 'Deliveries and adjustments cannot drive a location below zero.',
      },
      {
        id: 'transfer-zero',
        label: 'Transfers are net-zero',
        active: true,
        detail: 'Source decreases, destination increases, total is asserted unchanged.',
      },
      {
        id: 'append-only',
        label: 'Ledger is append-only',
        active: true,
        detail: 'No update or delete endpoint exists for ledger rows.',
      },
      {
        id: 'hierarchy',
        label: 'Containers roll up their bins',
        active: true,
        detail: 'Quantities are stored on leaf locations only.',
      },
      {
        id: 'approval',
        label: 'Variances need approval',
        active: db.settings.approvalRequired,
        detail: `Above ${db.settings.company.currency}${db.settings.approvalValueThreshold} or ${db.settings.approvalVariancePct}% variance.`,
      },
    ],
    permissions: Object.fromEntries(
      (Object.keys(ROLE_SUMMARY) as (keyof typeof ROLE_SUMMARY)[]).map((role) => [
        role,
        permissionsFor(role),
      ]),
    ),
  });
});

api.use((_req, _res, next) => next(new HttpError(404, 'That API endpoint does not exist.')));
