/**
 * Solar designer.
 *
 * Daily yield for month m:
 *   E_m (Wh/day) = P_installed (W) × PSH_m (h) × Π(1 − loss_i) × η_controller × f_PWM
 *
 * PSH ("peak sun hours") is the average daily irradiation on the module plane in
 * kWh/m²/day, numerically equal to hours at the 1000 W/m² STC irradiance.
 */
import type { SolarConfig, SourceRef, SystemVoltage } from './types';
import { clamp, mean, pct, safe } from './units';

export interface IrradianceLocation {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Radiation database used, e.g. PVGIS-SARAH3. */
  database: string;
  /** Average daily irradiation on a horizontal plane, per month (kWh/m²/day). */
  horizontal: number[];
  /** Average daily irradiation on an equator-facing plane at `tiltDeg`, per month. */
  tilted?: number[];
  tiltDeg?: number;
  /** PVGIS annual yield for a flat 1 kWp array with 14 % system loss (kWh/kWp/yr), for cross-checks. */
  pvgisFlatYieldKwhPerKwp?: number;
  source: SourceRef;
}

export interface SolarLossBreakdown {
  shading: number;
  orientation: number;
  temperature: number;
  soiling: number;
  reflection: number;
  wiring: number;
  controller: number;
  pwm: number;
  /** Product of all factors (fraction of STC energy delivered to the battery). */
  overall: number;
}

/** Average battery charging voltage relative to nominal, used for PWM and current estimates. */
export const CHARGE_VOLTAGE_RATIO = 13.6 / 12;
/** Fallback PWM factor when the panel Vmp is unknown. */
export const PWM_FALLBACK_FACTOR = 0.75;
/** Lowest cell temperature assumed for open-circuit voltage checks (°C). */
export const DESIGN_MIN_CELL_TEMP_C = -10;
/** Voc temperature coefficient used when the datasheet value is unavailable (%/°C). */
export const FALLBACK_VOC_COEFF_PCT_PER_C = -0.35;

/** PWM controllers pull the array down to battery voltage, wasting the Vmp headroom. */
export function pwmFactor(
  systemVoltage: number,
  vmpV: number | undefined,
  panelsInSeries: number,
): number {
  if (!vmpV || vmpV <= 0) return PWM_FALLBACK_FACTOR;
  const vCharge = systemVoltage * CHARGE_VOLTAGE_RATIO;
  return clamp(vCharge / (vmpV * Math.max(1, panelsInSeries)), 0, 1);
}

export function solarLosses(config: SolarConfig, systemVoltage: number): SolarLossBreakdown {
  const f = (lossPct: number) => 1 - pct(safe(lossPct));
  const shading = f(config.shadingLossPct);
  const orientation = f(config.orientationLossPct);
  const temperature = f(config.temperatureLossPct);
  const soiling = f(config.soilingLossPct);
  const reflection = f(config.reflectionLossPct);
  const wiring = f(config.wiringLossPct);
  const controller = pct(safe(config.controllerEfficiencyPct, 100));
  const pwm =
    config.controllerType === 'pwm'
      ? pwmFactor(systemVoltage, config.panel.vmpV, config.panelsInSeries)
      : 1;
  return {
    shading,
    orientation,
    temperature,
    soiling,
    reflection,
    wiring,
    controller,
    pwm,
    overall: shading * orientation * temperature * soiling * reflection * wiring * controller * pwm,
  };
}

export function installedPowerW(config: SolarConfig): number {
  if (!config.enabled) return 0;
  return safe(config.panel.powerW) * Math.max(0, Math.floor(safe(config.quantity)));
}

/** Monthly PSH series for the chosen mounting. Falls back to horizontal data. */
export function planeIrradiance(
  location: IrradianceLocation,
  mounting: SolarConfig['mounting'],
): number[] {
  if (mounting === 'tilted' && location.tilted && location.tilted.length === 12) {
    return location.tilted;
  }
  return location.horizontal;
}

export interface MonthlySolar {
  month: number; // 1-12
  psh: number;
  whPerDay: number;
}

export interface SolarStringCheck {
  strings: number;
  unevenStrings: boolean;
  arrayVmpV: number | null;
  arrayVocV: number | null;
  /** Open-circuit voltage at the design minimum cell temperature. */
  arrayVocColdV: number | null;
  vocOk: boolean | null;
  /** Estimated controller output current at full STC power (A). */
  maxOutputCurrentA: number;
  controllerCurrentOk: boolean | null;
  controllerPowerOk: boolean | null;
}

