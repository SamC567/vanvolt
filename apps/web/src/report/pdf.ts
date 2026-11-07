/**
 * PDF engineering report, generated entirely in the browser (vector text, tables and charts).
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { MONTHS, type Design, type SourceRef, type SystemAnalysis } from '@vanvolt/engine';

export interface ReportOptions {
  appliances: boolean;
  cables: boolean;
  simulation: boolean;
  assumptions: boolean;
  sources: boolean;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  appliances: true,
  cables: true,
  simulation: true,
  assumptions: true,
  sources: true,
};

/* Light-mode palette (validated reference palette). */
const C = {
  ink: [11, 11, 11] as const,
  ink2: [82, 81, 78] as const,
  ink3: [133, 132, 126] as const,
  line: [225, 224, 219] as const,
  head: [240, 239, 236] as const,
  accent: [42, 120, 214] as const,
  solar: [235, 104, 52] as const,
  alt: [42, 120, 214] as const,
  shore: [27, 175, 122] as const,
  crit: [208, 59, 59] as const,
  warn: [250, 178, 25] as const,
  good: [12, 163, 12] as const,
};

/** Standard PDF fonts use WinAnsi encoding — replace characters it cannot show. */
export function pdfText(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/≈/g, '~')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/−/g, '-')
    .replace(/∞/g, 'inf')
    .replace(/γ/g, 'gamma')
    .replace(/Δ/g, 'delta ')
    .replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”…•€]/g, '');
}

const n = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? v !== null && v !== undefined && v > 0
      ? 'inf'
      : '-'
    : v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });

interface Ctx {
  doc: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
  margin: number;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y + needed > ctx.pageH - 18) {
    ctx.doc.addPage();
    ctx.y = 20;
  }
}

function heading(ctx: Ctx, text: string) {
  ensure(ctx, 20);
  ctx.y += 4;
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(13);
  ctx.doc.setTextColor(...C.ink);
  ctx.doc.text(pdfText(text), ctx.margin, ctx.y);
  ctx.doc.setDrawColor(...C.accent);
  ctx.doc.setLineWidth(0.6);
  ctx.doc.line(ctx.margin, ctx.y + 1.8, ctx.margin + 18, ctx.y + 1.8);
  ctx.y += 7;
}

function para(ctx: Ctx, text: string, size = 9, color: readonly [number, number, number] = C.ink2) {
  const doc = ctx.doc;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(pdfText(text), ctx.pageW - ctx.margin * 2) as string[];
  ensure(ctx, lines.length * size * 0.42 + 2);
  doc.text(lines, ctx.margin, ctx.y);
  ctx.y += lines.length * size * 0.42 + 2;
}

function table(
  ctx: Ctx,
  head: string[],
  body: (string | number)[][],
  opts: { colRight?: number[]; fontSize?: number } = {},
) {
  const right = new Set(opts.colRight ?? []);
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [head.map(pdfText)],
    body: body.map((r) => r.map((c) => pdfText(String(c)))),
    margin: { left: ctx.margin, right: ctx.margin },
    styles: {
      font: 'helvetica',
      fontSize: opts.fontSize ?? 8,
      cellPadding: 1.6,
      textColor: [...C.ink],
      lineColor: [...C.line],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [...C.head], textColor: [...C.ink2], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: Object.fromEntries([...right].map((i) => [i, { halign: 'right' as const }])),
    theme: 'grid',
  });
  ctx.y =
    ((ctx.doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      ctx.y) + 5;
}

