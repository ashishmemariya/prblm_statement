/**
 * The StockSense design system.
 *
 * Every page imports from this file, which is what stops the product from
 * drifting into five different buttons, four different badges and two different
 * greys. Nothing here knows about business rules.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TONE_BAR, TONE_CLASS, TONE_ICON, statusTone } from '../lib/format';
import type { Tone } from '../types';

/* ================================================================== atoms */

export function Icon({
  name,
  size = 18,
  fill = false,
  className = '',
}: {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`ms ${fill ? 'ms-fill' : ''} ${className}`}
      style={{ fontSize: size, width: size, height: size }}
      aria-hidden
    >
      {name}
    </span>
  );
}

export function Ref({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ref text-[11.5px] ${className}`}>{children}</span>;
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_BAR[tone]}`} />}
      {children}
    </span>
  );
}

/** Status is never communicated by colour alone — the word is always present. */
export function StatusBadge({ value, className = '' }: { value: string; className?: string }) {
  return (
    <Badge tone={statusTone(value)} className={className} dot>
      {value}
    </Badge>
  );
}

export function Delta({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  const n = Number.isFinite(value) ? (value as number) : 0;
  if (n === 0) {
    return <span className={`tnum text-[12px] font-semibold text-text-subtle ${className}`}>0</span>;
  }
  return (
    <span
      className={`tnum text-[12px] font-bold ${n > 0 ? 'text-success' : 'text-danger'} ${className}`}
    >
      {n > 0 ? '+' : '−'}
      {Math.abs(n).toLocaleString('en-IN')}
    </span>
  );
}

export function LiveDot({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-success-ink uppercase">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      {label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionTitle({
  children,
  icon,
  right,
  className = '',
}: {
  children: ReactNode;
  icon?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-tight">
        {icon && <Icon name={icon} size={17} className="text-primary" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

/* ================================================================ buttons */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  iconFilled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  icon,
  iconFilled = false,
  size = 'md',
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${sizeClass} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Icon name="progress_activity" size={16} className="animate-spin" />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} fill={iconFilled} />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: Omit<ButtonProps, 'children' | 'aria-label'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`btn btn-${variant} btn-icon ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 15 : 18} />
    </button>
  );
}

export function LinkButton({
  to,
  children,
  variant = 'secondary',
  icon,
  size = 'md',
  className = '',
}: {
  to: string;
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <Link to={to} className={`btn btn-${variant} ${sizeClass} ${className}`}>
      {icon && <Icon name={icon} size={17} />}
      {children}
    </Link>
  );
}

/* ================================================================= fields */

export function Field({
  label,
  children,
  hint,
  error,
  required,
  className = '',
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1 flex items-center gap-1 text-[10.5px] font-bold tracking-[0.06em] text-text-muted uppercase"
      >
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-danger">
          <Icon name="error" size={13} /> {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Input({
  className = '',
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`field ${invalid ? 'field-invalid' : ''} ${className}`} {...rest} />;
}

export function Select({
  className = '',
  invalid,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={`field ${invalid ? 'field-invalid' : ''} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`field resize-y ${className}`} {...rest} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle">
        <Icon name="search" size={16} />
      </span>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field !pl-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-text-subtle hover:text-text"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--color-primary)]"
      />
      <span className="text-[12.5px] leading-snug">{label}</span>
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-card border border-border p-3.5 text-left transition hover:border-primary/50 disabled:opacity-60 ${
        checked ? 'bg-primary-soft/40' : ''
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? 'justify-end bg-success' : 'justify-start bg-border-strong'
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-bold">{label}</span>
        {description && <span className="mt-1 block text-[11.5px] text-text-muted">{description}</span>}
        <span
          className={`mt-1.5 inline-block text-[10px] font-bold tracking-wide uppercase ${
            checked ? 'text-success' : 'text-text-subtle'
          }`}
        >
          {checked ? 'On' : 'Off'}
        </span>
      </span>
    </button>
  );
}

/** Large-target numeric entry for warehouse floors. */
export function QuantityInput({
  value,
  onChange,
  unit,
  step = 1,
  min = 0,
  max,
  disabled,
  size = 'md',
  autoFocus,
  id,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const lastExternal = useRef(value);

  useEffect(() => {
    if (lastExternal.current !== value) {
      lastExternal.current = value;
      setText(value === null ? '' : String(value));
    }
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      lastExternal.current = null;
      onChange(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(min, max === undefined ? n : Math.min(max, n));
    lastExternal.current = clamped;
    onChange(clamped);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          if (text.trim() !== '' && Number.isFinite(Number(text))) {
            const n = Math.max(min, max === undefined ? Number(text) : Math.min(max, Number(text)));
            setText(String(n));
            lastExternal.current = n;
            onChange(n);
          } else if (text.trim() === '') {
            setText('');
            lastExternal.current = null;
            onChange(null);
          }
        }}
        className={`field tnum !pr-16 font-mono text-center ${
          size === 'lg' ? '!py-4 text-center text-[28px] font-extrabold' : 'text-[15px] font-bold'
        }`}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] font-semibold text-text-subtle">
          {unit}
        </span>
      )}
    </div>
  );
}

