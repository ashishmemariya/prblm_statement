import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import { notificationService, searchService } from '../services';
import { money, timeOnly, qty as n } from '../lib/format';
import { useDebounced, useMediaQuery } from '../lib/hooks';
import type { Notification, Permission, SearchHit } from '../types';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  LiveDot,
  StatusBadge,
} from './design';

/* ================================================================== NAV */

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  requires?: Permission;
  badge?: 'attention' | 'notifications';
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
      { to: '/inventory', label: 'Stock by Location', icon: 'shelves', requires: 'product.view' },
      { to: '/low-stock', label: 'Low Stock', icon: 'trending_down', requires: 'product.view', badge: 'attention' },
      { to: '/reorder-rules', label: 'Reorder Rules', icon: 'rule', requires: 'product.view' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/receipts', label: 'Receipts', icon: 'move_to_inbox', requires: 'receipt.view' },
      { to: '/deliveries', label: 'Deliveries', icon: 'local_shipping', requires: 'delivery.view' },
      { to: '/transfers', label: 'Transfers', icon: 'swap_horiz', requires: 'transfer.view' },
      { to: '/adjustments', label: 'Adjustments', icon: 'rule', requires: 'adjustment.view' },
      { to: '/counts', label: 'Physical Counts', icon: 'fact_check', requires: 'count.view' },
      { to: '/moves', label: 'Move History', icon: 'receipt_long', requires: 'ledger.view' },
    ],
  },
  {
    section: 'Warehouses',
    items: [
      { to: '/warehouses', label: 'Warehouses', icon: 'warehouse', requires: 'product.view' },
      { to: '/locations', label: 'Locations', icon: 'account_tree', requires: 'product.view' },
    ],
  },
  {
    section: 'Analytics',
    items: [{ to: '/reports', label: 'Reports', icon: 'bar_chart', requires: 'report.view' }],
  },
  {
    section: 'System',
    items: [
      { to: '/notifications', label: 'Notifications', icon: 'notifications', badge: 'notifications' },
      { to: '/settings', label: 'Settings', icon: 'tune', requires: 'settings.view' },
      { to: '/profile', label: 'Profile', icon: 'person' },
    ],
  },
];

const MOBILE_TABS: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Tasks', icon: 'checklist' },
  { to: '/scanner', label: 'Scan', icon: 'qr_code_scanner' },
  { to: '/products', label: 'Stock', icon: 'inventory_2' },
  { to: '/transfers', label: 'Move', icon: 'swap_horiz' },
];

