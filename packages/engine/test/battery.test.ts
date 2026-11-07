import { describe, expect, it } from 'vitest';
import {
  analyseBattery,
  autonomyDays,
  bankSpec,
  CHEMISTRIES,
  cycleLifeAt,
  estimatedLifeYears,
  minimumBankVoltage,
  peukertCurve,
  peukertFactor,
  requiredCapacityAh,
  usableEnergyWh,
  type BatteryModule,
} from '../src';

const lfp: BatteryModule = {
  id: 't',
  manufacturer: 'T',
  model: 'T',
  chemistry: 'lifepo4',
  nominalVoltage: 12.8,
  capacityAh: 100,
  maxContinuousDischargeA: 100,
  maxContinuousChargeA: 50,
  provenance: 'user',
  cycleLife: [
    { dodPct: 50, cycles: 5000 },
    { dodPct: 80, cycles: 2500 },
  ],
};
const agm: BatteryModule = {
  id: 'a',
  manufacturer: 'A',
  model: 'A',
  chemistry: 'agm',
  nominalVoltage: 12,
  capacityAh: 100,
  provenance: 'user',
};

describe('bankSpec', () => {
  it('multiplies voltage by series and capacity by parallel', () => {
    const b = bankSpec(lfp, 2, 3, CHEMISTRIES.lifepo4);
    expect(b.nominalVoltage).toBeCloseTo(25.6, 9);
    expect(b.capacityAh).toBe(300);
    expect(b.nominalWh).toBeCloseTo(7680, 6);
    expect(b.voltageClass).toBe(24);
    expect(b.moduleCount).toBe(6);
    expect(b.maxContinuousDischargeA).toBe(300); // parallel strings share current
    expect(b.limitsFromDatasheet).toBe(true);
  });
  it('falls back to C-rate assumptions when limits are missing', () => {
    const b = bankSpec(agm, 1, 2, CHEMISTRIES.agm);
    expect(b.maxContinuousChargeA).toBeCloseTo(40, 9); // 0.2C × 100 Ah × 2
    expect(b.limitsFromDatasheet).toBe(false);
  });
});

describe('peukertFactor', () => {
  it('matches the Peukert equation below the rated current', () => {
    // 100 Ah C20 → I20 = 5 A. At 10 A with k = 1.25: (5/10)^0.25 = 0.8409
    expect(peukertFactor(100, 10, 1.25, 20)).toBeCloseTo(0.840896, 5);
  });
  it('is capped at 1 for slow discharge and for k ≤ 1', () => {
    expect(peukertFactor(100, 1, 1.25, 20)).toBe(1);
    expect(peukertFactor(100, 50, 1.0, 20)).toBe(1);
    expect(peukertFactor(100, 0, 1.25, 20)).toBe(1);
  });
  it('produces a monotonic capacity curve', () => {
    const c = peukertCurve(100, 1.25, 20);
    for (let i = 1; i < c.length; i++)
      expect(c[i]!.capacityPct).toBeGreaterThanOrEqual(c[i - 1]!.capacityPct);
    expect(c[c.length - 1]!.capacityPct).toBeCloseTo(100, 3);
  });
});

describe('capacity, autonomy and sizing', () => {
  it('usable energy = nominal × DoD × Peukert', () => {
    expect(usableEnergyWh(2560, 80)).toBeCloseTo(2048, 6);
    expect(usableEnergyWh(1200, 50, 0.9)).toBeCloseTo(540, 6);
  });
  it('autonomy days = usable / daily', () => {
    expect(autonomyDays(2048, 1024)).toBe(2);
    expect(autonomyDays(100, 0)).toBe(Infinity);
  });
  it('required capacity inverts the usable-energy formula', () => {
    // 1000 Wh/day × 2 days / (12.8 V × 0.8) = 195.3 Ah
    expect(requiredCapacityAh(1000, 2, 12.8, 80)).toBeCloseTo(195.3125, 4);
  });
});

describe('cycle life', () => {
  it('interpolates log-linearly between datasheet points', () => {
    expect(cycleLifeAt(lfp.cycleLife, 50)).toBe(5000);
    expect(cycleLifeAt(lfp.cycleLife, 80)).toBe(2500);
    // midpoint 65 % → geometric mean of 5000 and 2500
    expect(cycleLifeAt(lfp.cycleLife, 65)).toBeCloseTo(Math.sqrt(5000 * 2500), 6);
    expect(cycleLifeAt(lfp.cycleLife, 95)).toBe(2500);
    expect(cycleLifeAt(undefined, 50)).toBeNull();
  });
  it('estimates years from energy throughput', () => {
    // 2500 cycles × 0.8 × 1280 Wh / (640 Wh/day × 365) = 10.96 years
    expect(estimatedLifeYears(2500, 80, 1280, 640)).toBeCloseTo(10.9589, 3);
  });
});

describe('minimumBankVoltage and analyseBattery', () => {
  it('scales the per-block minimum voltage', () => {
    expect(minimumBankVoltage(25.6, CHEMISTRIES.lifepo4)).toBeCloseTo(24.0, 9);
    expect(minimumBankVoltage(12, CHEMISTRIES.agm)).toBeCloseTo(11.5, 9);
  });
  it('computes autonomy and recommended parallel strings', () => {
    const r = analyseBattery(
      { module: lfp, series: 1, parallel: 1, dodPct: 80, autonomyTargetDays: 3 },
      CHEMISTRIES.lifepo4,
      512,
      200,
      400,
    );
    expect(r.usableWh).toBeCloseTo(1024, 6);
    expect(r.autonomyDays).toBeCloseTo(2, 6);
    expect(r.requiredAhForTarget).toBeCloseTo(150, 6); // 512 × 3 / (12.8 × 0.8)
    expect(r.recommendedParallel).toBe(2);
    expect(r.peakDischargeA).toBeCloseTo(400 / 12, 6);
  });
  it('applies Peukert to lead-acid at high average current', () => {
    const r = analyseBattery(
      { module: agm, series: 1, parallel: 1, dodPct: 50, autonomyTargetDays: 1 },
      CHEMISTRIES.agm,
      2400, // 2400 Wh / 12 V / 16 h = 12.5 A > C20 5 A
      0,
      0,
    );
    expect(r.peukertCurrentA).toBeCloseTo(12.5, 6);
    expect(r.peukertFactor).toBeCloseTo((5 / 12.5) ** 0.25, 6);
    expect(r.usableWh).toBeCloseTo(1200 * 0.5 * (5 / 12.5) ** 0.25, 6);
  });
});
