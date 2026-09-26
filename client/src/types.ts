export type Unit = 'kg' | 'Units' | 'Rolls';
export type ProductStatus = 'IN_STOCK' | 'LOW' | 'OUT';
/**
 * Mirrors the server's `status.ts`. `Overdue` is not a status: a late document
 * stays in its own step and carries a derived `attention` flag instead.
 */
export type DocStatus =
  | 'Draft'
  | 'Waiting'
  | 'Ready'
  | 'Picking'
  | 'Packed'
  | 'In Transit'
  | 'Done'
  | 'Canceled';

export type AttentionKind = 'Overdue' | 'Awaiting approval' | 'Draft' | 'Blocked';

export interface Attention {
  kind: AttentionKind;
  message: string;
  daysLate: number;
}

/** Fields the API adds to every document it returns. */
export interface DocumentMeta {
  attention: Attention | null;
  stepIndex: number;
  stepCount: number;
}

export interface StatusFlows {
  receipt: readonly string[];
  delivery: readonly string[];
  transfer: readonly string[];
  adjustment: readonly string[];
}

export interface DocColumn {
  key: string;
  label: string;
  icon: string;
}

/**
 * `Overdue` is not a board column or a status — it is the derived attention
 * lane, so it matches on `attention` rather than on the stored status.
 */
export function isAttentionKey(key: string): key is 'Overdue' {
  return key === 'Overdue';
}

export function docMatchesColumn(
  doc: { status?: string; state?: string; attention?: Attention | null },
  key: string,
): boolean {
  if (isAttentionKey(key)) return doc.attention?.kind === 'Overdue';
  return (doc.status ?? doc.state) === key;
}
export type LedgerType =
  | 'OPENING'
  | 'RECEIPT'
  | 'DELIVERY'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'REVERSAL';
export type AdjustmentReason =
  | 'Damaged in Transit'
  | 'Missing / Investigation'
  | 'Incorrect Entry / Counting Error'
  | 'Scrap / Wear & Tear'
  | 'Supplier Surplus'
  | 'Other';
export type AdjustmentState = 'Draft' | 'Pending Approval' | 'Approved' | 'Posted' | 'Canceled';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: Unit;
  unitCost: number;
  reorderPoint: number;
  reserved: number;
  stock: Record<string, number>;
  icon: string;
  total: number;
  free: number;
  status: ProductStatus;
  byLocation?: { code: string; name: string; qty: number; container: boolean }[];
  moves?: LedgerEntry[];
  openOrders?: { ref: string; kind: 'Delivery' | 'Receipt'; qty: number; to: string; status: string }[];
}

export interface ReceiptLine {
  sku: string;
  expected: number;
  received: number;
  bin: string;
  lot: string;
  barcode: string;
  name: string;
  unit: Unit;
  unitCost: number;
  lineValue: number;
  variance: number;
}

export interface Receipt extends DocumentMeta {
  ref: string;
  supplier: string;
  supplierTier: 'Tier 1 Vendor' | 'Tier 2 Vendor' | 'Unverified';
  poRef: string;
  bolRef: string;
  destination: string;
  contact: string;
  scheduledDate: string;
  carrier: string;
  dockBay: string;
  status: DocStatus;
  items: ReceiptLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  postedAt?: string;
  lines?: ReceiptLine[];
  totalValue?: number;
}

export interface DeliveryLine {
  sku: string;
  qty: number;
  bin: string;
  name: string;
  unit: Unit;
  unitCost: number;
  availableAtSource: number;
  availableTotal: number;
  pullFrom: string;
  reason: string;
  sufficient: boolean;
  shortfall: number;
  value: number;
}

export interface Delivery extends DocumentMeta {
  ref: string;
  from: string;
  to: string;
  contact: string;
  address: string;
  scheduledDate: string;
  carrier: string;
  status: DocStatus;
  operationType: string;
  items: DeliveryLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  postedAt?: string;
  check?: { ref: string; lines: unknown[]; blocked: boolean; blockers: string[]; alreadyPosted: boolean };
  lines?: DeliveryLine[];
  totalValue?: number;
}

