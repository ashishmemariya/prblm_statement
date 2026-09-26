/**
 * Client service layer.
 *
 * Components call these; they never build a URL or interpret a payload. The
 * server remains the only place a business number is produced.
 */
import { get, patch, post, qs, seg } from '../http';
import type {
  Adjustment,
  AdjustmentReason,
  Count,
  Delivery,
  DeliveryStatus,
  DiagnosticsReport,
  DirectoryEntry,
  LedgerEntry,
  LedgerSummary,
  LocationNode,
  LocationSummary,
  Product,
  ProfileInfo,
  Receipt,
  ReceiptStatus,
  ReportResult,
  SearchHit,
  Settings,
  Snapshot,
  Transfer,
  TransferStatus,
  WarehouseSummary,
} from '../types';

export const authService = {
  login: (email: string, password: string) =>
    post<{ token: string; user: ProfileInfo['user']; permissions: ProfileInfo['permissions'] }>(
      '/auth/login',
      { email, password },
    ),
  logout: () => post<{ ok: true }>('/auth/logout'),
  session: () => get<{ user: ProfileInfo['user']; permissions: ProfileInfo['permissions']; roleSummary: string }>('/auth/session'),
  directory: () => get<DirectoryEntry[]>('/auth/directory'),
  forgotPassword: (email: string) => post<{ ok: true; message: string }>('/auth/forgot-password', { email }),
};

export const productService = {
  list: () => get<Product[]>('/products'),
  get: (sku: string) => get<Product>(`/products/${seg(sku)}`),
  categories: () => get<string[]>('/categories'),
  units: () => get<string[]>('/units'),
};

export const inventoryService = {
  byLocation: () => get<LocationSummary[]>('/inventory'),
  location: (code: string) => get<LocationNode>(`/locations/${seg(code)}`),
  warehouses: () => get<WarehouseSummary[]>('/warehouses'),
  warehouse: (code: string) => get<WarehouseSummary & { locations: LocationNode[]; receipts: Receipt[]; deliveries: Delivery[]; transfers: Transfer[]; counts: Count[]; activity: { id: string; at: string; summary: string; detail: string; user: string; severity: string; ref: string }[] }>(`/warehouses/${seg(code)}`),
};

export const receiptService = {
  list: () => get<Receipt[]>('/receipts'),
  get: (ref: string) => get<Receipt>(`/receipts/${seg(ref)}`),
  create: (body: {
    supplier: string;
    poRef?: string;
    bolRef?: string;
    contact?: string;
    destination: string;
    scheduledDate: string;
    carrier?: string;
    dockBay?: string;
    notes?: string;
    lines: { sku: string; expected: number; bin?: string; lot?: string }[];
  }) => post<Receipt>('/receipts', body),
  update: (
    ref: string,
    body: {
      supplier?: string;
      poRef?: string;
      bolRef?: string;
      contact?: string;
      carrier?: string;
      dockBay?: string;
      notes?: string;
      scheduledDate?: string;
      lines?: { id: string; received?: number; expected?: number; bin?: string; lot?: string }[];
      add?: { sku: string; expected: number; bin?: string; lot?: string }[];
    },
  ) => patch<Receipt>(`/receipts/${seg(ref)}`, body),
  setStatus: (ref: string, to: ReceiptStatus) => post<Receipt>(`/receipts/${seg(ref)}/status`, { to }),
};

export const deliveryService = {
  list: () => get<Delivery[]>('/deliveries'),
  get: (ref: string) => get<Delivery>(`/deliveries/${seg(ref)}`),
  create: (body: {
    customer: string;
    contact?: string;
    address?: string;
    from: string;
    scheduledDate: string;
    carrier?: string;
    notes?: string;
    lines: { sku: string; qty: number; bin?: string }[];
  }) => post<Delivery>('/deliveries', body),
  pick: (ref: string, lineId: string, picked: number) =>
    post<Delivery>(`/deliveries/${seg(ref)}/pick`, { lineId, picked }),
  setStatus: (ref: string, to: DeliveryStatus) => post<Delivery>(`/deliveries/${seg(ref)}/status`, { to }),
};

