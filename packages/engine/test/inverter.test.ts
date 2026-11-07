import { describe, expect, it } from 'vitest';
import { analyseInverter, createDesign, dcInputCurrent, INVERTER_MODELS, recommendInverter, requiredInverterRating } from '../src';
import { appliance } from './helpers';

const base = () => createDesign().inverter; // Inverter Smart 12/1600: 1300 W, 3000 W peak

describe('dcInputCurrent', () => {
  it('is P / (V × η)', () => {
    expect(dcInputCurrent(1000, 12, 90)).toBeCloseTo(92.5926, 3);
    expect(dcInputCurrent(1000, 48, 95)).toBeCloseTo(21.9298, 3);
    expect(dcInputCurrent(1000, 0, 90)).toBe(0);
  });
});

describe('requiredInverterRating and recommendInverter', () => {
  it('adds the sizing margin to continuous demand', () => {
    expect(requiredInverterRating(1000, 2500, 25)).toEqual({ continuousW: 1250, peakW: 2500 });
  });
  it('picks the smallest suitable pure-sine model at the system voltage', () => {
    const m = recommendInverter(INVERTER_MODELS, 12, 1250, 2500);
    expect(m).not.toBeNull();
    expect(m!.inputVoltage).toBe(12);
    expect(m!.continuousW).toBeGreaterThanOrEqual(1250);
    expect(m!.peakW).toBeGreaterThanOrEqual(2500);
    const smaller = INVERTER_MODELS.filter((x) => x.inputVoltage === 12 && x.continuousW >= 1250 && x.peakW >= 2500 && x.continuousW < m!.continuousW);
    expect(smaller).toHaveLength(0);
    expect(recommendInverter(INVERTER_MODELS, 12, 100000, 0)).toBeNull();
  });
});

describe('analyseInverter', () => {
  const run = (apps: ReturnType<typeof appliance>[], over: Partial<Parameters<typeof analyseInverter>[0]> = {}) =>
    analyseInverter({
      appliances: apps,
      acContinuousW: apps.reduce((t, a) => t + a.powerW, 0),
      acPeakW: Math.max(0, ...apps.map((a) => a.surgeW)),
      config: base(),
      systemVoltage: 12,
      minimumVoltage: 12,
      batteryMaxDischargeA: 200,
      minVoltageRatio: 12 / 12.8,
      ...over,
    });

  it('accepts a load within ratings', () => {
    const r = run([appliance({ supply: 'ac', powerW: 500, surgeW: 500 })]);
    expect(r.loadChecks[0]!.status).toBe('ok');
    expect(r.continuousOk).toBe(true);
  });
  it('distinguishes meeting demand from meeting the sizing margin', () => {
    // 1200 W demand: 12/1600 (1300 W) covers demand but not 1500 W with 25 % margin
    const r = run([appliance({ supply: 'ac', powerW: 1200, surgeW: 1200 })]);
    expect(r.continuousOk).toBe(true);
    expect(r.marginOk).toBe(false);
  });
  it('flags loads above the continuous rating as incompatible', () => {
    const r = run([appliance({ supply: 'ac', powerW: 2100, surgeW: 2100, kind: 'induction' })]);
    expect(r.loadChecks[0]!.status).toBe('incompatible');
    expect(r.continuousOk).toBe(false);
  });
  it('flags start-up surges above the peak rating', () => {
    const r = run([appliance({ supply: 'ac', powerW: 600, surgeW: 3500, kind: 'motor' })]);
    expect(r.loadChecks[0]!.status).toBe('incompatible');
    expect(r.loadChecks[0]!.reasons.join(' ')).toMatch(/surge/i);
  });
  it('warns about modified sine wave for motors', () => {
    const cfg = { ...base(), model: { ...base().model, waveform: 'modified-sine' as const } };
    const r = run([appliance({ supply: 'ac', powerW: 300, surgeW: 300, kind: 'motor' })], { config: cfg });
    expect(r.loadChecks[0]!.status).toBe('warning');
  });
  it('flags loads beyond the battery discharge limit', () => {
    const r = run([appliance({ supply: 'ac', powerW: 1000, surgeW: 1000 })], { batteryMaxDischargeA: 50 });
    expect(r.loadChecks[0]!.status).toBe('incompatible');
  });
  it('reports DC currents for 12, 24 and 48 V', () => {
    const r = run([appliance({ supply: 'ac', powerW: 1000, surgeW: 1000 })]);
    const [a12, a24, a48] = r.currentsByVoltage;
    expect(a12!.continuousA).toBeCloseTo(2 * a24!.continuousA, 6);
    expect(a24!.continuousA).toBeCloseTo(2 * a48!.continuousA, 6);
  });
  it('treats a disabled inverter as incompatible for AC loads', () => {
    const r = run([appliance({ supply: 'ac', powerW: 100, surgeW: 100 })], { config: { ...base(), enabled: false } });
    expect(r.loadChecks[0]!.status).toBe('incompatible');
  });
});
