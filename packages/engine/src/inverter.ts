/**
 * Inverter designer: sizing, per-load compatibility and DC input currents.
 *
 * DC input current: I_dc = P_ac / (V_dc × η)
 * Evaluated at the bank's design minimum voltage (worst case, highest current).
 */
import type { Appliance, InverterConfig, InverterModel, LoadKind, SystemVoltage } from './types';
import { SYSTEM_VOLTAGES } from './types';
import { pct, safe } from './units';

export type CompatibilityStatus = 'ok' | 'warning' | 'incompatible';

export interface LoadCompatibility {
  applianceId: string;
  name: string;
  runningW: number;
  surgeW: number;
  /** DC current drawn from the battery by this load alone at minimum voltage (A). */
  dcCurrentA: number;
  status: CompatibilityStatus;
  reasons: string[];
}

export interface DcCurrentAtVoltage {
  voltage: SystemVoltage;
  continuousA: number;
  peakA: number;
  /** DC current at the selected inverter's full continuous rating (A). */
  ratedA: number;
}

export interface InverterAnalysis {
  enabled: boolean;
  hasAcLoads: boolean;
  requiredContinuousW: number;
  requiredPeakW: number;
  /** Continuous AC demand before margin (W). */
  acContinuousW: number;
  acPeakW: number;
  /** Inverter rating covers the continuous demand. */
  continuousOk: boolean;
  /** Inverter rating also covers the sizing margin. */
  marginOk: boolean;
  peakOk: boolean;
  /** Continuous AC demand as a fraction of the inverter rating (%). */
  utilisationPct: number;
  /** DC input current at the inverter's rated continuous output (A) at minimum voltage. */
  ratedDcCurrentA: number;
  /** DC input current at the inverter's peak output (A) at minimum voltage. */
  peakDcCurrentA: number;
  inputVoltageMatches: boolean;
  loadChecks: LoadCompatibility[];
  currentsByVoltage: DcCurrentAtVoltage[];
  idleWhPerDay: number;
  /** Smallest suitable inverter from the library, if a library is supplied. */
  recommended: InverterModel | null;
  /** Whether the recommended model also meets the sizing margin. */
  recommendedMeetsMargin: boolean;
}

/** Load kinds sensitive to modified-sine-wave inverters. */
const MSW_SENSITIVE: Partial<Record<LoadKind, string>> = {
  motor: 'Motors run hotter and noisier on a modified sine wave.',
  compressor: 'Compressor motors run hotter and may fail to start on a modified sine wave.',
  microwave: 'Microwaves run hotter and with reduced output on a modified sine wave.',
  induction: 'Induction hobs may malfunction or refuse to operate on a modified sine wave.',
  electronic:
    'Some electronics (dimmers, timers, speed controllers, chargers) may buzz or malfunction on a modified sine wave.',
  lighting: 'Dimmable lights and some LED drivers may flicker or buzz on a modified sine wave.',
};

/** Fraction of a rating above which a load is flagged as "close to limit". */
export const NEAR_LIMIT_FRACTION = 0.8;

export function dcInputCurrent(acPowerW: number, dcVoltage: number, efficiencyPct: number): number {
  const eff = pct(efficiencyPct);
  if (dcVoltage <= 0 || eff <= 0) return 0;
  return acPowerW / (dcVoltage * eff);
}

export interface InverterInputs {
  appliances: readonly Appliance[];
  acContinuousW: number;
  acPeakW: number;
  config: InverterConfig;
  systemVoltage: SystemVoltage;
  /** Design minimum battery voltage (V). */
  minimumVoltage: number;
  /** Battery bank max continuous discharge current (A). */
  batteryMaxDischargeA: number;
  /** Ratio of minimum to nominal voltage, used for the 12/24/48 comparison. */
  minVoltageRatio: number;
  library?: readonly InverterModel[];
}

export function requiredInverterRating(acContinuousW: number, acPeakW: number, marginPct: number) {
  return {
    continuousW: acContinuousW * (1 + safe(marginPct) / 100),
    peakW: acPeakW,
  };
}

/** Smallest library inverter (by continuous rating) meeting both requirements at the system voltage. */
export function recommendInverter(
  library: readonly InverterModel[],
  systemVoltage: SystemVoltage,
  continuousW: number,
  peakW: number,
): InverterModel | null {
  const candidates = library
    .filter((m) => m.inputVoltage === systemVoltage && m.waveform === 'pure-sine')
    .filter((m) => m.continuousW >= continuousW && m.peakW >= peakW)
    .sort((a, b) => a.continuousW - b.continuousW || a.idleW - b.idleW);
  return candidates[0] ?? null;
}

