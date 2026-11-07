/**
 * Shared UI building blocks.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, ExternalLink, Info, X } from 'lucide-react';
import type { Finding, Provenance, Severity, SourceRef } from '@vanvolt/engine';

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Grid({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const map = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 xl:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  };
  return <div className={clsx('grid grid-cols-1 gap-4', map[cols], className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  hint,
  disabled,
  badge,
  compact,
  ariaLabel,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <div className={clsx(compact ? '' : 'min-w-0')}>
      {label && (
        <label htmlFor={id} className="label flex items-center gap-1.5">
          <span>{label}</span>
          {badge}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          aria-label={ariaLabel ?? label}
          type="number"
          inputMode="decimal"
          className={clsx('input num', unit && 'pr-12', compact && 'py-1')}
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            setText(Number.isFinite(value) ? String(value) : '');
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-ink3">
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-ink3">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      {multiline ? (
        <textarea
          id={id}
          className="input min-h-[72px]"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
  group?: string;
  disabled?: boolean;
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  badge,
  ariaLabel,
}: {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hint?: ReactNode;
  badge?: ReactNode;
  ariaLabel?: string;
}) {
  const id = useId();
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  const render = (o: Option<T>) => (
    <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
      {o.label}
    </option>
  );
  return (
    <div className="min-w-0">
      {label && (
        <label htmlFor={id} className="label flex items-center gap-1.5">
          <span>{label}</span>
          {badge}
        </label>
      )}
      <select
        id={id}
        aria-label={ariaLabel ?? label}
        className="input pr-8"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
      >
        {groups.length > 1
          ? groups.map((g) => (
              <optgroup key={g} label={g || 'Other'}>
                {options.filter((o) => (o.group ?? '') === g).map(render)}
              </optgroup>
            ))
          : options.map(render)}
      </select>
      {hint && <p className="mt-1 text-xs text-ink3">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          checked ? 'bg-accent' : 'bg-surface3',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium">{label}</span>}
          {description && <span className="block text-xs text-ink3">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-line bg-surface2 p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1 text-sm font-medium transition',
            o.value === value ? 'bg-surface text-ink shadow-card' : 'text-ink2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  marker,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
  marker?: { value: number; label: string };
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-ink2">
          {label}
        </label>
        <span className="num text-sm font-semibold">
          {value}
          {unit && <span className="ml-0.5 text-xs font-normal text-ink3">{unit}</span>}
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          className="w-full"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {marker && (
          <div
            className="pointer-events-none absolute -bottom-3 text-[10px] text-ink3"
            style={{ left: `calc(${((marker.value - min) / (max - min)) * 100}% - 12px)` }}
            title={marker.label}
          >
            ▲ {marker.label}
          </div>
        )}
      </div>
      {hint && <p className={clsx('text-xs text-ink3', marker ? 'mt-4' : 'mt-1')}>{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  unit,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'good' | 'warn' | 'crit';
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs font-medium text-ink3">
        <span>{label}</span>
        {icon && <span className="text-ink3">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={clsx(
            'num text-2xl font-semibold tracking-tight',
            tone === 'crit' && 'text-crit',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-ink3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink2">{sub}</div>}
    </div>
  );
}

export function KeyValue({
  items,
}: {
  items: { label: ReactNode; value: ReactNode; badge?: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-line text-sm">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1.5">
          <dt className="flex items-center gap-1.5 text-ink2">
            {it.label}
            {it.badge}
          </dt>
          <dd className="num text-right font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal meter: value against a limit. */
