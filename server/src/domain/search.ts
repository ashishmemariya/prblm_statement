/**
 * Grouped global search across every entity a user can navigate to.
 */
import { getDb } from '../store.js';
import { onHand, available } from './stock.js';

export interface SearchHit {
  group: 'Products' | 'Operations' | 'Warehouses' | 'Locations';
  id: string;
  title: string;
  subtitle: string;
  ref: string;
  link: string;
  meta?: string;
}

function hit(group: SearchHit['group'], id: string, title: string, subtitle: string, link: string, ref: string, meta?: string): SearchHit {
  return { group, id, title, subtitle, link, ref, meta };
}

export function search(query: string, limitPerGroup = 6): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const db = getDb();
  const contains = (haystack: string) => haystack.toLowerCase().includes(q);

  const products: SearchHit[] = db.products
    .filter((p) => contains(p.name) || contains(p.sku) || contains(p.barcode) || contains(p.category))
    .slice(0, limitPerGroup)
    .map((p) =>
      hit(
        'Products',
        p.sku,
        p.name,
        `${p.sku} · ${p.category}`,
        `/products/${p.sku}`,
        p.sku,
        `${onHand(p)} ${p.uom} on hand · ${available(p)} ${p.uom} available`,
      ),
    );

  const operations: SearchHit[] = [
    ...db.receipts
      .filter((r) => contains(r.ref) || contains(r.supplier) || contains(r.poRef) || contains(r.bolRef))
      .slice(0, limitPerGroup)
      .map((r) =>
        hit('Operations', r.ref, `Receipt ${r.ref}`, `${r.supplier} · ${r.status}`, `/receipts/${r.ref}`, r.ref, r.destination),
      ),
    ...db.deliveries
      .filter((d) => contains(d.ref) || contains(d.customer) || contains(d.contact))
      .slice(0, limitPerGroup)
      .map((d) =>
        hit('Operations', d.ref, `Delivery ${d.ref}`, `${d.customer} · ${d.status}`, `/deliveries/${d.ref}`, d.ref, d.from),
      ),
    ...db.transfers
      .filter((t) => contains(t.ref) || t.lines.some((l) => contains(l.sku)))
      .slice(0, limitPerGroup)
      .map((t) =>
        hit('Operations', t.ref, `Transfer ${t.ref}`, `${t.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ')}`, `/transfers/${t.ref}`, t.ref, `${t.from} → ${t.to}`),
      ),
    ...db.adjustments
      .filter((a) => contains(a.ref) || contains(a.sku) || contains(a.location))
      .slice(0, limitPerGroup)
      .map((a) =>
        hit('Operations', a.ref, `Adjustment ${a.ref}`, `${a.sku} · ${a.reason}`, `/adjustments/${a.ref}`, a.ref, a.status),
      ),
    ...db.counts
      .filter((c) => contains(c.ref) || contains(c.assignedTo))
      .slice(0, limitPerGroup)
      .map((c) =>
        hit('Operations', c.ref, `Count ${c.ref}`, `${c.assignedTo} · ${c.status}`, `/counts/${c.ref}`, c.ref, c.location),
      ),
  ];

  const warehouses: SearchHit[] = db.warehouses
    .filter((w) => contains(w.name) || contains(w.code) || contains(w.manager))
    .map((w) => hit('Warehouses', w.code, w.name, `${w.code} · ${w.manager}`, `/warehouses/${w.code}`, w.code, w.address));

  const locations: SearchHit[] = db.locations
    .filter((l) => contains(l.name) || contains(l.code))
    .slice(0, limitPerGroup)
    .map((l) => hit('Locations', l.code, l.name, `${l.code} · ${l.container ? 'Zone' : 'Storage location'}`, `/locations/${l.code}`, l.code, l.warehouse));

  return [...products, ...operations, ...warehouses, ...locations];
}
