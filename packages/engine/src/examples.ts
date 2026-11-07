/**
 * Example campervan designs. Built from library data so they stay consistent with
 * the component database. Ids are deterministic so the JSON exports are stable.
 */
import type { Appliance, Design } from './types';
import { applianceFromPreset, createDesign, defaultCableRuns } from './defaults';
import {
  AC_CHARGERS,
  BATTERY_MODULES,
  DCDC_CHARGERS,
  INVERTER_MODELS,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
} from './data';
import { deepClone } from './units';

const EPOCH = '2026-11-07T00:00:00.000Z';

function lib<T extends { id: string }>(list: readonly T[], id: string): T {
  const x = list.find((i) => i.id === id);
  if (!x) throw new Error(`Library item not found: ${id}`);
  return deepClone(x);
}

function apps(prefix: string, items: [string, Partial<Appliance>?][]): Appliance[] {
  return items.map(([presetId, overrides], i) =>
    applianceFromPreset(presetId, { ...overrides, id: `${prefix}-app-${i + 1}` }),
  );
}

function base(id: string, name: string, description: string): Design {
  const d = createDesign({ name, description });
  return {
    ...d,
    id,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    cables: { ...d.cables, runs: defaultCableRuns() },
  };
}

export function weekendVan(): Design {
  const d = base(
    'example-weekend-van',
    'Weekend van — 12 V, 200 Ah LiFePO4',
    'Compact van used at weekends: compressor cool box, LED lighting, diesel heater, phone and laptop charging. 380 W of flat roof solar plus a 30 A DC-DC charger.',
  );
  d.appliances = apps('wk', [
    ['dometic-cfx3-45'],
    ['lumitec-orbit', { quantity: 4 }],
    ['shurflo-trail-king-7'],
    ['autoterm-air-2d', { hoursPerDay: 6 }],
    ['generic-dc-usb'],
    ['apple-96w-usbc', { hoursPerDay: 2, daysPerWeek: 2 }],
  ]);
  d.simulation = { month: 4, days: 7, startSocPct: 100 };
  return d;
}

export function fullTimeOffGrid(): Design {
  const d = base(
    'example-full-time',
    'Full-time off-grid — 12 V, 400 Ah LiFePO4',
    'Remote worker living in a van year-round in southern Europe: Starlink, laptop, fridge, roof fan, occasional induction cooking. 600 W solar and a 50 A DC-DC charger.',
  );
  d.battery = {
    module: lib(BATTERY_MODULES, 'victron-lfp-ng-12-200'),
    series: 1,
    parallel: 2,
    dodPct: 80,
    autonomyTargetDays: 2,
  };
  d.solar = {
    ...d.solar,
    panel: lib(SOLAR_PANELS, 'renogy-rsp200d-200w-12v-mono'),
    quantity: 3,
    panelsInSeries: 3,
    locationId: 'lisbon',
    controller: lib(MPPT_CONTROLLERS, 'victron-smartsolar-100-50'),
  };
  d.inverter = {
    ...d.inverter,
    model: lib(INVERTER_MODELS, 'victron-inverter-smart-12-3000'),
    averageEfficiencyPct: 88,
    onHoursPerDay: 6,
  };
  d.charging.alternator = {
    ...d.charging.alternator,
    dcdc: lib(DCDC_CHARGERS, 'victron-orion-xs-12-12-50'),
    drivingHoursPerDay: 1.5,
    drivingDaysPerWeek: 2,
  };
  d.appliances = apps('ft', [
    ['dometic-crx-65'],
    ['starlink-mini', { hoursPerDay: 10, profile: 'daytime' }],
    ['apple-96w-usbc', { hoursPerDay: 6, daysPerWeek: 5 }],
    ['lumitec-orbit', { quantity: 6 }],
    ['fiamma-turbo-vent-f', { hoursPerDay: 8 }],
    ['fiamma-aqua-8f-10l'],
    ['tefal-ih210840', { hoursPerDay: 0.4, daysPerWeek: 4 }],
    ['russell-hobbs-23840'],
    ['apple-20w-usbc'],
  ]);
  d.simulation = { month: 12, days: 7, startSocPct: 100 };
  return d;
}

