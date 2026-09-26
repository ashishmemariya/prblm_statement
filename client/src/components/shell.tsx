import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../store';
import type { Permission } from '../types';
import { Icon } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Hidden when the signed-in role lacks this capability. */
  requires?: Permission;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: 'space_dashboard', end: true }],
  },
  {
    section: 'Inventory',
    items: [
      { to: '/products', label: 'Products & Stock', icon: 'inventory_2', requires: 'product.view' },
      { to: '/ledger', label: 'Move History', icon: 'receipt_long', requires: 'ledger.view' },
      { to: '/counts', label: 'Physical Counts', icon: 'fact_check', requires: 'count.view' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/receipts', label: 'Receipts', icon: 'move_to_inbox', requires: 'receipt.view' },
      { to: '/deliveries', label: 'Deliveries', icon: 'local_shipping', requires: 'delivery.view' },
      { to: '/transfers', label: 'Transfers', icon: 'swap_horiz', requires: 'transfer.view' },
    ],
  },
  {
    section: 'Network',
    items: [
      { to: '/warehouse', label: 'Warehouses', icon: 'warehouse', requires: 'product.view' },
      { to: '/settings', label: 'Settings', icon: 'tune', requires: 'settings.manage' },
    ],
  },
];

const MOBILE_NAV = NAV.flatMap((g) => g.items);

export function SideNav() {
  const { snap, user, can } = useApp();
  const loc = useLocation();
  const active = loc.pathname;

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-outline-variant bg-surface-lowest max-lg:hidden">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
          <Icon name="deployed_code" size={20} fill />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] leading-tight font-extrabold tracking-tight">
            StockSense
          </p>
          <p className="truncate text-[10.5px] text-on-surface/50">Enterprise Logistics</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-3">
        {NAV.map((group) => {
          const visible = group.items.filter((item) => !item.requires || can(item.requires));
          if (visible.length === 0) return null;
          return (
            <div key={group.section}>
              <p className="px-2 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-outline uppercase">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const on = item.end ? active === item.to : active.startsWith(item.to);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end ?? false}
                        className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] font-semibold transition ${
                          on ? 'bg-accent text-primary' : 'text-outline hover:bg-surface-low hover:text-on-surface'
                        }`}
                      >
                        <Icon name={item.icon} size={18} fill={on} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {snap && (
        <div className="border-t border-outline-variant px-3.5 py-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-outline uppercase">
            Attention needed
          </p>
          <ul className="mt-1.5 space-y-1">
            <li className="flex items-center justify-between text-[11.5px]">
              <span className="text-on-surface/65">Low / out of stock</span>
              <span className="tnum font-bold text-error">{snap.dashboard.lowStock.length}</span>
            </li>
            <li className="flex items-center justify-between text-[11.5px]">
              <span className="text-on-surface/65">Overdue deliveries</span>
              <span className="tnum font-bold text-error">{snap.dashboard.overdueDeliveries}</span>
            </li>
            <li className="flex items-center justify-between text-[11.5px]">
              <span className="text-on-surface/65">Counts awaiting approval</span>
              <span className="tnum font-bold text-warning">
                {snap.dashboard.pendingAdjustments}
              </span>
            </li>
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2.5 border-t border-outline-variant px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
          {user?.initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold">{user?.name}</p>
          <p className="truncate text-[10.5px] text-outline">{user?.role}</p>
        </div>
      </div>
    </nav>
  );
}

export function MobileNav() {
  const loc = useLocation();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-outline-variant bg-surface-lowest px-2 py-1.5 lg:hidden">
      {MOBILE_NAV.map((item) => {
        const on = item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
              on ? 'bg-primary-container/12 text-primary' : 'text-on-surface/60'
            }`}
          >
            <Icon name={item.icon} size={16} fill={on} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function TopNav() {
  const { user, signOut, snap, refresh, busy, notify } = useApp();
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState(false);

  const results = !q.trim()
    ? []
    : (snap?.products ?? [])
        .filter(
          (p) =>
            p.sku.toLowerCase().includes(q.toLowerCase()) ||
            p.name.toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 6);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-outline-variant bg-surface-lowest/95 px-3 py-2.5 backdrop-blur md:px-5">
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Icon name="deployed_code" size={18} fill />
        </div>
      </div>

      <div className="relative max-w-md flex-1">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-outline">
          <Icon name="search" size={18} />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU, name, document ref…"
          className="field !pl-9"
        />
        {results.length > 0 && (
          <div className="animate-pop absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-xl">
            {results.map((p) => (
              <a
                key={p.sku}
                href={`#/products/${p.sku}`}
                onClick={() => setQ('')}
                className="flex items-center gap-2.5 border-b border-outline-variant/60 px-3 py-2 last:border-0 hover:bg-surface-low"
              >
                <Icon name={p.icon} size={17} className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                  <span className="ref block text-[10.5px] text-on-surface/50">{p.sku}</span>
                </span>
                <span className="tnum text-[11px] font-bold text-on-surface/60">
                  {p.total} {p.unit}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className="btn btn-outline !px-2.5"
          onClick={() => void refresh()}
          title="Refresh from server"
          aria-label="Refresh"
        >
          <Icon name={busy ? 'progress_activity' : 'refresh'} size={17} />
        </button>
        <button
          className="btn btn-outline relative !px-2.5"
          title="Notifications"
          aria-label="Notifications"
          onClick={() => {
            const d = snap?.dashboard;
            notify({
              kind: 'info',
              title: 'Operations pulse',
              detail: d
                ? `${d.waitingDeliveries} waiting · ${d.readyDeliveries} ready · ${d.overdueDeliveries} overdue · ${d.pendingAdjustments} counts pending`
                : undefined,
            });
          }}
        >
          <Icon name="notifications" size={17} />
          {snap && snap.dashboard.overdueDeliveries + snap.dashboard.pendingAdjustments > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-on-error">
              {snap.dashboard.overdueDeliveries + snap.dashboard.pendingAdjustments}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setPicker((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={picker}
            className="flex items-center gap-2 rounded-control border border-outline-variant bg-surface-low px-2 py-1.5 hover:bg-surface-container"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
              {user?.initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[11.5px] leading-tight font-bold">{user?.name}</span>
              <span className="block text-[9.5px] leading-tight text-outline">{user?.role}</span>
            </span>
            <Icon name="expand_more" size={16} className="text-outline" />
          </button>

          {picker && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close menu"
                onClick={() => setPicker(false)}
              />
              <div
                role="menu"
                className="animate-pop absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-panel border border-outline-variant bg-surface-lowest shadow-xl"
              >
                <div className="border-b border-outline-variant px-3 py-2.5">
                  <p className="truncate text-[12.5px] font-bold">{user?.name}</p>
                  <p className="truncate text-[10.5px] text-outline">{user?.email}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-primary">
                    <Icon name="badge" size={12} /> {user?.role}
                  </p>
                </div>

                <button
                  role="menuitem"
                  onClick={() => {
                    setPicker(false);
                    void signOut();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] font-semibold hover:bg-surface-low"
                >
                  <Icon name="logout" size={17} /> Sign out
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setPicker(false);
                    void signOut();
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-outline-variant px-3 py-2.5 text-left text-[12.5px] font-semibold hover:bg-surface-low"
                >
                  <Icon name="switch_account" size={17} /> Switch account
                </button>

                <p className="border-t border-outline-variant px-3 py-2 text-[10.5px] leading-relaxed text-outline">
                  Stock movements are signed with your account, not a chosen identity.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
