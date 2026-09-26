/* Client mirror of the server domain model. These are the only shapes a page
   is allowed to read — there are no component-local business numbers. */

export type Uom = 'kg' | 'Units' | 'Boxes' | 'Rolls' | 'Litres' | 'Metres' | 'Pieces';
export type Role = 'Admin' | 'Inventory Manager' | 'Warehouse Staff' | 'Viewer';
export type Health = 'IN_STOCK' | 'LOW' | 'OUT';
export type Severity = 'info' | 'success' | 'warning' | 'critical';
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

export type ReceiptStatus = 'Draft' | 'Waiting' | 'Ready' | 'Done' | 'Canceled';
export type DeliveryStatus = 'Draft' | 'Waiting' | 'Ready' | 'Picking' | 'Packed' | 'Done' | 'Canceled';
export type TransferStatus = 'Draft' | 'Waiting' | 'Ready' | 'In Transit' | 'Done' | 'Canceled';
export type AdjustmentStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Posted' | 'Rejected';
export type CountStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Canceled';
export type DocumentStatus = ReceiptStatus | DeliveryStatus | TransferStatus | AdjustmentStatus | CountStatus;
export type LedgerType = 'OPENING' | 'RECEIPT' | 'DELIVERY' | 'TRANSFER' | 'ADJUSTMENT';
export type AdjustmentReason = 'Damaged' | 'Missing' | 'Expired' | 'Counting Error' | 'Incorrect Entry' | 'Other';
export type NotificationType =
  | 'Low Stock'
  | 'Out of Stock'
  | 'Receipt Ready'
  | 'Delivery Blocked'
  | 'Transfer Completed'
  | 'Adjustment Approval'
  | 'Count Due'
  | 'Reorder Alert'
  | 'Cycle Count Variance';

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

export interface Transition {
  from: DocumentStatus;
  to: DocumentStatus;
  label: string;
  permission: Permission;
  posts?: boolean;
  tone: 'primary' | 'success' | 'danger';
}

export interface ReorderRule {
  productSku: string;
  minStock: number;
  reorderPoint: number;
  safetyStock: number;
  reorderQty: number;
  preferredSupplier: string;
  leadTimeDays: number;
}

export interface ProductLocationRow {
  code: string;
  name: string;
  warehouse: string;
  qty: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  uom: Uom;
  unitCost: number;
  icon: string;
  stock: Record<string, number>;
  reorder: ReorderRule;
  createdAt: string;
  updatedAt: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  health: Health;
  value: number;
  locations: ProductLocationRow[];
  moves?: LedgerEntry[];
  openOrders?: OpenOrder[];
  dayFlow?: [string, number][];
  reservedBy?: { ref: string; customer: string; qty: number }[];
}

export interface OpenOrder {
  ref: string;
  kind: 'Delivery' | 'Receipt' | 'Transfer';
  qty: number;
  picked: number;
  to: string;
  scheduledDate: string;
  status: string;
  link: string;
}

export interface Warehouse {
  code: string;
  name: string;
  kind: string;
  address: string;
  manager: string;
  capacityUnits: number;
}

export interface WarehouseSummary {
  code: string;
  name: string;
  kind: string;
  manager: string;
  address: string;
  locations: number;
  leafLocations: number;
  products: number;
  stockValue: number;
  stockUnits: number;
  utilisation: number;
  usedVolume: number;
  capacity: number;
  incoming: number;
  outgoing: number;
  topProducts: string[];
  receipts: number;
  deliveries: number;
  transfers: number;
  health: 'Healthy' | 'Busy' | 'Critical';
}

export interface LocationNode {
  code: string;
  name: string;
  warehouse: string;
  parent?: string;
  container: boolean;
  type: string;
  capacityUnits: number;
  volumePerUnit: number;
  state: string;
  ownBalance?: number;
  breadcrumb?: { code: string; name: string }[];
  childCount?: number;
  scopeSize?: number;
  stock?: { sku: string; name: string; uom: string; qty: number }[];
  skuCount?: number;
  totalUnits?: number;
  stockValue?: number;
  capacity?: number;
  usedVolume?: number;
  utilisation?: number;
  pendingMoves?: {
    ref: string;
    kind: string;
    sku: string;
    qty: number;
    link: string;
    status: string;
  }[];
  activity?: {
    at: string;
    ref: string;
    type: LedgerType;
    sku: string;
    name: string;
    delta: number;
    user: string;
    note: string;
  }[];
  children?: LocationNode[];
}

