import { useEffect, type ReactNode } from 'react';
import { Icon } from './ui';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/25 backdrop-blur-[2px]"
      />
      <aside
        className={`animate-slide-in relative flex h-full w-full ${width} flex-col border-l border-outline-variant bg-surface-lowest shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-extrabold tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-[12px] text-on-surface/55">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn btn-outline !px-2 !py-1.5" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-outline-variant bg-surface-low px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-pop relative flex max-h-[88vh] w-full ${width} flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-2xl`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-3.5">
          <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
          <button onClick={onClose} className="btn btn-outline !px-2 !py-1.5" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-outline-variant bg-surface-low px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
