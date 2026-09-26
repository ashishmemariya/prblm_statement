import { getDb, commit } from './store.js';
import {
  postAdjustment,
  postDelivery,
  postReceipt,
  postReversal,
  postTransfer,
  stockAt,
  totalStock,
  HttpError,
} from './engine.js';
import type { LocationCode } from './types.js';

/**
 * The canonical lifecycle drill from the wireframe:
 *   1. Receive 100 kg Steel Rods          -> RC-1001
 *   2. Transfer rack -> production        -> TR-2001
 *   3. Deliver 20 kg to Azure Interior    -> WH/OUT/0001
 *   4. Post -3 kg count variance          -> ADJ-4001
 *
 * The seeded database is the *live* system: all four documents are already
 * posted, so the dashboard opens on the real 77 kg balance and the real ledger.
 * `startDrill()` rewinds those four documents by writing counter-movING ledger
 * rows (never deleting one) and reopens them, at which point the walkthrough can
 * be executed by hand from a genuinely empty rack.
 */

export const DRILL = {
  receipt: 'RC-1001',
  transfer: 'TR-2001',
  delivery: 'WH/OUT/0001',
  adjustment: 'ADJ-4001',
  sku: 'STL-ROD-12',
  rack: 'WH/Stock/Heavy-Rack-01' as LocationCode,
  production: 'WH-Production' as LocationCode,
  receiveQty: 100,
  deliverQty: 20,
  varianceQty: 3,
  targetBalance: 77,
};

