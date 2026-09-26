/**
 * Timestamp helpers.
 *
 * Every timestamp in the database is a naive local ISO string
 * (`2026-09-26T09:20`). Naive ISO sorts lexicographically, so ordering,
 * range filters and "is this late?" comparisons are all plain string work.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function now(now: Date = new Date()): string {
  return `${dateOnly(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function stamp(d: Date = new Date()): string {
  return `${now(d)}:${pad(d.getSeconds())}`;
}

export function dateOnly(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(base: string, days: number): string {
  const d = new Date(`${base.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateOnly(d);
}

export function atTime(date: string, time: string): string {
  return `${date}T${time}`;
}

export function dayOf(value: string): string {
  return value.slice(0, 10);
}

/** 0 = same day, negative = in the past. */
export function daysFromToday(value: string, today = dateOnly()): number {
  const a = new Date(`${dayOf(value)}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function isLate(scheduled: string, today = dateOnly()): boolean {
  return dayOf(scheduled) < today;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Rounds away float noise from repeated add/subtract so no screen shows 3.0000000000004. */
export function qty(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
