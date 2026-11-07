/**
 * Factories for new designs, appliances and cable runs.
 */
import type {
  Appliance,
  CableRole,
  CableRunSettings,
  Design,
  SystemVoltage,
} from './types';
import {
  AC_CHARGERS,
  APPLIANCE_PRESETS,
  BATTERY_MODULES,
  CHEMISTRIES,
  DCDC_CHARGERS,
  INVERTER_MODELS,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
  type AppliancePreset,
} from './data';
import { DEFAULT_RUN_SETTINGS } from './analysis';
import { deepClone, uid } from './units';

export const SCHEMA_VERSION = 1 as const;

function byId<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`Library item not found: ${id}`);
  return deepClone(found);
}

export function applianceFromPreset(presetId: string, overrides: Partial<Appliance> = {}): Appliance {
  const preset = APPLIANCE_PRESETS.find((p) => p.presetId === presetId);
  if (!preset) throw new Error(`Appliance preset not found: ${presetId}`);
  return applianceFrom(preset, overrides);
}

export function applianceFrom(preset: AppliancePreset, overrides: Partial<Appliance> = {}): Appliance {
  const { presetId, ...rest } = deepClone(preset);
  return { ...rest, id: uid('app'), enabled: true, libraryId: presetId, ...overrides };
}

export function defaultCableRuns(): CableRunSettings[] {
  return (Object.keys(DEFAULT_RUN_SETTINGS) as Exclude<CableRole, 'custom'>[]).map((role) => ({
    id: role,
    role,
    name: DEFAULT_RUN_SETTINGS[role].name,
    lengthM: DEFAULT_RUN_SETTINGS[role].lengthM,
    maxDropPct: DEFAULT_RUN_SETTINGS[role].maxDropPct,
    installation: 'free-air',
    bundledCount: 1,
  }));
}

export interface NewDesignOptions {
  name?: string;
  description?: string;
  systemVoltage?: SystemVoltage;
}

/** A sensible starting design: 12 V LiFePO4 weekend van. */
export function createDesign(opts: NewDesignOptions = {}): Design {
  const now = new Date().toISOString();
  const module = byId(BATTERY_MODULES, 'victron-lfp-ng-12-200');
  const inverter = byId(INVERTER_MODELS, 'victron-inverter-smart-12-1600');
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('design'),
    name: opts.name ?? 'New campervan design',
    description: opts.description ?? '',
    createdAt: now,
    updatedAt: now,
    systemVoltage: opts.systemVoltage ?? 12,
    appliances: [
      applianceFromPreset('dometic-cfx3-45'),
      applianceFromPreset('lumitec-orbit'),
      applianceFromPreset('shurflo-trail-king-7'),
      applianceFromPreset('autoterm-air-2d'),
      applianceFromPreset('generic-dc-usb'),
      applianceFromPreset('apple-96w-usbc'),
    ],
    battery: {
      module,
      series: 1,
      parallel: 1,
      dodPct: CHEMISTRIES[module.chemistry].defaultDodPct,
      autonomyTargetDays: 2,
    },
    solar: {
      enabled: true,
      panel: byId(SOLAR_PANELS, 'victron-bluesolar-mono-190w'),
      quantity: 2,
      panelsInSeries: 1,
      locationId: 'london',
      mounting: 'flat',
      shadingLossPct: 5,
      orientationLossPct: 0,
      temperatureLossPct: 8,
      soilingLossPct: 3,
      reflectionLossPct: 3,
      wiringLossPct: 3,
      controllerType: 'mppt',
      controller: byId(MPPT_CONTROLLERS, 'victron-smartsolar-100-30'),
      controllerEfficiencyPct: 98,
    },
    inverter: {
      enabled: true,
      model: inverter,
      averageEfficiencyPct: inverter.maxEfficiencyPct - 5,
      onHoursPerDay: 4,
      sizingMarginPct: 25,
    },
    charging: {
      alternator: {
        enabled: true,
        method: 'dcdc',
        dcdc: byId(DCDC_CHARGERS, 'victron-orion-tr-smart-12-12-30-iso'),
        dcdcCount: 1,
        vsrCurrentA: 40,
        drivingHoursPerDay: 1,
        drivingDaysPerWeek: 3,
        startHour: 10,
      },
      shore: {
        enabled: false,
        useInverterCharger: false,
        charger: byId(AC_CHARGERS, 'victron-ip22-12-30'),
        hoursPerDay: 10,
        daysPerWeek: 1,
        startHour: 18,
      },
    },
    cables: {
      runs: defaultCableRuns(),
      ambientC: 30,
      conductorTempC: 50,
      insulationRatingC: 90,
    },
    simulation: { month: 1, days: 7, startSocPct: 100 },
    diagram: { positions: {} },
  };
}

/** Deep copy a design with a new id and name. */
export function duplicateDesign(design: Design, name?: string): Design {
  const copy = deepClone(design);
  const now = new Date().toISOString();
  return { ...copy, id: uid('design'), name: name ?? `${design.name} (copy)`, createdAt: now, updatedAt: now };
}
