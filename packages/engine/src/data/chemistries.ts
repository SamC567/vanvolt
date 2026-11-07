/**
 * Battery chemistry parameters. Each parameter is either sourced (manufacturer/reference)
 * or an explicitly labelled VanVolt engineering assumption — see `PARAMETER_PROVENANCE`.
 */
import type { ChemistryParams } from '../battery';
import type { Chemistry, Provenance, SourceRef } from '../types';

const ACCESSED = '2026-11-07';

export const VICTRON_LFP_EFFICIENCY: SourceRef = {
  title: 'Victron 12,8 & 25,6 V LiFePO4 Smart datasheet — "round-trip energy efficiency of the average lead-acid battery is 80 %… of a LFP battery is 92 %"',
  url: 'https://www.victronenergy.com/upload/documents/Datasheet-12,8-&-25,6-Volt-lithium-iron-phosphate-batteries-Smart-EN.pdf',
  publisher: 'Victron Energy',
  accessed: ACCESSED,
  verification: 'document',
};

export const VICTRON_PEUKERT: SourceRef = {
  title: 'Victron SmartShunt manual — Peukert exponent setting (default 1.25, range 1.00–1.50)',
  url: 'https://www.victronenergy.com/media/pg/SmartShunt/en/all-features-and-settings.html',
  publisher: 'Victron Energy',
  accessed: ACCESSED,
  verification: 'document',
};

export const VICTRON_LEAD_DOD: SourceRef = {
  title: 'Victron BMV-700 manual — default discharge floor 50 % SoC for lead-acid',
  url: 'https://www.victronenergy.com/media/pg/BMV-700/en/all-features-and-settings.html',
  publisher: 'Victron Energy',
  accessed: ACCESSED,
  verification: 'document',
};

export const VICTRON_LFP_CYCLES: SourceRef = {
  title: 'Victron Lithium Battery Smart — cycle life 2500 cycles at 80 % DoD',
  url: 'https://www.victronenergy.com/media/pg/Lithium_Battery_Smart/en/technical-data.html',
  publisher: 'Victron Energy',
  accessed: ACCESSED,
  verification: 'document',
};

export const CHEMISTRIES: Record<Chemistry, ChemistryParams> = {
  lifepo4: {
    id: 'lifepo4',
    label: 'LiFePO4 (lithium iron phosphate)',
    defaultDodPct: 80,
    maxRecommendedDodPct: 90,
    chargeEfficiencyPct: 92,
    peukertExponent: 1.05,
    cellNominalV: 3.2,
    minVoltagePer12V: 12.0,
    ratedHours: 1,
    fallbackMaxChargeC: 0.5,
    fallbackMaxDischargeC: 1,
    minChargeTempC: 5,
    taperStartSoc: 0.95,
    notes:
      'Flat discharge curve and high round-trip efficiency. Needs a BMS that blocks charging at low temperature; check your battery datasheet for its charge temperature range.',
    sources: [VICTRON_LFP_EFFICIENCY, VICTRON_LFP_CYCLES, VICTRON_PEUKERT],
  },
  agm: {
    id: 'agm',
    label: 'AGM lead-acid',
    defaultDodPct: 50,
    maxRecommendedDodPct: 50,
    chargeEfficiencyPct: 80,
    peukertExponent: 1.25,
    cellNominalV: 2,
    minVoltagePer12V: 11.5,
    ratedHours: 20,
    fallbackMaxChargeC: 0.2,
    fallbackMaxDischargeC: 0.5,
    minChargeTempC: -10,
    taperStartSoc: 0.8,
    notes:
      'Discharging below 50 % shortens life sharply. Usable capacity falls at high discharge rates (Peukert effect). Charge acceptance tapers well before full.',
    sources: [VICTRON_LFP_EFFICIENCY, VICTRON_PEUKERT, VICTRON_LEAD_DOD],
  },
  gel: {
    id: 'gel',
    label: 'GEL lead-acid',
    defaultDodPct: 50,
    maxRecommendedDodPct: 50,
    chargeEfficiencyPct: 80,
    peukertExponent: 1.25,
    cellNominalV: 2,
    minVoltagePer12V: 11.5,
    ratedHours: 20,
    fallbackMaxChargeC: 0.2,
    fallbackMaxDischargeC: 0.5,
    minChargeTempC: -10,
    taperStartSoc: 0.8,
    notes: 'Better cycle life than AGM at the same depth of discharge, lower high-current performance.',
    sources: [VICTRON_LFP_EFFICIENCY, VICTRON_PEUKERT, VICTRON_LEAD_DOD],
  },
  flooded: {
    id: 'flooded',
    label: 'Flooded (wet) lead-acid',
    defaultDodPct: 50,
    maxRecommendedDodPct: 50,
    chargeEfficiencyPct: 80,
    peukertExponent: 1.25,
    cellNominalV: 2,
    minVoltagePer12V: 11.5,
    ratedHours: 20,
    fallbackMaxChargeC: 0.2,
    fallbackMaxDischargeC: 0.5,
    minChargeTempC: -10,
    taperStartSoc: 0.8,
    notes: 'Needs ventilation (hydrogen gassing) and periodic topping-up. Not recommended inside living space.',
    sources: [VICTRON_LFP_EFFICIENCY, VICTRON_PEUKERT, VICTRON_LEAD_DOD],
  },
};

/** Provenance of each chemistry parameter, for display in the assumptions panel. */
export const PARAMETER_PROVENANCE: Record<string, { provenance: Provenance; note: string }> = {
  defaultDodPct: {
    provenance: 'assumption',
    note: 'LiFePO4 80 % matches the DoD at which Victron rates cycle life; lead-acid 50 % follows Victron guidance.',
  },
  chargeEfficiencyPct: { provenance: 'manufacturer', note: 'Victron: LFP 92 %, average lead-acid 80 % round-trip.' },
  peukertExponent: {
    provenance: 'manufacturer',
    note: 'Lead-acid uses Victron’s battery-monitor default of 1.25. LiFePO4 uses 1.05 (VanVolt assumption). Use your battery’s own value if published.',
  },
  minVoltagePer12V: {
    provenance: 'assumption',
    note: 'Design minimum terminal voltage under load used for worst-case current: 12.0 V per 12.8 V LiFePO4 block, 11.5 V per 12 V lead-acid block.',
  },
  fallbackMaxChargeC: {
    provenance: 'assumption',
    note: 'Used only when the module datasheet value is unavailable: LiFePO4 0.5C, lead-acid 0.2C.',
  },
  minChargeTempC: {
    provenance: 'assumption',
    note: 'Indicative only — check your battery datasheet. LiFePO4 must not be charged below its specified minimum temperature.',
  },
  taperStartSoc: {
    provenance: 'assumption',
    note: 'Simulation only: charge acceptance tapers above 95 % SoC (LiFePO4) or 80 % SoC (lead-acid).',
  },
};
