/**
 * Charging system: alternator (DC-DC charger or voltage-sensing relay), shore
 * power charger and solar, alone or combined.
 *
 * Energy accounting uses the battery nominal voltage:
 *   E (Wh/day avg) = I_out × V_nominal × hours/day × days/week ÷ 7
 * Charge actually stored = E × battery charge efficiency.
 */
import type { ChargingConfig, Chemistry, InverterConfig, SystemVoltage } from './types';
import { MONTHS, clamp, pct, safe } from './units';
import type { SolarAnalysis } from './solar';
import { CHARGE_VOLTAGE_RATIO } from './solar';

export type ChargeSourceId = 'solar' | 'alternator' | 'shore';

export interface ChargeSourceSummary {
  id: ChargeSourceId;
  label: string;
  enabled: boolean;
  /** Maximum charge current delivered to the battery (A). */
  currentA: number;
  /** Average daily energy delivered (Wh/day), annual average for solar. */
  whPerDayAvg: number;
  /** Energy on a day the source runs (Wh). */
  whPerActiveDay: number;
  /** Current drawn from the vehicle starter battery / alternator (A), alternator only. */
  inputCurrentA?: number;
}

export interface MonthlyBalance {
  month: number;
  label: string;
  solarWh: number;
  alternatorWh: number;
  shoreWh: number;
  totalInWh: number;
  /** Charge energy available to loads after battery efficiency (Wh/day). */
  storedWh: number;
  consumptionWh: number;
  netWh: number;
  /** Fraction of consumption covered by charging (%), capped at 100. */
  coveragePct: number;
  /** Coverage from solar alone (%), capped at 100. */
  solarCoveragePct: number;
}

export interface ChargingAnalysis {
  sources: ChargeSourceSummary[];
  monthly: MonthlyBalance[];
  /** Combined maximum charge current when all sources run together (A). */
  simultaneousCurrentA: number;
  batteryMaxChargeA: number;
  simultaneousOk: boolean;
  worstMonth: MonthlyBalance;
  bestMonth: MonthlyBalance;
  /** Average alternator charging hours per day needed to balance the worst month. */
  alternatorHoursPerDayNeeded: number;
}

export interface ChargingInputs {
  config: ChargingConfig;
  inverter: InverterConfig;
  solar: SolarAnalysis | null;
  systemVoltage: SystemVoltage;
  /** Battery bank nominal voltage (V). */
  bankVoltage: number;
  chemistry: Chemistry;
  chargeEfficiencyPct: number;
  batteryMaxChargeA: number;
  dailyConsumptionWh: number;
}

/** Vehicle electrical system voltage assumed for the DC-DC input when not specified (V). */
export const DEFAULT_VEHICLE_VOLTAGE = 12;

export function alternatorCurrent(config: ChargingConfig['alternator']): number {
  if (!config.enabled) return 0;
  return config.method === 'dcdc'
    ? safe(config.dcdc.outputCurrentA) * Math.max(1, Math.floor(safe(config.dcdcCount, 1)))
    : safe(config.vsrCurrentA);
}

/** Current drawn from the vehicle side by DC-DC chargers (A). */
export function dcdcInputCurrent(
  outputA: number,
  bankVoltage: number,
  efficiencyPct: number,
  vehicleVoltage = DEFAULT_VEHICLE_VOLTAGE,
): number {
  const eff = pct(efficiencyPct);
  if (eff <= 0 || vehicleVoltage <= 0) return 0;
  const vOut = bankVoltage * CHARGE_VOLTAGE_RATIO;
  return (outputA * vOut) / (vehicleVoltage * eff);
}

export function shoreCurrent(config: ChargingConfig['shore'], inverter: InverterConfig): number {
  if (!config.enabled) return 0;
  if (config.useInverterCharger) return safe(inverter.model.chargerA);
  return safe(config.charger.outputCurrentA);
}

/** Average energy per day for a source running `hours` on `days` days per week. */
export function weeklyAveragedWh(currentA: number, voltage: number, hours: number, days: number): number {
  return (
    safe(currentA) * safe(voltage) * clamp(safe(hours), 0, 24) * (clamp(Math.round(safe(days)), 0, 7) / 7)
  );
}

