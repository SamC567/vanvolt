import { describe, expect, it } from 'vitest';
import {
  ambientFactor,
  CABLE_TABLES,
  deratedAmpacity,
  eligibleFuseFamilies,
  groupingFactor,
  minimumCsaForDrop,
  recommendFuse,
  resistanceAt,
  selectFuseRating,
  sizeCable,
  standardFuseRatings,
  voltageDrop,
  type CableRunInput,
} from '../src';

const t90 = CABLE_TABLES.ampacity.find((t) => t.insulationRatingC === 90)!;

function run(over: Partial<CableRunInput> = {}): CableRunInput {
  return {
    id: 'r',
    role: 'custom',
    name: 'Run',
    lengthM: 2,
    currentA: 50,
    voltageV: 12,
    maxDropPct: 3,
    installation: 'free-air',
    bundledCount: 1,
    ambientC: 30,
    ...over,
  };
}
const opts = { conductorTempC: 20, insulationRatingC: 90 };

describe('resistance and voltage drop', () => {
  it('corrects resistance for temperature (α = 0.00393)', () => {
    expect(resistanceAt(1, 20)).toBe(1);
    expect(resistanceAt(0.78, 50)).toBeCloseTo(0.78 * 1.1179, 6);
  });
  it('uses the round-trip length', () => {
    // 100 A, 2 m one-way, 25 mm² (0.78 Ω/km) at 20 °C → 100 × 0.00078 × 4 = 0.312 V
    expect(voltageDrop(100, 2, 0.78, 20)).toBeCloseTo(0.312, 9);
  });
  it('minimum theoretical CSA', () => {
    // 2 × 2 m × 100 A × 0.017241 / (12 × 3 %) = 19.16 mm²
    expect(minimumCsaForDrop(100, 2, 12, 3, 20)).toBeCloseTo((4 * 100 * 0.017241) / 0.36, 6);
  });
});

describe('derating', () => {
  it('ambient factor is 1 at ≤ 30 °C and the ISO 60 °C factor at 60 °C', () => {
    expect(ambientFactor(CABLE_TABLES, 90, 25, 30)).toBe(1);
    expect(ambientFactor(CABLE_TABLES, 90, 60, 30)).toBeCloseTo(0.82, 9);
    expect(ambientFactor(CABLE_TABLES, 90, 45, 30)).toBeCloseTo(0.91, 9);
  });
  it('grouping factor steps by conductor count', () => {
    expect(groupingFactor(CABLE_TABLES.grouping, 1)).toBe(1);
    expect(groupingFactor(CABLE_TABLES.grouping, 3)).toBe(0.7);
    expect(groupingFactor(CABLE_TABLES.grouping, 5)).toBe(0.6);
    expect(groupingFactor(CABLE_TABLES.grouping, 10)).toBe(0.5);
    expect(groupingFactor(CABLE_TABLES.grouping, 30)).toBe(0.4);
  });
  it('applies the ISO 10133 table value with derating', () => {
    expect(deratedAmpacity(CABLE_TABLES, t90, 25, 'free-air', 1, 30)).toBe(140);
    expect(deratedAmpacity(CABLE_TABLES, t90, 25, 'bundled', 3, 30)).toBeCloseTo(98, 9);
    expect(deratedAmpacity(CABLE_TABLES, t90, 3, 'free-air', 1, 30)).toBeNull();
  });
});