/** Vector bar chart (optionally stacked) with an optional reference line series. */
function barChart(
  ctx: Ctx,
  opts: {
    title: string;
    labels: string[];
    series: { name: string; color: readonly [number, number, number]; values: number[] }[];
    line?: { name: string; values: number[] };
    unit: string;
    height?: number;
  },
) {
  const { doc, margin } = ctx;
  const h = opts.height ?? 55;
  ensure(ctx, h + 20);
  const x0 = margin + 14;
  const w = ctx.pageW - margin * 2 - 16;
  const top = ctx.y + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(pdfText(opts.title), margin, ctx.y);
  const totals = opts.labels.map((_, i) =>
    opts.series.reduce((t, s) => t + Math.max(0, s.values[i] ?? 0), 0),
  );
  const maxV = Math.max(1, ...totals, ...(opts.line?.values ?? [0]));
  const step = Math.pow(10, Math.floor(Math.log10(maxV)));
  const niceMax = Math.ceil(maxV / step) * step;
  // grid + axis labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  for (let g = 0; g <= 4; g++) {
    const v = (niceMax * g) / 4;
    const gy = top + h - (h * g) / 4;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.15);
    doc.line(x0, gy, x0 + w, gy);
    doc.setTextColor(...C.ink3);
    doc.text(n(v), x0 - 1.5, gy + 1, { align: 'right' });
  }
  const slot = w / opts.labels.length;
  const bw = Math.min(9, slot * 0.6);
  opts.labels.forEach((lab, i) => {
    let acc = 0;
    const cx = x0 + slot * i + slot / 2;
    for (const s of opts.series) {
      const v = Math.max(0, s.values[i] ?? 0);
      if (v <= 0) continue;
      const bh = (v / niceMax) * h;
      doc.setFillColor(...s.color);
      doc.rect(cx - bw / 2, top + h - acc - bh, bw, bh, 'F');
      acc += bh;
    }
    doc.setTextColor(...C.ink3);
    doc.text(pdfText(lab), cx, top + h + 4, { align: 'center' });
  });
  if (opts.line) {
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([1.2, 1], 0);
    const pts = opts.line.values.map(
      (v, i) => [x0 + slot * i + slot / 2, top + h - (v / niceMax) * h] as const,
    );
    for (let i = 1; i < pts.length; i++)
      doc.line(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
    doc.setLineDashPattern([], 0);
  }
  // legend
  let lx = x0;
  const ly = top + h + 9;
  doc.setFontSize(7);
  for (const s of opts.series) {
    doc.setFillColor(...s.color);
    doc.rect(lx, ly - 2.2, 2.6, 2.6, 'F');
    doc.setTextColor(...C.ink2);
    doc.text(pdfText(s.name), lx + 3.6, ly);
    lx += doc.getTextWidth(pdfText(s.name)) + 9;
  }
  if (opts.line) {
    doc.setDrawColor(...C.ink);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(lx, ly - 0.9, lx + 5, ly - 0.9);
    doc.setLineDashPattern([], 0);
    doc.text(pdfText(opts.line.name), lx + 6.5, ly);
  }
  doc.setTextColor(...C.ink3);
  doc.text(pdfText(opts.unit), x0 - 12, top - 1.5);
  ctx.y = ly + 6;
}

function lineChart(
  ctx: Ctx,
  title: string,
  values: number[],
  floor: number,
  xLabels: (i: number) => string | null,
) {
  const { doc, margin } = ctx;
  const h = 45;
  ensure(ctx, h + 16);
  const x0 = margin + 12;
  const w = ctx.pageW - margin * 2 - 14;
  const top = ctx.y + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(pdfText(title), margin, ctx.y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  for (let g = 0; g <= 4; g++) {
    const gy = top + h - (h * g) / 4;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.15);
    doc.line(x0, gy, x0 + w, gy);
    doc.setTextColor(...C.ink3);
    doc.text(`${g * 25}%`, x0 - 1.5, gy + 1, { align: 'right' });
  }
  const fy = top + h - (floor / 100) * h;
  doc.setDrawColor(...C.crit);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x0, fy, x0 + w, fy);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.6);
  const dx = w / Math.max(1, values.length - 1);
  for (let i = 1; i < values.length; i++) {
    doc.line(
      x0 + dx * (i - 1),
      top + h - (values[i - 1]! / 100) * h,
      x0 + dx * i,
      top + h - (values[i]! / 100) * h,
    );
  }
  doc.setTextColor(...C.ink3);
  values.forEach((_, i) => {
    const l = xLabels(i);
    if (l) doc.text(l, x0 + dx * i, top + h + 4, { align: 'center' });
  });
  ctx.y = top + h + 9;
}

