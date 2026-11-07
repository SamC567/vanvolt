/**
 * Chart components. Colours come from CSS variables so light/dark themes swap in one
 * place. Series colours follow the entity, never its rank:
 *   alternator = --series-1 (blue), solar = --series-2 (orange), shore = --series-3 (aqua).
 */
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyBalance, MonthlySolar, SimulationStep } from '@vanvolt/engine';
import { MONTHS } from '@vanvolt/engine';
import { fmt } from '../lib/format';

export const SERIES = {
  alternator: 'var(--series-1)',
  solar: 'var(--series-2)',
  shore: 'var(--series-3)',
  primary: 'var(--series-1)',
  load: 'var(--text)',
  soc: 'var(--series-1)',
  violet: 'var(--series-7)',
} as const;

const axisProps = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false,
} as const;

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
}

/** Props Recharts injects into a custom tooltip `content` element. */
interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit: string;
  labelFormatter?: (l: unknown) => ReactNode;
}

function ChartTooltip({ active, payload, label, unit, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(label) : String(label)}</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink2">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="num font-medium text-ink">
              {fmt(Number(p.value), Math.abs(Number(p.value)) < 10 ? 1 : 0)} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const legendProps = {
  iconType: 'square' as const,
  iconSize: 10,
  wrapperStyle: { fontSize: 12, color: 'var(--text-2)', paddingTop: 4 },
};

export function ChartFrame({ height = 260, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly charge energy by source (stored, after battery efficiency) vs consumption. */
export function MonthlyBalanceChart({ monthly, efficiency }: { monthly: MonthlyBalance[]; efficiency: number }) {
  const data = monthly.map((m) => ({
    label: m.label,
    Solar: m.solarWh * efficiency,
    Alternator: m.alternatorWh * efficiency,
    Shore: m.shoreWh * efficiency,
    Consumption: m.consumptionWh,
  }));
  const hasAlt = data.some((d) => d.Alternator > 0);
  const hasShore = data.some((d) => d.Shore > 0);
  return (
    <ChartFrame label="Monthly charging energy by source compared with daily consumption" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => fmt(v)} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip unit="Wh/day" />} />
        <Legend {...legendProps} />
        <Bar dataKey="Solar" stackId="in" fill={SERIES.solar} stroke="var(--surface)" strokeWidth={1} maxBarSize={36} />
        {hasAlt && <Bar dataKey="Alternator" stackId="in" fill={SERIES.alternator} stroke="var(--surface)" strokeWidth={1} maxBarSize={36} />}
        {hasShore && <Bar dataKey="Shore" stackId="in" fill={SERIES.shore} stroke="var(--surface)" strokeWidth={1} maxBarSize={36} />}
        <Line dataKey="Consumption" type="monotone" stroke={SERIES.load} strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Monthly solar yield with the daily consumption as a reference line. */
export function MonthlySolarChart({ monthly, consumptionWh }: { monthly: MonthlySolar[]; consumptionWh: number }) {
  const data = monthly.map((m) => ({ label: MONTHS[m.month - 1], Solar: m.whPerDay, psh: m.psh }));
  return (
    <ChartFrame label="Monthly average daily solar energy" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => fmt(v)} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip unit="Wh/day" />} />
        <Bar dataKey="Solar" name="Solar yield" fill={SERIES.solar} radius={[4, 4, 0, 0]} maxBarSize={36} />
        {consumptionWh > 0 && (
          <ReferenceLine
            y={consumptionWh}
            stroke="var(--text)"
            strokeDasharray="5 4"
            label={{ value: `Daily use ${fmt(consumptionWh)} Wh`, position: 'insideTopRight', fill: 'var(--text-2)', fontSize: 11 }}
          />
        )}
      </BarChart>
    </ChartFrame>
  );
}

/** Horizontal bar of daily battery energy per item. */
export function HorizontalEnergyChart({ items, unit = 'Wh/day' }: { items: { name: string; value: number }[]; unit?: string }) {
  const height = Math.max(120, items.length * 30 + 40);
  return (
    <ChartFrame label="Daily energy by appliance" height={height}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => fmt(v)} />
        <YAxis type="category" dataKey="name" {...axisProps} width={150} tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip unit={unit} />} />
        <Bar dataKey="value" name="Battery energy" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ChartFrame>
  );
}