export interface SolarAnalysis {
  installedW: number;
  losses: SolarLossBreakdown;
  monthly: MonthlySolar[];
  annualAvgWhPerDay: number;
  bestMonth: MonthlySolar;
  worstMonth: MonthlySolar;
  /** Average of the three summer months for the location's hemisphere. */
  summerWhPerDay: number;
  winterWhPerDay: number;
  /** Panel power needed to cover consumption in the worst month (W). */
  requiredWForWorstMonth: number;
  requiredWForSummer: number;
  strings: SolarStringCheck;
  location: IrradianceLocation;
}

/** Summer/winter month numbers for a latitude (meteorological seasons). */
export function seasonMonths(lat: number): { summer: number[]; winter: number[] } {
  const north = { summer: [6, 7, 8], winter: [12, 1, 2] };
  return lat >= 0 ? north : { summer: north.winter, winter: north.summer };
}

export function stringCheck(config: SolarConfig, systemVoltage: SystemVoltage): SolarStringCheck {
  const qty = Math.max(0, Math.floor(safe(config.quantity)));
  const series = Math.max(1, Math.floor(safe(config.panelsInSeries, 1)));
  const strings = Math.floor(qty / series);
  const unevenStrings = qty % series !== 0;
  const p = config.panel;
  const arrayVmpV = p.vmpV ? p.vmpV * series : null;
  const arrayVocV = p.vocV ? p.vocV * series : null;
  const coeff = (p.tempCoeffVocPctPerC ?? FALLBACK_VOC_COEFF_PCT_PER_C) / 100;
  const arrayVocColdV = arrayVocV ? arrayVocV * (1 + coeff * (DESIGN_MIN_CELL_TEMP_C - 25)) : null;
  const ctrl = config.controllerType === 'mppt' ? config.controller : undefined;
  const vocOk = ctrl && arrayVocColdV !== null ? arrayVocColdV <= ctrl.maxPvVoltageV : null;
  const installed = installedPowerW(config);
  const losses = solarLosses(config, systemVoltage);
  const maxOutputCurrentA =
    (installed * losses.controller * losses.wiring) / (systemVoltage * CHARGE_VOLTAGE_RATIO);
  const controllerCurrentOk = ctrl ? maxOutputCurrentA <= ctrl.maxChargeCurrentA : null;
  const ratedPower = ctrl?.maxPvPowerW?.[systemVoltage];
  const controllerPowerOk = ratedPower !== undefined ? installed <= ratedPower : null;
  return {
    strings,
    unevenStrings,
    arrayVmpV,
    arrayVocV,
    arrayVocColdV,
    vocOk,
    maxOutputCurrentA,
    controllerCurrentOk,
    controllerPowerOk,
  };
}

/**
 * Daily solar energy for each month. Controller clipping is flagged by the string check
 * rather than applied to daily energy (it only affects the midday peak).
 */
export function analyseSolar(
  config: SolarConfig,
  location: IrradianceLocation,
  systemVoltage: SystemVoltage,
  dailyConsumptionWh: number,
): SolarAnalysis {
  const installedW = installedPowerW(config);
  const losses = solarLosses(config, systemVoltage);
  const psh = planeIrradiance(location, config.mounting);
  const monthly: MonthlySolar[] = psh.map((h, i) => ({
    month: i + 1,
    psh: h,
    whPerDay: installedW * h * losses.overall,
  }));
  const sorted = [...monthly].sort((a, b) => a.whPerDay - b.whPerDay);
  const { summer, winter } = seasonMonths(location.lat);
  const avgOf = (months: number[]) =>
    mean(months.map((m) => monthly[m - 1]?.whPerDay ?? 0));
  const worst = sorted[0] ?? { month: 1, psh: 0, whPerDay: 0 };
  const best = sorted[sorted.length - 1] ?? worst;
  const perW = (m: MonthlySolar) => m.psh * losses.overall;
  const summerPerW = mean(summer.map((m) => (monthly[m - 1] ? perW(monthly[m - 1]!) : 0)));
  return {
    installedW,
    losses,
    monthly,
    annualAvgWhPerDay: mean(monthly.map((m) => m.whPerDay)),
    bestMonth: best,
    worstMonth: worst,
    summerWhPerDay: avgOf(summer),
    winterWhPerDay: avgOf(winter),
    requiredWForWorstMonth: perW(worst) > 0 ? dailyConsumptionWh / perW(worst) : Infinity,
    requiredWForSummer: summerPerW > 0 ? dailyConsumptionWh / summerPerW : Infinity,
    strings: stringCheck(config, systemVoltage),
    location,
  };
}
