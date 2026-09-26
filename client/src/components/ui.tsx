import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ *
 * Status pills — colour language carried over from the wireframes
 * ------------------------------------------------------------------ */

const TONES = {
  Ready: 'bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]',
  Waiting: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  Done: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Overdue: 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]',
  Draft: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  Packed: 'bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]',
  Canceled: 'bg-[#F4F4F5] text-[#52525B] border-[#E4E4E7]',
  IN_STOCK: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  LOW: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  OUT: 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]',
  'Pending Approval': 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  Reconciled: 'bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]',
  Posted: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Active: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Receiving: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  'Chill Pass': 'bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]',
  Locked: 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]',
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ value, dot = false }: { value: string; dot?: boolean }) {
  const tone = TONES[value as Tone] ?? TONES.Draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {value}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'teal' | 'plum' | 'error' | 'success' | 'warn';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-container text-on-surface border-outline-variant',
    teal: 'bg-tertiary-container text-on-tertiary-container border-tertiary/25',
    plum: 'bg-primary-container/12 text-primary border-primary/20',
    error: 'bg-error-container text-on-error-container border-error/25',
    success: 'bg-success-container text-on-success-container border-success/25',
    warn: 'bg-warning-container text-on-warning-container border-warning/30',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Ref({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ref text-[12px] ${className}`}>{children}</span>;
}

export function Delta({ value, className = '' }: { value: number; className?: string }) {
  if (value === 0) {
    return (
      <span className={`tnum font-mono text-[12px] font-semibold text-outline ${className}`}>
        0
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`tnum font-mono text-[12px] font-bold ${up ? 'text-success' : 'text-error'} ${className}`}
    >
      {up ? '+' : ''}
      {value}
    </span>
  );
}

export function Icon({ name, size = 18, fill = false, className = '' }: {
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

/* ------------------------------------------------------------------ *
 * Page scaffolding
 * ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-0.5 text-[22px] leading-tight font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] text-on-surface/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
  icon,
}: {
  children: ReactNode;
  right?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-tight">
        {icon && <Icon name={icon} size={17} className="text-primary" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Empty({ icon, title, detail }: { icon: string; title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
        <Icon name={icon} size={24} className="text-outline" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="max-w-sm text-[12px] text-on-surface/55">{detail}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold tracking-wide text-on-surface/60 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-on-surface/45">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-outline-variant bg-surface-low p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${
            value === o.value
              ? 'bg-surface-lowest text-primary shadow-sm'
              : 'text-on-surface/55 hover:text-on-surface'
          }`}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
