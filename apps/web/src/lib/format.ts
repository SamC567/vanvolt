/** Number formatting helpers (en-GB). */

const nf = (dp: number) =>
  new Intl.NumberFormat('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function fmt(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  return nf(dp).format(v);
}

/** Energy with automatic Wh/kWh units. */
export function fmtWh(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return fmt(v);
  return Math.abs(v) >= 10000 ? `${fmt(v / 1000, 1)} kWh` : `${fmt(v)} Wh`;
}

export function fmtSigned(v: number, dp = 0): string {
  if (!Number.isFinite(v)) return fmt(v, dp);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), dp)}`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
