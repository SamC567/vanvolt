// Regression tests for the security audit: crafted design files must never crash the app,
// hang it, render unsafe links, or pass off unchecked data as verified.
import { describe, expect, it } from 'vitest';
import { analyseDesign, createDesign, EXAMPLE_DESIGNS } from '@vanvolt/engine';
import { DesignImportError, MAX_APPLIANCES, migrateDesign } from './migrate';

const base = () => JSON.parse(JSON.stringify(createDesign({ name: 'Crafted' })));

describe('migrateDesign with hostile input', () => {
  it('drops invalid appliances and coerces bad enums so analysis cannot crash', () => {
    const raw = base();
    raw.appliances = [
      null,
      42,
      'x',
      { name: 'ok', powerW: 10, provenance: 'totally-verified', supply: 'mains' },
    ];
    raw.battery.module.chemistry = 'unobtainium';
    raw.description = { evil: true };
    const d = migrateDesign(raw, { imported: true });
    expect(d.appliances).toHaveLength(1);
    expect(d.appliances[0]!.provenance).toBe('user');
    expect(d.appliances[0]!.supply).toBe('dc');
    expect(d.battery.module.chemistry).toBe('lifepo4');
    expect(d.description).toBe('');
    expect(() => analyseDesign(d)).not.toThrow();
  });

  it('bounds simulation length and numeric ranges', () => {
    const raw = base();
    raw.simulation.days = 1e9;
    raw.simulation.month = 99;
    raw.battery.parallel = 1e6;
    raw.appliances[0].hoursPerDay = 1e9;
    raw.solar.quantity = -5;
    const d = migrateDesign(raw);
    expect(d.simulation.days).toBe(60);
    expect(d.simulation.month).toBe(12);
    expect(d.battery.parallel).toBe(32);
    expect(d.appliances[0]!.hoursPerDay).toBe(24);
    expect(d.solar.quantity).toBe(0);
    const t0 = performance.now();
    analyseDesign(d);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('rejects oversized files', () => {
    const raw = base();
    raw.appliances = Array.from({ length: MAX_APPLIANCES + 1 }, () => raw.appliances[0]);
    expect(() => migrateDesign(raw)).toThrow(DesignImportError);
  });

  it('keeps only http(s) source URLs', () => {
    const raw = base();
    raw.appliances[0].source = {
      title: 'Datasheet',
      url: 'javascript:alert(1)',
      verification: 'secondary',
    };
    raw.battery.module.source = { title: 'x', url: 'ms-msdt:/id PCWDiagnostic' };
    raw.solar.panel.source = { title: 'x', url: 'data:text/html,<script>alert(1)</script>' };
    const d = migrateDesign(raw, { imported: true });
    expect(d.appliances[0]!.source!.url).toBe('');
    expect(d.battery.module.source!.url).toBe('');
    expect(d.solar.panel.source!.url).toBe('');
  });

  it('downgrades unverifiable "document" claims in imported files', () => {
    const raw = base();
    raw.battery.module.id = 'custom-fake';
    raw.battery.module.source = {
      title: 'Totally real datasheet',
      url: 'https://example.com/x.pdf',
      verification: 'document',
    };
    const d = migrateDesign(raw, { imported: true });
    expect(d.battery.module.source!.verification).toBe('secondary');
    expect(d.battery.module.source!.note).toMatch(/not checked/);
  });

  it('keeps verification for unmodified library items and for own saved designs', () => {
    const lib = migrateDesign(base(), { imported: true });
    expect(lib.battery.module.source!.verification).toBe('document');
    const raw = base();
    raw.battery.module.id = 'custom-fake';
    raw.battery.module.source = {
      title: 'Mine',
      url: 'https://example.com/x.pdf',
      verification: 'document',
    };
    expect(migrateDesign(raw).battery.module.source!.verification).toBe('document');
  });

  it('replaces unsafe or duplicate ids', () => {
    const raw = base();
    raw.id = '__proto__';
    raw.appliances[1].id = raw.appliances[0].id;
    const d = migrateDesign(raw);
    expect(d.id).not.toBe('__proto__');
    expect(new Set(d.appliances.map((a) => a.id)).size).toBe(d.appliances.length);
  });

  it.each(EXAMPLE_DESIGNS.map((e) => [e.id, e.build] as const))(
    'leaves the example %s unchanged',
    (_, build) => {
      const d = build();
      expect(migrateDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
    },
  );
});
