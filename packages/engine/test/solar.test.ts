import { describe, expect, it } from 'vitest';
import {
  analyseSolar,
  CHARGE_VOLTAGE_RATIO,
  createDesign,
  IRRADIANCE_LOCATIONS,
  pwmFactor,
  seasonMonths,
  solarLosses,
  stringCheck,
  type IrradianceLocation,
  type SolarConfig,
} from '../src';

const flatLoc: IrradianceLocation = {
  id: 't',
  name: 'T',
  country: 'X',
  lat: 50,
  lon: 0,
  database: 'test',
  horizontal: [1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1],
  tilted: [2, 3, 4, 5, 5, 5, 5, 5, 5, 4, 3, 2],
  source: { title: 't', url: 'https://example.com' },
};

function config(over: Partial<SolarConfig> = {}): SolarConfig {
  return {
    ...createDesign().solar,
    shadingLossPct: 0,
    orientationLossPct: 0,
    temperatureLossPct: 0,
    soilingLossPct: 0,
    reflectionLossPct: 0,
    wiringLossPct: 0,
    controllerEfficiencyPct: 100,
    ...over,
  };
}

describe('pwmFactor', () => {
  it('is charging voltage ÷ array Vmp', () => {
    // 12 V × 13.6/12 = 13.6 V; Vmp 18 V → 0.7556
    expect(pwmFactor(12, 18, 1)).toBeCloseTo(13.6 / 18, 6);
    expect(pwmFactor(12, undefined, 1)).toBe(0.75);
    expect(pwmFactor(24, 18, 1)).toBe(1); // clamped
  });
});

describe('solarLosses', () => {
  it('multiplies every loss factor', () => {
    const l = solarLosses(
      config({ shadingLossPct: 10, temperatureLossPct: 10, controllerEfficiencyPct: 98 }),
      12,
    );
    expect(l.overall).toBeCloseTo(0.9 * 0.9 * 0.98, 9);
    expect(l.pwm).toBe(1);
  });
});

describe('analyseSolar', () => {
  it('daily yield = installed W × PSH × losses', () => {
    const c = config({ quantity: 2 }); // 2 × 190 W = 380 W
    const r = analyseSolar(c, flatLoc, 12, 500);
    expect(r.installedW).toBe(380);
    expect(r.monthly[0]!.whPerDay).toBeCloseTo(380, 6);
    expect(r.monthly[5]!.whPerDay).toBeCloseTo(2280, 6);
    expect(r.worstMonth.month).toBe(1);
    expect(r.summerWhPerDay).toBeCloseTo((380 * (6 + 6 + 5)) / 3, 6);
    expect(r.winterWhPerDay).toBeCloseTo((380 * (1 + 1 + 2)) / 3, 6);
    expect(r.requiredWForWorstMonth).toBeCloseTo(500, 6);
  });
  it('uses the tilted data set when mounting is tilted', () => {
    const r = analyseSolar(config({ quantity: 1, mounting: 'tilted' }), flatLoc, 12, 0);
    expect(r.monthly[0]!.psh).toBe(2);
  });
  it('swaps seasons in the southern hemisphere', () => {
    expect(seasonMonths(-30).summer).toEqual([12, 1, 2]);
  });
  it('returns zero when disabled', () => {
    expect(analyseSolar(config({ enabled: false }), flatLoc, 12, 0).installedW).toBe(0);
  });
  it('agrees with PVGIS annual yield within 12 % for London using PVGIS-like losses', () => {
    const london = IRRADIANCE_LOCATIONS.find((l) => l.id === 'london')!;
    // PVGIS reports l_tg ≈ −5.25 %, reflection ≈ −4.7 %, spectral +1.7 %, plus 14 % system loss.
    const c = config({
      quantity: 1,
      temperatureLossPct: 5.25,
      reflectionLossPct: 3,
      wiringLossPct: 14,
    });
    c.panel = { ...c.panel, powerW: 1000 };
    const r = analyseSolar(c, london, 12, 0);
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const annualKwh = r.monthly.reduce((t, m, i) => t + (m.whPerDay * days[i]!) / 1000, 0);
    expect(
      Math.abs(annualKwh - london.pvgisFlatYieldKwhPerKwp!) / london.pvgisFlatYieldKwhPerKwp!,
    ).toBeLessThan(0.12);
  });
});

describe('stringCheck', () => {
  it('computes cold Voc with the datasheet coefficient', () => {
    const c = config({ quantity: 2, panelsInSeries: 2 });
    const s = stringCheck(c, 12);
    // Victron 190 W: Voc 25.5 V, coefficient −0.35 %/°C, −10 °C → ×(1 + 0.0035 × 35)
    expect(s.arrayVocColdV).toBeCloseTo(2 * 25.5 * (1 + 0.0035 * 35), 6);
    expect(s.strings).toBe(1);
    expect(s.vocOk).toBe(true);
  });
  it('flags controller clipping and uneven strings', () => {
    const c = config({ quantity: 3, panelsInSeries: 2 });
    c.controller = { ...c.controller!, maxChargeCurrentA: 10 };
    const s = stringCheck(c, 12);
    expect(s.unevenStrings).toBe(true);
    expect(s.maxOutputCurrentA).toBeCloseTo(570 / (12 * CHARGE_VOLTAGE_RATIO), 6);
    expect(s.controllerCurrentOk).toBe(false);
  });
  it('flags over-voltage', () => {
    const c = config({ quantity: 4, panelsInSeries: 4 });
    c.controller = { ...c.controller!, maxPvVoltageV: 100 };
    expect(stringCheck(c, 12).vocOk).toBe(false); // 4 × 25.5 × 1.1225 = 114.5 V
  });
});