export function Meter({
  value,
  limit,
  label,
  unit,
}: {
  value: number;
  limit: number;
  label: string;
  unit: string;
}) {
  const ratio = limit > 0 ? value / limit : 0;
  const pct = Math.min(100, ratio * 100);
  const over = ratio > 1;
  const near = ratio > 0.8 && !over;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink2">{label}</span>
        <span className="num font-medium">
          {Math.round(value).toLocaleString('en-GB')} / {Math.round(limit).toLocaleString('en-GB')}{' '}
          {unit}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface3"
        role="meter"
        aria-valuenow={value}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={clsx('h-full rounded-full', over ? 'bg-crit' : near ? 'bg-warn' : 'bg-good')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(over || near) && (
        <p
          className={clsx('mt-1 flex items-center gap-1 text-xs', over ? 'text-crit' : 'text-ink2')}
        >
          {over ? <AlertOctagon size={12} /> : <AlertTriangle size={12} className="text-warn" />}
          {over ? 'Exceeds limit' : 'Above 80 % of limit'}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Provenance and sources                                              */
/* ------------------------------------------------------------------ */

export const PROVENANCE_META: Record<Provenance, { label: string; title: string; dot: string }> = {
  manufacturer: {
    label: 'Manufacturer',
    title: 'Taken from a manufacturer datasheet or product page',
    dot: 'bg-[var(--series-1)]',
  },
  standard: {
    label: 'Standard',
    title: 'From a published standard or recognised technical reference',
    dot: 'bg-[var(--series-7)]',
  },
  user: { label: 'Your input', title: 'Entered or edited by you', dot: 'bg-ink3' },
  assumption: {
    label: 'Assumption',
    title: 'A documented VanVolt engineering assumption — editable',
    dot: 'bg-[var(--series-4)]',
  },
  estimate: {
    label: 'Estimate',
    title: 'A generic typical value, not tied to a specific product',
    dot: 'bg-[var(--series-5)]',
  },
  calculated: {
    label: 'Calculated',
    title: 'An estimate calculated by the VanVolt engine',
    dot: 'bg-[var(--series-3)]',
  },
};

export function ProvenanceBadge({
  provenance,
  source,
}: {
  provenance: Provenance;
  source?: SourceRef | undefined;
}) {
  const m = PROVENANCE_META[provenance];
  const secondary = source?.verification === 'secondary';
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface2 px-1.5 py-px text-[10px] font-medium text-ink2"
      title={`${m.title}${source ? ` — ${source.title}` : ''}${secondary ? ' (secondary: not yet checked against the document)' : ''}`}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', m.dot)} aria-hidden />
      {m.label}
      {secondary && <span className="text-ink3">*</span>}
    </span>
  );
}

/** Parse a URL and accept only http(s) — data from imported designs is untrusted. */
export function safeHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export function SourceLink({
  source,
  compact,
}: {
  source?: SourceRef | undefined;
  compact?: boolean;
}) {
  if (!source || !source.url) return null;
  const url = safeHttpUrl(source.url);
  if (!url)
    return (
      <span
        className="text-xs text-ink3"
        title="Link hidden: only http(s) addresses are shown as links"
      >
        {source.title} (unsupported link)
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <a
        href={url.href}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-accent hover:underline"
        title={source.title}
      >
        <ExternalLink size={12} />
        {compact ? 'Source' : source.title}
      </a>
      {!compact && <span className="text-ink3">{url.hostname}</span>}
      {source.verification === 'document' ? (
        <span
          className="rounded bg-surface2 px-1 text-[10px] text-ink2"
          title="Checked against the cited document"
        >
          verified
        </span>
      ) : source.verification === 'secondary' ? (
        <span
          className="rounded bg-surface2 px-1 text-[10px] text-ink3"
          title="Reported from the source via search extracts — check the datasheet before relying on it"
        >
          secondary — verify
        </span>
      ) : null}
      {source.note && !compact && <span className="text-ink3">{source.note}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const SEV_META: Record<Severity, { icon: typeof Info; label: string; cls: string }> = {
  critical: { icon: AlertOctagon, label: 'Critical', cls: 'text-crit' },
  warning: { icon: AlertTriangle, label: 'Warning', cls: 'text-warn' },
  info: { icon: Info, label: 'Info', cls: 'text-accent' },
};

export function StatusPill({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  const map = {
    ok: { icon: CheckCircle2, label: 'No issues', cls: 'text-good' },
    warning: { icon: AlertTriangle, label: 'Warnings', cls: 'text-warn' },
    critical: { icon: AlertOctagon, label: 'Critical issues', cls: 'text-crit' },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium">
      <Icon size={14} className={m.cls} aria-hidden />
      {m.label}
    </span>
  );
}

export function FindingsList({
  findings,
  empty = 'No issues found.',
}: {
  findings: Finding[];
  empty?: string;
}) {
  if (findings.length === 0)
    return (
      <p className="flex items-center gap-2 text-sm text-ink2">
        <CheckCircle2 size={16} className="text-good" /> {empty}
      </p>
    );
  return (
    <ul className="space-y-2">
      {findings.map((f) => {
        const m = SEV_META[f.severity];
        const Icon = m.icon;
        return (
          <li
            key={f.id}
            className="flex gap-2.5 rounded-lg border border-line bg-surface2/50 p-2.5 text-sm"
          >
            <Icon size={16} className={clsx('mt-0.5 shrink-0', m.cls)} aria-label={m.label} />
            <div className="min-w-0">
              <p>
                <span className="sr-only">{m.label}: </span>
                {f.message}
              </p>
              {f.advice && <p className="mt-0.5 text-xs text-ink2">{f.advice}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusIcon({ status }: { status: 'ok' | 'warning' | 'incompatible' | 'critical' }) {
  if (status === 'ok') return <CheckCircle2 size={16} className="text-good" aria-label="OK" />;
  if (status === 'warning')
    return <AlertTriangle size={16} className="text-warn" aria-label="Warning" />;
  return <AlertOctagon size={16} className="text-crit" aria-label="Problem" />;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'card flex max-h-[90vh] w-full flex-col overflow-hidden rounded-b-none shadow-pop sm:rounded-xl',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="btn btn-ghost px-1.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return (
    <div
      className={clsx(
        'flex gap-2.5 rounded-lg border p-3 text-sm',
        tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-line bg-surface2/60',
      )}
    >
      {tone === 'warn' ? (
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
      ) : (
        <Info size={16} className="mt-0.5 shrink-0 text-accent" />
      )}
      <div className="min-w-0 text-ink2">{children}</div>
    </div>
  );
}
