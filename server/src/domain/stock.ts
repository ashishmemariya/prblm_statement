/**
 * The only place stock is read or written.
 *
 * Invariant enforced here: quantities live on LEAF locations. Containers have
 * no balance of their own — their figure is the sum of their subtree. Every
 * posting path goes through `credit` / `debit`, so a container can never
 * double count a bin.
 */
import { getDb } from '../store.js';
import { qty as round } from '../datetime.js';
import { badRequest, notFound } from '../errors.js';
import type { Health, Location, Product } from '../types.js';

/* --------------------------------------------------------- location graph */

export function allLocations(): Location[] {
  return getDb().locations;
}

export function findLocation(code: string): Location | undefined {
  return getDb().locations.find((l) => l.code === code);
}

export function requireLocation(code: string): Location {
  const loc = findLocation(code);
  if (!loc) {
    throw badRequest(
      `“${code}” is not a location in this network. Pick a location from the list.`,
    );
  }
  return loc;
}

export function childrenOf(code: string): Location[] {
  return getDb().locations.filter((l) => l.parent === code);
}

/** The node plus every descendant. */
export function locationScope(code: string): string[] {
  const locations = getDb().locations;
  const scope = new Set<string>([code]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of locations) {
      if (l.parent && scope.has(l.parent) && !scope.has(l.code)) {
        scope.add(l.code);
        grew = true;
      }
    }
  }
  return [...scope];
}

/** True when `inner` sits inside `outer` (or is `outer`). */
export function isNested(inner: string, outer: string): boolean {
  return inner === outer || locationScope(outer).includes(inner);
}

/** True when a code is a location OR the code of a warehouse (whose root node shares the code). */
export function isAddressable(code: string): boolean {
  const db = getDb();
  return findLocation(code) !== undefined || db.warehouses.some((w) => w.code === code);
}

export function requireAddressable(code: string): string {
  if (!isAddressable(code)) {
    throw badRequest(`“${code}” is not a warehouse or location in this network.`);
  }
  return code;
}

export function leavesUnder(code: string): Location[] {
  return locationScope(code)
    .map(findLocation)
    .filter((l): l is Location => !!l && !l.container);
}

export function pathOf(code: string): Location[] {
  const out: Location[] = [];
  let cursor = findLocation(code);
  while (cursor) {
    out.unshift(cursor);
    cursor = cursor.parent ? findLocation(cursor.parent) : undefined;
  }
  return out;
}

/* --------------------------------------------------------------- balances */

export function onHand(product: Product): number {
  return round(Object.values(product.stock).reduce((a, b) => a + (b ?? 0), 0));
}

/** Quantity physically held in a location subtree. */
export function atLocation(product: Product, code: string): number {
  return round(locationScope(code).reduce((sum, key) => sum + (product.stock[key] ?? 0), 0));
}

export function ownBalance(product: Product, code: string): number {
  return round(product.stock[code] ?? 0);
}

/** Deliveries in Ready, Picking or Packed hold stock for their customer. */
export const RESERVING_STATUSES = ['Ready', 'Picking', 'Packed'] as const;

export function reservedFor(sku: string): number {
  return round(
    getDb()
      .deliveries.filter((d) => (RESERVING_STATUSES as readonly string[]).includes(d.status))
      .flatMap((d) => d.lines)
      .filter((l) => l.sku === sku)
      .reduce((a, l) => a + l.qty, 0),
  );
}

export function reservedForLine(sku: string, excludeRef?: string): number {
  return round(
    getDb()
      .deliveries.filter(
        (d) => d.ref !== excludeRef && (RESERVING_STATUSES as readonly string[]).includes(d.status),
      )
      .flatMap((d) => d.lines)
      .filter((l) => l.sku === sku)
      .reduce((a, l) => a + l.qty, 0),
  );
}

/** Goods still to arrive on confirmed inbound documents. */
export function incomingFor(sku: string): number {
  return round(
    getDb()
      .receipts.filter((r) => r.status === 'Waiting' || r.status === 'Ready')
      .flatMap((r) => r.lines)
      .filter((l) => l.sku === sku)
      .reduce((a, l) => a + Math.max(0, l.expected), 0),
  );
}

export function available(product: Product): number {
  return round(Math.max(0, onHand(product) - reservedFor(product.sku)));
}

export function health(product: Product): Health {
  const total = onHand(product);
  if (total <= 0) return 'OUT';
  if (available(product) <= product.reorder.reorderPoint) return 'LOW';
  return 'IN_STOCK';
}

export function valuation(product: Product): number {
  return round(onHand(product) * product.unitCost);
}

export function findProduct(sku: string): Product | undefined {
  return getDb().products.find((p) => p.sku === sku);
}

export function requireProduct(sku: string): Product {
  const p = findProduct(sku);
  if (!p) throw notFound(`“${sku}” is not in the product catalogue.`);
  return p;
}