export function analyseCharging(input: ChargingInputs): ChargingAnalysis {
  const { config, bankVoltage } = input;
  const alt = config.alternator;
  const shore = config.shore;

  const altA = alternatorCurrent(alt);
  const altActive = altA * bankVoltage * clamp(safe(alt.drivingHoursPerDay), 0, 24);
  const altAvg = weeklyAveragedWh(altA, bankVoltage, alt.drivingHoursPerDay, alt.drivingDaysPerWeek);
  const altInputA =
    alt.enabled && alt.method === 'dcdc'
      ? dcdcInputCurrent(altA, bankVoltage, alt.dcdc.efficiencyPct, alt.dcdc.inputVoltage ?? DEFAULT_VEHICLE_VOLTAGE)
      : altA;

  const shoreA = shoreCurrent(shore, input.inverter);
  const shoreActive = shoreA * bankVoltage * clamp(safe(shore.hoursPerDay), 0, 24);
  const shoreAvg = weeklyAveragedWh(shoreA, bankVoltage, shore.hoursPerDay, shore.daysPerWeek);

  const solar = input.solar;
  const solarCapA = solar && solar.installedW > 0 ? solar.strings.maxOutputCurrentA : 0;

  const sources: ChargeSourceSummary[] = [
    {
      id: 'solar',
      label: 'Solar',
      enabled: !!solar && solar.installedW > 0,
      currentA: solarCapA,
      whPerDayAvg: solar ? solar.annualAvgWhPerDay : 0,
      whPerActiveDay: solar ? solar.annualAvgWhPerDay : 0,
    },
    {
      id: 'alternator',
      label: alt.method === 'dcdc' ? 'Alternator (DC-DC)' : 'Alternator (relay)',
      enabled: alt.enabled,
      currentA: altA,
      whPerDayAvg: altAvg,
      whPerActiveDay: altActive,
      inputCurrentA: altInputA,
    },
    {
      id: 'shore',
      label: 'Shore power',
      enabled: shore.enabled,
      currentA: shoreA,
      whPerDayAvg: shoreAvg,
      whPerActiveDay: shoreActive,
    },
  ];

  const eff = pct(input.chargeEfficiencyPct);
  const monthly: MonthlyBalance[] = MONTHS.map((label, i) => {
    const solarWh = solar?.monthly[i]?.whPerDay ?? 0;
    const totalInWh = solarWh + altAvg + shoreAvg;
    const storedWh = totalInWh * eff;
    const consumptionWh = input.dailyConsumptionWh;
    const cover = (wh: number) =>
      consumptionWh > 0 ? Math.min(100, ((wh * eff) / consumptionWh) * 100) : 100;
    return {
      month: i + 1,
      label,
      solarWh,
      alternatorWh: altAvg,
      shoreWh: shoreAvg,
      totalInWh,
      storedWh,
      consumptionWh,
      netWh: storedWh - consumptionWh,
      coveragePct: cover(totalInWh),
      solarCoveragePct: cover(solarWh),
    };
  });
  const byNet = [...monthly].sort((a, b) => a.netWh - b.netWh);
  const worstMonth = byNet[0]!;
  const bestMonth = byNet[byNet.length - 1]!;

  const simultaneousCurrentA = sources.filter((s) => s.enabled).reduce((t, s) => t + s.currentA, 0);

  // Average alternator charging hours per day needed to balance the worst month.
  const otherStored = (worstMonth.solarWh + worstMonth.shoreWh) * eff;
  const neededWh = Math.max(0, input.dailyConsumptionWh - otherStored);
  const altPerHourStored = altA * bankVoltage * eff;
  const alternatorHoursPerDayNeeded =
    neededWh === 0 ? 0 : altPerHourStored > 0 ? neededWh / altPerHourStored : Number.POSITIVE_INFINITY;

  return {
    sources,
    monthly,
    simultaneousCurrentA,
    batteryMaxChargeA: input.batteryMaxChargeA,
    simultaneousOk: input.batteryMaxChargeA <= 0 || simultaneousCurrentA <= input.batteryMaxChargeA,
    worstMonth,
    bestMonth,
    alternatorHoursPerDayNeeded,
  };
}
