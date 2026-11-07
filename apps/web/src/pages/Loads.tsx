import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Copy, Plus, Search, Trash2 } from 'lucide-react';
import {
  APPLIANCE_PRESETS,
  applianceFrom,
  uid,
  type Appliance,
  type ApplianceCategory,
  type AppliancePreset,
  type LoadKind,
  type UsageProfile,
} from '@vanvolt/engine';
import {
  Callout,
  Card,
  EmptyState,
  KeyValue,
  Modal,
  NumberField,
  PageHeader,
  ProvenanceBadge,
  SelectField,
  SourceLink,
  Stat,
  TextField,
  Toggle,
} from '../components/ui';
import { HorizontalEnergyChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt, fmtWh } from '../lib/format';

const CATEGORY_LABEL: Record<ApplianceCategory, string> = {
  refrigeration: 'Refrigeration',
  heating: 'Heating',
  cooking: 'Cooking',
  lighting: 'Lighting',
  water: 'Water',
  ventilation: 'Ventilation',
  electronics: 'Electronics',
  communications: 'Communications',
  'personal-care': 'Personal care',
  tools: 'Tools',
  other: 'Other',
};

const KIND_LABEL: Record<LoadKind, string> = {
  resistive: 'Resistive (heater, kettle)',
  motor: 'Motor (fan, pump, blender)',
  compressor: 'Compressor (fridge, A/C)',
  electronic: 'Electronic (chargers, IT)',
  lighting: 'Lighting',
  induction: 'Induction hob',
  microwave: 'Microwave',
};

const PROFILE_LABEL: Record<UsageProfile, string> = {
  allday: 'All day',
  morning: 'Morning (06–10)',
  daytime: 'Daytime (10–17)',
  evening: 'Evening (17–23)',
  night: 'Night (22–06)',
};

/** Fields that describe the appliance's electrical rating (editing them makes it user data). */
const RATING_FIELDS: (keyof Appliance)[] = ['powerW', 'surgeW', 'standbyW', 'supply', 'kind'];

function LibraryPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ApplianceCategory | 'all'>('all');
  const list = APPLIANCE_PRESETS.filter(
    (p) =>
      (cat === 'all' || p.category === cat) &&
      (q.trim() === '' || p.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const add = (p: AppliancePreset) => {
    update((d) => void d.appliances.push(applianceFrom(p)));
    onClose();
  };
  const cats = [...new Set(APPLIANCE_PRESETS.map((p) => p.category))];
  return (
    <Modal open={open} onClose={onClose} title="Add appliance" wide>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-2.5 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search appliances…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search appliances"
            autoFocus
          />
        </div>
        <select
          className="input sm:w-48"
          value={cat}
          onChange={(e) => setCat(e.target.value as ApplianceCategory | 'all')}
          aria-label="Category"
        >
          <option value="all">All categories</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.map((p) => (
          <li key={p.presetId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <ProvenanceBadge provenance={p.provenance} source={p.source} />
              </div>
              <p className="num mt-0.5 text-xs text-ink2">
                {p.supply === 'ac' ? '230 V AC' : 'DC'} · {fmt(p.powerW, p.powerW < 100 ? 1 : 0)} W
                {p.surgeW > p.powerW ? ` · surge ${fmt(p.surgeW)} W` : ''} ·{' '}
                {CATEGORY_LABEL[p.category]}
              </p>
              {p.source && (
                <div className="mt-1">
                  <SourceLink source={p.source} compact />
                </div>
              )}
              {p.notes && <p className="mt-1 text-xs text-ink3">{p.notes}</p>}
            </div>
            <button className="btn btn-primary shrink-0" onClick={() => add(p)}>
              <Plus size={15} /> Add
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="p-4 text-sm text-ink3">No matching appliances.</li>}
      </ul>
    </Modal>
  );
}

function ApplianceRow({
  a,
  whPerDay,
  sharePct,
}: {
  a: Appliance;
  whPerDay: number;
  sharePct: number;
}) {
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Appliance>(key: K, value: Appliance[K]) =>
    update((d) => {
      const x = d.appliances.find((y) => y.id === a.id);
      if (!x) return;
      x[key] = value;
      if (key === 'powerW' && x.surgeW < (value as number)) x.surgeW = value as number;
      if (RATING_FIELDS.includes(key) && x.provenance !== 'user') x.provenance = 'user';
    });
  const remove = () =>
    update((d) => void (d.appliances = d.appliances.filter((y) => y.id !== a.id)));
  const dup = () =>
    update((d) => {
      const i = d.appliances.findIndex((y) => y.id === a.id);
      d.appliances.splice(i + 1, 0, {
        ...structuredClone(a),
        id: uid('app'),
        name: `${a.name} (copy)`,
      });
    });

  return (
    <li className={clsx('border-b border-line last:border-b-0', !a.enabled && 'opacity-60')}>
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3">
        <button
          className="btn btn-ghost px-1"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`Edit ${a.name}`}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <button
            className="block w-full truncate text-left text-sm font-medium"
            onClick={() => setOpen(!open)}
          >
            {a.name}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink2">
            <span
              className={clsx(
                'rounded px-1.5 py-px font-medium',
                a.supply === 'ac' ? 'bg-surface2 text-[var(--series-7)]' : 'bg-surface2 text-ink2',
              )}
            >
              {a.supply === 'ac' ? 'AC' : 'DC'}
            </span>
            <span className="num">
              {a.quantity > 1 ? `${a.quantity} × ` : ''}
              {fmt(a.powerW, a.powerW < 100 ? 1 : 0)} W ·{' '}
              {fmt(a.hoursPerDay, a.hoursPerDay < 1 ? 2 : 1)} h/day
              {a.dutyCyclePct < 100 ? ` · ${a.dutyCyclePct}% duty` : ''}
              {a.daysPerWeek < 7 ? ` · ${a.daysPerWeek} d/wk` : ''}
            </span>
            {!a.concurrent && <span className="rounded bg-surface2 px-1.5 py-px">exclusive</span>}
            <ProvenanceBadge provenance={a.provenance} source={a.source} />
          </div>
        </div>
        <div className="hidden w-28 text-right sm:block">
          <div className="num text-sm font-semibold">{fmt(whPerDay)} Wh</div>
          <div className="h-1 overflow-hidden rounded-full bg-surface3">
            <div
              className="h-full bg-[var(--series-1)]"
              style={{ width: `${Math.min(100, sharePct)}%` }}
            />
          </div>
        </div>
        <Toggle checked={a.enabled} onChange={(v) => set('enabled', v)} />
      </div>
      {open && (
        <div className="border-t border-line bg-surface2/40 px-3 py-3 sm:px-12">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2">
              <TextField label="Name" value={a.name} onChange={(v) => set('name', v)} />
            </div>
            <SelectField
              label="Supply"
              value={a.supply}
              options={[
                { value: 'dc', label: 'DC (12/24/48 V)' },
                { value: 'ac', label: '230 V AC via inverter' },
              ]}
              onChange={(v) => set('supply', v)}
            />
            <SelectField
              label="Category"
              value={a.category}
              options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
                value: value as ApplianceCategory,
                label,
              }))}
              onChange={(v) => set('category', v)}
            />
            <NumberField
              label="Running power"
              unit="W"
              min={0}
              step={0.1}
              value={a.powerW}
              onChange={(v) => set('powerW', v)}
            />
            <NumberField
              label="Start-up surge"
              unit="W"
              min={0}
              step={1}
              value={a.surgeW}
              onChange={(v) => set('surgeW', Math.max(v, a.powerW))}
              hint="Peak power while starting"
            />
            <NumberField
              label="Quantity"
              min={0}
              step={1}
              value={a.quantity}
              onChange={(v) => set('quantity', Math.round(v))}
            />
            <NumberField
              label="Standby power"
              unit="W"
              min={0}
              step={0.1}
              value={a.standbyW}
              onChange={(v) => set('standbyW', v)}
            />
            <NumberField
              label="Hours on per day"
              unit="h"
              min={0}
              max={24}
              step={0.05}
              value={a.hoursPerDay}
              onChange={(v) => set('hoursPerDay', v)}
            />
            <NumberField
              label="Duty cycle"
              unit="%"
              min={0}
              max={100}
              step={1}
              value={a.dutyCyclePct}
              onChange={(v) => set('dutyCyclePct', v)}
              hint="Share of on-time at full power"
            />
            <NumberField
              label="Days used per week"
              min={0}
              max={7}
              step={1}
              value={a.daysPerWeek}
              onChange={(v) => set('daysPerWeek', Math.round(v))}
            />
            <SelectField
              label="Time of use"
              value={a.profile}
              options={Object.entries(PROFILE_LABEL).map(([value, label]) => ({
                value: value as UsageProfile,
                label,
              }))}
              onChange={(v) => set('profile', v)}
            />
            <div className="col-span-2">
              <SelectField
                label="Load type (for inverter checks)"
                value={a.kind}
                options={Object.entries(KIND_LABEL).map(([value, label]) => ({
                  value: value as LoadKind,
                  label,
                }))}
                onChange={(v) => set('kind', v)}
              />
            </div>
            <div className="col-span-2 flex items-end">
              <Toggle
                checked={!a.concurrent}
                onChange={(v) => set('concurrent', !v)}
                label="Exclusive high-power load"
                description="Never used at the same time as other exclusive loads (e.g. kettle and hair dryer)"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-ink2">
              {a.source && (
                <span className="flex flex-wrap items-center gap-2">
                  {a.provenance === 'user' ? 'Based on:' : 'Source:'}{' '}
                  <SourceLink source={a.source} />
                </span>
              )}
              {a.notes && <p className="mt-1 text-ink3">{a.notes}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={dup}>
                <Copy size={14} /> Duplicate
              </button>
              <button className="btn text-crit" onClick={remove}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function LoadsPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const [picker, setPicker] = useState(false);
  const c = a.consumption;
  const rows = useMemo(() => new Map(c.appliances.map((r) => [r.id, r])), [c]);
  const chartItems = [...c.appliances]
    .sort((x, y) => y.batteryWhPerDayAvg - x.batteryWhPerDayAvg)
    .map((r) => ({
      name: r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name,
      value: r.batteryWhPerDayAvg,
    }));
  if (c.inverterIdleWhPerDay > 0)
    chartItems.push({ name: 'Inverter idle', value: c.inverterIdleWhPerDay });

  return (
    <>
      <PageHeader
        title="Electrical consumption"
        subtitle="List every appliance. Energy is shown as drawn from the battery, including inverter losses for 230 V loads."
        actions={
          <button className="btn btn-primary" onClick={() => setPicker(true)}>
            <Plus size={15} /> Add appliance
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Average day"
          value={fmt(c.batteryWhPerDay)}
          unit="Wh"
          sub={`${fmt(c.batteryAhPerDay, 1)} Ah at ${fmt(c.voltage, 1)} V`}
        />
        <Stat
          label="Day using everything"
          value={fmt(c.batteryWhPerFullUseDay)}
          unit="Wh"
          sub={`${fmt(c.batteryAhPerFullUseDay, 1)} Ah`}
        />
        <Stat
          label="Weekly"
          value={fmtWh(c.batteryWhPerWeek)}
          sub={`${fmt(c.batteryAhPerWeek)} Ah per week`}
        />
        <Stat
          label="Peak at battery"
          value={fmt(c.battery.peakW)}
          unit="W"
          sub={`${fmt(c.battery.continuousW)} W continuous`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={`Appliances (${design.appliances.length})`}
          subtitle="Click a row to edit. Editing a rating turns manufacturer data into your own input."
          bodyClassName="p-0"
        >
          {design.appliances.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No appliances yet"
                action={
                  <button className="btn btn-primary" onClick={() => setPicker(true)}>
                    <Plus size={15} /> Add appliance
                  </button>
                }
              >
                Start with the fridge, lights, water pump and heater — then add 230 V loads.
              </EmptyState>
            </div>
          ) : (
            <ul>
              {design.appliances.map((ap) => (
                <ApplianceRow
                  key={ap.id}
                  a={ap}
                  whPerDay={rows.get(ap.id)?.batteryWhPerDayAvg ?? 0}
                  sharePct={rows.get(ap.id)?.sharePct ?? 0}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title="Continuous and peak demand"
            subtitle="Concurrent loads together + largest start-up surge"
          >
            <KeyValue
              items={[
                { label: 'DC loads — continuous', value: `${fmt(c.dc.continuousW)} W` },
                { label: 'DC loads — peak', value: `${fmt(c.dc.peakW)} W` },
                { label: 'AC loads — continuous', value: `${fmt(c.ac.continuousW)} W` },
                { label: 'AC loads — peak', value: `${fmt(c.ac.peakW)} W` },
                { label: 'At battery — continuous', value: `${fmt(c.battery.continuousW)} W` },
                { label: 'At battery — peak', value: `${fmt(c.battery.peakW)} W` },
              ]}
            />
          </Card>
          <Card title="Energy split">
            <KeyValue
              items={[
                { label: 'DC loads', value: `${fmt(c.dcLoadWhPerDay)} Wh/day` },
                { label: 'AC loads (at outlet)', value: `${fmt(c.acLoadWhPerDay)} Wh/day` },
                {
                  label: 'Inverter conversion loss',
                  value: `${fmt(c.inverterLossWhPerDay)} Wh/day`,
                },
                { label: 'Inverter idle', value: `${fmt(c.inverterIdleWhPerDay)} Wh/day` },
                { label: <b>Total from battery</b>, value: <b>{fmt(c.batteryWhPerDay)} Wh/day</b> },
              ]}
            />
          </Card>
        </div>
      </div>

      {chartItems.length > 0 && (
        <Card
          className="mt-4"
          title="Where the energy goes"
          subtitle="Average daily energy drawn from the battery"
        >
          <HorizontalEnergyChart items={chartItems} />
        </Card>
      )}

      <div className="mt-4">
        <Callout>
          Library wattages come from manufacturer documents, linked on each item. Real consumption
          depends on how you use each appliance, so check hours and duty cycles against your own
          habits. Items marked <i>Estimate</i> are generic placeholders: replace them with the
          rating on your appliance.
        </Callout>
      </div>

      <LibraryPicker open={picker} onClose={() => setPicker(false)} />
    </>
  );
}
