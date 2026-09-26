import type {
  Adjustment,
  CredentialRecord,
  Database,
  Delivery,
  LedgerEntry,
  LedgerType,
  LocationCode,
  Product,
  Receipt,
  StorageLocation,
  Transfer,
  User,
} from './types.js';
import { hashPassword } from './password.js';

/** Anchor date for the seeded dataset. */
const STAMP = '2026-09-26';

/**
 * Bump whenever the seed shape changes. `store.ts` discards any persisted file
 * whose version does not match, so a schema change can never boot into a
 * half-migrated database.
 */
export const SEED_VERSION = 3;

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */

/**
 * Demo directory. Passwords are only ever stored as scrypt hashes; the plaintext
 * below exists to be hashed once at seed time and is never written to disk.
 */
const SEED_USERS: User[] = [
  {
    id: 'U-1001',
    name: 'Rahul Sharma',
    email: 'demo@stocksense.app',
    role: 'Inventory Manager',
    title: 'Inventory Manager',
    initials: 'RS',
    auditorId: '8821',
    active: true,
  },
  {
    id: 'U-1002',
    name: 'Priya Patel',
    email: 'priya@stocksense.app',
    role: 'Warehouse Staff',
    title: 'Warehouse Associate',
    initials: 'PP',
    auditorId: '8834',
    active: true,
  },
  {
    id: 'U-1003',
    name: 'Arjun Verma',
    email: 'arjun@stocksense.app',
    role: 'Floor Supervisor',
    title: 'Floor Supervisor',
    initials: 'AV',
    auditorId: '8840',
    active: true,
  },
  {
    id: 'U-1004',
    name: 'Sana Kapoor',
    email: 'admin@stocksense.app',
    role: 'Admin',
    title: 'Systems Administrator',
    initials: 'SK',
    auditorId: '8801',
    active: true,
  },
];

const SEED_PASSWORDS: Record<string, string> = {
  'U-1001': 'Demo@1234',
  'U-1002': 'Demo@1234',
  'U-1003': 'Demo@1234',
  'U-1004': 'Admin@1234',
};

const SEED_CREDENTIALS: CredentialRecord[] = SEED_USERS.map((u) => ({
  userId: u.id,
  ...hashPassword(SEED_PASSWORDS[u.id] ?? 'Demo@1234'),
}));

/* ------------------------------------------------------------------ */
/* locations                                                           */
/* ------------------------------------------------------------------ */

const SEED_LOCATIONS: StorageLocation[] = [
  {
    code: 'WH/Stock',
    name: 'Main Stock Area',
    shortCode: 'STK-01',
    warehouse: 'WH-01',
    container: true,
    type: 'Internal Storage',
    skuCount: 6,
    maxLoad: '17,500 kg',
    status: 'Active',
  },
  {
    code: 'WH/Stock/Heavy-Rack-01',
    name: 'Heavy Pallet Rack 01',
    shortCode: 'HR-01',
    warehouse: 'WH-01',
    parent: 'WH/Stock',
    container: false,
    type: 'Heavy Floor',
    skuCount: 2,
    maxLoad: '12,500 kg',
    status: 'Active',
  },
  {
    code: 'WH/Stock/Bay-04',
    name: 'Main Stacks / Bay 04 / Shelf B',
    shortCode: 'B04-SB',
    warehouse: 'WH-01',
    parent: 'WH/Stock',
    container: false,
    type: 'Internal Storage',
    skuCount: 5,
    maxLoad: '5,000 kg',
    status: 'Active',
  },
  {
    code: 'WH-Rack-A',
    name: 'Heavy Materials Rack A',
    shortCode: 'RCK-A',
    warehouse: 'WH-01',
    container: true,
    type: 'Heavy Floor',
    skuCount: 2,
    maxLoad: '15,000 kg',
    status: 'Active',
  },
  {
    code: 'WH/Input',
    name: 'Inward Staging Dock',
    shortCode: 'IN-01',
    warehouse: 'WH-01',
    container: true,
    type: 'Inward Dock',
    skuCount: 1,
    maxLoad: 'Staging 48h',
    status: 'Receiving',
  },
  {
    code: 'WH/Output',
    name: 'Outward Dispatch',
    shortCode: 'OUT-01',
    warehouse: 'WH-01',
    container: true,
    type: 'Outward Pack',
    skuCount: 0,
    maxLoad: 'Ready',
    status: 'Ready',
  },
  {
    code: 'WH-Production',
    name: 'Production Staging',
    shortCode: 'PRD-01',
    warehouse: 'WH-03-PR',
    container: true,
    type: 'Internal Storage',
    skuCount: 1,
    maxLoad: '8,000 kg',
    status: 'Receiving',
  },
  {
    code: 'WH-Cold-Zone',
    name: 'Cold Chain Zone',
    shortCode: 'CLD-A',
    warehouse: 'WH-02-CS',
    container: true,
    type: 'Cold Chain',
    skuCount: 0,
    maxLoad: '2,200 kg',
    status: 'Chill Pass',
  },
  {
    code: 'WH/Quarantine',
    name: 'Quarantine & Inspection Hold',
    shortCode: 'QRN-01',
    warehouse: 'WH-01',
    container: false,
    type: 'Quarantine',
    skuCount: 0,
    maxLoad: '—',
    status: 'Locked',
  },
];

