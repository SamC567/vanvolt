/**
 * Battery bank designer.
 *
 * Bank:   V_bank = V_module × series,  Ah_bank = Ah_module × parallel,  Wh = V × Ah
 * Usable: Wh_usable = Wh_nominal × DoD × Peukert factor
 * Autonomy (days) = Wh_usable / daily battery energy
 *
 * Peukert (lead-acid): capacity at current I relative to the rated (C20) capacity
 *   C_I / C_rated = (I_rated / I)^(k − 1),  I_rated = C_rated / 20 h
 * VanVolt caps the factor at 1.0 (no credit for discharging slower than C20), which is
 * conservative.
 */
import type { BatteryConfig, BatteryModule, Chemistry, CycleLifePoint, SourceRef } from './types';
import { clamp, pct, safe, voltageClass } from './units';

export interface ChemistryParams {
  id: Chemistry;
  label: string;
  /** Default usable depth of discharge (%). */
  defaultDodPct: number;
  /** Highest DoD VanVolt allows before flagging a warning (%). */
  maxRecommendedDodPct: number;
  /** Battery energy (round-trip) efficiency used for charging accounting (%). */
  chargeEfficiencyPct: number;
  /** Peukert exponent. 1.0 = no rate effect. */
  peukertExponent: number;
  /** Nominal voltage of a single cell (V). */
  cellNominalV: number;
  /** Design minimum terminal voltage per 12 V-class block under load (V). */
  minVoltagePer12V: number;
  /** Rated discharge period for the published capacity (h). */
  ratedHours: number;
  /** Fallback max continuous charge rate if the module has no datasheet value (C). */
  fallbackMaxChargeC: number;
  /** Fallback max continuous discharge rate if the module has no datasheet value (C). */
  fallbackMaxDischargeC: number;
  /** Lowest recommended charging temperature (°C). */
  minChargeTempC: number;
  /** State-of-charge (fraction) above which charge acceptance tapers. */
  taperStartSoc: number;
  notes: string;
  sources: SourceRef[];
}

export interface BankSpec {
  nominalVoltage: number;
  capacityAh: number;
  nominalWh: number;
  voltageClass: 12 | 24 | 48 | null;
  moduleCount: number;
  weightKg: number | null;
  maxContinuousDischargeA: number;
  maxContinuousChargeA: number;
  peakDischargeA: number | null;
  /** True when the discharge/charge limits come from module data, not fallbacks. */
  limitsFromDatasheet: boolean;
}

export function bankSpec(
  module: BatteryModule,
  series: number,
  parallel: number,
  chem: ChemistryParams,
): BankSpec {
  const s = Math.max(1, Math.floor(safe(series, 1)));
  const p = Math.max(1, Math.floor(safe(parallel, 1)));
  const nominalVoltage = safe(module.nominalVoltage) * s;
  const capacityAh = safe(module.capacityAh) * p;
  const fromSheet =
    module.maxContinuousDischargeA !== undefined && module.maxContinuousChargeA !== undefined;
  const maxDis = module.maxContinuousDischargeA ?? module.capacityAh * chem.fallbackMaxDischargeC;
  const maxChg = module.maxContinuousChargeA ?? module.capacityAh * chem.fallbackMaxChargeC;
  return {
    nominalVoltage,
    capacityAh,
    nominalWh: nominalVoltage * capacityAh,
    voltageClass: voltageClass(nominalVoltage),
    moduleCount: s * p,
    weightKg: module.weightKg !== undefined ? module.weightKg * s * p : null,
    // Parallel strings share current; series modules carry the same current.
    maxContinuousDischargeA: maxDis * p,
    maxContinuousChargeA: maxChg * p,
    peakDischargeA: module.peakDischargeA !== undefined ? module.peakDischargeA * p : null,
    limitsFromDatasheet: fromSheet,
  };
}

/**
 * Fraction of rated capacity available when discharging at `currentA`.
 * Capped at 1 (conservative). Returns 1 for zero/negative current.
 */
export function peukertFactor(
  ratedAh: number,
  currentA: number,
  exponent: number,
  ratedHours = 20,
): number {
  if (currentA <= 0 || ratedAh <= 0 || exponent <= 1) return 1;
  const ratedCurrent = ratedAh / ratedHours;
  const factor = (ratedCurrent / currentA) ** (exponent - 1);
  return Math.min(1, factor);
}

/** Usable energy (Wh) of a bank. */
export function usableEnergyWh(nominalWh: number, dodPct: number, peukert = 1): number {
  return safe(nominalWh) * pct(dodPct) * clamp(peukert, 0, 1);
}

/** Days of autonomy with no charging. Infinity when consumption is zero. */
export function autonomyDays(usableWh: number, dailyWh: number): number {
  if (dailyWh <= 0) return Number.POSITIVE_INFINITY;
  return usableWh / dailyWh;
}

/** Bank capacity (Ah) required to cover `days` of consumption at the given voltage and DoD. */
export function requiredCapacityAh(
  dailyWh: number,
  days: number,
  voltage: number,
  dodPct: number,
  peukert = 1,
): number {
  const dod = pct(dodPct);
  if (voltage <= 0 || dod <= 0 || peukert <= 0) return 0;
  return (safe(dailyWh) * safe(days)) / (voltage * dod * peukert);
}

/**
 * Interpolate cycle life at a DoD from datasheet points (log-linear between points,
 * clamped to the published range). Returns null if no data.
 */