describe('fuses', () => {
  it('rates at ≥ 125 % of design current and protects the cable', () => {
    const f = recommendFuse(CABLE_TABLES, 40, 70, 12);
    expect(f.minRatingA).toBe(50);
    expect(f.ratingA).toBe(50);
    expect(f.ok).toBe(true);
    expect(f.families.map((x) => x.id)).toContain('midi');
  });
  it('fails when no rating fits below the cable ampacity', () => {
    const f = recommendFuse(CABLE_TABLES, 40, 45, 12);
    expect(f.ok).toBe(false);
  });
  it('restricts main lithium fuses to high-interrupt families', () => {
    const f = recommendFuse(CABLE_TABLES, 160, 300, 12, { mainBattery: true, lithium: true });
    expect(f.ratingA).toBe(200);
    expect(f.families.every((x) => x.highInterrupt)).toBe(true);
    expect(f.families.length).toBeGreaterThan(0);
  });
  it('excludes 32 V fuse families on 48 V systems (max charge ≈ 1.2 × nominal)', () => {
    const fams = eligibleFuseFamilies(CABLE_TABLES, 48);
    expect(fams.length).toBeGreaterThan(0);
    expect(fams.every((x) => x.maxVoltageDc >= 57.6)).toBe(true);
    expect(fams.some((x) => x.maxVoltageDc === 32)).toBe(false);
    // 20 A at 48 V: no family offers ≤ 25 A at this voltage, so the pool is the eligible families' ratings
    const f = recommendFuse(CABLE_TABLES, 20, 100, 48);
    expect(f.families.every((x) => x.maxVoltageDc >= 57.6)).toBe(true);
  });
  it('picks a rating that a suitable family actually offers', () => {
    // 140 A × 1.25 = 175 A; lithium main fuse → high-interrupt families offer 200 A, not 175 A
    const sel = selectFuseRating(CABLE_TABLES, 140, 12, { mainBattery: true, lithium: true });
    expect(sel.ratingA).toBe(200);
    expect(sel.families.length).toBeGreaterThan(0);
    // Not a main fuse: 175 A MIDI/MEGA is available
    expect(selectFuseRating(CABLE_TABLES, 140, 12).ratingA).toBe(175);
  });
  it('does not assign automotive fuses to PV string circuits', () => {
    const f = recommendFuse(CABLE_TABLES, 12, 30, 40, { pv: true });
    expect(f.ratingA).toBeNull();
    expect(f.families).toEqual([]);
    expect(f.ok).toBe(true);
    expect(f.notes[0]).toMatch(/gPV/);
  });
  it('standard ratings are sorted and unique', () => {
    const r = standardFuseRatings(CABLE_TABLES);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
    expect(new Set(r).size).toBe(r.length);
  });
});

describe('sizeCable', () => {
  it('selects a voltage-drop-limited size for long runs', () => {
    // 20 A over 6 m at 12 V, 3 %: need ≥ 2×6×20×ρ/0.36 ≈ 11.5 mm² → 16 mm²
    const r = sizeCable(CABLE_TABLES, run({ currentA: 20, lengthM: 6 }), opts);
    expect(r.selectedCsaMm2).toBe(16);
    expect(r.limitedBy).toBe('voltage-drop');
    expect(r.dropPct).toBeLessThanOrEqual(3);
    expect(r.fuse.ratingA).toBe(25);
  });
  it('selects an ampacity-limited size for short heavy runs', () => {
    // 150 A over 0.5 m: drop is tiny; fuse 200 A needs ampacity ≥ 200 → 50 mm² (230 A)
    const r = sizeCable(CABLE_TABLES, run({ currentA: 150, lengthM: 0.5 }), opts);
    expect(r.fuse.ratingA).toBe(200);
    expect(r.selectedCsaMm2).toBe(50);
    expect(r.limitedBy).toBe('ampacity');
    expect(r.ok).toBe(true);
  });
  it('reports a too-small override', () => {
    const r = sizeCable(CABLE_TABLES, run({ currentA: 100, lengthM: 2, overrideCsaMm2: 10 }), opts);
    expect(r.limitedBy).toBe('override');
    expect(r.ok).toBe(false);
    expect(r.messages.length).toBeGreaterThan(0);
  });
  it('returns no size when nothing in the table suffices', () => {
    const r = sizeCable(CABLE_TABLES, run({ currentA: 600, lengthM: 10 }), opts);
    expect(r.selectedCsaMm2).toBeNull();
    expect(r.ok).toBe(false);
  });
  it('computes cable power loss = I × Vdrop', () => {
    const r = sizeCable(CABLE_TABLES, run({ currentA: 20, lengthM: 6 }), opts);
    expect(r.powerLossW).toBeCloseTo(20 * r.dropV, 9);
  });
});