/* ------------------------------------------------------------------ */
/* products — exactly the ten catalogue items, with the canonical      */
/* reorder points and costs the dashboard KPIs are derived from.       */
/* ------------------------------------------------------------------ */

interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  unit: Product['unit'];
  unitCost: number;
  reorderPoint: number;
  reserved: number;
  icon: string;
  /** baseline on-hand at the start of the ledger, per location */
  opening: Array<[LocationCode, number]>;
}

const PRODUCT_SEED: ProductSeed[] = [
  {
    sku: 'STL-ROD-12',
    name: 'Steel Rods 12mm High Tensile',
    category: 'Raw Materials',
    unit: 'kg',
    unitCost: 1210,
    reorderPoint: 30,
    reserved: 0,
    icon: 'carpenter',
    opening: [],
  },
  {
    sku: 'DESK-CHR-01',
    name: 'Ergonomic Executive Desk',
    category: 'Furniture',
    unit: 'Units',
    unitCost: 10200,
    reorderPoint: 8,
    reserved: 6,
    icon: 'table_restaurant',
    opening: [['WH/Stock/Bay-04', 30]],
  },
  {
    sku: 'SSD-SAM-1TB',
    name: 'Samsung SSD 1TB',
    category: 'Computer Hardware',
    unit: 'Units',
    unitCost: 4300,
    reorderPoint: 10,
    reserved: 0,
    icon: 'memory',
    opening: [['WH/Stock/Bay-04', 40]],
  },
  {
    sku: 'RAM-KNG-16',
    name: 'Kingston DDR4 RAM 16GB',
    category: 'Computer Hardware',
    unit: 'Units',
    unitCost: 2300,
    reorderPoint: 12,
    reserved: 0,
    icon: 'developer_board',
    opening: [['WH/Stock/Bay-04', 48]],
  },
  {
    sku: 'MON-DEL-24',
    name: 'Dell UltraSharp 24" Monitor',
    category: 'Computer Hardware',
    unit: 'Units',
    unitCost: 11800,
    reorderPoint: 12,
    reserved: 0,
    icon: 'monitor',
    opening: [['WH/Stock/Bay-04', 9]],
  },
  {
    sku: 'SCN-IND-2D',
    name: 'Industrial 2D Barcode Scanner',
    category: 'Electronics',
    unit: 'Units',
    unitCost: 7900,
    reorderPoint: 10,
    reserved: 0,
    icon: 'qr_code_scanner',
    opening: [['WH-Rack-A', 20]],
  },
  {
    sku: 'ACC-LOG-M18',
    name: 'Logitech Wireless Mouse M185',
    category: 'Accessories',
    unit: 'Units',
    unitCost: 490,
    reorderPoint: 40,
    reserved: 0,
    icon: 'mouse',
    opening: [['WH/Stock/Bay-04', 32]],
  },
  {
    sku: 'CAB-CAT6-305',
    name: 'Cat6 Ethernet Cable 305m',
    category: 'Networking',
    unit: 'Rolls',
    unitCost: 1020,
    reorderPoint: 24,
    reserved: 2,
    icon: 'cable',
    opening: [['WH-Rack-A', 20]],
  },
  {
    sku: 'LBL-THM-406',
    name: 'Thermal Shipping Label Roll 4x6',
    category: 'Office Supplies',
    unit: 'Rolls',
    unitCost: 240,
    reorderPoint: 48,
    reserved: 0,
    icon: 'print',
    opening: [['WH/Stock/Bay-04', 40]],
  },
  {
    sku: 'COP-WIR-50',
    name: 'Heavy Copper Conduit 50m',
    category: 'Raw Materials',
    unit: 'Rolls',
    unitCost: 1250,
    reorderPoint: 8,
    reserved: 0,
    icon: 'cable',
    opening: [['WH-Rack-A', 18]],
  },
];

