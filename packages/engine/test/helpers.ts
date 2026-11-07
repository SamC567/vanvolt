import type { Appliance } from '../src';

export function appliance(overrides: Partial<Appliance> = {}): Appliance {
  return {
    id: overrides.id ?? 'a1',
    name: 'Test load',
    category: 'other',
    supply: 'dc',
    kind: 'electronic',
    powerW: 10,
    surgeW: 10,
    quantity: 1,
    hoursPerDay: 1,
    dutyCyclePct: 100,
    daysPerWeek: 7,
    standbyW: 0,
    concurrent: true,
    profile: 'allday',
    enabled: true,
    provenance: 'user',
    ...overrides,
  };
}

export const NO_INVERTER = {
  enabled: false,
  averageEfficiencyPct: 100,
  idleW: 0,
  onHoursPerDay: 0,
};
