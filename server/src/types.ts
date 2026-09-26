/**
 * Canonical StockSense domain model.
 *
 * Two rules hold everywhere and are enforced by `domain/stock.ts`:
 *   1. Quantities live on LEAF locations. Containers roll up their children on read.
 *   2. Everything else — on hand, reserved, available, valuation, health — is derived,
 *      never stored. That is what stops two pages from disagreeing.
 */

/* ------------------------------------------------------------------ units */

export const UNITS = ['kg', 'Units', 'Boxes', 'Rolls', 'Litres', 'Metres', 'Pieces'] as const;
export type Uom = (typeof UNITS)[number];

/** Used only when a product somehow has no unit; rendering never shows `undefined`. */
export const FALLBACK_UOM: Uom = 'Units';

export function safeUom(value: unknown): Uom {
  return (UNITS as readonly string[]).includes(String(value)) ? (value as Uom) : FALLBACK_UOM;
}

/* ------------------------------------------------------------- structure */

export type Role = 'Admin' | 'Inventory Manager' | 'Warehouse Staff' | 'Viewer';

export type Permission =
  | 'product.view'
  | 'product.manage'
  | 'receipt.view'
  | 'receipt.create'
  | 'receipt.post'
  | 'delivery.view'
  | 'delivery.create'
  | 'delivery.pick'
  | 'delivery.post'
  | 'transfer.view'
  | 'transfer.create'
  | 'transfer.post'
  | 'adjustment.view'
  | 'adjustment.create'
  | 'adjustment.approve'
  | 'count.view'
  | 'count.create'
  | 'count.approve'
  | 'ledger.view'
  | 'ledger.export'
  | 'report.view'
  | 'reorder.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'diagnostics.view'
  | 'demo.reset';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
  /** Shown on every signed action so the audit trail names a person. */
  employeeCode: string;
  active: boolean;
  lastActiveAt: string;
}

export interface Warehouse {
  code: string;
  name: string;
  kind: 'Central' | 'Production' | 'Dispatch' | 'Secondary';
  address: string;
  manager: string;
  /** Cubic-metre capacity used by the location roll-up, 0–100. */
  capacityUnits: number;
}

export type LocationType =
  | 'Receiving'
  | 'Storage'
  | 'Heavy Rack'
  | 'Assembly'
  | 'Packing'
  | 'Dispatch';

export type LocationState = 'Active' | 'Receiving' | 'Packing' | 'Dispatch';

export interface Location {
  code: string;
  name: string;
  warehouse: string;
  /** Absent for warehouse roots. */
  parent?: string;
  /** A container rolls up its children; a leaf holds quantity. */
  container: boolean;
  type: LocationType;
  /** Nominal volume in m³ — drives the utilisation figure. */
  capacityUnits: number;
  /** Units of this location's own balance (leaves only) expressed in m³-equivalent. */
  volumePerUnit: number;
  state: LocationState;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface ReorderRule {
  productSku: string;
  /** Hard floor — below this the item is critical. */
  minStock: number;
  /** Trigger point for a replenishment suggestion. */
  reorderPoint: number;
  /** Buffer held to absorb lead-time variance. */
  safetyStock: number;
  /** How much to raise when the trigger fires. */
  reorderQty: number;
  preferredSupplier: string;
  leadTimeDays: number;
}

export type Health = 'IN_STOCK' | 'LOW' | 'OUT';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  uom: Uom;
  unitCost: number;
  icon: string;
  /** Own balances keyed by leaf location code. Never negative. */
  stock: Record<string, number>;
  reorder: ReorderRule;
  createdAt: string;
  updatedAt: string;
}

/* --------------------------------------------------------------- documents */

export const RECEIPT_STATUSES = ['Draft', 'Waiting', 'Ready', 'Done', 'Canceled'] as const;
export const DELIVERY_STATUSES = [
  'Draft',
  'Waiting',
  'Ready',
  'Picking',
  'Packed',
  'Done',
  'Canceled',
] as const;
export const TRANSFER_STATUSES = [
  'Draft',
  'Waiting',
  'Ready',
  'In Transit',
  'Done',
  'Canceled',
] as const;
export const ADJUSTMENT_STATUSES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Posted',
  'Rejected',
] as const;
export const COUNT_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Canceled'] as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];
export type CountStatus = (typeof COUNT_STATUSES)[number];

export interface ReceiptLine {
  id: string;
  sku: string;
  expected: number;
  /** Filled in at the goods-in step. Draft creation never moves stock. */
  received: number;
  bin: string;
  lot: string;
  barcode: string;
}

export interface Receipt {
  ref: string;
  supplier: string;
  poRef: string;
  bolRef: string;
  contact: string;
  /** Warehouse the goods are booked into. */
  destination: string;
  /** Default bin for lines that do not name one. */
  scheduledDate: string;
  carrier: string;
  dockBay: string;
  status: ReceiptStatus;
  lines: ReceiptLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  validatedAt?: string;
  validatedBy?: string;
}