/* ------------------------------------------------------------------ */
/* documents                                                           */
/* ------------------------------------------------------------------ */

const SEED_RECEIPTS: Receipt[] = [
  {
    ref: 'RC-1001',
    supplier: 'Apex Metallurgical Ltd',
    supplierTier: 'Tier 1 Vendor',
    poRef: 'PO-2026-8891',
    bolRef: 'BOL-88421',
    destination: 'WH/Stock/Heavy-Rack-01',
    contact: 'Marcus Vance',
    scheduledDate: '2026-03-02 10:30',
    carrier: 'SwiftTrans Logistics #44',
    dockBay: 'BAY-02 North',
    status: 'Done',
    items: [
      {
        sku: 'STL-ROD-12',
        expected: 100,
        received: 100,
        bin: 'WH/Stock/Heavy-Rack-01',
        lot: 'HT-99120-X',
        barcode: '749021884102',
      },
    ],
    notes: 'Pallets intact (2/2). Zero transit damage. Security seal matched.',
    createdAt: '2026-03-02 08:15',
    createdBy: 'Rahul Sharma',
    postedAt: '2026-03-02 10:44',
  },
  {
    ref: 'RC-1002',
    supplier: 'LogiTech Dynamics',
    supplierTier: 'Tier 2 Vendor',
    poRef: 'PO-2026-8907',
    bolRef: 'BOL-88502',
    destination: 'WH-Rack-A',
    contact: 'Marcus Vance',
    scheduledDate: '2026-06-18 09:15',
    carrier: 'Internal Shuttle',
    dockBay: 'BAY-01 North',
    status: 'Done',
    items: [
      {
        sku: 'SCN-IND-2D',
        expected: 7,
        received: 7,
        bin: 'WH-Rack-A',
        lot: 'SC-1192',
        barcode: '4710781983211',
      },
    ],
    notes: 'Dock check-in complete. Carton count reconciled against BOL.',
    createdAt: '2026-06-18 07:20',
    createdBy: 'Priya Patel',
    postedAt: '2026-06-18 09:31',
  },
  {
    ref: 'RC-1003',
    supplier: 'Nordic Raw Materials',
    supplierTier: 'Unverified',
    poRef: 'PO-2026-8912',
    bolRef: '—',
    destination: 'WH/Input',
    contact: 'Elias Lind',
    scheduledDate: '2026-09-27 11:00',
    carrier: '—',
    dockBay: 'Unassigned',
    status: 'Draft',
    items: [
      {
        sku: 'COP-WIR-50',
        expected: 8,
        received: 0,
        bin: 'WH/Input',
        lot: 'PENDING',
        barcode: '—',
      },
    ],
    notes: 'Draft awaiting PO confirmation.',
    createdAt: '2026-09-25 07:02',
    createdBy: 'Priya Patel',
  },
  {
    ref: 'RC-1004',
    supplier: 'Precision Hydraulics',
    supplierTier: 'Tier 2 Vendor',
    poRef: 'PO-2026-8842',
    bolRef: 'BOL-88012',
    destination: 'WH/Stock/Bay-04',
    contact: 'David Klemper',
    scheduledDate: '2026-09-24 09:00',
    carrier: 'Internal Shuttle',
    dockBay: 'Unassigned',
    status: 'Waiting',
    items: [
      {
        sku: 'RAM-KNG-16',
        expected: 24,
        received: 0,
        bin: 'WH/Stock/Bay-04',
        lot: 'RAM-4410',
        barcode: '0742533912665',
      },
    ],
    notes: 'Inbound on schedule. Awaiting dock assignment.',
    createdAt: '2026-09-22 10:00',
    createdBy: 'Rahul Sharma',
  },
];