export const transferService = {
  list: () => get<Transfer[]>('/transfers'),
  get: (ref: string) => get<Transfer>(`/transfers/${seg(ref)}`),
  preview: (from: string, to: string, lines: { sku: string; qty: number }[]) =>
    post<{ lines: { sku: string; name: string; uom: string; qty: number; availableAtSource: number; remainingAtSource: number; canMove: boolean }[]; enterpriseBefore: number; enterpriseAfter: number }>('/transfers/preview', { from, to, lines }),
  create: (body: { from: string; to: string; lines: { sku: string; qty: number }[]; reason?: string }) =>
    post<Transfer>('/transfers', body),
  setStatus: (ref: string, to: TransferStatus) => post<Transfer>(`/transfers/${seg(ref)}/status`, { to }),
};

export const adjustmentService = {
  list: () => get<Adjustment[]>('/adjustments'),
  get: (ref: string) => get<Adjustment>(`/adjustments/${seg(ref)}`),
  create: (body: { sku: string; location: string; counted: number; reason: AdjustmentReason; notes?: string; countRef?: string }) =>
    post<Adjustment>('/adjustments', body),
  update: (ref: string, body: { counted?: number; reason?: AdjustmentReason; notes?: string; location?: string }) =>
    patch<Adjustment>(`/adjustments/${seg(ref)}`, body),
  setStatus: (ref: string, to: Adjustment['status']) => post<Adjustment>(`/adjustments/${seg(ref)}/status`, { to }),
};

export const countService = {
  list: () => get<Count[]>('/counts'),
  get: (ref: string) => get<Count>(`/counts/${seg(ref)}`),
  staff: () => get<{ name: string; role: string; title: string }[]>('/counts/staff'),
  create: (body: { warehouse: string; location?: string; category?: string; assignedTo: string; dueDate: string; notes?: string }) =>
    post<Count>('/counts', body),
  record: (ref: string, lineId: string, counted: number | null, note: string) =>
    post<Count>(`/counts/${seg(ref)}/line`, { lineId, counted, note }),
  setStatus: (ref: string, to: Count['status']) => post<Count>(`/counts/${seg(ref)}/status`, { to }),
  raiseAdjustments: (ref: string) => post<Adjustment[]>(`/counts/${seg(ref)}/raise-adjustments`),
};

export const ledgerService = {
  list: () => get<LedgerEntry[]>('/moves'),
  summary: () => get<LedgerSummary>('/moves-summary'),
  get: (id: string) =>
    get<{ entry: LedgerEntry; siblings: LedgerEntry[]; beforeAfter: { before: number; after: number } | null }>(
      `/moves/${seg(id)}`,
    ),
};

export const notificationService = {
  list: () => get<{ items: Snapshot['notifications']; read: string[] }>('/notifications'),
  markRead: (id: string) => post<{ read: string[] }>(`/notifications/${seg(id)}/read`),
  markAllRead: () => post<{ read: string[] }>('/notifications/read-all'),
};

export const reportService = {
  list: () => get<Snapshot['reports']>('/reports'),
  run: (id: string, filter: { from?: string; to?: string; warehouse?: string; category?: string; sku?: string }) =>
    get<ReportResult>(`/reports/${seg(id)}${qs(filter)}`),
};

export const searchService = {
  query: (q: string) => get<{ query: string; groups: SearchHit[] }>(`/search${qs({ q })}`),
};

export const settingsService = {
  get: () => get<Settings>('/settings'),
  save: (body: Partial<Settings>) => patch<Settings>('/settings', body),
};

export const profileService = {
  get: () => get<ProfileInfo>('/profile'),
};

export const diagnosticsService = {
  get: () => get<DiagnosticsReport>('/diagnostics'),
};

export const demoService = {
  snapshot: () => get<Snapshot>('/snapshot'),
  dashboard: () => get<Snapshot['dashboard']>('/dashboard'),
  reset: () => post<{ ok: true; message: string }>('/reset'),
};