export function analyseInverter(input: InverterInputs): InverterAnalysis {
  const { config, appliances, minimumVoltage } = input;
  const model = config.model;
  const acLoads = appliances.filter((a) => a.enabled && a.supply === 'ac');
  const hasAcLoads = acLoads.length > 0;
  const req = requiredInverterRating(input.acContinuousW, input.acPeakW, config.sizingMarginPct);
  const eff = config.averageEfficiencyPct;
  const enabled = config.enabled;

  const loadChecks: LoadCompatibility[] = acLoads.map((a) => {
    const qty = Math.max(0, Math.floor(safe(a.quantity)));
    const runningW = safe(a.powerW) * qty;
    const surgeW = runningW + Math.max(0, safe(a.surgeW) - safe(a.powerW));
    const dcCurrentA = dcInputCurrent(runningW, minimumVoltage, eff);
    const reasons: string[] = [];
    let status: CompatibilityStatus = 'ok';
    const raise = (s: CompatibilityStatus) => {
      if (s === 'incompatible' || (s === 'warning' && status === 'ok')) status = s;
    };
    if (!enabled) {
      raise('incompatible');
      reasons.push('No inverter is enabled — AC loads cannot run.');
    } else {
      if (runningW > model.continuousW) {
        raise('incompatible');
        reasons.push(
          `Running power ${Math.round(runningW)} W exceeds the inverter's continuous rating of ${model.continuousW} W.`,
        );
      } else if (runningW > model.continuousW * NEAR_LIMIT_FRACTION) {
        raise('warning');
        reasons.push(
          `Running power is ${Math.round((runningW / model.continuousW) * 100)}% of the inverter's continuous rating — little headroom for other loads.`,
        );
      }
      if (surgeW > model.peakW) {
        raise('incompatible');
        reasons.push(
          `Start-up surge ${Math.round(surgeW)} W exceeds the inverter's peak rating of ${model.peakW} W — likely to trip on start.`,
        );
      }
      if (model.waveform === 'modified-sine') {
        const note = MSW_SENSITIVE[a.kind];
        if (note) {
          raise('warning');
          reasons.push(note);
        }
      }
    }
    if (input.batteryMaxDischargeA > 0 && dcCurrentA > input.batteryMaxDischargeA) {
      raise('incompatible');
      reasons.push(
        `Draws about ${Math.round(dcCurrentA)} A from the battery, above the bank's continuous discharge limit of ${Math.round(input.batteryMaxDischargeA)} A.`,
      );
    }
    if (dcCurrentA >= 100 && input.systemVoltage === 12) {
      raise('warning');
      reasons.push(
        `High DC current (${Math.round(dcCurrentA)} A at ${minimumVoltage.toFixed(1)} V) — needs heavy cabling; consider 24 V or 48 V.`,
      );
    }
    return { applianceId: a.id, name: a.name, runningW, surgeW, dcCurrentA, status, reasons };
  });

  const withMargin = input.library
    ? recommendInverter(input.library, input.systemVoltage, req.continuousW, req.peakW)
    : null;
  const recommended =
    withMargin ??
    (input.library
      ? recommendInverter(input.library, input.systemVoltage, input.acContinuousW, req.peakW)
      : null);
  const recommendedMeetsMargin = withMargin !== null;

  const currentsByVoltage: DcCurrentAtVoltage[] = SYSTEM_VOLTAGES.map((v) => {
    const vMin = v * input.minVoltageRatio;
    return {
      voltage: v,
      continuousA: dcInputCurrent(input.acContinuousW, vMin, eff),
      peakA: dcInputCurrent(input.acPeakW, vMin, eff),
      ratedA: dcInputCurrent(model.continuousW, vMin, eff),
    };
  });

  return {
    enabled,
    hasAcLoads,
    requiredContinuousW: req.continuousW,
    requiredPeakW: req.peakW,
    acContinuousW: input.acContinuousW,
    acPeakW: input.acPeakW,
    continuousOk: !hasAcLoads || (enabled && model.continuousW >= input.acContinuousW),
    marginOk: !hasAcLoads || (enabled && model.continuousW >= req.continuousW),
    peakOk: !hasAcLoads || (enabled && model.peakW >= req.peakW),
    utilisationPct: model.continuousW > 0 ? (input.acContinuousW / model.continuousW) * 100 : 0,
    ratedDcCurrentA: dcInputCurrent(model.continuousW, minimumVoltage, eff),
    peakDcCurrentA: dcInputCurrent(model.peakW, minimumVoltage, eff),
    inputVoltageMatches: model.inputVoltage === input.systemVoltage,
    loadChecks,
    currentsByVoltage,
    idleWhPerDay:
      enabled && hasAcLoads ? safe(model.idleW) * Math.min(24, safe(config.onHoursPerDay)) : 0,
    recommended,
    recommendedMeetsMargin,
  };
}