const SEED_DELIVERIES: Delivery[] = [
  {
    ref: 'WH/OUT/0001',
    from: 'WH-Production',
    to: 'Azure Interior',
    contact: 'Marcus Vance',
    address: '452 Industrial Parkway, Sector 9',
    scheduledDate: '2026-03-04 14:00',
    carrier: 'BlueDart Express',
    status: 'Done',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'STL-ROD-12', qty: 20, bin: 'WH-Production' }],
    notes: 'Dispatch validated against released work order. POD captured.',
    createdAt: '2026-03-04 07:40',
    createdBy: 'Rahul Sharma',
    postedAt: '2026-03-04 15:12',
  },
  {
    ref: 'WH/OUT/0002',
    from: 'WH/Stock/Bay-04',
    to: 'Deco Addict',
    contact: 'Elias Lind',
    address: '7 Riverside Design Park',
    scheduledDate: '2026-05-11 09:00',
    carrier: 'DHL Express',
    status: 'Done',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'DESK-CHR-01', qty: 6, bin: 'B04-SB' }],
    notes: 'Delivered and signed off.',
    createdAt: '2026-05-11 08:05',
    createdBy: 'Arjun Verma',
    postedAt: '2026-05-11 11:40',
  },
  {
    ref: 'WH/OUT/0003',
    from: 'WH/Stock/Bay-04',
    to: 'TechNova Global',
    contact: 'Rachel Green',
    address: 'Unit 22, Tech Park Block C',
    scheduledDate: '2026-07-02 11:30',
    carrier: 'FedEx Freight',
    status: 'Done',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'SSD-SAM-1TB', qty: 2, bin: 'B04-SB' }],
    notes: 'Delivered and signed off.',
    createdAt: '2026-07-02 09:30',
    createdBy: 'Arjun Verma',
    postedAt: '2026-07-02 14:05',
  },
  {
    ref: 'WH/OUT/0004',
    from: 'WH-Rack-A',
    to: 'Lumber & Co',
    contact: 'Nathan Brooks',
    address: '88 Sawmill Road',
    scheduledDate: '2026-08-14 10:15',
    carrier: 'Internal Shuttle',
    status: 'Done',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'COP-WIR-50', qty: 2, bin: 'Bay 02-Rack 09' }],
    notes: 'Delivered and signed off.',
    createdAt: '2026-08-14 08:00',
    createdBy: 'Arjun Verma',
    postedAt: '2026-08-14 12:22',
  },
  {
    ref: 'WH/OUT/0005',
    from: 'WH/Stock/Bay-04',
    to: 'Azure Interior',
    contact: 'Sarah Connor',
    address: '452 Industrial Parkway, Sector 9',
    scheduledDate: '2026-09-27 16:30',
    carrier: 'Unassigned',
    status: 'Draft',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'LBL-THM-406', qty: 6, bin: 'B04-SB' }],
    notes: 'Draft — awaiting stock release.',
    createdAt: '2026-09-25 09:12',
    createdBy: 'Priya Patel',
  },
  {
    ref: 'WH/OUT/0006',
    from: 'WH/Stock/Bay-04',
    to: 'Northwind Retail',
    contact: 'Liam Davies',
    address: '3 Harbour Freight Terminals',
    scheduledDate: '2026-09-26 13:00',
    carrier: 'BlueDart Express',
    status: 'Ready',
    operationType: 'WH: Delivery Orders (Sales Orders)',
    items: [{ sku: 'ACC-LOG-M18', qty: 8, bin: 'B04-SB' }],
    notes: 'Reserved and staged for afternoon collection.',
    createdAt: '2026-09-26 08:05',
    createdBy: 'Priya Patel',
  },
];

const SEED_TRANSFERS: Transfer[] = [
  {
    ref: 'TR-2001',
    from: 'WH/Stock/Heavy-Rack-01',
    to: 'WH-Production',
    sku: 'STL-ROD-12',
    qty: 100,
    requestedBy: 'Priya Patel',
    status: 'Done',
    scheduledDate: '2026-03-02 11:20',
    createdAt: '2026-03-02 11:20',
    postedAt: '2026-03-02 12:05',
  },
  {
    ref: 'TR-2002',
    from: 'WH/Stock',
    to: 'WH-Production',
    sku: 'DESK-CHR-01',
    qty: 4,
    requestedBy: 'Rahul Sharma',
    status: 'Waiting',
    scheduledDate: '2026-09-26 15:00',
    createdAt: '2026-09-26 07:30',
  },
  {
    ref: 'TR-2003',
    from: 'WH/Input',
    to: 'WH/Quarantine',
    sku: 'COP-WIR-50',
    qty: 4,
    requestedBy: 'Priya Patel',
    status: 'Draft',
    scheduledDate: '2026-09-28 10:00',
    createdAt: '2026-09-25 16:20',
  },
];

