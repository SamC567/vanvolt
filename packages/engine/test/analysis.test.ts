import { describe, expect, it } from 'vitest';
import {
  analyseDesign,
  compareDesigns,
  compareSystemVoltages,
  createDesign,
  duplicateDesign,
  EXAMPLE_DESIGNS,
} from '../src';

describe('analyseDesign', () => {
  it('analyses the default design without critical issues', () => {
    const a = analyseDesign(createDesign());
    expect(a.findings.filter((f) => f.severity === 'critical')).toEqual([]);
    expect(a.summary.dailyWh).toBeGreaterThan(0);
    expect(a.cables.length).toBeGreaterThan(3);
    expect(a.simulation.steps).toHaveLength(7 * 24);
    expect(a.assumptions.length).toBeGreaterThan(10);
  });

  it.each(EXAMPLE_DESIGNS.map((e) => [e.id, e.build] as const))(
    'example %s analyses and is deterministic',
    (_, build) => {
      const d = build();
      const a = analyseDesign(d);
      expect(Number.isFinite(a.summary.dailyWh)).toBe(true);
      expect(a.battery.bank.voltageClass).toBe(d.systemVoltage);
      expect(analyseDesign(build()).summary).toEqual(a.summary);
    },
  );

  it('flags a battery/system voltage mismatch', () => {
    const d = createDesign();
    d.systemVoltage = 24;
    const a = analyseDesign(d);
    expect(
      a.findings.some((f) => f.id === 'battery:voltage-mismatch' && f.severity === 'critical'),
    ).toBe(true);
    expect(a.status).toBe('critical');
  });

  it('flags AC loads without an inverter', () => {
    const d = createDesign();
    d.inverter.enabled = false;
    expect(analyseDesign(d).findings.some((f) => f.id === 'consumption:ac-no-inverter')).toBe(true);
  });

  it('flags a relay (VSR) on a lithium bank', () => {
    const d = createDesign();
    d.charging.alternator.method = 'vsr';
    expect(analyseDesign(d).findings.some((f) => f.id === 'charging:vsr-lithium')).toBe(true);
  });

  it('includes the main battery cable with a high-interrupt fuse for lithium', () => {
    const a = analyseDesign(createDesign());
    const main = a.cables.find((c) => c.role === 'battery-main')!;
    expect(main.fuse.families.every((f) => f.highInterrupt)).toBe(true);
  });
});

describe('compareSystemVoltages', () => {
  it('halves currents each time the voltage doubles', () => {
    const d = EXAMPLE_DESIGNS[1]!.build();
    const opts = compareSystemVoltages(d, analyseDesign(d));
    expect(opts.map((o) => o.voltage)).toEqual([12, 24, 48]);
    expect(opts[0]!.inverterContinuousA).toBeCloseTo(2 * opts[1]!.inverterContinuousA, 6);
    expect(opts[1]!.inverterContinuousA).toBeCloseTo(2 * opts[2]!.inverterContinuousA, 6);
    expect(opts[0]!.bankAh).toBeCloseTo(4 * opts[2]!.bankAh, 6);
  });
});

describe('compareDesigns', () => {
  it('highlights the best value per metric', () => {
    const a = createDesign();
    const b = duplicateDesign(a, 'Bigger battery');
    b.battery.parallel = 2;
    const rows = compareDesigns(
      [a, b].map((design) => ({ design, analysis: analyseDesign(design) })),
    );
    const usable = rows.find((r) => r.metric.key === 'usableWh')!;
    expect(usable.bestIndex).toBe(1);
    const volts = rows.find((r) => r.metric.key === 'systemVoltage')!;
    expect(volts.bestIndex).toBeNull();
  });
});