const STEPS = [
  {
    key: 'receive',
    title: `Receive ${DRILL.receiveQty} kg Steel Rods`,
    detail: `Goods receipt ${DRILL.receipt} posted into ${DRILL.rack}.`,
  },
  {
    key: 'transfer',
    title: 'Move stock to production staging',
    detail: `Internal transfer ${DRILL.transfer} relocates ${DRILL.receiveQty} kg without changing the total.`,
  },
  {
    key: 'deliver',
    title: `Deliver ${DRILL.deliverQty} kg to Azure Interior`,
    detail: `Outbound order ${DRILL.delivery} validated — now fully covered by on-hand stock.`,
  },
  {
    key: 'adjust',
    title: `Post −${DRILL.varianceQty} kg count variance`,
    detail: `Physical count ${DRILL.adjustment} reconciled and written to the immutable ledger.`,
  },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export function scenarioState() {
  const db = getDb();
  const steel = db.products.find((p) => p.sku === DRILL.sku);
  const receipt = db.receipts.find((r) => r.ref === DRILL.receipt);
  const transfer = db.transfers.find((t) => t.ref === DRILL.transfer);
  const delivery = db.deliveries.find((d) => d.ref === DRILL.delivery);
  const adjustment = db.adjustments.find((a) => a.ref === DRILL.adjustment);

  const done: Record<StepKey, boolean> = {
    receive: receipt?.status === 'Done',
    transfer: transfer?.status === 'Done',
    deliver: delivery?.status === 'Done',
    adjust: adjustment?.state === 'Posted',
  };

  const next = STEPS.findIndex((s) => !done[s.key]);
  const complete = next === -1;

  return {
    steps: STEPS.map((s, i) => ({
      key: s.key,
      index: i,
      title: s.title,
      detail: s.detail,
      completed: done[s.key],
      active: i === next,
    })),
    currentStep: complete ? STEPS.length - 1 : next,
    complete,
    /** true once the drill has been started and not yet finished */
    started: !done.receive || !complete,
    steel: steel
      ? {
          sku: steel.sku,
          total: totalStock(steel),
          rack: stockAt(steel, DRILL.rack),
          production: stockAt(steel, DRILL.production),
        }
      : null,
    refs: {
      receipt: DRILL.receipt,
      transfer: DRILL.transfer,
      delivery: DRILL.delivery,
      adjustment: DRILL.adjustment,
    },
  };
}

/**
 * Rewinds the four drill documents to their pre-lifecycle state. Rows already
 * written by an *earlier* drill are left alone — only the current posting of
 * each document is counter-moved, so the reversal is always exactly one
 * document deep and re-running the drill cannot compound.
 */
export function startDrill(user: string) {
  const db = getDb();
  const receipt = db.receipts.find((r) => r.ref === DRILL.receipt);
  const transfer = db.transfers.find((t) => t.ref === DRILL.transfer);
  const delivery = db.deliveries.find((d) => d.ref === DRILL.delivery);
  const adjustment = db.adjustments.find((a) => a.ref === DRILL.adjustment);

  if (!receipt || !transfer || !delivery || !adjustment) {
    throw new HttpError(500, 'The lifecycle drill documents are missing from the catalogue.');
  }

  const legs = [];
  const note = `Drill rewind of ${DRILL.adjustment} chain.`;

  if (adjustment.state === 'Posted') {
    legs.push({
      sku: DRILL.sku,
      location: DRILL.production,
      delta: DRILL.varianceQty,
      reverses: DRILL.adjustment,
      note,
    });
    adjustment.state = 'Approved';
    adjustment.postedAt = undefined;
    adjustment.counted = DRILL.targetBalance + DRILL.deliverQty;
    adjustment.recorded = DRILL.targetBalance + DRILL.deliverQty;
    adjustment.delta = 0;
  }

  if (delivery.status === 'Done') {
    legs.push({
      sku: DRILL.sku,
      location: DRILL.production,
      delta: DRILL.deliverQty,
      reverses: DRILL.delivery,
      note,
    });
    delivery.status = 'Waiting';
    delivery.postedAt = undefined;
  }

  if (transfer.status === 'Done') {
    legs.push({
      sku: DRILL.sku,
      location: DRILL.production,
      delta: -DRILL.receiveQty,
      reverses: DRILL.transfer,
      note,
    });
    legs.push({
      sku: DRILL.sku,
      location: DRILL.rack,
      delta: DRILL.receiveQty,
      reverses: DRILL.transfer,
      note,
    });
    transfer.status = 'Waiting';
  }

  if (receipt.status === 'Done') {
    legs.push({
      sku: DRILL.sku,
      location: DRILL.rack,
      delta: -DRILL.receiveQty,
      reverses: DRILL.receipt,
      note,
    });
    receipt.status = 'Ready';
    receipt.postedAt = undefined;
  }

  if (legs.length === 0) {
    throw new HttpError(409, 'The lifecycle drill has already been started.');
  }

  const entries = postReversal(legs, user);
  commit();

  const steel = db.products.find((p) => p.sku === DRILL.sku);
  return {
    rewound: legs.length,
    entries: entries.length,
    balance: steel ? totalStock(steel) : 0,
    message:
      steel && totalStock(steel) === 0
        ? `Drill rewound — ${DRILL.sku} is back to 0. Start with step 1.`
        : `Drill rewound — ${DRILL.sku} now stands at ${steel ? totalStock(steel) : 0}.`,
  };
}

/** Executes the next outstanding step. Idempotent: a finished drill is a no-op. */
export function runScenarioStep(user: string) {
  const db = getDb();
  const receipt = db.receipts.find((r) => r.ref === DRILL.receipt);
  const transfer = db.transfers.find((t) => t.ref === DRILL.transfer);
  const delivery = db.deliveries.find((d) => d.ref === DRILL.delivery);
  const adjustment = db.adjustments.find((a) => a.ref === DRILL.adjustment);

  if (receipt && receipt.status !== 'Done') {
    const doc = postReceipt(DRILL.receipt, user).doc;
    return {
      action: 'receive',
      message: `Received ${DRILL.receiveQty} kg into ${doc.destination}.`,
      ref: doc.ref,
    };
  }

  if (transfer && transfer.status !== 'Done') {
    const doc = postTransfer(DRILL.transfer, user).doc;
    return {
      action: 'transfer',
      message: `Moved ${doc.qty} kg ${doc.from} → ${doc.to} (total unchanged).`,
      ref: doc.ref,
    };
  }

  if (delivery && delivery.status !== 'Done') {
    const doc = postDelivery(DRILL.delivery, user).doc;
    return {
      action: 'deliver',
      message: `Dispatched ${DRILL.deliverQty} kg to ${doc.to}. Validation passed.`,
      ref: doc.ref,
    };
  }

  if (adjustment && adjustment.state !== 'Posted') {
    const doc = postAdjustment({
      ref: DRILL.adjustment,
      counted: DRILL.targetBalance,
      reason: 'Scrap / Wear & Tear',
      memo: 'Drill: count variance written to the ledger.',
      user,
    }).doc;
    return {
      action: 'adjust',
      message: `Posted ${doc.delta} kg variance (${doc.ref}).`,
      ref: doc.ref,
    };
  }

  return {
    action: 'complete',
    message: `Drill complete — ${DRILL.sku} stands at ${DRILL.targetBalance} kg.`,
    ref: DRILL.adjustment,
  };
}