const SEED_ADJUSTMENTS: Adjustment[] = [
  {
    ref: 'ADJ-4001',
    sku: 'STL-ROD-12',
    location: 'WH-Production',
    recorded: 80,
    counted: 77,
    delta: -3,
    reason: 'Scrap / Wear & Tear',
    memo: 'Physical count confirmed twice via mechanical scales. Scrap rods set aside for salvage logging.',
    auditor: 'Rahul Sharma',
    state: 'Posted',
    valuationImpact: -3630,
    createdAt: '2026-03-04 16:40',
    postedAt: '2026-03-05 09:10',
  },
  {
    ref: 'ADJ-4002',
    sku: 'COP-WIR-50',
    location: 'WH-Rack-A',
    recorded: 18,
    counted: 16,
    delta: -2,
    reason: 'Incorrect Entry / Counting Error',
    memo: 'Cycle count found 2 spools recorded in Bay 02 that are physically in Bay 09. Re-binned during the count.',
    auditor: 'Priya Patel',
    state: 'Pending Approval',
    valuationImpact: 0,
    createdAt: '2026-09-26 09:31',
  },
];

/* ------------------------------------------------------------------ */
/* derivation: the ledger is the source of truth, `stock` falls out    */
/* ------------------------------------------------------------------ */

interface Move {
  type: LedgerType;
  ref: string;
  sku: string;
  at: string;
  from: string;
  to: string;
  /** physical quantity moved; negative for a dispatch, positive for a receipt */
  qty: number;
  /**
   * Signed effect on the *global* balance. Differs from `qty` for a transfer,
   * which relocates stock and is therefore always 0.
   */
  delta: number;
  user: string;
  note: string;
}

const OPENING_MOVES: Move[] = PRODUCT_SEED.flatMap((p) =>
  p.opening.map(([loc, qty]) => ({
    type: 'OPENING' as const,
    ref: 'OPENING-BALANCE',
    sku: p.sku,
    at: '2026-01-01 00:00:00',
    from: 'Opening balance',
    to: loc,
    qty,
    delta: qty,
    user: 'System',
    note: `Opening book balance carried forward from FY2025-26.`,
  })),
);

const DOCUMENT_MOVES: Move[] = [
  ...SEED_RECEIPTS.filter((r) => r.status === 'Done').flatMap((r) =>
    r.items.map((line) => ({
      type: 'RECEIPT' as const,
      ref: r.ref,
      sku: line.sku,
      at: r.postedAt ?? r.createdAt,
      from: r.supplier,
      to: line.bin,
      qty: line.received,
      delta: line.received,
      user: r.createdBy,
      note: 'Goods received note posted.',
    })),
  ),
  ...SEED_TRANSFERS.filter((t) => t.status === 'Done').map((t) => ({
    type: 'TRANSFER' as const,
    ref: t.ref,
    sku: t.sku,
    at: t.createdAt,
    from: t.from,
    to: t.to,
    qty: t.qty,
    // A relocation adds nothing to the enterprise-wide balance.
    delta: 0,
    user: t.requestedBy,
    note: 'Relocation — net-zero effect on the global balance.',
  })),
  ...SEED_DELIVERIES.filter((d) => d.status === 'Done').flatMap((d) =>
    d.items.map((line) => ({
      type: 'DELIVERY' as const,
      ref: d.ref,
      sku: line.sku,
      at: d.postedAt ?? d.createdAt,
      from: d.from,
      to: d.to,
      qty: -line.qty,
      delta: -line.qty,
      user: d.createdBy,
      note: 'Dispatch validated, POD captured.',
    })),
  ),
  ...SEED_ADJUSTMENTS.filter((a) => a.state === 'Posted').map((a) => ({
    type: 'ADJUSTMENT' as const,
    ref: a.ref,
    sku: a.sku,
    at: a.postedAt ?? a.createdAt,
    from: a.location,
    to: a.location,
    qty: a.delta,
    delta: a.delta,
    user: a.auditor,
    note: a.memo,
  })),
];

/**
 * Replays every opening balance and posted document in timestamp order to
 * produce the ledger, then folds the ledger into per-location on-hand. Both are
 * produced from the same move list, so a hand-edited product count can never
 * drift from the movement history.
 */