export interface LocationSummary {
  code: string;
  name: string;
  warehouse: string;
  type: string;
  state: string;
  capacity: number;
  usedVolume: number;
  utilisation: number;
  skuCount: number;
  totalUnits: number;
  value: number;
  products: { sku: string; name: string; uom: string; qty: number }[];
}

export interface ReceiptLine {
  id: string;
  sku: string;
  expected: number;
  received: number;
  bin: string;
  binName: string;
  binValid: boolean;
  lot: string;
  barcode: string;
  name: string;
  uom: Uom;
  unitCost: number;
  lineValue: number;
  variance: number;
  onHandAtBin: number;
}

export interface Receipt {
  ref: string;
  supplier: string;
  poRef: string;
  bolRef: string;
  contact: string;
  destination: string;
  destinationName: string;
  scheduledDate: string;
  carrier: string;
  dockBay: string;
  status: ReceiptStatus;
  notes: string;
  createdAt: string;
  createdBy: string;
  validatedAt?: string;
  validatedBy?: string;
  lines: ReceiptLine[];
  items: ReceiptLine[];
  totalExpected: number;
  totalReceived: number;
  totalValue: number;
  overdue: boolean;
  transitions: Transition[];
  impact?: ReceiptImpact[];
  createdByUser?: User | null;
}

export interface ReceiptImpact {
  sku: string;
  name: string;
  uom: Uom;
  bin: string;
  before: number;
  receiving: number;
  after: number;
}

export interface DeliveryLine {
  id: string;
  sku: string;
  qty: number;
  picked: number;
  bin: string;
  packed: boolean;
  name: string;
  uom: Uom;
  unitCost: number;
  value: number;
  availableAtSource: number;
  availableTotal: number;
  pullFrom: string;
  sufficient: boolean;
  shortfall: number;
  reason: string;
}

export interface LineAvailability {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  bin: string;
  required: number;
  picked: number;
  availableAtSource: number;
  availableTotal: number;
  pullFrom: string;
  shortfall: number;
  sufficient: boolean;
  reason: string;
}

export interface DeliveryCheck {
  ref: string;
  status: DeliveryStatus;
  lines: LineAvailability[];
  blocked: boolean;
  blockers: string[];
  totalRequired: number;
  totalAvailable: number;
  pickedLines: number;
  pickProgress: number;
  overdue: boolean;
  daysLate: number;
}

export interface Delivery {
  ref: string;
  customer: string;
  contact: string;
  address: string;
  from: string;
  sourceName: string;
  scheduledDate: string;
  carrier: string;
  status: DeliveryStatus;
  notes: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  completedBy?: string;
  lines: DeliveryLine[];
  items: DeliveryLine[];
  check: DeliveryCheck;
  totalQty: number;
  totalValue: number;
  overdue: boolean;
  daysLate: number;
  transitions: Transition[];
}

export interface TransferLine {
  id: string;
  sku: string;
  qty: number;
  name: string;
  uom: Uom;
  availableAtSource: number;
  remainingAfter: number;
  availableAtDestination: number;
  onHand: number;
}

export interface Transfer {
  ref: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  lines: TransferLine[];
  status: TransferStatus;
  reason: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  totalQty: number;
  enterpriseTotal: number;
  nested: boolean;
  transitions: Transition[];
  createdByUser?: User | null;
}

export interface Adjustment {
  ref: string;
  sku: string;
  name: string;
  uom: Uom;
  unitCost: number;
  location: string;
  locationName: string;
  recorded: number;
  counted: number | null;
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
  impact: number;
  variancePct: number;
  approvalRequired: boolean;
  approvalReason: string;
  currentOnHand: number;
  transitions: Transition[];
  count: { ref: string; assignedTo: string; status: string } | null;
}

export interface CountLine {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  location: string;
  locationName: string;
  systemQty: number;
  counted: number | null;
  difference: number | null;
  currentOnHand: number;
  note: string;
}

export interface Count {
  ref: string;
  warehouse: string;
  location: string;
  category: string;
  assignedTo: string;
  dueDate: string;
  status: CountStatus;
  lines: CountLine[];
  notes: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  totalLines: number;
  countedLines: number;
  progress: number;
  variances: number;
  absoluteVariance: number;
  adjustments: { ref: string; sku: string; status: string; difference: number | null }[];
  overdue: boolean;
  daysToDue: number;
  transitions: Transition[];
}

export interface LedgerLeg {
  location: string;
  delta: number;
}

export interface LedgerEntry {
  id: string;
  at: string;
  type: LedgerType;
  ref: string;
  sku: string;
  name: string;
  delta: number;
  from: string;
  to: string;
  legs: LedgerLeg[];
  balanceAfter: number;
  user: string;
  note: string;
}