/* ================================================================= tables */

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  sortable,
  sorted,
  onSort,
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | null;
  onSort?: () => void;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`th ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center gap-1 uppercase hover:text-text ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {children}
          <Icon name={sorted === 'asc' ? 'arrow_upward' : sorted === 'desc' ? 'arrow_downward' : 'unfold_more'} size={13} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
  colSpan,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`td ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

/* ================================================================== cards */

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  to,
  footer,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: string;
  tone?: Tone;
  to?: string;
  footer?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-bold tracking-[0.06em] text-text-muted uppercase">{label}</p>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${TONE_CLASS[tone]}`}>
          <Icon name={icon} size={14} />
        </span>
      </div>
      <p className="tnum mt-2 text-[24px] leading-none font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-text-muted">{sub}</p>}
      {footer}
    </>
  );
  const className = `card block p-3.5 text-left transition ${
    to || onClick ? 'hover:border-primary/50 hover:shadow-sm' : ''
  }`;
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} w-full`}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

export function StatRow({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; tone?: Tone }[];
  columns?: 2 | 3 | 4;
}) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];
  return (
    <div className={`grid grid-cols-2 gap-2.5 ${grid}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border p-2.5 ${
            item.tone ? TONE_CLASS[item.tone] : 'border-border bg-surface-muted'
          }`}
        >
          <p className="text-[10px] font-bold tracking-[0.05em] uppercase opacity-75">{item.label}</p>
          <p className="tnum mt-0.5 text-[16px] leading-tight font-extrabold">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function Progress({
  value,
  tone = 'primary',
  label,
}: {
  value: number;
  tone?: Tone;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
          <span>{label}</span>
          <span className="tnum font-semibold">{pct}%</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Meter({
  value,
  max,
  tone = 'primary',
}: {
  value: number;
  max: number;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ============================================================== overlays */

export function Modal({
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
  const titleId = useId();
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-pop relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-panel border border-border bg-surface shadow-2xl sm:rounded-panel`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-extrabold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[11.5px] text-text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-navy/30 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-slide-in relative flex h-full w-full ${width} flex-col border-l border-border bg-surface shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[15px] font-extrabold tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

