import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../store';
import { Icon } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { snap, can, run, notify } = useApp();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-dash', label: 'Dashboard', hint: 'Operations overview', group: 'Go to', icon: 'space_dashboard', run: () => go('/') },
      { id: 'nav-products', label: 'Products & Stock', hint: 'Search the catalogue', group: 'Go to', icon: 'inventory_2', run: () => go('/products') },
      { id: 'nav-receipts', label: 'Receipts', hint: 'Inbound stock', group: 'Go to', icon: 'move_to_inbox', run: () => go('/receipts') },
      { id: 'nav-deliveries', label: 'Deliveries', hint: 'Outbound orders', group: 'Go to', icon: 'local_shipping', run: () => go('/deliveries') },
      { id: 'nav-transfers', label: 'Transfers', hint: 'Move stock between locations', group: 'Go to', icon: 'swap_horiz', run: () => go('/transfers') },
      { id: 'nav-counts', label: 'Physical Counts', hint: 'Count and reconcile', group: 'Go to', icon: 'fact_check', run: () => go('/counts') },
      { id: 'nav-ledger', label: 'Move History', hint: 'Full stock ledger', group: 'Go to', icon: 'receipt_long', run: () => go('/ledger') },
      { id: 'nav-warehouse', label: 'Warehouses', hint: 'Network and locations', group: 'Go to', icon: 'warehouse', run: () => go('/warehouse') },
      { id: 'nav-settings', label: 'Settings', hint: 'Preferences', group: 'Go to', icon: 'tune', run: () => go('/settings') },
    ];

    const actions: Command[] = [];
    if (can('transfer.create')) {
      actions.push({
        id: 'act-transfer',
        label: 'New transfer',
        hint: 'Move stock between locations',
        group: 'Create',
        icon: 'swap_horiz',
        run: () => go('/transfers?new=1'),
      });
    }
    if (can('count.create')) {
      actions.push({
        id: 'act-count',
        label: 'Start a physical count',
        hint: 'Record a counted quantity',
        group: 'Create',
        icon: 'fact_check',
        run: () => go('/counts?new=1'),
      });
    }
    if (can('demo.reset')) {
      actions.push({
        id: 'act-reset',
        label: 'Reset demo data',
        hint: 'Restore the original dataset',
        group: 'Create',
        icon: 'restart_alt',
        run: () => {
          if (!window.confirm('Reset all demo data back to the original dataset? This cannot be undone.')) return;
          void run('Reset demo data', () => api.reset(), { success: 'Demo data restored' });
        },
      });
    }

    const products: Command[] = (snap?.products ?? [])
      .filter((p) => {
        if (!query.trim()) return false;
        const q = query.trim().toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((p) => ({
        id: `sku-${p.sku}`,
        label: p.name,
        hint: `${p.sku} · ${p.category} · ${p.total} ${p.unit} on hand`,
        group: 'Products',
        icon: 'inventory_2',
        run: () => go(`/products/${encodeURIComponent(p.sku)}`),
      }));

    return [...actions, ...nav, ...products];
  }, [snap, query, can, run, notify]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.group !== 'Products');
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        results[cursor]?.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, cursor, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  if (!open) return null;

  const groups = [...new Set(results.map((c) => c.group))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4"
      style={{ background: 'rgb(15 23 42 / 0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl rounded-panel border border-outline-variant bg-surface-lowest shadow-2xl overflow-hidden animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, jump to a page, or start an action…"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-outline"
          />
          <kbd className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded border border-outline-variant bg-surface-low text-outline">
            ESC
          </kbd>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold">No matches</div>
            <p className="text-xs text-outline mt-1">Try a SKU, product name, or page.</p>
          </div>
        ) : (
          <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
            {groups.map((group) => (
              <li key={group}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-outline px-3 py-1.5">
                  {group}
                </div>
                <ul>
                  {results
                    .filter((c) => c.group === group)
                    .map((c) => {
                      const index = results.indexOf(c);
                      const active = index === cursor;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            data-active={active}
                            onMouseEnter={() => setCursor(index)}
                            onClick={c.run}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-control text-left transition-colors ${
                              active ? 'bg-accent text-primary' : 'hover:bg-surface-low'
                            }`}
                          >
                            <Icon name={c.icon} size={18} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold truncate">{c.label}</span>
                              <span className="block text-[11px] text-outline truncate">{c.hint}</span>
                            </span>
                            {active && (
                              <span className="text-[10px] text-outline shrink-0">
                                <Icon name="keyboard_return" size={14} />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between px-4 py-2 border-t border-outline-variant bg-surface-low text-[10px] text-outline">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1 py-0.5 rounded border border-outline-variant bg-surface-lowest font-sans">↑↓</kbd>
            navigate
            <kbd className="px-1 py-0.5 rounded border border-outline-variant bg-surface-lowest font-sans ml-2">↵</kbd>
            select
          </span>
          <span>StockSense</span>
        </div>
      </div>
    </div>
  );
}