export interface DeliveryLine {
  id: string;
  sku: string;
  qty: number;
  /** Quantity physically picked so far. */
  picked: number;
  bin: string;
  packed: boolean;
}

export interface Delivery {
  ref: string;
  customer: string;
  contact: string;
  address: string;
  from: string;
  scheduledDate: string;
  carrier: string;
  status: DeliveryStatus;
  lines: DeliveryLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  completedBy?: string;
}

export interface TransferLine {
  id: string;
  sku: string;
  qty: number;
}

export interface Transfer {
  ref: string;
  from: string;
  to: string;
  lines: TransferLine[];
  status: TransferStatus;
  reason: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
}

export const ADJUSTMENT_REASONS = [
  'Damaged',
  'Missing',
  'Expired',
  'Counting Error',
  'Incorrect Entry',
  'Other',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export interface Adjustment {
  ref: string;
  sku: string;
  location: string;
  /** Book quantity captured by the server when the line was created. */
  recorded: number;
  /** Physical count. Null until a count is entered. */
  counted: number | null;
  /** counted − recorded, computed server-side. Null while the count is blank. */
  difference: number | null;
  reason: AdjustmentReason;
  notes: string;
  status: AdjustmentStatus;
  countRef?: string;
  createdAt: string;
  createdBy: string;
  submittedBy?: string;
  approvedBy?: string;
  postedAt?: string;
}

export interface CountLine {
  id: string;
  sku: string;
  location: string;
  systemQty: number;
  counted: number | null;
  note: string;
}

export interface Count {
  ref: string;
  warehouse: string;
  /** Empty means the whole warehouse. */
  location: string;
  /** Empty means every category. */
  category: string;
  assignedTo: string;
  dueDate: string;
  status: CountStatus;
  lines: CountLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
}

/* ------------------------------------------------------------------ ledger */

export const LEDGER_TYPES = [
  'OPENING',
  'RECEIPT',
  'DELIVERY',
  'TRANSFER',
  'ADJUSTMENT',
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export interface LedgerEntry {
  id: string;
  at: string;
  type: LedgerType;
  ref: string;
  sku: string;
  name: string;
  /** Signed change of the enterprise-wide balance for this SKU. Transfers are 0. */
  delta: number;
  from: string;
  to: string;
  /** Per-leaf detail: which location lost or gained what. */
  legs: { location: string; delta: number }[];
  balanceAfter: number;
  user: string;
  note: string;
}

/* ------------------------------------------------- events & notifications */

export const EVENT_TYPES = [
  'STOCK_RECEIVED',
  'STOCK_TRANSFERRED',
  'STOCK_DELIVERED',
  'STOCK_ADJUSTED',
  'RECEIPT_VALIDATED',
  'DELIVERY_COMPLETED',
  'TRANSFER_COMPLETED',
  'ADJUSTMENT_APPROVED',
  'LOW_STOCK_TRIGGERED',
  'NOTIFICATION_CREATED',
  'DOCUMENT_CREATED',
  'DOCUMENT_CANCELLED',
  'COUNT_COMPLETED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEvent {
  id: string;
  at: string;
  type: EventType;
  ref: string;
  summary: string;
  detail: string;
  user: string;
  link?: string;
  /** How loudly the operations timeline should render it. */
  severity: 'info' | 'success' | 'warning' | 'critical';
}

/**
 * Prototype event store. A WebSocket / SSE transport would publish the same
 * records — the client already reacts to `events` by re-reading the snapshot.
 */
export interface EventRecord extends DomainEvent {}

export const NOTIFICATION_TYPES = [
  'Low Stock',
  'Out of Stock',
  'Receipt Ready',
  'Delivery Blocked',
  'Transfer Completed',
  'Adjustment Approval',
  'Count Due',
  'Reorder Alert',
  'Cycle Count Variance',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  ref: string;
  link: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  at: string;
  /** Stable identity so the same condition is not duplicated after a refresh. */
  key: string;
}

/* -------------------------------------------------------------- settings */

export interface CompanyProfile {
  name: string;
  legalName: string;
  gstin: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  currency: string;
  fiscalYearStart: string;
}

export interface Settings {
  company: CompanyProfile;
  preventNegativeStock: boolean;
  approvalRequired: boolean;
  approvalValueThreshold: number;
  approvalVariancePct: number;
  defaultUom: Uom;
  allowPartialDeliveries: boolean;
  notificationEmail: boolean;
  notificationInApp: boolean;
  lowStockDigest: boolean;
  sessionTimeoutHours: number;
  theme: 'light' | 'system';
  density: 'comfortable' | 'compact';
}

export interface CredentialRecord {
  userId: string;
  salt: string;
  hash: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface Database {
  version: number;
  builtAt: string;
  settings: Settings;
  users: User[];
  credentials: CredentialRecord[];
  categories: Category[];
  warehouses: Warehouse[];
  locations: Location[];
  products: Product[];
  receipts: Receipt[];
  deliveries: Delivery[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  counts: Count[];
  ledger: LedgerEntry[];
  events: EventRecord[];
  /** Notification ids the signed-in user has already opened. */
  readNotifications: string[];
}
