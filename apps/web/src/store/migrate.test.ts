import { describe, expect, it } from 'vitest';
import { createDesign } from '@vanvolt/engine';
import { DesignImportError, migrateDesign } from './migrate';

describe('migrateDesign', () => {
  it('round-trips a valid design', () => {
    const d = createDesign({ name: 'Round trip' });
    const m = migrateDesign(JSON.parse(JSON.stringify(d)));
    expect(m).toEqual(d);
  });
  it('fills fields missing from older files', () => {
    const d = createDesign() as unknown as Record<string, unknown>;
    delete d.simulation;
    delete (d.cables as Record<string, unknown>).conductorTempC;
    const m = migrateDesign(d);
    expect(m.simulation.days).toBeGreaterThan(0);
    expect(m.cables.conductorTempC).toBe(50);
  });
  it('rejects files that are not designs', () => {
    expect(() => migrateDesign(null)).toThrow(DesignImportError);
    expect(() => migrateDesign({ name: 'x' })).toThrow(DesignImportError);
    expect(() => migrateDesign({ ...createDesign(), schemaVersion: 99 })).toThrow(/schema version/);
  });
});
