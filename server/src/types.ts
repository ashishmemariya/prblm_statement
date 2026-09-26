/** Shared domain model for StockSense ERP. Mirrors the wireframe source-of-truth. */

export type LocationCode =
  | 'WH/Stock'
  | 'WH/Stock/Heavy-Rack-01'
  | 'WH/Stock/Bay-04'
  | 'WH-Rack-A'
  | 'WH/Input'
  | 'WH/Output'
  | 'WH-Production'
  | 'WH-Cold-Zone'
  | 'WH/Quarantine';

export type Unit = 'kg' | 'Units' | 'Rolls';

export type ProductStatus = 'IN_STOCK' | 'LOW' | 'OUT';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: Unit;
  unitCost: number;
  /** reorder / safety-stock threshold */
  reorderPoint: number;
  /** qty committed to open outbound orders (soft reservation) */
  reserved: number;
  /** physical on-hand, keyed by location code. DERIVED from the ledger, never hand-edited. */
  stock: Record<string, number>;
  icon: string;
}

/**
 * The union of every document status. `Overdue` is intentionally absent — a late
 * document stays in its own step and raises a derived attention flag instead.
 * See `status.ts` for the per-kind flows and the transition rules.
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

export interface ReceiptLine {
  sku: string;
  expected: number;
  received: number;
  bin: string;
  lot: string;
  barcode: string;
}

export interface Receipt {
  ref: string;
  supplier: string;
  supplierTier: 'Tier 1 Vendor' | 'Tier 2 Vendor' | 'Unverified';
  poRef: string;
  bolRef: string;
  destination: LocationCode;
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
}

export interface DeliveryLine {
  sku: string;
  qty: number;
  bin: string;
}

export interface Delivery {
  ref: string;
  from: LocationCode;
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
}

export interface Transfer {
  ref: string;
  from: LocationCode;
  to: LocationCode;
  sku: string;
  qty: number;
  requestedBy: string;
  status: DocStatus;
  /** planned move window; a transfer that slips raises a derived Overdue flag */
  scheduledDate: string;
  createdAt: string;
  postedAt?: string;
}

export type AdjustmentReason =
  | 'Damaged in Transit'
  | 'Missing / Investigation'
  | 'Incorrect Entry / Counting Error'
  | 'Scrap / Wear & Tear'
  | 'Supplier Surplus'
  | 'Other';

export type AdjustmentState = 'Draft' | 'Pending Approval' | 'Approved' | 'Posted' | 'Canceled';

export interface Adjustment {
  ref: string;
  sku: string;
  location: LocationCode;
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
}

/**
 * `OPENING` is the seeded baseline and `REVERSAL` unwinds a previously posted
 * document. Both exist so that no ledger row ever has to be deleted or edited.
 */
export type LedgerType =
  | 'OPENING'
  | 'RECEIPT'
  | 'DELIVERY'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: LedgerType;
  ref: string;
  sku: string;
  name: string;
  /** signed change of the *global* balance; transfers are 0 */
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
  type: 'Main Fulfillment' | 'Cold Chain' | 'Transit Hub';
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
  /** parent container code; absent for roots. Enables roll-up balances. */
  parent?: string;
  container: boolean;
  type:
    | 'Internal Storage'
    | 'Heavy Floor'
    | 'Cold Chain'
    | 'Inward Dock'
    | 'Outward Pack'
    | 'Quarantine';
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

/**
 * Password material is deliberately kept OUT of `User` so that any code path which
 * serialises users (snapshot, `/api/users`, notifications) can never leak a hash.
 */
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

/** Coarse capability list driving UI visibility and server-side enforcement. */
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


export interface Settings {
  valuationMethod: 'FIFO' | 'AVCO';
  removalStrategy: 'FIFO' | 'FEFO';
  preventNegativeStock: boolean;
  dualSignoffThreshold: number;
  dualSignoffVariancePct: number;
  currency: string;
}

export interface Database {
  version: number;
  settings: Settings;
  users: User[];
  credentials: CredentialRecord[];
  warehouses: Warehouse[];
  locations: StorageLocation[];
  products: Product[];
  receipts: Receipt[];
  deliveries: Delivery[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  ledger: LedgerEntry[];
}