export interface LedgerSummary {
  total: number;
  receipt: number;
  delivery: number;
  transfer: number;
  adjustment: number;
  opening: number;
}

export interface DomainEvent {
  id: string;
  at: string;
  type: string;
  ref: string;
  summary: string;
  detail: string;
  user: string;
  link?: string;
  severity: Severity;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  ref: string;
  link: string;
  severity: Severity;
  at: string;
  key: string;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
}

export interface AttentionItem {
  id: string;
  kind: string;
  severity: Exclude<Severity, 'success'>;
  title: string;
  detail: string;
  status: string;
  link: string;
  cta: string;
}

export function docMatchesColumn(
  doc: { status?: string; state?: string; attention?: AttentionItem | null },
  key: string,
): boolean {
  if (key === 'Overdue') return doc.attention?.kind === 'Overdue';
  return (doc.status ?? doc.state) === key;
}

export interface DashboardSummary {
  currency: string;
  totalStock: number;
  available: number;
  reserved: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockList: { sku: string; name: string; uom: Uom; onHand: number; available: number; reorderPoint: number }[];
  outOfStockList: { sku: string; name: string; uom: Uom; onHand: number; reorderPoint: number }[];
  pendingReceipts: number;
  pendingDeliveries: number;
  blockedDeliveries: number;
  openTransfers: number;
  pendingApprovals: number;
  openCounts: number;
  accuracy: number;
  catalogSkus: number;
  warehouses: number;
  locations: number;
  ledgerEntries: number;
  notifications: NotificationSummary;
  attention: AttentionItem[];
  timeline: DomainEvent[];
}

export interface ReorderRow {
  sku: string;
  name: string;
  uom: Uom;
  supplier: string;
  onHand: number;
  available: number;
  reserved: number;
  minStock: number;
  reorderPoint: number;
  safetyStock: number;
  suggestedQty: number;
  leadTimeDays: number;
  unitCost: number;
  estimatedValue: number;
  status: 'Critical' | 'Reorder' | 'Healthy';
  primaryLocation: string;
  primaryLocationQty: number;
}

export interface LowStockByLocation {
  sku: string;
  name: string;
  uom: Uom;
  location: string;
  onHand: number;
  reorderPoint: number;
  suggestedQty: number;
  status: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
  employeeCode: string;
  active: boolean;
  lastActiveAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

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

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;
}

export interface ReportResult {
  id: string;
  name: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
  chart?: { label: string; value: number }[];
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
}

export interface SearchHit {
  group: 'Products' | 'Operations' | 'Warehouses' | 'Locations';
  id: string;
  title: string;
  subtitle: string;
  ref: string;
  link: string;
  meta?: string;
}

export interface DiagnosticsReport {
  runtime: {
    node: string;
    platform: string;
    uptimeSeconds: number;
    memoryMb: number;
    storage: string;
    schemaVersion: number;
    seedVersion: number;
    demoMode: boolean;
  };
  environment: { name: string; repositoryUrl: string; repositoryConfigured: boolean };
  services: { api: string; database: string; realtime: string; lastSync: string };
  counts: Record<string, number>;
  guardrails: { id: string; label: string; active: boolean; detail: string }[];
  permissions: Record<string, Permission[]>;
}

export interface Domains {
  receipt: readonly ReceiptStatus[];
  delivery: readonly DeliveryStatus[];
  transfer: readonly TransferStatus[];
  adjustment: readonly AdjustmentStatus[];
  count: readonly CountStatus[];
  reasons: readonly AdjustmentReason[];
  units: readonly Uom[];
}

export interface Snapshot {
  version: number;
  builtAt: string;
  generatedAt: string;
  settings: Settings;
  users: User[];
  categories: Category[];
  warehouses: Warehouse[];
  locations: LocationNode[];
  products: Product[];
  receipts: Receipt[];
  deliveries: Delivery[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  counts: Count[];
  ledger: LedgerEntry[];
  events: DomainEvent[];
  readNotifications: string[];
  dashboard: DashboardSummary;
  notifications: Notification[];
  reorder: ReorderRow[];
  lowStockByLocation: LowStockByLocation[];
  warehousesSummary: WarehouseSummary[];
  reports: ReportDefinition[];
  domains: Domains;
  me: { user: User; permissions: Permission[]; roleSummary: string } | null;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
}

export interface ProfileInfo {
  user: User;
  permissions: Permission[];
  roleSummary: string;
  stats: { documentsRaised: number; movements: number; approvals: number };
}
