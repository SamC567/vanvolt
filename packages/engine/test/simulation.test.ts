import { describe, expect, it } from 'vitest';
import {
  chargeAcceptance,
  dayLengthHours,
  declinationDeg,
  simulate,
  solarHourlyProfile,
  usageHourlyProfile,
  windowMask,
  type SimulationInputs,
} from '../src';
import { appliance } from './helpers';

describe('solar geometry', () => {
  it('declination peaks near the June solstice and is ~0 at equinox', () => {
    expect(declinationDeg(172)).toBeCloseTo(23.45, 1);
    expect(Math.abs(declinationDeg(81))).toBeLessThan(0.5);
  });
  it('day length is ~12 h at the equinox and 0/24 h in polar night/day', () => {
    expect(dayLengthHours(51.5, 81)).toBeCloseTo(12, 0);
    expect(dayLengthHours(70, 355)).toBe(0);
    expect(dayLengthHours(70, 172)).toBe(24);
    expect(dayLengthHours(51.5, 172)).toBeGreaterThan(16);
  });
  it('solar profile sums to 1 and is zero at night', () => {
    const p = solarHourlyProfile(51.5, 6);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(p[0]).toBe(0);
    expect(p[12]).toBeGreaterThan(p[8]!);
    expect(solarHourlyProfile(70, 12).every((v) => v === 0)).toBe(true);
  });
});

describe('profiles and masks', () => {
  it('usage profiles sum to 1', () => {
    for (const p of ['allday', 'morning', 'daytime', 'evening', 'night'] as const) {
      expect(usageHourlyProfile(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(usageHourlyProfile('night')[2]).toBeGreaterThan(0);
  });
  it('window masks wrap past midnight and support fractional hours', () => {
    const m = windowMask(22, 3.5);
    expect(m[22]).toBe(1);
    expect(m[23]).toBe(1);
    expect(m[0]).toBe(1);
    expect(m[1]).toBe(0.5);
    expect(m.reduce((a, b) => a + b, 0)).toBe(3.5);
  });
  it('charge acceptance tapers above the threshold', () => {
    expect(chargeAcceptance(0.5, 0.8)).toBe(1);
    expect(chargeAcceptance(0.9, 0.8)).toBeCloseTo(0.525, 9);
    expect(chargeAcceptance(1, 0.8)).toBe(0);
  });
});

function inputs(over: Partial<SimulationInputs> = {}): SimulationInputs {
  return {
    appliances: [appliance({ powerW: 50, hoursPerDay: 24 })], // 1200 Wh/day
    inverterEfficiencyPct: 100,
    inverterIdleW: 0,
    inverterOnHoursPerDay: 0,
    hasAcLoads: false,
    solarWhPerDay: 0,
    latitude: 50,
    month: 6,
    days: 2,
    startSocPct: 100,
    nominalWh: 2000,
    dodPct: 80,
    chargeEfficiencyPct: 100,
    maxChargeW: 1000,
    taperStartSoc: 0.95,
    alternator: { enabled: false, powerW: 0, hoursPerDay: 0, daysPerWeek: 0, startHour: 10 },
    shore: { enabled: false, powerW: 0, hoursPerDay: 0, daysPerWeek: 0, startHour: 18 },
    ...over,
  };
}

describe('simulate', () => {
  it('discharges by the load until the DoD floor, then records unmet energy', () => {
    const r = simulate(inputs());
    // usable 1600 Wh, load 2400 Wh over 2 days → 800 Wh unmet
    expect(r.totalLoadWh).toBeCloseTo(2400, 6);
    expect(r.totalUnmetWh).toBeCloseTo(800, 6);
    expect(r.minSocPct).toBeCloseTo(20, 6);
    expect(r.firstEmptyHour).toBe(32);
  });
  it('conserves energy with charging (no losses)', () => {
    const r = simulate(inputs({ solarWhPerDay: 1200, startSocPct: 50 }));
    const startWh = 1000;
    const endWh = (r.endSocPct / 100) * 2000;
    const solarTotal = r.steps.reduce((t, s) => t + s.solarW, 0);
    expect(endWh - startWh).toBeCloseTo(
      solarTotal - r.totalLoadWh + r.totalUnmetWh - r.totalCurtailedWh,
      6,
    );
  });
  it('curtails solar when the battery is full', () => {
    const r = simulate(inputs({ appliances: [], solarWhPerDay: 1000, startSocPct: 100 }));
    expect(r.totalCurtailedWh).toBeCloseTo(2000, 6);
    expect(r.endSocPct).toBeCloseTo(100, 6);
  });
  it('applies charge efficiency and alternator windows', () => {
    const r = simulate(
      inputs({
        appliances: [],
        startSocPct: 20,
        days: 1,
        chargeEfficiencyPct: 90,
        alternator: { enabled: true, powerW: 400, hoursPerDay: 1, daysPerWeek: 7, startHour: 10 },
      }),
    );
    expect(r.steps[10]!.alternatorW).toBe(400);
    expect(r.endSocPct).toBeCloseTo(20 + (400 * 0.9 * 100) / 2000, 6);
  });
  it('caps the number of simulated days', () => {
    expect(simulate(inputs({ days: 1e9 })).steps).toHaveLength(60 * 24);
    expect(simulate(inputs({ days: Number.NaN })).steps).toHaveLength(24);
  });
});
