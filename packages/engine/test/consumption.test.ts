import { describe, expect, it } from 'vitest';
import { applianceUseDayWh, applianceWeeklyWh, calculateConsumption, loadDemand } from '../src';
import { appliance, NO_INVERTER } from './helpers';

describe('applianceUseDayWh', () => {
  it('multiplies power × hours × duty × quantity', () => {
    // 40 W × 5 h × 50 % × 2 units = 200 Wh
    expect(applianceUseDayWh(appliance({ powerW: 40, hoursPerDay: 5, dutyCyclePct: 50, quantity: 2 }))).toBe(200);
  });
  it('adds standby for the remaining hours', () => {
    // 100 W × 2 h + 1 W × 22 h = 222 Wh
    expect(applianceUseDayWh(appliance({ powerW: 100, hoursPerDay: 2, standbyW: 1 }))).toBe(222);
  });
  it('clamps hours to 24 and ignores negative input', () => {
    expect(applianceUseDayWh(appliance({ powerW: 10, hoursPerDay: 30 }))).toBe(240);
    expect(applianceUseDayWh(appliance({ powerW: -10, hoursPerDay: 5 }))).toBe(0);
  });
});

describe('applianceWeeklyWh', () => {
  it('scales by days per week and keeps standby on idle days', () => {
    // use days: 3 × (50 W × 2 h + 2 W × 22 h) = 3 × 144 = 432; idle days: 4 × 2 W × 24 h = 192
    const a = appliance({ powerW: 50, hoursPerDay: 2, standbyW: 2, daysPerWeek: 3 });
    expect(applianceWeeklyWh(a)).toBe(432 + 192);
  });
});

describe('loadDemand', () => {
  it('sums concurrent loads and adds the largest surge', () => {
    const d = loadDemand([
      { runningW: 100, surgeW: 100, concurrent: true },
      { runningW: 200, surgeW: 800, concurrent: true },
    ]);
    expect(d.continuousW).toBe(300);
    expect(d.peakW).toBe(900); // 300 + (800 − 200)
  });
  it('treats exclusive loads as one-at-a-time alongside concurrent loads', () => {
    const d = loadDemand([
      { runningW: 100, surgeW: 100, concurrent: true },
      { runningW: 2000, surgeW: 2000, concurrent: false },
      { runningW: 1200, surgeW: 1500, concurrent: false },
    ]);
    expect(d.continuousW).toBe(2100); // 100 + max(2000, 1200)
    // Starting the 1200 W load: 100 + 1500 = 1600; running the 2000 W: 2100 → peak 2100
    expect(d.peakW).toBe(2100);
  });
  it('is zero for no loads', () => {
    expect(loadDemand([])).toEqual({ continuousW: 0, peakW: 0 });
  });
});

describe('calculateConsumption', () => {
  it('computes Wh and Ah for DC loads', () => {
    const r = calculateConsumption([appliance({ powerW: 24, hoursPerDay: 10 })], 12, NO_INVERTER);
    expect(r.batteryWhPerDay).toBe(240);
    expect(r.batteryAhPerDay).toBe(20);
    expect(r.batteryWhPerWeek).toBe(1680);
    expect(r.batteryAhPerWeek).toBe(140);
  });
  it('adds inverter conversion loss and idle draw for AC loads', () => {
    const r = calculateConsumption(
      [appliance({ supply: 'ac', powerW: 900, hoursPerDay: 1 })],
      12,
      { enabled: true, averageEfficiencyPct: 90, idleW: 10, onHoursPerDay: 5 },
    );
    expect(r.acLoadWhPerDay).toBe(900);
    expect(r.inverterLossWhPerDay).toBeCloseTo(100, 6); // 900/0.9 − 900
    expect(r.inverterIdleWhPerDay).toBe(50);
    expect(r.batteryWhPerDay).toBeCloseTo(1050, 6);
    expect(r.ac.continuousW).toBe(900);
    expect(r.battery.continuousW).toBeCloseTo(1010, 6); // 900/0.9 + 10 W idle
  });
  it('separates average day from a full-use day', () => {
    const r = calculateConsumption([appliance({ powerW: 70, hoursPerDay: 1, daysPerWeek: 1 })], 12, NO_INVERTER);
    expect(r.batteryWhPerDay).toBeCloseTo(10, 6);
    expect(r.batteryWhPerFullUseDay).toBe(70);
  });
  it('ignores disabled appliances and reports category shares', () => {
    const r = calculateConsumption(
      [
        appliance({ id: 'x', powerW: 10, hoursPerDay: 10, category: 'lighting' }),
        appliance({ id: 'y', powerW: 30, hoursPerDay: 10, category: 'refrigeration' }),
        appliance({ id: 'z', powerW: 1000, hoursPerDay: 10, enabled: false }),
      ],
      12,
      NO_INVERTER,
    );
    expect(r.batteryWhPerDay).toBe(400);
    expect(r.byCategory.lighting).toBe(100);
    expect(r.appliances.find((a) => a.id === 'y')!.sharePct).toBe(75);
  });
});
