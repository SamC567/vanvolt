import { describe, expect, it } from 'vitest';
import {
  AC_CHARGERS,
  APPLIANCE_PRESETS,
  BATTERY_MODULES,
  CABLE_TABLES,
  DCDC_CHARGERS,
  INVERTER_MODELS,
  IRRADIANCE_LOCATIONS,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
} from '../src';

const sourced = [...BATTERY_MODULES, ...INVERTER_MODELS, ...MPPT_CONTROLLERS, ...DCDC_CHARGERS, ...AC_CHARGERS, ...SOLAR_PANELS];

describe('component library integrity', () => {
  it('every manufacturer item cites an https source with verification status', () => {
    for (const item of sourced) {
      expect(item.provenance, item.id).toBe('manufacturer');
      expect(item.source?.url, item.id).toMatch(/^https:\/\//);
      expect(['document', 'secondary'], item.id).toContain(item.source?.verification);
    }
  });
  it('ids are unique', () => {
    const ids = sourced.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('electrical values are positive and plausible', () => {
    for (const b of BATTERY_MODULES) expect(b.capacityAh * b.nominalVoltage, b.id).toBeGreaterThan(0);
    for (const i of INVERTER_MODELS) {
      expect(i.peakW, i.id).toBeGreaterThanOrEqual(i.continuousW);
      expect(i.maxEfficiencyPct, i.id).toBeLessThanOrEqual(100);
    }
    for (const p of SOLAR_PANELS) {
      expect(p.vocV!, p.id).toBeGreaterThan(p.vmpV!);
      expect(p.iscA!, p.id).toBeGreaterThan(p.impA!);
      // Vmp × Imp within 2 % of Pmax
      expect(Math.abs(p.vmpV! * p.impA! - p.powerW) / p.powerW, p.id).toBeLessThan(0.02);
    }
  });
});

describe('appliance presets', () => {
  it('manufacturer presets cite a source; estimates are labelled', () => {
    for (const p of APPLIANCE_PRESETS) {
      if (p.provenance === 'manufacturer') expect(p.source?.url, p.presetId).toMatch(/^https:\/\//);
      expect(p.surgeW, p.presetId).toBeGreaterThanOrEqual(p.powerW);
    }
    expect(APPLIANCE_PRESETS.some((p) => p.provenance === 'estimate')).toBe(true);
  });
});

describe('irradiance data', () => {
  it('has 12 non-negative months for every location', () => {
    for (const l of IRRADIANCE_LOCATIONS) {
      expect(l.horizontal, l.id).toHaveLength(12);
      expect(l.tilted, l.id).toHaveLength(12);
      expect(l.horizontal.every((v) => v >= 0 && v < 10), l.id).toBe(true);
      expect(l.source.url, l.id).toMatch(/^https:\/\/re\.jrc\.ec\.europa\.eu/);
    }
  });
});

describe('cable tables', () => {
  it('resistance decreases and ampacity increases with cross-section', () => {
    const c = CABLE_TABLES.conductors;
    for (let i = 1; i < c.length; i++) expect(c[i]!.resistanceOhmPerKm).toBeLessThan(c[i - 1]!.resistanceOhmPerKm);
    for (const t of CABLE_TABLES.ampacity) {
      const vals = c.map((x) => t.values[String(x.csaMm2)]!);
      for (let i = 1; i < vals.length; i++) expect(vals[i]!, t.id).toBeGreaterThan(vals[i - 1]!);
    }
  });
  it('fuse ratings sit inside each family range', () => {
    for (const f of CABLE_TABLES.fuses) {
      for (const r of f.ratings) {
        expect(r, f.id).toBeGreaterThanOrEqual(f.minA);
        expect(r, f.id).toBeLessThanOrEqual(f.maxA);
      }
    }
  });
});
