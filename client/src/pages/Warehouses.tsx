import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store';
import { Drawer } from '../components/overlays';
import {
  Badge,
  Card,
  Empty,
  Icon,
  PageHeader,
  Ref,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import type { StorageLocation } from '../types';

const TYPE_ICON: Record<string, string> = {
  'Internal Storage': 'shelves',
  'Heavy Floor': 'forklift',
  'Cold Chain': 'ac_unit',
  'Inward Dock': 'move_to_inbox',
  'Outward Pack': 'outbox',
  Quarantine: 'gpp_bad',
};

export default function Warehouses() {
  const { snap } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<StorageLocation | null>(null);
  const [query, setQuery] = useState('');

  if (!snap) return null;

  const wh = snap.warehouses.find((w) => w.code === selected) ?? snap.warehouses[0];
  const roots = snap.locations.filter((l) => !l.parent);
  const site = roots.find((r) => r.warehouse === wh?.code);

  const childrenOf = (code: string) => snap.locations.filter((l) => l.parent === code);
  const visible = query
    ? snap.locations.filter(
        (l) =>
          l.code.toLowerCase().includes(query.toLowerCase()) ||
          l.name.toLowerCase().includes(query.toLowerCase()),
      )
    : snap.locations;

  /** SKUs holding stock anywhere in this subtree. */
  const occupants = (code: string): { sku: string; name: string; qty: number; unit: string }[] => {
    const scope = new Set<string>([code]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of snap.locations) {
        if (l.parent && scope.has(l.parent) && !scope.has(l.code)) {
          scope.add(l.code);
          grew = true;
        }
      }
    }
    return snap.products
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        qty: [...scope].reduce((a, k) => a + (p.stock[k] ?? 0), 0),
      }))
      .filter((o) => o.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  };

  const totalUnits = snap.locations.reduce((a, l) => a + l.skuCount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Network topology"
        title="Warehouses & Locations"
        subtitle="Container locations roll up the balances of their child bins, so WH/Stock always reflects everything sitting on its racks."
        actions={
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-outline">
              <Icon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a location…"
              className="field !py-2 !pl-8"
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snap.warehouses.map((w) => (
          <button
            key={w.code}
            onClick={() => setSelected(w.code)}
            className={`card animate-in p-4 text-left transition hover:shadow-md ${
              wh?.code === w.code ? 'border-primary ring-1 ring-primary/30' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary-container text-on-tertiary-container">
                <Icon name="warehouse" size={18} />
              </span>
              <Badge tone="teal">{w.type}</Badge>
            </div>
            <p className="mt-2.5 text-[13.5px] font-extrabold tracking-tight">{w.name}</p>
            <Ref className="text-[11px] text-on-surface/50">{w.code}</Ref>
            <p className="mt-1.5 line-clamp-2 text-[11.5px] text-on-surface/60">{w.address}</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-on-surface/55">Capacity</span>
                <span className="tnum font-mono font-bold">{w.capacityUsedPct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container">
                <div
                  className={`h-full rounded-full ${
                    w.capacityUsedPct > 88 ? 'bg-error' : w.capacityUsedPct > 70 ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${w.capacityUsedPct}%` }}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-2.5 text-[10.5px] text-on-surface/55">
              <span>{w.locationCount} locations</span>
              <span>Manager · {w.manager}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-outline-variant px-4 py-2.5">
            <SectionTitle
              icon="account_tree"
              right={
                <span className="text-[11px] text-on-surface/50">
                  {visible.length} of {snap.locations.length} locations
                </span>
              }
            >
              Location tree
            </SectionTitle>
          </div>

          {visible.length === 0 ? (
            <Empty icon="search_off" title="No location matches" />
          ) : (
            <ul className="divide-y divide-outline-variant">
              {roots
                .filter((r) => visible.some((v) => v.code === r.code || v.code.startsWith(`${r.code}/`)))
                .map((root) => {
                  const kids = childrenOf(root.code);
                  return (
                    <li key={root.code}>
                      <LocationRow
                        loc={root}
                        depth={0}
                        whCode={wh?.code}
                        onSelect={setDetail}
                        occupants={occupants(root.code).length}
                      />
                      {kids.map((k) => (
                        <LocationRow
                          key={k.code}
                          loc={k}
                          depth={1}
                          whCode={wh?.code}
                          onSelect={setDetail}
                          occupants={occupants(k.code).length}
                        />
                      ))}
                    </li>
                  );
                })}
            </ul>
          )}

          <p className="flex items-start gap-2 border-t border-outline-variant bg-surface-low px-4 py-2.5 text-[11px] text-on-surface/55">
            <Icon name="account_tree" size={15} className="mt-px shrink-0" />
            A container's quantity is the sum of its own balance and every descendant bin. Posting
            into a bin immediately changes its parent.
          </p>
        </Card>

        <div className="space-y-4">
          {wh && site && (
            <Card className="p-4">
              <SectionTitle icon="hub">{wh.name}</SectionTitle>
              <div className="space-y-2.5 text-[12px]">
                {[
                  ['Code', wh.code],
                  ['Type', wh.type],
                  ['Manager', wh.manager],
                  ['Address', wh.address],
                  ['Locations', String(wh.locationCount)],
                  ['Capacity used', `${wh.capacityUsedPct}%`],
                  ['Primary site', site.code],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-on-surface/50">{k}</span>
                    <span className={`text-right font-semibold ${k === 'Code' || k === 'Primary site' ? 'font-mono text-[11.5px]' : ''}`}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {site && (
            <Card className="p-4">
              <SectionTitle icon="shelves">What sits in {site.code}</SectionTitle>
              {occupants(site.code).length === 0 ? (
                <p className="text-[12px] text-on-surface/55">This location is empty.</p>
              ) : (
                <ul className="space-y-1.5">
                  {occupants(site.code).map((o) => (
                    <li key={o.sku}>
                      <Link
                        to={`/products/${o.sku}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-low"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold">{o.name}</span>
                          <Ref className="text-[10px] text-on-surface/50">{o.sku}</Ref>
                        </span>
                        <span className="tnum font-mono text-[12px] font-bold">
                          {o.qty} <span className="text-[10px] text-on-surface/50">{o.unit}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="p-4">
            <SectionTitle icon="insights">Network roll-up</SectionTitle>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-center justify-between gap-2">
                <span className="text-on-surface/60">Container locations</span>
                <span className="tnum font-mono font-bold">{roots.length}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-on-surface/60">Leaf bins</span>
                <span className="tnum font-mono font-bold">
                  {snap.locations.length - roots.length}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-on-surface/60">SKUs catalogued</span>
                <span className="tnum font-mono font-bold">{snap.dashboard.catalogSkus}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-on-surface/60">Distinct SKU-location pairs</span>
                <span className="tnum font-mono font-bold">{totalUnits}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.code ?? ''}
        subtitle={detail?.name}
        width="max-w-md"
        footer={
          <button className="btn btn-outline" onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={detail.status} dot />
              <Badge tone="teal">{detail.type}</Badge>
              {detail.container && <Badge tone="plum">Container</Badge>}
            </div>

            <div className="card bg-surface-low p-3.5">
              <dl className="space-y-2 text-[12px]">
                {[
                  ['Short code', detail.shortCode],
                  ['Warehouse', detail.warehouse],
                  ['Parent', detail.parent ?? '— root —'],
                  ['Max load', detail.maxLoad],
                  ['SKUs mapped', String(detail.skuCount)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <dt className="text-on-surface/50">{k}</dt>
                    <dd className="text-right font-mono text-[11.5px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <SectionTitle icon="deployed_code">
                Stock held here {detail.container ? '(incl. child bins)' : ''}
              </SectionTitle>
              {occupants(detail.code).length === 0 ? (
                <p className="text-[12px] text-on-surface/55">Nothing on hand at this location.</p>
              ) : (
                <ul className="space-y-1.5">
                  {occupants(detail.code).map((o) => (
                    <li key={o.sku}>
                      <Link
                        to={`/products/${o.sku}`}
                        onClick={() => setDetail(null)}
                        className="flex items-center gap-2 rounded-lg border border-outline-variant px-2.5 py-2 hover:border-primary/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold">{o.name}</span>
                          <Ref className="text-[10px] text-on-surface/50">{o.sku}</Ref>
                        </span>
                        <span className="tnum font-mono text-[13px] font-bold">
                          {o.qty} <span className="text-[10px] text-on-surface/50">{o.unit}</span>
                        </span>
                        <Icon name="chevron_right" size={16} className="text-outline" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.container && childrenOf(detail.code).length > 0 && (
              <div>
                <SectionTitle icon="subdirectory_arrow_right">Child bins</SectionTitle>
                <ul className="space-y-1.5">
                  {childrenOf(detail.code).map((c) => (
                    <li key={c.code}>
                      <button
                        onClick={() => setDetail(c)}
                        className="flex w-full items-center gap-2 rounded-lg border border-outline-variant px-2.5 py-2 text-left hover:border-primary/40"
                      >
                        <Icon name={TYPE_ICON[c.type] ?? 'shelves'} size={16} className="text-primary" />
                        <span className="min-w-0 flex-1">
                          <Ref className="block text-[11px] font-semibold">{c.code}</Ref>
                          <span className="block truncate text-[10.5px] text-on-surface/50">{c.name}</span>
                        </span>
                        <StatusBadge value={c.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function LocationRow({
  loc,
  depth,
  whCode,
  onSelect,
  occupants,
}: {
  loc: StorageLocation;
  depth: number;
  whCode?: string;
  onSelect: (l: StorageLocation) => void;
  occupants: number;
}) {
  const dim = loc.warehouse !== whCode;
  return (
    <button
      onClick={() => onSelect(loc)}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-surface-low ${
        dim ? 'opacity-45' : ''
      }`}
      style={{ paddingLeft: depth === 0 ? '1rem' : '2.75rem' }}
    >
      {depth === 0 ? (
        <Icon name="account_tree" size={17} className="shrink-0 text-primary" fill />
      ) : (
        <span className="flex w-4 shrink-0 justify-center">
          <span className="h-full w-px bg-outline-variant" />
        </span>
      )}
      <Icon
        name={TYPE_ICON[loc.type] ?? 'shelves'}
        size={16}
        className={`shrink-0 ${depth === 0 ? 'text-on-surface/60' : 'text-outline'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Ref className="truncate text-[11.5px]">{loc.code}</Ref>
          {loc.container && <Icon name="folder" size={13} className="text-outline" />}
        </span>
        <span className="block truncate text-[10.5px] text-on-surface/50">{loc.name}</span>
      </span>
      <span className="tnum shrink-0 text-[10.5px] text-on-surface/50">
        {occupants} SKU{occupants === 1 ? '' : 's'}
      </span>
      <span className="hidden w-16 shrink-0 text-right font-mono text-[10.5px] text-on-surface/45 sm:block">
        {loc.maxLoad}
      </span>
      <StatusBadge value={loc.status} dot />
    </button>
  );
}