const hourLabel = (h: unknown) => {
  const n = Number(h);
  return `Day ${Math.floor(n / 24) + 1}, ${String(n % 24).padStart(2, '0')}:00`;
};

export function SocChart({ steps, floorPct }: { steps: SimulationStep[]; floorPct: number }) {
  const data = steps.map((s) => ({ hour: s.hour, SoC: s.socPct }));
  return (
    <ChartFrame label="Battery state of charge over the simulation" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="socFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="hour" {...axisProps} interval={23} tickFormatter={(h) => `D${Math.floor(Number(h) / 24) + 1}`} />
        <YAxis {...axisProps} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<ChartTooltip unit="%" labelFormatter={hourLabel} />} />
        <ReferenceLine
          y={floorPct}
          stroke="var(--crit)"
          strokeDasharray="4 4"
          label={{ value: `DoD limit ${fmt(floorPct)}%`, position: 'insideBottomRight', fill: 'var(--text-2)', fontSize: 11 }}
        />
        <Area dataKey="SoC" name="State of charge" type="monotone" stroke={SERIES.soc} strokeWidth={2} fill="url(#socFill)" dot={false} />
      </AreaChart>
    </ChartFrame>
  );
}

export function PowerFlowChart({ steps }: { steps: SimulationStep[] }) {
  const data = steps.map((s) => ({
    hour: s.hour,
    Solar: s.solarW,
    Alternator: s.alternatorW,
    Shore: s.shoreW,
    Load: s.loadW,
  }));
  const hasAlt = data.some((d) => d.Alternator > 0);
  const hasShore = data.some((d) => d.Shore > 0);
  return (
    <ChartFrame label="Hourly charging power by source and load power" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="hour" {...axisProps} interval={23} tickFormatter={(h) => `D${Math.floor(Number(h) / 24) + 1}`} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => fmt(v)} />
        <Tooltip content={<ChartTooltip unit="W" labelFormatter={hourLabel} />} />
        <Legend {...legendProps} />
        <Area dataKey="Solar" stackId="p" type="monotone" stroke={SERIES.solar} fill={SERIES.solar} fillOpacity={0.35} strokeWidth={1.5} />
        {hasAlt && <Area dataKey="Alternator" stackId="p" type="stepAfter" stroke={SERIES.alternator} fill={SERIES.alternator} fillOpacity={0.35} strokeWidth={1.5} />}
        {hasShore && <Area dataKey="Shore" stackId="p" type="stepAfter" stroke={SERIES.shore} fill={SERIES.shore} fillOpacity={0.35} strokeWidth={1.5} />}
        <Line dataKey="Load" name="Load (at battery)" type="monotone" stroke={SERIES.load} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartFrame>
  );
}

export function PeukertChart({ curve }: { curve: { hours: number; capacityPct: number }[] }) {
  const data = curve.map((c) => ({ label: `${c.hours} h`, Capacity: c.capacityPct }));
  return (
    <ChartFrame label="Available capacity versus discharge time (Peukert)" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<ChartTooltip unit="%" labelFormatter={(l) => `Discharged in ${String(l)}`} />} />
        <Line dataKey="Capacity" name="Available capacity" stroke={SERIES.primary} strokeWidth={2} dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }} />
      </LineChart>
    </ChartFrame>
  );
}

/** Single-metric bar chart across designs (one bar per design, design colour fixed by order). */
export function DesignBars({ title, unit, items }: { title: string; unit: string; items: { name: string; value: number; color: string }[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink2">{title}</p>
      <ChartFrame label={title} height={170}>
        <BarChart data={items} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="name" {...axisProps} tick={false} />
          <YAxis {...axisProps} width={48} tickFormatter={(v) => fmt(v)} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey="value" name={title} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            {items.map((it) => (
              <Cell key={it.name} fill={it.color} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
    </div>
  );
}
