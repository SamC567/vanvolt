import { describe, expect, it } from 'vitest';
import { analyseDesign, EXAMPLE_DESIGNS } from '@vanvolt/engine';
import { buildReport, pdfText, reportFileName } from './pdf';

describe('pdfText', () => {
  it('replaces characters the standard PDF fonts cannot encode', () => {
    expect(pdfText('Battery → busbar ≈ 2 ≤ 3 −1 ∞')).toBe('Battery -> busbar ~ 2 <= 3 -1 inf');
    expect(pdfText('25 mm² at 30 °C × 2 — ok')).toBe('25 mm² at 30 °C × 2 — ok');
  });
});

describe('buildReport', () => {
  it.each(EXAMPLE_DESIGNS.map((e) => [e.id, e.build] as const))(
    'generates a multi-page PDF for %s',
    (_, build) => {
      const d = build();
      const doc = buildReport(d, analyseDesign(d));
      expect(doc.getNumberOfPages()).toBeGreaterThan(2);
      const out = doc.output('arraybuffer');
      const head = new TextDecoder().decode(new Uint8Array(out).slice(0, 5));
      expect(head).toBe('%PDF-');
    },
  );
  it('makes a safe file name', () => {
    const d = EXAMPLE_DESIGNS[0]!.build();
    expect(reportFileName({ ...d, name: 'My van / 2026!' })).toMatch(
      /^vanvolt-my-van-2026-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});
