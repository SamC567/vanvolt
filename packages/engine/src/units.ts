/** Small numeric helpers shared by the engine. All functions are pure. */

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Convert a percentage (e.g. 80) to a fraction (0.8), clamped to [0, 1]. */
export function pct(value: number): number {
  return clamp(value, 0, 100) / 100;
}

/** Non-negative finite number or fallback. Guards calculations against bad input. */
export function safe(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Wh → Ah at a given voltage. */
export function whToAh(wh: number, voltage: number): number {
  return voltage > 0 ? wh / voltage : 0;
}

/** Ah → Wh at a given voltage. */
export function ahToWh(ah: number, voltage: number): number {
  return ah * voltage;
}

/** Current drawn for a power at a voltage, optionally through a converter of given efficiency. */
export function currentFor(powerW: number, voltage: number, efficiency = 1): number {
  if (voltage <= 0 || efficiency <= 0) return 0;
  return powerW / (voltage * efficiency);
}

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Day-of-year for the 15th of a month (1-based month), non-leap year. */
export function midMonthDayOfYear(month: number): number {
  let day = 0;
  for (let m = 0; m < month - 1; m++) day += DAYS_IN_MONTH[m] ?? 30;
  return day + 15;
}

/**
 * Classify a battery bank nominal voltage into a 12/24/48 V system class.
 * Returns null if the voltage does not fall in a recognised band.
 */
export function voltageClass(nominalV: number): 12 | 24 | 48 | null {
  if (nominalV >= 10 && nominalV <= 16) return 12;
  if (nominalV >= 20 && nominalV <= 32) return 24;
  if (nominalV >= 40 && nominalV <= 64) return 48;
  return null;
}

let idCounter = 0;
/** Short unique id (not cryptographic). */
export function uid(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}${idCounter.toString(36)}`;
}

/** Deep copy of plain JSON-compatible data (designs, library items). */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