export function winterAgmVan(): Design {
  const d = base(
    'example-winter-agm',
    'Winter ski van — 12 V, 220 Ah AGM (budget)',
    'Budget build on lead-acid batteries for winter ski trips in the Alps: diesel heater runs every night, short winter days. Shows how AGM depth-of-discharge limits and a PWM controller affect the result.',
  );
  d.battery = {
    module: lib(BATTERY_MODULES, 'victron-agm-12-110'),
    series: 1,
    parallel: 2,
    dodPct: 50,
    autonomyTargetDays: 2,
  };
  d.solar = {
    ...d.solar,
    panel: lib(SOLAR_PANELS, 'renogy-rng-175d-175w-12v-mono'),
    quantity: 1,
    locationId: 'munich',
    controllerType: 'pwm',
    controllerEfficiencyPct: 98,
    shadingLossPct: 10,
  };
  delete d.solar.controller;
  d.inverter = { ...d.inverter, enabled: false };
  d.charging.alternator = {
    ...d.charging.alternator,
    dcdc: lib(DCDC_CHARGERS, 'victron-orion-tr-smart-12-12-18-iso'),
    drivingHoursPerDay: 2,
    drivingDaysPerWeek: 2,
  };
  d.charging.shore = {
    ...d.charging.shore,
    enabled: true,
    charger: lib(AC_CHARGERS, 'victron-ip22-12-15'),
    hoursPerDay: 12,
    daysPerWeek: 1,
  };
  d.appliances = apps('wa', [
    ['webasto-air-top-2000-stc', { hoursPerDay: 10 }],
    ['dometic-crx-50'],
    ['lumitec-orbit', { quantity: 4, hoursPerDay: 6 }],
    ['fiamma-aqua-8f-10l'],
    ['generic-dc-usb'],
    ['generic-dc-tv'],
  ]);
  d.simulation = { month: 1, days: 7, startSocPct: 100 };
  return d;
}

export function electricMotorhome48(): Design {
  const d = base(
    'example-48v-motorhome',
    'All-electric motorhome — 48 V, 10 kWh LiFePO4',
    'Larger motorhome cooking entirely on electricity (induction hob, kettle, microwave, coffee) with a 3 kVA inverter/charger. 940 W of solar in two series strings. 12 V loads run from a 48→12 V converter (not modelled).',
  );
  d.systemVoltage = 48;
  d.battery = {
    module: lib(BATTERY_MODULES, 'victron-lfp-ng-48-100'),
    series: 1,
    parallel: 2,
    dodPct: 80,
    autonomyTargetDays: 2,
  };
  d.solar = {
    ...d.solar,
    panel: lib(SOLAR_PANELS, 'victron-bluesolar-mono-235w'),
    quantity: 4,
    panelsInSeries: 2,
    locationId: 'seville',
    controller: lib(MPPT_CONTROLLERS, 'victron-smartsolar-150-35'),
  };
  const mp = lib(INVERTER_MODELS, 'victron-multiplus-ii-48-3000-35');
  d.inverter = {
    enabled: true,
    model: mp,
    averageEfficiencyPct: mp.maxEfficiencyPct - 5,
    onHoursPerDay: 14,
    sizingMarginPct: 25,
  };
  d.charging.alternator = { ...d.charging.alternator, enabled: false };
  d.charging.shore = {
    ...d.charging.shore,
    enabled: true,
    useInverterCharger: true,
    hoursPerDay: 10,
    daysPerWeek: 1,
  };
  d.appliances = apps('em', [
    ['tefal-ih210840', { hoursPerDay: 1 }],
    ['russell-hobbs-23840', { quantity: 1, hoursPerDay: 0.25 }],
    ['beko-moc20100'],
    ['nespresso-essenza-mini'],
    ['dometic-crx-65', { supply: 'dc' }],
    ['lumitec-orbit', { quantity: 10 }],
    ['starlink-standard'],
    ['apple-96w-usbc', { quantity: 2 }],
    ['philips-bhc010'],
  ]);
  d.simulation = { month: 1, days: 7, startSocPct: 100 };
  return d;
}

export const EXAMPLE_DESIGNS: { id: string; build: () => Design }[] = [
  { id: 'example-weekend-van', build: weekendVan },
  { id: 'example-full-time', build: fullTimeOffGrid },
  { id: 'example-winter-agm', build: winterAgmVan },
  { id: 'example-48v-motorhome', build: electricMotorhome48 },
];
