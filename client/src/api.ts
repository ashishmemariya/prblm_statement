import type {
  AdjustmentReason,
  Delivery,
  DiagnosticsReport,
  DirectoryEntry,
  Product,
  Receipt,
  SessionInfo,
  Snapshot,
  StorageLocation,
} from './types';

const BASE = '/api';
const TOKEN_KEY = 'stocksense.token';

export class ApiError extends Error {
  status: number;
  blockers: string[];
  constructor(status: number, message: string, blockers: string[] = []) {
    super(message);
    this.status = status;
    this.blockers = blockers;
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — session simply will not persist */
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; blockers?: string[] };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.blockers ?? []);
  }
  return (await res.json()) as T;
}

const get = <T,>(path: string) => req<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = <T,>(path: string, body: unknown) =>
  req<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};

export const api = {
  /* ---- auth ---- */
  login: (email: string, password: string) =>
    post<{ token: string; user: SessionInfo['user']; permissions: SessionInfo['permissions'] }>(
      '/auth/login',
      { email, password },
    ),
  logout: () => post<{ ok: true }>('/auth/logout'),
  session: () => get<SessionInfo>('/auth/session'),
  directory: () => get<DirectoryEntry[]>('/auth/directory'),
  diagnostics: () => get<DiagnosticsReport>('/diagnostics'),

  /* ---- data ---- */
  snapshot: () => get<Snapshot>('/snapshot'),
  reset: () => post<{ ok: true }>('/reset'),
  users: () => get<Snapshot['users']>('/users'),

  products: (f?: { q?: string; category?: string; status?: string }) =>
    get<Product[]>(`/products${q({ ...f })}`),
  product: (sku: string) => get<Product>(`/products/${encodeURIComponent(sku)}`),
  categories: () => get<string[]>('/categories'),

  receipts: (status?: string) => get<Receipt[]>(`/receipts${q({ status })}`),
  receipt: (ref: string) => get<Receipt>(`/receipt${q({ ref })}`),
  // The server attributes the movement to the signed-in user; `user` is accepted
  // only so existing call sites keep compiling.
  validateReceipt: (ref: string, _user?: string) =>
    post<{ ok: true; receipt: Receipt }>(`/receipt/validate${q({ ref })}`),

  deliveries: (status?: string) => get<Delivery[]>(`/deliveries${q({ status })}`),
  delivery: (ref: string) => get<Delivery>(`/delivery${q({ ref })}`),
  validateDelivery: (ref: string, _user?: string) =>
    post<{ ok: true; delivery: Delivery }>(`/delivery/validate${q({ ref })}`),

  transfers: () => get<Snapshot['transfers']>('/transfers'),
  createTransfer: (body: { from: string; to: string; sku: string; qty: number }) =>
    post<Snapshot['transfers'][number]>('/transfers', body),
  executeTransfer: (ref: string, _user?: string) =>
    post<{ ok: true; transfer: Snapshot['transfers'][number] }>(`/transfer/execute${q({ ref })}`),

  adjustments: () => get<Snapshot['adjustments']>('/adjustments'),
  createCount: (body: {
    sku: string;
    location: string;
    recorded: number;
    counted: number;
    reason: string;
    memo: string;
  }) => post<Snapshot['adjustments'][number]>('/adjustments', body),
  postAdjustment: (body: {
    ref: string;
    counted: number;
    reason: AdjustmentReason;
    memo: string;
  }) => post<{ ok: true; adjustment: Snapshot['adjustments'][number] }>(`/adjustment/post${q({ ref: body.ref })}`, body),

  ledger: (f?: { type?: string; sku?: string }) => get<Snapshot['ledger']>(`/ledger${q({ ...f })}`),

  warehouses: () => get<Snapshot['warehouses']>('/warehouses'),
  locations: () => get<StorageLocation[]>('/locations'),

  settings: () => get<Snapshot['settings']>('/settings'),
  saveSettings: (body: Partial<Snapshot['settings']>) => patch<Snapshot['settings']>('/settings', body),

    runScenario: () =>
      post<{ action: string; message: string; ref: string }>('/scenario/run'),
    startDrill: () =>
      post<{ rewound: number; entries: number; balance: number; message: string }>(
        '/scenario/start-drill',
      ),
  };