/* ------------------------------------------------------- debit and credit */

export interface Leg {
  location: string;
  delta: number;
}

/**
 * Which leaves a debit of `amount` should be drawn from, deepest source first.
 * Pure — it never mutates, so a UI preview and the actual posting agree.
 */
export function planDebit(product: Product, from: string, amount: number): Leg[] | null {
  const scope = leavesUnder(from).filter((l) => (product.stock[l.code] ?? 0) > 0);
  if (scope.reduce((a, l) => a + (product.stock[l.code] ?? 0), 0) < amount) return null;
  const legs: Leg[] = [];
  let want = round(amount);
  for (const loc of scope) {
    if (want <= 0) break;
    const have = product.stock[loc.code] ?? 0;
    const take = round(Math.min(have, want));
    if (take <= 0) continue;
    legs.push({ location: loc.code, delta: -take });
    want = round(want - take);
  }
  return want <= 0 ? legs : null;
}

/**
 * Where a credit should land. Leaves only: a container credits its emptiest
 * child so utilisation figures stay meaningful.
 */
export function planCredit(to: string, product: Product, amount: number): Leg[] {
  const node = findLocation(to);
  if (!node) {
    throw badRequest(`“${to}” is not a location in this network.`);
  }
  if (!node.container) return [{ location: node.code, delta: round(amount) }];
  const targets = childrenOf(node.code).filter((c) => !c.container);
  if (targets.length === 0) {
    throw badRequest(`${node.name} has no storage bins to receive stock into.`);
  }
  const free = (code: string) => {
    const loc = findLocation(code);
    const used = round((product.stock[code] ?? 0) * (loc?.volumePerUnit ?? 0));
    return (loc?.capacityUnits ?? 0) - used;
  };
  const best = [...targets].sort((a, b) => {
    const d = free(b.code) - free(a.code);
    return d !== 0 ? d : a.code.localeCompare(b.code);
  })[0];
  if (!best) throw badRequest(`${node.name} has no storage bins to receive stock into.`);
  return [{ location: best.code, delta: round(amount) }];
}

/** Applies legs to the product map, refusing to drive any leaf below zero. */
export function applyLegs(product: Product, legs: Leg[]): void {
  for (const leg of legs) {
    const next = round((product.stock[leg.location] ?? 0) + leg.delta);
    if (next < -1e-9) {
      throw badRequest(
        `${product.sku} has only ${product.stock[leg.location] ?? 0} ${product.uom} at ${leg.location}.`,
      );
    }
    if (next === 0) delete product.stock[leg.location];
    else product.stock[leg.location] = next;
  }
}

export function credit(product: Product, to: string, amount: number): Leg[] {
  const legs = planCredit(to, product, amount);
  applyLegs(product, legs);
  return legs;
}

export function debit(product: Product, from: string, amount: number): Leg[] {
  const legs = planDebit(product, from, amount);
  if (!legs) {
    const have = atLocation(product, from);
    throw badRequest(
      `Only ${have} ${product.uom} of ${product.name} is held at ${from}. Short by ${round(amount - have)} ${product.uom}.`,
    );
  }
  applyLegs(product, legs);
  return legs;
}

/** Applies a signed difference to a subtree, positive or negative. */
export function reconcile(product: Product, at: string, difference: number): Leg[] {
  if (difference === 0) return [];
  if (difference > 0) return credit(product, at, difference);
  const legs = planDebit(product, at, -difference);
  if (!legs) {
    throw badRequest(
      `The counted quantity is below zero — the adjustment would leave ${at} with a negative balance.`,
    );
  }
  applyLegs(product, legs);
  return legs;
}

/* ------------------------------------------------------------- utilisation */

export function usedUnits(code: string): number {
  const db = getDb();
  const leaves = leavesUnder(code);
  let used = 0;
  for (const leaf of leaves) {
    for (const product of db.products) {
      used += (product.stock[leaf.code] ?? 0) * leaf.volumePerUnit;
    }
  }
  return round(used);
}

export function capacityOf(code: string): number {
  const loc = findLocation(code);
  if (!loc) return 0;
  return loc.capacityUnits > 0 ? loc.capacityUnits : childrenOf(code).reduce((a, c) => a + c.capacityUnits, 0);
}

export function utilisation(code: string): number {
  const capacity = capacityOf(code);
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((usedUnits(code) / capacity) * 100));
}

/** SKUs holding stock anywhere in a subtree, largest first. */
export function occupants(code: string): { sku: string; name: string; qty: number; uom: string }[] {
  const scope = new Set(locationScope(code));
  return getDb()
    .products
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      uom: p.uom,
      qty: round([...scope].reduce((a, k) => a + (p.stock[k] ?? 0), 0)),
    }))
    .filter((o) => o.qty > 0)
    .sort((a, b) => b.qty - a.qty);
}

export function skuCountAt(code: string): number {
  return occupants(code).length;
}
