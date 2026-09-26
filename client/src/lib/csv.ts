/** Real CSV export. No fake download, no fake PDF. */

function escapeCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'number'
        ? String(value)
        : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: { key: string; label: string }[],
  rows: Record<string, string | number>[],
): string {
  const head = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  // A BOM keeps Excel happy with the ₹ sign and non-ASCII names.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stampForFile(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
