/**
 * Document status machine.
 *
 * A status is a fact about a document, not a label someone typed. Only the
 * transitions declared here are accepted, and each one names the permission that
 * may perform it, so the same table drives the server guard and the UI buttons.
 */
import { badRequest } from '../errors.js';
import type {
  AdjustmentStatus,
  CountStatus,
  DeliveryStatus,
  Permission,
  ReceiptStatus,
  TransferStatus,
} from '../types.js';

export interface Transition<S extends string> {
  from: S;
  to: S;
  label: string;
  permission: Permission;
  /** Marks stock as moved once the transition completes. */
  posts?: boolean;
  tone: 'primary' | 'success' | 'danger';
}

export const RECEIPT_FLOW: Transition<ReceiptStatus>[] = [
  { from: 'Draft', to: 'Waiting', label: 'Send for validation', permission: 'receipt.create', tone: 'primary' },
  { from: 'Waiting', to: 'Ready', label: 'Mark ready to receive', permission: 'receipt.post', tone: 'primary' },
  { from: 'Ready', to: 'Done', label: 'Validate receipt', permission: 'receipt.post', tone: 'success', posts: true },
  { from: 'Draft', to: 'Canceled', label: 'Cancel receipt', permission: 'receipt.create', tone: 'danger' },
  { from: 'Waiting', to: 'Canceled', label: 'Cancel receipt', permission: 'receipt.create', tone: 'danger' },
  { from: 'Ready', to: 'Canceled', label: 'Cancel receipt', permission: 'receipt.create', tone: 'danger' },
];

export const DELIVERY_FLOW: Transition<DeliveryStatus>[] = [
  { from: 'Draft', to: 'Waiting', label: 'Release order', permission: 'delivery.create', tone: 'primary' },
  { from: 'Waiting', to: 'Ready', label: 'Reserve stock & start picking', permission: 'delivery.create', tone: 'primary' },
  { from: 'Ready', to: 'Picking', label: 'Start picking', permission: 'delivery.pick', tone: 'primary' },
  { from: 'Picking', to: 'Packed', label: 'Mark packed', permission: 'delivery.pick', tone: 'primary' },
  { from: 'Ready', to: 'Packed', label: 'Skip picking & mark packed', permission: 'delivery.post', tone: 'primary' },
  { from: 'Packed', to: 'Done', label: 'Complete delivery', permission: 'delivery.post', tone: 'success', posts: true },
  { from: 'Picking', to: 'Done', label: 'Complete delivery', permission: 'delivery.post', tone: 'success', posts: true },
  { from: 'Ready', to: 'Done', label: 'Complete delivery now', permission: 'delivery.post', tone: 'success', posts: true },
  { from: 'Draft', to: 'Canceled', label: 'Cancel delivery', permission: 'delivery.create', tone: 'danger' },
  { from: 'Waiting', to: 'Canceled', label: 'Cancel delivery', permission: 'delivery.create', tone: 'danger' },
  { from: 'Ready', to: 'Canceled', label: 'Cancel delivery', permission: 'delivery.create', tone: 'danger' },
  { from: 'Picking', to: 'Canceled', label: 'Cancel delivery', permission: 'delivery.create', tone: 'danger' },
];

export const TRANSFER_FLOW: Transition<TransferStatus>[] = [
  { from: 'Draft', to: 'Waiting', label: 'Submit request', permission: 'transfer.create', tone: 'primary' },
  { from: 'Waiting', to: 'Ready', label: 'Approve for movement', permission: 'transfer.create', tone: 'primary' },
  { from: 'Ready', to: 'In Transit', label: 'Dispatch', permission: 'transfer.post', tone: 'primary' },
  { from: 'In Transit', to: 'Done', label: 'Confirm arrival', permission: 'transfer.post', tone: 'success', posts: true },
  { from: 'Ready', to: 'Done', label: 'Complete transfer', permission: 'transfer.post', tone: 'success', posts: true },
  { from: 'Draft', to: 'Canceled', label: 'Cancel transfer', permission: 'transfer.create', tone: 'danger' },
  { from: 'Waiting', to: 'Canceled', label: 'Cancel transfer', permission: 'transfer.create', tone: 'danger' },
  { from: 'Ready', to: 'Canceled', label: 'Cancel transfer', permission: 'transfer.create', tone: 'danger' },
  { from: 'In Transit', to: 'Canceled', label: 'Cancel transfer', permission: 'transfer.create', tone: 'danger' },
];

export const ADJUSTMENT_FLOW: Transition<AdjustmentStatus>[] = [
  { from: 'Draft', to: 'Pending Approval', label: 'Submit for approval', permission: 'adjustment.create', tone: 'primary' },
  { from: 'Pending Approval', to: 'Approved', label: 'Approve adjustment', permission: 'adjustment.approve', tone: 'primary' },
  { from: 'Approved', to: 'Posted', label: 'Post to stock', permission: 'adjustment.approve', tone: 'success', posts: true },
  { from: 'Pending Approval', to: 'Rejected', label: 'Reject adjustment', permission: 'adjustment.approve', tone: 'danger' },
  { from: 'Draft', to: 'Rejected', label: 'Discard', permission: 'adjustment.create', tone: 'danger' },
];

export const COUNT_FLOW: Transition<CountStatus>[] = [
  { from: 'Scheduled', to: 'In Progress', label: 'Start counting', permission: 'count.approve', tone: 'primary' },
  { from: 'In Progress', to: 'Completed', label: 'Complete count', permission: 'count.approve', tone: 'success' },
  { from: 'Scheduled', to: 'Canceled', label: 'Cancel count', permission: 'count.create', tone: 'danger' },
  { from: 'In Progress', to: 'Canceled', label: 'Cancel count', permission: 'count.create', tone: 'danger' },
];

export const TERMINAL = {
  receipt: ['Done', 'Canceled'],
  delivery: ['Done', 'Canceled'],
  transfer: ['Done', 'Canceled'],
  adjustment: ['Posted', 'Rejected'],
  count: ['Completed', 'Canceled'],
} as const;

export function findTransition<S extends string>(
  flow: Transition<S>[],
  from: S,
  to: S,
): Transition<S> {
  const hit = flow.find((t) => t.from === from && t.to === to);
  if (!hit) {
    const allowed = flow.filter((t) => t.from === from).map((t) => t.to);
    throw badRequest(
      `A ${from} document cannot move to ${to}.${allowed.length ? ` From ${from} you can move to ${allowed.join(', ')}.` : ''}`,
    );
  }
  return hit;
}

export function assertTransition<S extends string>(flow: Transition<S>[], from: S, to: S): Transition<S> {
  if (from === to) throw badRequest(`This document is already ${from}.`);
  return findTransition(flow, from, to);
}

export function nextStatuses<S extends string>(flow: Transition<S>[], from: S): Transition<S>[] {
  return flow.filter((t) => t.from === from);
}
