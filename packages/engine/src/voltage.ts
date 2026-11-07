/**
 * 12 V vs 24 V vs 48 V comparison for the same energy storage and loads.
 */
import type { Design, SystemVoltage } from './types';
import { SYSTEM_VOLTAGES } from './types';
import type { SystemAnalysis } from './analysis';
import { sizeCable } from './cables';
import { CABLE_TABLES, CHEMISTRIES, DCDC_CHARGERS, INVERTER_MODELS, MPPT_CONTROLLERS, AC_CHARGERS } from './data';
import { DEFAULT_RUN_SETTINGS } from './analysis';
import { dcInputCurrent } from './inverter';
import { CHARGE_VOLTAGE_RATIO } from './solar';

export interface VoltageOption {
  voltage: SystemVoltage;
  bankNominalV: number;
  /** Bank capacity giving the same nominal energy (Ah). */
  bankAh: number;
  /** DC current for the continuous AC demand at minimum voltage (A). */
  inverterContinuousA: number;
  inverterPeakA: number;
  /** DC current for DC loads (A). */
  dcLoadsA: number;
  /** Main cable selected for the battery → inverter run (mm²). */
  inverterCableMm2: number | null;
  inverterCableLossW: number;
  /** Solar controller output current at full STC power (A). */
  solarCurrentA: number;
  /** Library components available at this voltage. */
  availability: { inverters: number; mppt: number; dcdc: number; acChargers: number };
  notes: string[];
}

export function compareSystemVoltages(design: Design, analysis: SystemAnalysis): VoltageOption[] {
  const chem = CHEMISTRIES[design.battery.module.chemistry];
  const nominalWh = analysis.battery.bank.nominalWh;
  const lfp = chem.id === 'lifepo4';
  const minRatio = analysis.bankVoltage > 0 ? analysis.battery.minimumVoltage / analysis.bankVoltage : 0.9;
  const eff = design.inverter.averageEfficiencyPct;
  const runSettings = design.cables.runs.find((r) => r.role === 'battery-inverter');
  const length = runSettings?.lengthM ?? DEFAULT_RUN_SETTINGS['battery-inverter'].lengthM;
  const maxDrop = runSettings?.maxDropPct ?? DEFAULT_RUN_SETTINGS['battery-inverter'].maxDropPct;
  const dcLoads = analysis.consumption.dc.continuousW;
  const dcLoadCount = design.appliances.filter((a) => a.enabled && a.supply === 'dc').length;

  return SYSTEM_VOLTAGES.map((v) => {
    const bankNominalV = lfp ? (v / 12) * 12.8 : v;
    const vMin = bankNominalV * minRatio;
    const contA = dcInputCurrent(analysis.consumption.ac.continuousW, vMin, eff);
    const peakA = dcInputCurrent(analysis.consumption.ac.peakW, vMin, eff);
    const ratedA = dcInputCurrent(analysis.inverter.requiredContinuousW, vMin, eff);
    const cable =
      analysis.inverter.hasAcLoads && ratedA > 0
        ? sizeCable(
            CABLE_TABLES,
            {
              id: `cmp-${v}`,
              role: 'battery-inverter',
              name: 'Battery → inverter',
              lengthM: length,
              currentA: ratedA,
              voltageV: bankNominalV,
              maxDropPct: maxDrop,
              installation: 'free-air',
              bundledCount: 1,
              ambientC: design.cables.ambientC,
            },
            { conductorTempC: design.cables.conductorTempC, insulationRatingC: design.cables.insulationRatingC },
          )
        : null;
    const notes: string[] = [];
    if (v === 12) notes.push('Widest choice of 12 V appliances and vehicle-compatible chargers.');
    if (v !== 12 && dcLoadCount > 0)
      notes.push(`${dcLoadCount} DC appliance(s) are typically 12 V — a ${v}→12 V DC-DC converter would be needed.`);
    if (v !== 12) notes.push(`Alternator charging needs a 12→${v} V DC-DC charger.`);
    if (v === 48) notes.push('Lowest currents and cable losses; best for high-power AC loads such as induction cooking.');
    if (cable?.selectedCsaMm2 === null) notes.push('No single standard conductor is large enough for the inverter run.');
    return {
      voltage: v,
      bankNominalV,
      bankAh: bankNominalV > 0 ? nominalWh / bankNominalV : 0,
      inverterContinuousA: contA,
      inverterPeakA: peakA,
      dcLoadsA: vMin > 0 ? dcLoads / vMin : 0,
      inverterCableMm2: cable?.selectedCsaMm2 ?? null,
      inverterCableLossW: cable && cable.selectedCsaMm2 !== null ? contA * (cable.dropV * (contA / Math.max(ratedA, 1e-9))) : 0,
      solarCurrentA: analysis.solar.installedW > 0 ? (analysis.solar.installedW * analysis.solar.losses.controller) / (bankNominalV * CHARGE_VOLTAGE_RATIO) : 0,
      availability: {
        inverters: INVERTER_MODELS.filter((m) => m.inputVoltage === v).length,
        mppt: MPPT_CONTROLLERS.filter((m) => m.maxPvPowerW?.[v] !== undefined).length,
        dcdc: DCDC_CHARGERS.filter((m) => (m.outputVoltage ?? 12) === v).length,
        acChargers: AC_CHARGERS.filter((m) => (m.outputVoltage ?? 12) === v).length,
      },
      notes,
    };
  });
}
