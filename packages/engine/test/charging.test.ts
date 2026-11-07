import { describe, expect, it } from 'vitest';
import {
  alternatorCurrent,
  analyseCharging,
  CHARGE_VOLTAGE_RATIO,
  createDesign,
  dcdcInputCurrent,
  weeklyAveragedWh,
} from '../src';

describe('charging helpers', () => {
  it('alternator current depends on method', () => {
    const alt = createDesign().charging.alternator; // Orion 12/12-30
    expect(alternatorCurrent(alt)).toBe(30);
    expect(alternatorCurrent({ ...alt, dcdcCount: 2 })).toBe(60);
    expect(alternatorCurrent({ ...alt, method: 'vsr', vsrCurrentA: 45 })).toBe(45);
    expect(alternatorCurrent({ ...alt, enabled: false })).toBe(0);
  });
  it('DC-DC input current includes conversion efficiency', () => {
    // 30 A × (12.8 × 13.6/12) V / (12 V × 0.87)
    expect(dcdcInputCurrent(30, 12.8, 87, 12)).toBeCloseTo(
      (30 * 12.8 * CHARGE_VOLTAGE_RATIO) / (12 * 0.87),
      6,
    );
  });
  it('weekly averaging', () => {
    // 30 A × 12.8 V × 2 h × 3/7
    expect(weeklyAveragedWh(30, 12.8, 2, 3)).toBeCloseTo((30 * 12.8 * 2 * 3) / 7, 6);
  });
});

describe('analyseCharging', () => {
  const d = createDesign();
  const solar = {
    installedW: 0,
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      psh: 0,
      whPerDay: 100 * (i + 1),
    })),
    annualAvgWhPerDay: 650,
    strings: { maxOutputCurrentA: 20 },
  } as unknown as Parameters<typeof analyseCharging>[0]['solar'];

  it('builds a monthly balance with battery efficiency', () => {
    const r = analyseCharging({
      config: { ...d.charging, alternator: { ...d.charging.alternator, enabled: false } },
      inverter: d.inverter,
      solar,
      systemVoltage: 12,
      bankVoltage: 12.8,
      chemistry: 'lifepo4',
      chargeEfficiencyPct: 90,
      batteryMaxChargeA: 100,
      dailyConsumptionWh: 900,
    });
    expect(r.monthly[0]!.storedWh).toBeCloseTo(90, 6);
    expect(r.monthly[0]!.netWh).toBeCloseTo(-810, 6);
    expect(r.monthly[11]!.coveragePct).toBeCloseTo(100, 6);
    expect(r.worstMonth.month).toBe(1);
    expect(r.bestMonth.month).toBe(12);
  });
  it('estimates alternator hours to close the worst-month deficit', () => {
    const r = analyseCharging({
      config: d.charging,
      inverter: d.inverter,
      solar,
      systemVoltage: 12,
      bankVoltage: 12.8,
      chemistry: 'lifepo4',
      chargeEfficiencyPct: 100,
      batteryMaxChargeA: 100,
      dailyConsumptionWh: 484,
    });
    // need 484 − 100 = 384 Wh; 30 A × 12.8 V = 384 W → 1 h
    expect(r.alternatorHoursPerDayNeeded).toBeCloseTo(1, 6);
  });
  it('flags simultaneous charge current above the battery limit', () => {
    const r = analyseCharging({
      config: { ...d.charging, shore: { ...d.charging.shore, enabled: true } },
      inverter: d.inverter,
      solar: { ...solar!, installedW: 400 } as typeof solar,
      systemVoltage: 12,
      bankVoltage: 12.8,
      chemistry: 'lifepo4',
      chargeEfficiencyPct: 92,
      batteryMaxChargeA: 50,
      dailyConsumptionWh: 500,
    });
    expect(r.simultaneousCurrentA).toBe(20 + 30 + 30);
    expect(r.simultaneousOk).toBe(false);
  });
});