function derive(moves: Move[]): { ledger: LedgerEntry[]; stock: Record<string, Record<string, number>> } {
  const nameOf = (sku: string) => PRODUCT_SEED.find((p) => p.sku === sku)?.name ?? sku;
  const ordered = [...moves].sort((a, b) => a.at.localeCompare(b.at));
  const known = new Set<string>(SEED_LOCATIONS.map((l) => l.code));

  const ledger: LedgerEntry[] = [];
  const stock: Record<string, Record<string, number>> = {};
  const running = new Map<string, number>();

  ordered.forEach((m, i) => {
    /** Credit a location, ignoring counterparties like suppliers and customers. */
    const move = (loc: string, delta: number) => {
      if (!known.has(loc) || delta === 0) return;
      const bucket = (stock[m.sku] ??= {});
      bucket[loc] = (bucket[loc] ?? 0) + delta;
    };

    switch (m.type) {
      case 'OPENING':
        move(m.to, m.qty);
        break;
      case 'RECEIPT':
        move(m.to, m.qty);
        break;
      case 'DELIVERY':
        move(m.from, m.qty);
        break;
      case 'TRANSFER':
        move(m.from, -m.qty);
        move(m.to, m.qty);
        break;
      case 'ADJUSTMENT':
        move(m.from, m.qty);
        break;
    }

    const balance = (running.get(m.sku) ?? 0) + m.delta;
    running.set(m.sku, balance);

    ledger.push({
      id: `LG-${String(i + 1).padStart(4, '0')}`,
      timestamp: m.at,
      type: m.type,
      ref: m.ref,
      sku: m.sku,
      name: nameOf(m.sku),
      delta: m.delta,
      from: m.from,
      to: m.to,
      balanceAfter: balance,
      user: m.user,
      note: m.note,
    });
  });

  // newest first, which is the order every screen reads the ledger in
  return { ledger: ledger.reverse(), stock };
}

export function buildSeed(): Database {
  const { ledger, stock } = derive([...OPENING_MOVES, ...DOCUMENT_MOVES]);

  const products: Product[] = PRODUCT_SEED.map((p, i) => ({
    id: `PROD-${String(i + 1).padStart(2, '0')}`,
    name: p.name,
    sku: p.sku,
    category: p.category,
    unit: p.unit,
    unitCost: p.unitCost,
    reorderPoint: p.reorderPoint,
    reserved: p.reserved,
    // Only list locations that actually hold stock, so a product's map reads as
    // "where is it" rather than "every location it ever passed through".
    stock: Object.fromEntries(
      Object.entries(stock[p.sku] ?? {}).filter(([, qty]) => qty !== 0),
    ),
    icon: p.icon,
  }));

  return {
    version: SEED_VERSION,
    settings: {
      valuationMethod: 'FIFO',
      removalStrategy: 'FIFO',
      preventNegativeStock: true,
      dualSignoffThreshold: 5000,
      dualSignoffVariancePct: 2.5,
      currency: '₹',
    },
    // The engine mutates documents in place when it posts them. Handing out the
    // module-level arrays directly would let those writes reach back into the
    // seed, so every reset would "restore" already-corrupted data.
    users: structuredClone(SEED_USERS),
    credentials: structuredClone(SEED_CREDENTIALS),
    warehouses: [
      {
        code: 'WH-01',
        name: 'Central Warehouse',
        type: 'Main Fulfillment',
        address: '104 Logistics Parkway, Industrial Sector 4, North Cargo Gate',
        manager: 'Rahul S.',
        capacityUsedPct: 78,
        locationCount: 6,
      },
      {
        code: 'WH-02-CS',
        name: 'Cold Storage Zone A',
        type: 'Cold Chain',
        address: 'Pier 9 Cold Chain Facility, Berth 3',
        manager: 'Elena Rostova',
        capacityUsedPct: 31,
        locationCount: 1,
      },
      {
        code: 'WH-03-PR',
        name: 'Production Inward Staging',
        type: 'Transit Hub',
        address: 'Plant 2 Assembly Wing, Sector B',
        manager: 'K. Tanaka',
        capacityUsedPct: 64,
        locationCount: 1,
      },
    ],
    locations: structuredClone(SEED_LOCATIONS),
    products,
    receipts: structuredClone(SEED_RECEIPTS),
    deliveries: structuredClone(SEED_DELIVERIES),
    transfers: structuredClone(SEED_TRANSFERS),
    adjustments: structuredClone(SEED_ADJUSTMENTS),
    ledger,
  };
}

export { STAMP };
