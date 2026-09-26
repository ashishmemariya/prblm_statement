import type { Severity, Tone } from '../types';

/* ------------------------------------------------------------ quantities */

/** Never renders `undefined`, `null` or `NaN` for a quantity. */
export function qty(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return Math.round(value * 1000) / 1000;
}

export function qtyText(value: number | null | undefined, unit?: string): string {
  const n = qty(value);
  const text = Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return unit ? `${text} ${unit}` : text;
}

export function signed(value: number | null | undefined): string {
  const n = qty(value);
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-IN')}`;
}

/* ---------------------------------------------------------------- money */

export function money(value: number | null | undefined, currency = '₹', compact = false): string {
  const n = qty(value);
  if (compact) {
    if (Math.abs(n) >= 1e7) return `${currency}${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `${currency}${(n / 1e5).toFixed(2)} L`;
    if (Math.abs(n) >= 1e3) return `${currency}${(n / 1e3).toFixed(1)} K`;
  }
  return `${currency}${Math.round(n).toLocaleString('en-IN')}`;
}

export function percent(value: number | null | undefined): string {
  return `${qty(value, 0)}%`;
}

/* ---------------------------------------------------------------- dates */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-26T09:20` → `26 Sep, 09:20` */
export function stamp(value: string | null | undefined): string {
  if (!value || value.length < 10) return '—';
  const day = value.slice(8, 10);
  const month = MONTHS[Number(value.slice(5, 7)) - 1] ?? '';
  const year = value.slice(0, 4);
  const time = value.length > 10 ? value.slice(11, 16) : '';
  return `${day} ${month} ${year}${time ? `, ${time}` : ''}`;
}

export function timeOnly(value: string | null | undefined): string {
  if (!value || value.length < 16) return '—';
  return value.slice(11, 16);
}

export function dateOnly(value: string | null | undefined): string {
  if (!value || value.length < 10) return '—';
  const month = MONTHS[Number(value.slice(5, 7)) - 1] ?? '';
  return `${value.slice(8, 10)} ${month} ${value.slice(0, 4)}`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value || value.length < 10) return '—';
  return `${value.slice(8, 10)} ${MONTHS[Number(value.slice(5, 7)) - 1] ?? ''}`;
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return today2(d);
}

function today2(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfMonth(date = today()): string {
  return `${date.slice(0, 7)}-01`;
}

/* --------------------------------------------------------------- status */

type StatusMap = Record<string, Tone>;

const STATUS_TONES: StatusMap = {
  // receipts
  Draft: 'neutral',
  Waiting: 'warning',
  Ready: 'info',
  Done: 'success',
  Canceled: 'neutral',
  // deliveries
  Picking: 'info',
  Packed: 'primary',
  // transfers
  'In Transit': 'warning',
  // adjustments
  'Pending Approval': 'warning',
  Approved: 'info',
  Posted: 'success',
  Rejected: 'danger',
  // counts
  Scheduled: 'neutral',
  'In Progress': 'info',
  Completed: 'success',
  // health
  IN_STOCK: 'success',
  LOW: 'warning',
  OUT: 'danger',
  // generic
  Active: 'success',
  Blocked: 'danger',
  'Pending Approval Required': 'warning',
  Healthy: 'success',
  Busy: 'warning',
  Critical: 'danger',
  Reorder: 'warning',
  'Out of stock': 'danger',
  'Low stock': 'warning',
  RECEIPT: 'success',
  DELIVERY: 'danger',
  TRANSFER: 'info',
  ADJUSTMENT: 'warning',
  OPENING: 'neutral',
};

export function statusTone(value: string): Tone {
  return STATUS_TONES[value] ?? 'neutral';
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink border-neutral-border',
  info: 'bg-info-soft text-info-ink border-info-border',
  success: 'bg-success-soft text-success-ink border-success-border',
  warning: 'bg-warning-soft text-warning-ink border-warning-border',
  danger: 'bg-danger-soft text-danger-ink border-danger-border',
  primary: 'bg-primary-soft text-primary border-primary-border',
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-text-subtle',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
};

export const TONE_ICON: Record<Tone, string> = {
  neutral: 'circle',
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  danger: 'cancel',
  primary: 'arrow_forward',
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'danger',
};

export const SEVERITY_BAR: Record<Severity, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-danger',
};

export const LEDGER_ICON: Record<string, string> = {
  OPENING: 'flag',
  RECEIPT: 'south_west',
  DELIVERY: 'north_east',
  TRANSFER: 'compare_arrows',
  ADJUSTMENT: 'rule',
};

export const LEDGER_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  RECEIPT: 'Received',
  DELIVERY: 'Delivered',
  TRANSFER: 'Transferred',
  ADJUSTMENT: 'Adjusted',
};

export const LOCATION_ICON: Record<string, string> = {
  Receiving: 'move_to_inbox',
  Storage: 'shelves',
  'Heavy Rack': 'forklift',
  Assembly: 'handyman',
  Packing: 'inventory_2',
  Dispatch: 'outbox',
};

export const ROLE_ICON: Record<string, string> = {
  Admin: 'admin_panel_settings',
  'Inventory Manager': 'inventory',
  'Warehouse Staff': 'front_hand',
  Viewer: 'visibility',
};

/** Human label for a raw location code. */
export function locationLabel(code: string, name?: string): string {
  if (name) return name;
  return code;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