export function cycleLifeAt(
  points: readonly CycleLifePoint[] | undefined,
  dodPct: number,
): number | null {
  if (!points || points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.dodPct - b.dodPct);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (dodPct <= first.dodPct) return first.cycles;
  if (dodPct >= last.dodPct) return last.cycles;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (dodPct >= a.dodPct && dodPct <= b.dodPct) {
      const t = (dodPct - a.dodPct) / (b.dodPct - a.dodPct);
      return Math.exp(Math.log(a.cycles) + t * (Math.log(b.cycles) - Math.log(a.cycles)));
    }
  }
  return null;
}

/**
 * Estimated service life in years using an energy-throughput model:
 *   lifetime throughput = cycles × DoD × nominal Wh
 *   years = throughput / (daily battery Wh × 365)
 * Ignores calendar ageing, so it is an upper bound.
 */
export function estimatedLifeYears(
  cycles: number | null,
  dodPct: number,
  nominalWh: number,
  dailyWh: number,
): number | null {
  if (cycles === null || dailyWh <= 0) return null;
  return (cycles * pct(dodPct) * nominalWh) / (dailyWh * 365);
}

/** Design minimum voltage of a bank under load. */
export function minimumBankVoltage(nominalV: number, chem: ChemistryParams): number {
  const blocks = nominalV / (chem.id === 'lifepo4' ? 12.8 : 12);
  return blocks * chem.minVoltagePer12V;
}

export interface BatteryAnalysis {
  bank: BankSpec;
  chemistry: ChemistryParams;
  dodPct: number;
  chargeEfficiencyPct: number;
  peukertExponent: number;
  /** Discharge current used to evaluate Peukert (A). */
  peukertCurrentA: number;
  peukertFactor: number;
  usableWh: number;
  usableAh: number;
  autonomyDays: number;
  autonomyTargetDays: number;
  requiredAhForTarget: number;
  /** Parallel strings of the selected module needed for the target. */
  recommendedParallel: number;
  cycleLife: number | null;
  estimatedLifeYears: number | null;
  minimumVoltage: number;
  /** Peak battery discharge current (A) at minimum voltage. */
  peakDischargeA: number;
  continuousDischargeA: number;
}

/** Hours over which daily consumption is assumed to be drawn for the Peukert current. */
export const PEUKERT_ACTIVE_HOURS = 16;

export function analyseBattery(
  config: BatteryConfig,
  chem: ChemistryParams,
  dailyBatteryWh: number,
  continuousW: number,
  peakW: number,
): BatteryAnalysis {
  const bank = bankSpec(config.module, config.series, config.parallel, chem);
  const exponent = config.peukertExponent ?? chem.peukertExponent;
  const chargeEff = config.chargeEfficiencyPct ?? chem.chargeEfficiencyPct;
  const v = bank.nominalVoltage;
  const peukertCurrentA = v > 0 ? dailyBatteryWh / v / PEUKERT_ACTIVE_HOURS : 0;
  const pf = peukertFactor(bank.capacityAh, peukertCurrentA, exponent, chem.ratedHours);
  const usableWh = usableEnergyWh(bank.nominalWh, config.dodPct, pf);
  const requiredAh = requiredCapacityAh(
    dailyBatteryWh,
    config.autonomyTargetDays,
    v,
    config.dodPct,
    pf,
  );
  const modAh = safe(config.module.capacityAh);
  const cycles = cycleLifeAt(config.module.cycleLife, config.dodPct);
  const vMin = minimumBankVoltage(v, chem);
  return {
    bank,
    chemistry: chem,
    dodPct: config.dodPct,
    chargeEfficiencyPct: chargeEff,
    peukertExponent: exponent,
    peukertCurrentA,
    peukertFactor: pf,
    usableWh,
    usableAh: v > 0 ? usableWh / v : 0,
    autonomyDays: autonomyDays(usableWh, dailyBatteryWh),
    autonomyTargetDays: config.autonomyTargetDays,
    requiredAhForTarget: requiredAh,
    recommendedParallel: modAh > 0 ? Math.max(1, Math.ceil(requiredAh / modAh - 1e-9)) : 1,
    cycleLife: cycles,
    estimatedLifeYears: estimatedLifeYears(cycles, config.dodPct, bank.nominalWh, dailyBatteryWh),
    minimumVoltage: vMin,
    peakDischargeA: vMin > 0 ? peakW / vMin : 0,
    continuousDischargeA: vMin > 0 ? continuousW / vMin : 0,
  };
}

/** Capacity available at a range of discharge rates — for the Peukert chart. */
export function peukertCurve(
  ratedAh: number,
  exponent: number,
  ratedHours = 20,
): { hours: number; currentA: number; capacityPct: number }[] {
  const hours = [1, 2, 3, 5, 10, 20];
  return hours.map((h) => {
    // Solve C_I = C_rated (I_r/I)^(k-1) with I = C_I / h  → I = (C_rated/h) ... iterate.
    let current = ratedAh / h;
    for (let i = 0; i < 30; i++) {
      const cap = ratedAh * Math.min(1, (ratedAh / ratedHours / current) ** (exponent - 1));
      current = cap / h;
    }
    const capPct = ((current * h) / ratedAh) * 100;
    return { hours: h, currentA: current, capacityPct: capPct };
  });
}