function collectSources(design: Design, a: SystemAnalysis): SourceRef[] {
  const list: SourceRef[] = [];
  const push = (s?: SourceRef) => {
    if (s && s.url && !list.some((x) => x.url === s.url && x.title === s.title)) list.push(s);
  };
  push(design.battery.module.source);
  push(design.solar.panel.source);
  push(design.solar.controller?.source);
  push(design.inverter.model.source);
  push(design.charging.alternator.enabled ? design.charging.alternator.dcdc.source : undefined);
  push(
    design.charging.shore.enabled && !design.charging.shore.useInverterCharger
      ? design.charging.shore.charger.source
      : undefined,
  );
  for (const ap of design.appliances) if (ap.enabled) push(ap.source);
  push(a.location.source);
  for (const x of a.assumptions) push(x.source);
  for (const c of a.cables) for (const f of c.fuse.families) push(f.source);
  return list;
}

export function buildReport(
  design: Design,
  a: SystemAnalysis,
  opts: ReportOptions = DEFAULT_REPORT_OPTIONS,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx: Ctx = {
    doc,
    y: 20,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    margin: 16,
  };
  const s = a.summary;
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Cover header band
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, ctx.pageW, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('VanVolt', ctx.margin, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Campervan electrical system — design report', ctx.margin, 22);
  doc.setFontSize(8);
  doc.text(pdfText(date), ctx.pageW - ctx.margin, 15, { align: 'right' });
  ctx.y = 46;
  doc.setTextColor(...C.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(pdfText(design.name), ctx.margin, ctx.y);
  ctx.y += 6;
  if (design.description) para(ctx, design.description, 9);
  const statusText =
    a.status === 'ok'
      ? 'No issues found'
      : a.status === 'warning'
        ? 'Warnings to review'
        : 'Critical issues to resolve';
  const statusColor = a.status === 'ok' ? C.good : a.status === 'warning' ? C.warn : C.crit;
  ensure(ctx, 10);
  const [sr, sg, sb] = statusColor;
  doc.setFillColor(sr, sg, sb);
  doc.circle(ctx.margin + 1.6, ctx.y - 1.2, 1.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(`Design status: ${statusText}`, ctx.margin + 5, ctx.y);
  ctx.y += 7;

  // Disclaimer box
  ensure(ctx, 18);
  doc.setDrawColor(...C.warn);
  doc.setFillColor(255, 248, 230);
  doc.roundedRect(ctx.margin, ctx.y, ctx.pageW - ctx.margin * 2, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.ink2);
  doc.text(
    doc.splitTextToSize(
      'Planning tool output only. Results are estimates based on the stated inputs, manufacturer data and engineering assumptions. This report is not a substitute for design verification and inspection of the installation by a competent person against the applicable standards (e.g. BS 7671 Section 721, BS EN 1648-2) and manufacturer instructions.',
      ctx.pageW - ctx.margin * 2 - 6,
    ) as string[],
    ctx.margin + 3,
    ctx.y + 4.5,
  );
  ctx.y += 20;

  heading(ctx, 'Summary');
  table(
    ctx,
    ['Metric', 'Value', 'Metric', 'Value'],
    [
      [
        'System voltage',
        `${design.systemVoltage} V`,
        'Location',
        `${a.location.name} (${design.solar.mounting === 'flat' ? 'flat panels' : 'tilted 35°'})`,
      ],
      [
        'Daily consumption',
        `${n(s.dailyWh)} Wh (${n(s.dailyAh, 1)} Ah)`,
        'Weekly consumption',
        `${n(s.weeklyWh)} Wh`,
      ],
      [
        'Battery bank',
        `${n(a.battery.bank.nominalVoltage, 1)} V ${n(a.battery.bank.capacityAh)} Ah (${n(a.battery.bank.nominalWh)} Wh)`,
        'Usable energy',
        `${n(s.usableWh)} Wh at ${design.battery.dodPct}% DoD`,
      ],
      [
        'Autonomy (no charging)',
        `${n(s.autonomyDays, 1)} days`,
        'Installed solar',
        `${n(s.installedSolarW)} W`,
      ],
      [
        'Solar summer / winter',
        `${n(s.solarSummerWhPerDay)} / ${n(s.solarWinterWhPerDay)} Wh/day`,
        `Worst month (${MONTHS[s.worstMonth - 1]})`,
        `${n(s.worstMonthNetWh)} Wh/day net`,
      ],
      [
        'Inverter',
        design.inverter.enabled
          ? `${design.inverter.model.model} (${n(design.inverter.model.continuousW)} W)`
          : 'None',
        'AC continuous / peak',
        `${n(a.consumption.ac.continuousW)} / ${n(a.consumption.ac.peakW)} W`,
      ],
      [
        'Peak battery current',
        `${n(a.battery.peakDischargeA)} A`,
        'Simulated min SoC',
        `${n(s.simMinSocPct)}% (${MONTHS[design.simulation.month - 1]})`,
      ],
    ],
  );

  heading(ctx, 'Design checks');
  if (a.findings.length === 0) para(ctx, 'No issues were found.');
  else
    table(
      ctx,
      ['Severity', 'Area', 'Finding', 'Advice'],
      a.findings.map((f) => [f.severity.toUpperCase(), f.module, f.message, f.advice ?? '']),
    );

  if (opts.appliances) {
    heading(ctx, 'Electrical loads');
    table(
      ctx,
      ['Appliance', 'Supply', 'W', 'Qty', 'h/day', 'Duty', 'Days/wk', 'Wh/day*', 'Data'],
      design.appliances
        .filter((x) => x.enabled)
        .map((ap) => {
          const r = a.consumption.appliances.find((y) => y.id === ap.id);
          return [
            ap.name,
            ap.supply.toUpperCase(),
            n(ap.powerW, ap.powerW < 100 ? 1 : 0),
            ap.quantity,
            n(ap.hoursPerDay, 2),
            `${ap.dutyCyclePct}%`,
            ap.daysPerWeek,
            n(r?.batteryWhPerDayAvg),
            ap.provenance,
          ];
        }),
      { colRight: [2, 3, 4, 5, 6, 7] },
    );
    para(
      ctx,
      `* Average daily energy drawn from the battery, including inverter losses (${design.inverter.averageEfficiencyPct}% average efficiency) for AC loads. Inverter idle: ${n(a.consumption.inverterIdleWhPerDay)} Wh/day. Continuous at battery: ${n(a.consumption.battery.continuousW)} W; peak ${n(a.consumption.battery.peakW)} W.`,
      7.5,
    );
  }

  heading(ctx, 'Battery');
  const m = design.battery.module;
  table(
    ctx,
    ['Item', 'Value'],
    [
      [
        'Module',
        `${m.manufacturer} ${m.model} (${m.chemistry.toUpperCase()}, ${m.nominalVoltage} V, ${m.capacityAh} Ah)`,
      ],
      [
        'Configuration',
        `${design.battery.series} in series × ${design.battery.parallel} in parallel`,
      ],
      [
        'Depth of discharge / efficiency',
        `${design.battery.dodPct}% / ${a.battery.chargeEfficiencyPct}% round trip`,
      ],
      [
        'Peukert exponent / factor',
        `${a.battery.peukertExponent.toFixed(2)} / ${n(a.battery.peukertFactor * 100, 1)}%`,
      ],
      [
        'Capacity for target autonomy',
        `${n(a.battery.requiredAhForTarget)} Ah for ${design.battery.autonomyTargetDays} days (${a.battery.recommendedParallel} in parallel)`,
      ],
      [
        'Current limits (bank)',
        `${n(a.battery.bank.maxContinuousDischargeA)} A discharge / ${n(a.battery.bank.maxContinuousChargeA)} A charge${a.battery.bank.limitsFromDatasheet ? '' : ' (partly assumed)'}`,
      ],
      [
        'Cycle life / estimated life',
        a.battery.cycleLife !== null
          ? `${n(a.battery.cycleLife)} cycles / ${n(a.battery.estimatedLifeYears, 1)} years (throughput model)`
          : 'No data',
      ],
    ],
  );

  heading(ctx, 'Solar');
  para(
    ctx,
    `${design.solar.quantity} x ${design.solar.panel.manufacturer} ${design.solar.panel.model} = ${n(a.solar.installedW)} W, ${a.solar.strings.strings} string(s) of ${design.solar.panelsInSeries}. Controller: ${design.solar.controllerType.toUpperCase()}${design.solar.controller && design.solar.controllerType === 'mppt' ? ` ${design.solar.controller.model}` : ''}. Overall efficiency to battery ${n(a.solar.losses.overall * 100, 1)}% (shading ${design.solar.shadingLossPct}%, orientation ${design.solar.orientationLossPct}%, temperature ${design.solar.temperatureLossPct}%, soiling ${design.solar.soilingLossPct}%, reflection ${design.solar.reflectionLossPct}%, wiring ${design.solar.wiringLossPct}%). Irradiation: ${a.location.source.title}.`,
  );
  barChart(ctx, {
    title: 'Average daily solar energy by month (Wh/day) vs consumption',
    labels: [...MONTHS],
    series: [{ name: 'Solar', color: C.solar, values: a.solar.monthly.map((x) => x.whPerDay) }],
    line: { name: 'Daily consumption', values: MONTHS.map(() => a.consumption.batteryWhPerDay) },
    unit: 'Wh/day',
  });

  heading(ctx, 'Charging and energy balance');
  table(
    ctx,
    ['Source', 'Enabled', 'Max current', 'Avg Wh/day', 'Active-day Wh'],
    a.charging.sources.map((x) => [
      x.label,
      x.enabled ? 'Yes' : 'No',
      `${n(x.currentA, 1)} A`,
      n(x.whPerDayAvg),
      n(x.whPerActiveDay),
    ]),
    { colRight: [2, 3, 4] },
  );
  const eff = a.battery.chargeEfficiencyPct / 100;
  barChart(ctx, {
    title: 'Stored charge energy by source vs daily consumption (Wh/day)',
    labels: [...MONTHS],
    series: [
      { name: 'Solar', color: C.solar, values: a.charging.monthly.map((x) => x.solarWh * eff) },
      {
        name: 'Alternator',
        color: C.alt,
        values: a.charging.monthly.map((x) => x.alternatorWh * eff),
      },
      { name: 'Shore', color: C.shore, values: a.charging.monthly.map((x) => x.shoreWh * eff) },
    ].filter((x) => x.values.some((v) => v > 0)),
    line: { name: 'Consumption', values: a.charging.monthly.map((x) => x.consumptionWh) },
    unit: 'Wh/day',
  });

  if (design.inverter.enabled && a.inverter.hasAcLoads) {
    heading(ctx, 'Inverter');
    para(
      ctx,
      `${design.inverter.model.manufacturer} ${design.inverter.model.model}: ${n(design.inverter.model.continuousW)} W continuous (25 °C), ${n(design.inverter.model.peakW)} W peak, ${design.inverter.model.idleW} W idle. Required: ${n(a.inverter.requiredContinuousW)} W continuous incl. ${design.inverter.sizingMarginPct}% margin, ${n(a.inverter.acPeakW)} W peak. DC input at rated output: ${n(a.inverter.ratedDcCurrentA)} A.`,
    );
    table(
      ctx,
      ['AC appliance', 'Status', 'Running W', 'Surge W', 'DC A', 'Notes'],
      a.inverter.loadChecks.map((l) => [
        l.name,
        l.status,
        n(l.runningW),
        n(l.surgeW),
        n(l.dcCurrentA),
        l.reasons.join(' '),
      ]),
      { colRight: [2, 3, 4] },
    );
  }

  if (opts.cables) {
    heading(ctx, 'Cables and protection');
    table(
      ctx,
      ['Circuit', 'Current', 'Length', 'Size', 'Drop', 'Loss', 'Fuse', 'Fuse type'],
      a.cables.map((c) => [
        c.name,
        `${n(c.input.currentA, 1)} A`,
        `${n(c.input.lengthM, 1)} m`,
        c.selectedCsaMm2 !== null ? `${c.selectedCsaMm2} mm²` : 'none',
        `${n(c.dropPct, 2)}%`,
        `${n(c.powerLossW, 1)} W`,
        c.fuse.ratingA !== null ? `${c.fuse.ratingA} A` : c.role === 'pv-mppt' ? 'see note' : '-',
        c.fuse.families.map((f) => f.name).join(', '),
      ]),
      { colRight: [1, 2, 3, 4, 5, 6] },
    );
    para(
      ctx,
      `Conductor resistance: IEC 60228 Class 5 copper at ${design.cables.conductorTempC} °C. Current capacity: ISO 10133 Table A.1, ${design.cables.insulationRatingC} °C insulation, ${design.cables.ambientC} °C ambient. Fuse rating >= 1.25 x design current and <= derated cable capacity. Terminal and fuse-holder resistances are not included. PV string circuits: string fuses are generally only needed with three or more strings in parallel and must be PV-rated (gPV).`,
      7.5,
    );
  }

  if (opts.simulation) {
    heading(
      ctx,
      `Simulation — ${MONTHS[design.simulation.month - 1]}, ${design.simulation.days} days`,
    );
    para(
      ctx,
      `Minimum state of charge ${n(a.simulation.minSocPct)}%, end ${n(a.simulation.endSocPct)}%. Unsupplied energy ${n(a.simulation.totalUnmetWh)} Wh; solar wasted with battery full ${n(a.simulation.totalCurtailedWh)} Wh.`,
    );
    lineChart(
      ctx,
      'Battery state of charge (%) — dashed red line: depth-of-discharge limit',
      a.simulation.steps.map((x) => x.socPct),
      100 - design.battery.dodPct,
      (i) => (i % 24 === 0 ? `D${i / 24 + 1}` : null),
    );
  }

  if (opts.assumptions) {
    heading(ctx, 'Assumptions');
    table(
      ctx,
      ['Area', 'Assumption', 'Value', 'Type'],
      a.assumptions.map((x) => [x.module, x.label, x.value, x.provenance]),
    );
  }

  if (opts.sources) {
    heading(ctx, 'Sources');
    para(
      ctx,
      '"verified" = checked against the cited document; "secondary" = reported from the source but not checked against the document — confirm before relying on it.',
      7.5,
    );
    table(
      ctx,
      ['Source', 'Check', 'URL'],
      collectSources(design, a).map((x) => [x.title, x.verification ?? '-', x.url]),
      { fontSize: 7 },
    );
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.ink3);
    doc.text(pdfText(`VanVolt — ${design.name}`), ctx.margin, ctx.pageH - 8);
    doc.text(`Page ${i} of ${pages}`, ctx.pageW - ctx.margin, ctx.pageH - 8, { align: 'right' });
  }
  return doc;
}

export function reportFileName(design: Design): string {
  const slug =
    design.name
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'design';
  return `vanvolt-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
}
