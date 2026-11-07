/**
 * Side-by-side comparison metrics for several designs.
 */
import type { Design } from './types';
import type { SystemAnalysis } from './analysis';

export interface ComparisonMetric {
  key: string;
  label: string;
  unit: string;
  /** Whether a higher value is better (for highlighting). null = neutral. */
  higherIsBetter: boolean | null;
  decimals: number;
  value: (d: Design, a: SystemAnalysis) => number | null;
}

export const COMPARISON_METRICS: ComparisonMetric[] = [
  { key: 'systemVoltage', label: 'System voltage', unit: 'V', higherIsBetter: null, decimals: 0, value: (d) => d.systemVoltage },
  { key: 'dailyWh', label: 'Daily consumption', unit: 'Wh', higherIsBetter: false, decimals: 0, value: (_, a) => a.summary.dailyWh },
  { key: 'nominalWh', label: 'Battery nominal energy', unit: 'Wh', higherIsBetter: true, decimals: 0, value: (_, a) => a.battery.bank.nominalWh },
  { key: 'usableWh', label: 'Battery usable energy', unit: 'Wh', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.usableWh },
  { key: 'autonomy', label: 'Autonomy (no charging)', unit: 'days', higherIsBetter: true, decimals: 1, value: (_, a) => (Number.isFinite(a.summary.autonomyDays) ? a.summary.autonomyDays : null) },
  { key: 'solarW', label: 'Installed solar', unit: 'W', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.installedSolarW },
  { key: 'solarSummer', label: 'Solar — summer average', unit: 'Wh/day', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.solarSummerWhPerDay },
  { key: 'solarWinter', label: 'Solar — winter average', unit: 'Wh/day', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.solarWinterWhPerDay },
  { key: 'worstNet', label: 'Worst-month daily balance', unit: 'Wh/day', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.worstMonthNetWh },
  { key: 'inverterW', label: 'Inverter continuous rating', unit: 'W', higherIsBetter: null, decimals: 0, value: (_, a) => a.summary.inverterW },
  { key: 'acPeak', label: 'Peak AC demand', unit: 'W', higherIsBetter: null, decimals: 0, value: (_, a) => a.summary.acPeakW },
  { key: 'simMin', label: 'Simulated minimum SoC', unit: '%', higherIsBetter: true, decimals: 0, value: (_, a) => a.summary.simMinSocPct },
  { key: 'weight', label: 'Battery weight', unit: 'kg', higherIsBetter: false, decimals: 0, value: (_, a) => a.summary.totalWeightKg },
  { key: 'critical', label: 'Critical issues', unit: '', higherIsBetter: false, decimals: 0, value: (_, a) => a.findings.filter((f) => f.severity === 'critical').length },
  { key: 'warnings', label: 'Warnings', unit: '', higherIsBetter: false, decimals: 0, value: (_, a) => a.findings.filter((f) => f.severity === 'warning').length },
];

export interface ComparisonRow {
  metric: ComparisonMetric;
  values: (number | null)[];
  /** Index of the best design for this metric, or null. */
  bestIndex: number | null;
}

export function compareDesigns(items: { design: Design; analysis: SystemAnalysis }[]): ComparisonRow[] {
  return COMPARISON_METRICS.map((metric) => {
    const values = items.map(({ design, analysis }) => metric.value(design, analysis));
    let bestIndex: number | null = null;
    if (metric.higherIsBetter !== null && items.length > 1) {
      let best: number | null = null;
      values.forEach((v, i) => {
        if (v === null) return;
        if (best === null || (metric.higherIsBetter ? v > best : v < best)) {
          best = v;
          bestIndex = i;
        }
      });
      // No highlight when all values are equal.
      const nonNull = values.filter((v): v is number => v !== null);
      if (nonNull.length > 0 && nonNull.every((v) => v === nonNull[0])) bestIndex = null;
    }
    return { metric, values, bestIndex };
  });
}