/* ================================================================ SIDE NAV */

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { snap, user, can, signOut } = useApp();
  const location = useLocation();
  const attention = snap?.dashboard.attention.length ?? 0;
  const unread = snap?.dashboard.notifications.unread ?? 0;

  return (
    <nav
      aria-label="Main navigation"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface max-lg:hidden"
    >
      <Link to="/" className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
          <Icon name="deployed_code" size={20} fill />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] leading-tight font-extrabold tracking-tight">StockSense</span>
          <span className="block truncate text-[10.5px] text-text-muted">Inventory Operations</span>
        </span>
      </Link>

      <div className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-3">
        {NAV.map((group) => {
          const visible = group.items.filter((item) => !item.requires || can(item.requires));
          if (visible.length === 0) return null;
          return (
            <div key={group.section}>
              <p className="px-2 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-text-subtle uppercase">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                  const count = item.badge === 'attention' ? attention : item.badge === 'notifications' ? unread : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end ?? false}
                        onClick={onNavigate}
                        className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[12.5px] font-semibold transition ${
                          active ? 'bg-primary-soft text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text'
                        }`}
                      >
                        <Icon name={item.icon} size={18} fill={active} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 && (
                          <span
                            className={`tnum rounded-full px-1.5 text-[10px] font-bold ${
                              item.badge === 'notifications'
                                ? 'bg-danger text-white'
                                : active
                                  ? 'bg-primary text-white'
                                  : 'bg-surface-sunken text-text-muted'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {snap && attention > 0 && (
        <div className="border-t border-border px-3.5 py-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-text-subtle uppercase">Needs attention</p>
          <ul className="mt-1.5 space-y-1">
            {snap.dashboard.attention.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-start gap-1.5 text-[11.5px]">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    item.severity === 'critical' ? 'bg-danger' : item.severity === 'warning' ? 'bg-warning' : 'bg-info'
                  }`}
                />
                <Link to={item.link} onClick={onNavigate} className="min-w-0 flex-1 truncate text-text-muted hover:text-primary">
                  {item.title}
                </Link>
              </li>
            ))}
            {attention > 3 && (
              <li>
                <Link to="/dashboard#attention" onClick={onNavigate} className="text-[11px] font-semibold text-primary hover:underline">
                  +{attention - 3} more
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="border-t border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
            {user?.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold">{user?.name}</p>
            <p className="truncate text-[10.5px] text-text-muted">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={() => void signOut()}
          className="mt-2 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-[12px] font-semibold text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <Icon name="logout" size={16} /> Sign out
        </button>
      </div>
    </nav>
  );
}

/* =============================================================== TOP NAV */

export function TopNav({
  onMenu,
  onSearch,
  onNotifications,
}: {
  onMenu: () => void;
  onSearch: () => void;
  onNotifications: () => void;
}) {
  const { snap, user, refresh, busy } = useApp();
  const [menu, setMenu] = useState(false);
  const unread = snap?.dashboard.notifications.unread ?? 0;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface/95 px-3 py-2.5 backdrop-blur md:px-5">
      <button
        onClick={onMenu}
        aria-label="Open navigation"
        className="btn btn-ghost btn-icon lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      <button
        onClick={onSearch}
        className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-control border border-border bg-surface-muted px-3 py-2 text-left transition hover:border-primary/50 sm:max-w-md"
        aria-label="Open search"
      >
        <Icon name="search" size={18} className="shrink-0 text-text-subtle" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-subtle">
          Search products, documents, locations…
        </span>
        <kbd className="hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-text-subtle sm:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {snap && (
          <span className="hidden items-center gap-2 rounded-full border border-border bg-surface-muted px-2.5 py-1 lg:inline-flex">
            <LiveDot />
            <span className="tnum text-[10.5px] text-text-muted">Synced {timeOnly(snap.generatedAt)}</span>
          </span>
        )}
        <IconButton
          label="Refresh data"
          icon={busy ? 'progress_activity' : 'refresh'}
          onClick={() => void refresh()}
        />
        <span className="relative">
          <IconButton label="Notifications" icon="notifications" onClick={onNotifications} />
          {unread > 0 && (
            <span className="tnum pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </span>

        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menu}
            className="flex items-center gap-2 rounded-control border border-border bg-surface-muted px-2 py-1.5 hover:bg-surface-hover"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
              {user?.initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[11.5px] leading-tight font-bold">{user?.name}</span>
              <span className="block text-[9.5px] leading-tight text-text-muted">{user?.role}</span>
            </span>
            <Icon name="expand_more" size={16} className="text-text-subtle" />
          </button>

          {menu && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setMenu(false)} />
              <div
                role="menu"
                className="animate-pop absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-panel border border-border bg-surface shadow-xl"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-[12.5px] font-bold">{user?.name}</p>
                  <p className="truncate text-[10.5px] text-text-muted">{user?.email}</p>
                  <Badge tone="primary" className="mt-1.5">
                    {user?.role}
                  </Badge>
                  {snap?.me && <p className="mt-1.5 text-[10.5px] leading-relaxed text-text-muted">{snap.me.roleSummary}</p>}
                </div>
                <Link to="/profile" role="menuitem" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold hover:bg-surface-muted">
                  <Icon name="person" size={17} /> My profile
                </Link>
                <Link to="/scanner" role="menuitem" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold hover:bg-surface-muted">
                  <Icon name="qr_code_scanner" size={17} /> Scanner
                </Link>
                <Link to="/settings" role="menuitem" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold hover:bg-surface-muted">
                  <Icon name="tune" size={17} /> Settings
                </Link>
                <Link to="/login" role="menuitem" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-[12.5px] font-semibold hover:bg-surface-muted">
                  <Icon name="switch_account" size={17} /> Switch account
                </Link>
                <p className="border-t border-border px-3 py-2 text-[10.5px] leading-relaxed text-text-subtle">
                  Every stock movement is signed with your account.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* =========================================================== MOBILE NAV */

export function MobileNav({ onMore }: { onMore: () => void }) {
  const location = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {MOBILE_TABS.map((tab) => {
        const active = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold ${
              active ? 'text-primary' : 'text-text-muted'
            }`}
          >
            <Icon name={tab.icon} size={22} fill={active} />
            {tab.label}
          </NavLink>
        );
      })}
      <button onClick={onMore} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold text-text-muted">
        <Icon name="more_horiz" size={22} />
        More
      </button>
    </nav>
  );
}

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useApp();
  return (
    <Drawer open={open} onClose={onClose} title="All sections" subtitle="StockSense" width="max-w-sm">
      <div className="space-y-5">
        {NAV.map((group) => {
          const visible = group.items.filter((item) => !item.requires || can(item.requires));
          if (visible.length === 0) return null;
          return (
            <div key={group.section}>
              <p className="mb-1.5 text-[10px] font-bold tracking-[0.12em] text-text-subtle uppercase">{group.section}</p>
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onClose}
                      className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-[13px] font-semibold text-text hover:bg-surface-muted"
                    >
                      <Icon name={item.icon} size={19} className="text-primary" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

/* ============================================================== TOASTS */

export function Toasts() {
  const { toasts, dismiss } = useApp();
  const navigate = useNavigate();
  if (toasts.length === 0) return null;

  const tone = {
    success: { cls: 'border-success-border bg-success-soft text-success-ink', icon: 'check_circle' },
    error: { cls: 'border-danger-border bg-danger-soft text-danger-ink', icon: 'error' },
    warning: { cls: 'border-warning-border bg-warning-soft text-warning-ink', icon: 'warning' },
    info: { cls: 'border-info-border bg-info-soft text-info-ink', icon: 'info' },
  } as const;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-3 right-3 z-[100] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const s = tone[toast.tone];
        return (
          <div
            key={toast.id}
            className={`animate-pop pointer-events-auto rounded-panel border p-3 shadow-lg ${s.cls}`}
          >
            <div className="flex gap-2.5">
              <Icon name={s.icon} size={19} className="mt-px shrink-0" fill />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-extrabold">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 text-[11.5px] leading-snug opacity-90">{toast.detail}</p>}
                {toast.blockers && toast.blockers.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {toast.blockers.map((blocker) => (
                      <li
                        key={blocker}
                        className="flex items-start gap-1.5 rounded-md bg-black/[0.06] px-2 py-1 text-[10.5px] font-semibold"
                      >
                        <Icon name="error" size={13} className="mt-px shrink-0" />
                        {blocker}
                      </li>
                    ))}
                  </ul>
                )}
                {toast.action && (
                  <button
                    onClick={() => {
                      navigate(toast.action!.to);
                      dismiss(toast.id);
                    }}
                    className="mt-2 text-[11.5px] font-bold underline"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="shrink-0 self-start opacity-70 hover:opacity-100">
                <Icon name="close" size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ====================================================== COMMAND CENTER */

interface Command {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: string;
  run: () => void;
}

export function CommandCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, can, run } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 180);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    void searchService
      .query(debounced.trim())
      .then((res) => {
        if (alive) setHits(res.groups);
      })
      .catch(() => {
        if (alive) setHits([]);
      });
    return () => {
      alive = false;
    };
  }, [debounced, open]);

  const commands = useMemo<Command[]>(() => {
    const goTo = (to: string): Command[] => [];
    void goTo;
    const nav: Command[] = NAV.flatMap((group) =>
      group.items
        .filter((item) => !item.requires || can(item.requires))
        .map((item) => ({
          id: `nav-${item.to}`,
          label: item.label,
          hint: group.section,
          group: 'Go to',
          icon: item.icon,
          run: () => go(item.to),
        })),
    );

    const actions: Command[] = [];
    if (can('receipt.create')) {
      actions.push({ id: 'a-receipt', label: 'Receive stock', hint: 'Create a new goods receipt', group: 'Create', icon: 'move_to_inbox', run: () => go('/receipts/new') });
    }
    if (can('delivery.create')) {
      actions.push({ id: 'a-delivery', label: 'Create delivery', hint: 'Release an outbound order', group: 'Create', icon: 'local_shipping', run: () => go('/deliveries/new') });
    }
    if (can('transfer.create')) {
      actions.push({ id: 'a-transfer', label: 'Transfer stock', hint: 'Move stock between locations', group: 'Create', icon: 'swap_horiz', run: () => go('/transfers/new') });
    }
    if (can('adjustment.create')) {
      actions.push({ id: 'a-adjust', label: 'Adjust inventory', hint: 'Raise a count variance', group: 'Create', icon: 'rule', run: () => go('/adjustments/new') });
    }
    if (can('count.create')) {
      actions.push({ id: 'a-count', label: 'Start a physical count', hint: 'Assign a count sheet', group: 'Create', icon: 'fact_check', run: () => go('/counts/new') });
    }
    actions.push({ id: 'a-scan', label: 'Open scanner', hint: 'Scan a barcode or SKU', group: 'Create', icon: 'qr_code_scanner', run: () => go('/scanner') });
    if (can('report.view')) {
      actions.push({ id: 'a-report', label: 'Open reports', hint: 'Ten live reports with CSV export', group: 'Create', icon: 'bar_chart', run: () => go('/reports') });
    }
    if (can('demo.reset')) {
      actions.push({
        id: 'a-reset',
        label: 'Reset demo data',
        hint: 'Return everything to the canonical scenario',
        group: 'Create',
        icon: 'restart_alt',
        run: () => {
          void run('Reset demo data', async () => {
            const { demoService } = await import('../services');
            return demoService.reset();
          }, { success: 'Demo data restored' });
          onClose();
        },
      });
    }

    const results: Command[] = hits.map((hit) => ({
      id: `hit-${hit.group}-${hit.id}`,
      label: hit.title,
      hint: hit.meta ? `${hit.subtitle} · ${hit.meta}` : hit.subtitle,
      group: hit.group,
      icon: hit.group === 'Products' ? 'inventory_2' : hit.group === 'Locations' ? 'place' : hit.group === 'Warehouses' ? 'warehouse' : 'description',
      run: () => go(hit.link),
    }));

    return [...actions, ...nav, ...results];
  }, [snap, can, run, hits]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        results[cursor]?.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, cursor, onClose]);

  if (!open) return null;
  const groups = [...new Set(results.map((c) => c.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]" style={{ background: 'rgb(15 23 42 / 0.45)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command centre"
        className="animate-pop w-full max-w-xl overflow-hidden rounded-panel border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Icon name="search" size={20} className="text-text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or run a command…"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-text-subtle"
          />
          <kbd className="hidden rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-text-subtle sm:block">ESC</kbd>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-bold">No matches</p>
            <p className="mt-1 text-[12px] text-text-muted">Try a SKU, a document reference, or a page name.</p>
          </div>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
            {groups.map((group) => (
              <li key={group}>
                <p className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-text-subtle uppercase">{group}</p>
                <ul>
                  {results
                    .filter((c) => c.group === group)
                    .map((command) => {
                      const index = results.indexOf(command);
                      const active = index === cursor;
                      return (
                        <li key={command.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setCursor(index)}
                            onClick={command.run}
                            className={`flex w-full min-h-11 items-center gap-3 rounded-control px-3 py-2 text-left transition ${
                              active ? 'bg-primary-soft text-primary' : 'hover:bg-surface-muted'
                            }`}
                          >
                            <Icon name={command.icon} size={18} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold">{command.label}</span>
                              <span className="block truncate text-[11px] opacity-70">{command.hint}</span>
                            </span>
                            {active && <Icon name="keyboard_return" size={14} />}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-border bg-surface-muted px-4 py-2 text-[10px] text-text-subtle">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-sans">↑↓</kbd> navigate
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-sans">↵</kbd> select
          </span>
          <span>StockSense · press / anywhere</span>
        </div>
      </div>
    </div>
  );
}

/* ==================================================== NOTIFICATION CENTRE */

export function NotificationCenter({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: Notification[];
}) {
  const { snap, refresh, notify } = useApp();
  const navigate = useNavigate();
  const read = new Set(snap?.readNotifications ?? []);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const visible = tab === 'unread' ? items.filter((i) => !read.has(i.id)) : items;

  const open1 = (item: Notification) => {
    void notificationService.markRead(item.id).then(() => refresh());
    navigate(item.link);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle={`${items.length} active · ${items.length - read.size} unread`}
      width="max-w-md"
      footer={
        <>
          <Button
            variant="ghost"
            icon="done_all"
            onClick={() =>
              void notificationService.markAllRead().then(() => {
                void refresh();
                notify({ tone: 'success', title: 'All notifications marked read' });
              })
            }
          >
            Mark all read
          </Button>
          <Link to="/notifications" onClick={onClose} className="btn btn-primary">
            Open centre
          </Link>
        </>
      }
    >
      <div className="mb-3 flex gap-1.5">
        {(['all', 'unread'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-control px-2.5 py-1.5 text-[12px] font-semibold capitalize ${
              tab === key ? 'bg-primary-soft text-primary' : 'text-text-muted hover:bg-surface-muted'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="notifications_off" title="Nothing here" detail="You are all caught up." />
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const isRead = read.has(item.id);
            return (
              <li key={item.id}>
                <button
                  onClick={() => open1(item)}
                  className={`flex w-full items-start gap-3 rounded-card border p-3 text-left transition hover:border-primary/50 ${
                    isRead ? 'border-border bg-surface' : 'border-primary-border bg-primary-soft/40'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      item.severity === 'critical'
                        ? 'bg-danger-soft text-danger'
                        : item.severity === 'warning'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-info-soft text-info'
                    }`}
                  >
                    <Icon name={item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'info'} size={15} fill />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] font-bold">{item.title}</span>
                      {!isRead && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-text-muted">{item.detail}</span>
                    <span className="mt-1 inline-flex">
                      <Badge tone="neutral">{item.type}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

/* ============================================================ DEMO MODE */

export function DemoModeBar({ onReset }: { onReset: () => void }) {
  const { snap } = useApp();
  if (!snap) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-dashed border-border-strong bg-surface-muted px-3 py-2">
      <Badge tone="primary" dot>
        Demo mode
      </Badge>
      <span className="text-[11.5px] text-text-muted">
        Seeded dataset · {snap.dashboard.catalogSkus} SKUs · {snap.dashboard.ledgerEntries} ledger rows ·{' '}
        {money(snap.dashboard.inventoryValue, snap.dashboard.currency, true)} on hand
      </span>
      <Button size="sm" variant="ghost" icon="restart_alt" className="ml-auto" onClick={onReset}>
        Reset demo data
      </Button>
    </div>
  );
}

/* ============================================================= KEYBOARD */

export function useGlobalShortcuts(onCommand: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onCommand();
        return;
      }
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onCommand();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCommand]);
}

/* ============================================================== helpers */

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}

export function StatPill({ label, value, tone }: { label: string; value: ReactNode; tone?: 'default' | 'danger' | 'warning' | 'success' }) {
  const map = {
    default: 'border-border bg-surface-muted',
    danger: 'border-danger-border bg-danger-soft',
    warning: 'border-warning-border bg-warning-soft',
    success: 'border-success-border bg-success-soft',
  }[tone ?? 'default'];
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${map}`}>
      <p className="text-[10px] font-bold tracking-[0.05em] text-text-muted uppercase">{label}</p>
      <p className="tnum mt-0.5 font-mono text-[15px] font-extrabold">{value}</p>
    </div>
  );
}

export { n as safeNumber, StatusBadge, Card };
