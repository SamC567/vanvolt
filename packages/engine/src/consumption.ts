/**
 * Electrical consumption calculator.
 *
 * Energy model (per appliance, per unit):
 *   on-time energy   = powerW × hoursPerDay × dutyCycle
 *   standby energy   = standbyW × (24 − hoursPerDay)
 *   use-day energy   = quantity × (on-time + standby)
 *   weekly energy    = use-day energy × daysPerWeek   (+ standby on non-use days)
 *   average day      = weekly / 7
 *
 * AC loads are supplied through the inverter, so the energy drawn from the
 * battery is the AC energy divided by the inverter's average efficiency.
 * Inverter idle (no-load) consumption is added separately.
 */
import type { Appliance, ApplianceCategory, LoadSupply } from './types';
import { clamp, pct, safe } from './units';

export interface InverterEnergyParams {
  /** Whether an inverter is present and switched on for AC loads. */
  enabled: boolean;
  /** Average conversion efficiency (%). */
  averageEfficiencyPct: number;
  /** Zero-load power draw (W). */
  idleW: number;
  /** Hours per day the inverter is switched on. */
  onHoursPerDay: number;
}

export interface ApplianceEnergy {
  id: string;
  name: string;
  category: ApplianceCategory;
  supply: LoadSupply;
  /** Energy at the appliance on a day it is used (Wh). */
  whPerUseDay: number;
  /** Energy at the appliance per week (Wh). */
  whPerWeek: number;
  /** Weekly energy averaged per day (Wh/day). */
  whPerDayAvg: number;
  /** Energy drawn from the battery, averaged per day, incl. inverter conversion loss (Wh/day). */
  batteryWhPerDayAvg: number;
  /** Battery charge drawn per average day at the battery nominal voltage (Ah/day). */
  batteryAhPerDayAvg: number;
  /** Running power of all units together (W, at the appliance). */
  runningW: number;
  /** Extra power while one unit starts (W). */
  surgeDeltaW: number;
  /** Running current drawn from the battery (A, at nominal voltage). */
  batteryCurrentA: number;
  /** Share of average daily battery energy (%). */
  sharePct: number;
}

export interface LoadDemand {
  /** Sum of running power expected at the same time (W). */
  continuousW: number;
  /** Worst-case instantaneous power when the largest surge load starts (W). */
  peakW: number;
}

export interface ConsumptionResult {
  appliances: ApplianceEnergy[];
  /** Direct DC load energy per average day (Wh). */
  dcLoadWhPerDay: number;
  /** AC load energy at the AC outlets per average day (Wh). */
  acLoadWhPerDay: number;
  /** Inverter conversion loss per average day (Wh). */
  inverterLossWhPerDay: number;
  /** Inverter idle consumption per day (Wh). */
  inverterIdleWhPerDay: number;
  /** Total energy drawn from the battery per average day (Wh). */
  batteryWhPerDay: number;
  /** Total battery charge per average day (Ah) at the battery nominal voltage. */
  batteryAhPerDay: number;
  /** Energy drawn from the battery on a day when every appliance is used (Wh). */
  batteryWhPerFullUseDay: number;
  batteryAhPerFullUseDay: number;
  /** Energy drawn from the battery per week (Wh). */
  batteryWhPerWeek: number;
  batteryAhPerWeek: number;
  /** AC demand at the inverter output. */
  ac: LoadDemand;
  /** DC loads demand (excluding the inverter). */
  dc: LoadDemand;
  /** Combined demand at the battery (DC loads + AC loads ÷ efficiency) (W). */
  battery: LoadDemand;
  byCategory: Partial<Record<ApplianceCategory, number>>;
  voltage: number;
}

/** Energy of a single appliance on a day it is used (Wh at the appliance). */
export function applianceUseDayWh(a: Appliance): number {
  const qty = Math.max(0, Math.floor(safe(a.quantity)));
  const hours = clamp(safe(a.hoursPerDay), 0, 24);
  const duty = pct(safe(a.dutyCyclePct, 100));
  const onWh = safe(a.powerW) * hours * duty;
  const standbyWh = safe(a.standbyW) * (24 - hours);
  return qty * (onWh + standbyWh);
}

/** Weekly energy of a single appliance (Wh at the appliance). */
export function applianceWeeklyWh(a: Appliance): number {
  const days = clamp(Math.round(safe(a.daysPerWeek)), 0, 7);
  const qty = Math.max(0, Math.floor(safe(a.quantity)));
  const useDays = applianceUseDayWh(a) * days;
  // Standby consumption continues on days the appliance is not used.
  const idleDays = qty * safe(a.standbyW) * 24 * (7 - days);
  return useDays + idleDays;
}

/**
 * Peak demand for a set of loads.
 * Loads with `concurrent = true` may all run together. Loads with
 * `concurrent = false` are "exclusive" high-power loads: never used together
 * with each other, but may run alongside the concurrent set.
 * Peak assumes one unit of one load starts while the others are running.
 */