function useLockBody(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

/* ============================================================ page layout */

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2.5">
      <ol className="flex flex-wrap items-center gap-1 text-[11.5px] font-semibold text-text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <Icon name="chevron_right" size={13} className="text-text-subtle" />}
            {item.to ? (
              <Link to={item.to} className="hover:text-primary hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="text-text">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; to?: string }[];
  meta?: ReactNode;
}) {
  return (
    <header className="mb-4">
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10.5px] font-bold tracking-[0.12em] text-primary uppercase">{eyebrow}</p>
          )}
          <h1 className="mt-0.5 text-[21px] leading-tight font-extrabold tracking-tight sm:text-[23px]">
            {title}
          </h1>
          {description && <p className="mt-1 max-w-3xl text-[12.5px] text-text-muted">{description}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (next: T) => void;
  tabs: { value: T; label: string; icon?: string; count?: number }[];
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border no-scrollbar" role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap transition ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            {tab.icon && <Icon name={tab.icon} size={16} fill={active} />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`tnum rounded-full px-1.5 text-[10.5px] font-bold ${
                  active ? 'bg-primary-soft text-primary' : 'bg-surface-sunken text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon?: string }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-control border border-border bg-surface-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-semibold transition ${
            value === option.value ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          {option.icon && <Icon name={option.icon} size={15} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================ page states */

export function EmptyState({
  icon = 'inbox',
  title,
  detail,
  action,
}: {
  icon?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken">
        <Icon name={icon} size={24} className="text-text-subtle" />
      </span>
      <p className="text-[14px] font-bold">{title}</p>
      {detail && <p className="max-w-sm text-[12.5px] text-text-muted">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  retryLabel = 'Retry',
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
        <Icon name="cloud_off" size={24} className="text-danger" />
      </span>
      <div>
        <p className="text-[14px] font-bold">{title}</p>
        {detail && <p className="mt-1 max-w-md text-[12.5px] text-text-muted">{detail}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-1/3' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2.5 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ lines = 6 }: { lines?: number }) {
  return (
    <div className="card space-y-3 p-5">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5 w-full" />
      ))}
    </div>
  );
}

/** A chart is a real bar chart of real numbers — never decorative filler. */
export function BarChart({
  data,
  valueLabel = 'Value',
  format = (n: number) => n.toLocaleString('en-IN'),
  limit = 8,
  emptyLabel = 'No data to chart yet.',
}: {
  data: { label: string; value: number }[];
  valueLabel?: string;
  format?: (n: number) => string;
  limit?: number;
  emptyLabel?: string;
}) {
  const rows = data.slice(0, limit);
  const max = Math.max(1, ...rows.map((d) => Math.abs(d.value)));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[12px] text-text-muted">{emptyLabel}</p>;
  }
  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const pct = (Math.abs(row.value) / max) * 100;
          return (
            <div key={row.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2.5">
              <span className="truncate text-[11.5px] font-semibold" title={row.label}>
                {row.label}
              </span>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="tnum text-right font-mono text-[11.5px] font-bold">{format(row.value)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10.5px] text-text-subtle">{valueLabel}</p>
    </div>
  );
}

/** Movements over time, as a signed bar per day. */
export function FlowChart({
  data,
  format = (n: number) => n.toLocaleString('en-IN'),
}: {
  data: [string, number][];
  format?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-[12px] text-text-muted">No movements recorded yet.</p>;
  }
  const max = Math.max(1, ...data.map(([, v]) => Math.abs(v)));
  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {data.map(([day, value]) => {
          const pct = (Math.abs(value) / max) * 100;
          return (
            <div key={day} className="group relative flex flex-1 flex-col justify-end" title={`${day}: ${format(value)}`}>
              <div
                className={`w-full rounded-t ${value >= 0 ? 'bg-success' : 'bg-danger'}`}
                style={{ height: `${Math.max(3, pct)}%`, opacity: value === 0 ? 0.25 : 0.85 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-text-subtle">
        <span>{data[0]?.[0]}</span>
        <span>{data[data.length - 1]?.[0]}</span>
      </div>
      <div className="mt-2 flex gap-4 text-[10.5px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-success" /> Received
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-danger" /> Issued
        </span>
      </div>
    </div>
  );
}

export function Timeline({
  items,
  emptyLabel = 'Nothing has happened yet.',
}: {
  items: {
    at: string;
    time: string;
    title: string;
    detail?: string;
    meta?: ReactNode;
    tone: Tone;
    icon: string;
    to?: string;
  }[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[12px] text-text-muted">{emptyLabel}</p>;
  }
  return (
    <ol className="relative space-y-0">
      {items.map((item, index) => {
        const body = (
          <>
            <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
              <Icon name={item.icon} size={15} className={TONE_BAR[item.tone].replace('bg-', 'text-')} />
            </span>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-[12.5px] font-bold">{item.title}</p>
                <span className="tnum text-[10.5px] font-semibold text-text-subtle">{item.time}</span>
              </div>
              {item.detail && <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">{item.detail}</p>}
              {item.meta}
            </div>
          </>
        );
        return (
          <li key={`${item.at}-${index}`} className="relative flex gap-3">
            {index < items.length - 1 && (
              <span className="absolute top-7 bottom-0 left-3.5 w-px bg-border" aria-hidden />
            )}
            {item.to ? (
              <Link to={item.to} className="flex min-w-0 flex-1 gap-3 rounded-md hover:bg-surface-muted">
                {body}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
  unit = 'rows',
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  total: number;
  unit?: string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="px-4 py-2.5 text-[11.5px] text-text-muted">
        {total} {unit}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-2.5">
      <p className="tnum text-[11.5px] text-text-muted">
        Page {page + 1} of {pageCount} · {total} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" icon="chevron_left" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* =============================================================== selectors */

export function ProductSelector({
  products,
  value,
  onChange,
  label = 'Product',
  disabled,
  invalid,
  allowEmpty = true,
  placeholder = 'Select a product…',
  id,
}: {
  products: { sku: string; name: string; uom: string; onHand?: number }[];
  value: string;
  onChange: (sku: string) => void;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} invalid={invalid}>
        {allowEmpty && <option value="">{placeholder}</option>}
        {products.map((p) => (
          <option key={p.sku} value={p.sku}>
            {p.sku} — {p.name}
            {p.onHand !== undefined ? ` (${p.onHand.toLocaleString('en-IN')} ${p.uom})` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function LocationSelector({
  locations,
  value,
  onChange,
  label = 'Location',
  disabled,
  invalid,
  allowEmpty = true,
  placeholder = 'Select a location…',
  id,
  showStock,
}: {
  locations: { code: string; name: string; warehouse: string; qty?: number; uom?: string }[];
  value: string;
  onChange: (code: string) => void;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  id?: string;
  showStock?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} invalid={invalid}>
        {allowEmpty && <option value="">{placeholder}</option>}
        {locations.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name} — {l.code}
            {showStock && l.qty !== undefined ? ` (${l.qty.toLocaleString('en-IN')} ${l.uom ?? ''})` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* ============================================================== utilities */

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card mb-4 flex flex-wrap items-end gap-3 p-3 ${className}`}>{children}</div>;
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-[11.5px] text-text-muted">{item.label}</dt>
          <dd className="text-right text-[12px] font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Checklist({ items }: { items: { ok: boolean; label: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2">
          <Icon
            name={item.ok ? 'check_circle' : 'radio_button_unchecked'}
            size={16}
            fill={item.ok}
            className={`mt-px shrink-0 ${item.ok ? 'text-success' : 'text-warning'}`}
          />
          <span className={`text-[12px] ${item.ok ? '' : 'font-semibold text-warning'}`}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Every capability that is not built yet says so — none of them pretend. */
export function ComingSoon({
  title,
  description,
  actionLabel = 'Notify me',
  onAction,
  compact = false,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-card border border-dashed border-border-strong bg-surface-muted text-center ${
        compact ? 'px-4 py-5' : 'px-6 py-10'
      }`}
    >
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
        <Icon name="construction" size={20} className="text-text-subtle" />
      </span>
      <p className="mt-2.5 text-[10.5px] font-bold tracking-[0.14em] text-text-subtle uppercase">Coming soon</p>
      <p className="mt-1 text-[13.5px] font-bold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-[12px] text-text-muted">{description}</p>}
      <p className="mx-auto mt-2 max-w-sm text-[11.5px] text-text-subtle">
        This capability is planned for a future StockSense release.
      </p>
      {onAction && (
        <Button className="mt-3" variant="secondary" icon="notifications" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/** A disabled control that explains itself instead of failing silently. */
export function DisabledWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex flex-col">
      <Button disabled title={hint}>
        {label}
      </Button>
      <span className="mt-1 text-[10.5px] text-text-subtle">{hint}</span>
    </span>
  );
}

export function WarnNote({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'danger' | 'info' | 'success' }) {
  const map = {
    warning: { cls: 'border-warning-border bg-warning-soft text-warning-ink', icon: 'warning' },
    danger: { cls: 'border-danger-border bg-danger-soft text-danger-ink', icon: 'report' },
    info: { cls: 'border-info-border bg-info-soft text-info-ink', icon: 'info' },
    success: { cls: 'border-success-border bg-success-soft text-success-ink', icon: 'check_circle' },
  }[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 ${map.cls}`}>
      <Icon name={map.icon} size={17} className="mt-px shrink-0" fill />
      <div className="min-w-0 text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <SectionTitle icon={icon}>{title}</SectionTitle>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export function DocumentRefLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="ref text-[11.5px] text-primary hover:underline">
      {children}
    </Link>
  );
}

/** Navigates after an action — used to move a user to the next sensible step. */
export function useGoto() {
  const navigate = useNavigate();
  return (to: string) => {
    navigate(to);
  };
}

export { TONE_ICON };