export interface Transfer extends DocumentMeta {
  ref: string;
  from: string;
  to: string;
  sku: string;
  qty: number;
  requestedBy: string;
  status: DocStatus;
  createdAt: string;
}

export interface Adjustment extends DocumentMeta {
  ref: string;
  sku: string;
  location: string;
  recorded: number;
  counted: number;
  delta: number;
  reason: AdjustmentReason;
  memo: string;
  auditor: string;
  state: AdjustmentState;
  valuationImpact: number;
  createdAt: string;
  postedAt?: string;
  dualSignoff?: boolean;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: LedgerType;
  ref: string;
  sku: string;
  name: string;
  delta: number;
  from: string;
  to: string;
  balanceAfter: number;
  user: string;
  note: string;
}

export interface Warehouse {
  code: string;
  name: string;
  type: string;
  address: string;
  manager: string;
  capacityUsedPct: number;
  locationCount: number;
}

export interface StorageLocation {
  code: string;
  name: string;
  shortCode: string;
  warehouse: string;
  parent?: string;
  container: boolean;
  type: string;
  skuCount: number;
  maxLoad: string;
  status: 'Active' | 'Receiving' | 'Ready' | 'Chill Pass' | 'Locked';
}

export type Role = 'Admin' | 'Inventory Manager' | 'Warehouse Staff' | 'Floor Supervisor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
  auditorId: string;
  active: boolean;
}

/** Safe subset of `User` published for the sign-in screen demo directory. */
export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
}

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
  | 'settings.manage'
  | 'diagnostics.view'
  | 'demo.reset'
  | 'user.impersonate';

export interface SessionInfo {
  user: User;
  permissions: Permission[];
}

export interface DiagnosticsReport {
  runtime: { node: string; uptimeSeconds: number; storage: string; seedVersion: number };
  counts: Record<string, number>;
  guardrails: { id: string; label: string; active: boolean; thresholdPct?: number }[];
}

export interface Settings {
  valuationMethod: 'FIFO' | 'AVCO';
  removalStrategy: 'FIFO' | 'FEFO';
  preventNegativeStock: boolean;
  dualSignoffThreshold: number;
  dualSignoffVariancePct: number;
  currency: string;
}

export interface DashboardSummary {
  catalogSkus: number;
  totalOnHand: number;
  freeToAllocate: number;
  reserved: number;
  valuation: number;
  lowStock: Product[];
  pendingReceipts: number;
  pendingDeliveries: number;
  waitingDeliveries: number;
  readyDeliveries: number;
  doneDeliveries: number;
  overdueDeliveries: number;
  lateReceipts: number;
  lateTransfers: number;
  /** documents past their scheduled slot, summed across all kinds */
  overdueCount: number;
  scheduledTransfers: number;
  pendingAdjustments: number;
  ledgerEntries: number;
}

export interface ScenarioStep {
  key: string;
  index: number;
  title: string;
  detail: string;
  completed: boolean;
  active: boolean;
}

export interface ScenarioState {
  steps: ScenarioStep[];
  currentStep: number;
  complete: boolean;
  /** true once the drill has been rewound and not yet finished */
  started: boolean;
  steel: { sku: string; total: number; rack: number; production: number } | null;
  refs: { receipt: string; transfer: string; delivery: string; adjustment: string };
}

export interface Snapshot {
  version: number;
  settings: Settings;
  users: User[];
  warehouses: Warehouse[];
  locations: StorageLocation[];
  products: Product[];
  receipts: Receipt[];
  deliveries: Delivery[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  ledger: LedgerEntry[];
  dashboard: DashboardSummary;
  scenario: ScenarioState;
  me: SessionInfo | null;
}