export function loadDemand(
  loads: readonly { runningW: number; surgeW: number; concurrent: boolean }[],
): LoadDemand {
  let base = 0;
  let worstExclusive = 0;
  for (const l of loads) {
    if (l.concurrent) base += l.runningW;
    else worstExclusive = Math.max(worstExclusive, l.runningW);
  }
  const continuousW = base + worstExclusive;
  let peakW = continuousW;
  for (const l of loads) {
    const surgeDelta = Math.max(0, l.surgeW - l.runningW);
    const candidate = l.concurrent
      ? continuousW + surgeDelta
      : base + l.runningW + surgeDelta;
    peakW = Math.max(peakW, candidate);
  }
  return { continuousW, peakW };
}

export function calculateConsumption(
  appliances: readonly Appliance[],
  voltage: number,
  inverter: InverterEnergyParams,
): ConsumptionResult {
  const eff = inverter.enabled ? Math.max(0.01, pct(inverter.averageEfficiencyPct)) : 1;
  const active = appliances.filter((a) => a.enabled);

  const rows: ApplianceEnergy[] = active.map((a) => {
    const qty = Math.max(0, Math.floor(safe(a.quantity)));
    const whPerUseDay = applianceUseDayWh(a);
    const whPerWeek = applianceWeeklyWh(a);
    const whPerDayAvg = whPerWeek / 7;
    const factor = a.supply === 'ac' ? 1 / eff : 1;
    const batteryWhPerDayAvg = whPerDayAvg * factor;
    const runningW = safe(a.powerW) * qty;
    const surgeDeltaW = qty > 0 ? Math.max(0, safe(a.surgeW) - safe(a.powerW)) : 0;
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      supply: a.supply,
      whPerUseDay,
      whPerWeek,
      whPerDayAvg,
      batteryWhPerDayAvg,
      batteryAhPerDayAvg: voltage > 0 ? batteryWhPerDayAvg / voltage : 0,
      runningW,
      surgeDeltaW,
      batteryCurrentA: voltage > 0 ? (runningW * factor) / voltage : 0,
      sharePct: 0,
    };
  });

  let dcLoadWhPerDay = 0;
  let acLoadWhPerDay = 0;
  let fullUseDcWh = 0;
  let fullUseAcWh = 0;
  for (const r of rows) {
    if (r.supply === 'ac') {
      acLoadWhPerDay += r.whPerDayAvg;
      fullUseAcWh += r.whPerUseDay;
    } else {
      dcLoadWhPerDay += r.whPerDayAvg;
      fullUseDcWh += r.whPerUseDay;
    }
  }

  const hasAc = rows.some((r) => r.supply === 'ac');
  const inverterLossWhPerDay = acLoadWhPerDay / eff - acLoadWhPerDay;
  const inverterIdleWhPerDay =
    inverter.enabled && hasAc
      ? safe(inverter.idleW) * clamp(safe(inverter.onHoursPerDay), 0, 24)
      : 0;
  const batteryWhPerDay =
    dcLoadWhPerDay + acLoadWhPerDay + inverterLossWhPerDay + inverterIdleWhPerDay;
  const batteryWhPerFullUseDay = fullUseDcWh + fullUseAcWh / eff + inverterIdleWhPerDay;

  for (const r of rows) {
    r.sharePct = batteryWhPerDay > 0 ? (r.batteryWhPerDayAvg / batteryWhPerDay) * 100 : 0;
  }

  const byCategory: Partial<Record<ApplianceCategory, number>> = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.batteryWhPerDayAvg;
  }

  const demandRows = active.map((a, i) => ({
    supply: a.supply,
    runningW: rows[i]!.runningW,
    surgeW: rows[i]!.runningW + rows[i]!.surgeDeltaW,
    concurrent: a.concurrent,
  }));
  const ac = loadDemand(demandRows.filter((d) => d.supply === 'ac'));
  const dc = loadDemand(demandRows.filter((d) => d.supply === 'dc'));
  const battery = loadDemand(
    demandRows.map((d) =>
      d.supply === 'ac'
        ? { runningW: d.runningW / eff, surgeW: d.surgeW / eff, concurrent: d.concurrent }
        : d,
    ),
  );
  if (inverter.enabled && hasAc) {
    battery.continuousW += safe(inverter.idleW);
    battery.peakW += safe(inverter.idleW);
  }

  return {
    appliances: rows,
    dcLoadWhPerDay,
    acLoadWhPerDay,
    inverterLossWhPerDay,
    inverterIdleWhPerDay,
    batteryWhPerDay,
    batteryAhPerDay: voltage > 0 ? batteryWhPerDay / voltage : 0,
    batteryWhPerFullUseDay,
    batteryAhPerFullUseDay: voltage > 0 ? batteryWhPerFullUseDay / voltage : 0,
    batteryWhPerWeek: batteryWhPerDay * 7,
    batteryAhPerWeek: voltage > 0 ? (batteryWhPerDay * 7) / voltage : 0,
    ac,
    dc,
    battery,
    byCategory,
    voltage,
  };
}
