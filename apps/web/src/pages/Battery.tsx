import { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  BATTERY_MODULES,
  CHEMISTRIES,
  compareSystemVoltages,
  deepClone,
  peukertCurve,
  type BatteryModule,
  type Chemistry,
  type SystemVoltage,
} from '@vanvolt/engine';
import {
  Callout,
  Card,
  KeyValue,
  Meter,
  NumberField,
  PageHeader,
  ProvenanceBadge,
  Segmented,
  SelectField,
  SliderField,
  SourceLink,
  Stat,
} from '../components/ui';
import { PeukertChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';

const CHEM_LABEL: Record<Chemistry, string> = {
  lifepo4: 'LiFePO4',
  agm: 'AGM',
  gel: 'GEL',
  flooded: 'Flooded lead-acid',
};

const CUSTOM = '__custom__';

/** Modules in series to reach a system voltage class (LiFePO4 blocks are 12.8 V per 12 V class). */
function seriesFor(systemVoltage: number, m: BatteryModule): number {
  const perClass = m.chemistry === 'lifepo4' ? (m.nominalVoltage / 12.8) * 12 : m.nominalVoltage;
  return Math.max(1, Math.round(systemVoltage / perClass));
}

export function BatteryPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const b = a.battery;
  const mod = design.battery.module;
  const chem = CHEMISTRIES[mod.chemistry];
  const voltageOptions = useMemo(() => compareSystemVoltages(design, a), [design, a]);
  const libMatch = BATTERY_MODULES.find((m) => m.id === mod.id);
  const isCustom = !libMatch || mod.provenance === 'user';

  const setModule = (id: string) =>
    update((d) => {
      if (id === CUSTOM) {
        d.battery.module = {
          ...d.battery.module,
          id: `custom-${Date.now()}`,
          manufacturer: 'Custom',
          model: 'Custom battery',
          provenance: 'user',
        };
        return;
      }
      const m = BATTERY_MODULES.find((x) => x.id === id);
      if (!m) return;
      const chemChanged = m.chemistry !== d.battery.module.chemistry;
      d.battery.module = deepClone(m);
      if (chemChanged) d.battery.dodPct = CHEMISTRIES[m.chemistry].defaultDodPct;
      d.battery.series = seriesFor(d.systemVoltage, m);
    });
  const setModField = <K extends keyof BatteryModule>(k: K, v: BatteryModule[K]) =>
    update((d) => {
      d.battery.module[k] = v;
      d.battery.module.provenance = 'user';
    });
  const setSystemVoltage = (v: SystemVoltage) =>
    update((d) => {
      d.systemVoltage = v;
      d.battery.series = seriesFor(v, d.battery.module);
    });

  const options = [
    ...BATTERY_MODULES.map((m) => ({
      value: m.id,
      label: `${m.manufacturer} ${m.model}`,
      group: CHEM_LABEL[m.chemistry],
    })),
    { value: CUSTOM, label: 'Custom battery…', group: 'Custom' },
  ];

  return (
    <>
      <PageHeader
        title="Battery bank"
        subtitle="Choose the system voltage, chemistry and bank configuration. Usable capacity accounts for depth of discharge and, for lead-acid, the Peukert effect."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Bank"
          value={`${fmt(b.bank.nominalVoltage, 1)} V`}
          sub={`${fmt(b.bank.capacityAh)} Ah · ${fmt(b.bank.nominalWh)} Wh nominal`}
        />
        <Stat
          label="Usable energy"
          value={fmt(b.usableWh)}
          unit="Wh"
          sub={`${fmt(b.usableAh)} Ah at ${b.dodPct}% DoD`}
        />
        <Stat
          label="Autonomy"
          value={Number.isFinite(b.autonomyDays) ? fmt(b.autonomyDays, 1) : '∞'}
          unit="days"
          tone={b.autonomyDays < design.battery.autonomyTargetDays ? 'crit' : undefined}
          sub={`Target ${design.battery.autonomyTargetDays} days`}
        />
        <Stat
          label="Estimated life"
          value={b.estimatedLifeYears !== null ? fmt(Math.min(b.estimatedLifeYears, 99), 1) : '—'}
          unit="years"
          sub={
            b.cycleLife !== null
              ? `${fmt(b.cycleLife)} cycles at ${b.dodPct}% DoD (calendar ageing ignored)`
              : 'No cycle-life data'
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Configuration">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink2">System voltage</span>
            <Segmented
              ariaLabel="System voltage"
              value={design.systemVoltage}
              options={[12, 24, 48].map((v) => ({ value: v as SystemVoltage, label: `${v} V` }))}
              onChange={setSystemVoltage}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="Battery module"
              value={isCustom ? CUSTOM : mod.id}
              options={options}
              onChange={setModule}
              badge={<ProvenanceBadge provenance={mod.provenance} source={mod.source} />}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="In series"
                min={1}
                max={16}
                value={design.battery.series}
                onChange={(v) => update((d) => void (d.battery.series = Math.round(v)))}
                hint="Raises voltage"
              />
              <NumberField
                label="In parallel"
                min={1}
                max={16}
                value={design.battery.parallel}
                onChange={(v) => update((d) => void (d.battery.parallel = Math.round(v)))}
                hint="Raises capacity"
              />
            </div>
          </div>

          {isCustom && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line p-3 md:grid-cols-4">
              <SelectField
                label="Chemistry"
                value={mod.chemistry}
                options={(Object.keys(CHEM_LABEL) as Chemistry[]).map((c) => ({
                  value: c,
                  label: CHEM_LABEL[c],
                }))}
                onChange={(v) => setModField('chemistry', v)}
              />
              <NumberField
                label="Nominal voltage"
                unit="V"
                min={2}
                step={0.1}
                value={mod.nominalVoltage}
                onChange={(v) => setModField('nominalVoltage', v)}
              />
              <NumberField
                label="Capacity"
                unit="Ah"
                min={1}
                value={mod.capacityAh}
                onChange={(v) => setModField('capacityAh', v)}
              />
              <NumberField
                label="Weight"
                unit="kg"
                min={0}
                step={0.1}
                value={mod.weightKg ?? 0}
                onChange={(v) => setModField('weightKg', v)}
              />
              <NumberField
                label="Max continuous discharge"
                unit="A"
                min={0}
                value={mod.maxContinuousDischargeA ?? 0}
                onChange={(v) => setModField('maxContinuousDischargeA', v)}
              />
              <NumberField
                label="Max continuous charge"
                unit="A"
                min={0}
                value={mod.maxContinuousChargeA ?? 0}
                onChange={(v) => setModField('maxContinuousChargeA', v)}
              />
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            <SliderField
              label="Usable depth of discharge"
              unit="%"
              min={10}
              max={100}
              value={design.battery.dodPct}
              onChange={(v) => update((d) => void (d.battery.dodPct = v))}
              marker={{ value: chem.defaultDodPct, label: `${chem.defaultDodPct}% typical` }}
              hint={`${chem.label}: deeper discharge gives more usable energy but fewer cycles.`}
            />
            <SliderField
              label="Autonomy target (no charging)"
              unit="days"
              min={0.5}
              max={7}
              step={0.5}
              value={design.battery.autonomyTargetDays}
              onChange={(v) => update((d) => void (d.battery.autonomyTargetDays = v))}
            />
          </div>

          <details className="mt-5 rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced: efficiency and Peukert
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <NumberField
                label="Round-trip efficiency"
                unit="%"
                min={50}
                max={100}
                value={b.chargeEfficiencyPct}
                onChange={(v) => update((d) => void (d.battery.chargeEfficiencyPct = v))}
                badge={
                  <ProvenanceBadge
                    provenance={
                      design.battery.chargeEfficiencyPct !== undefined ? 'user' : 'manufacturer'
                    }
                    source={chem.sources[0]}
                  />
                }
              />
              <NumberField
                label="Peukert exponent"
                min={1}
                max={1.6}
                step={0.01}
                value={b.peukertExponent}
                onChange={(v) => update((d) => void (d.battery.peukertExponent = v))}
                badge={
                  <ProvenanceBadge
                    provenance={
                      design.battery.peukertExponent !== undefined
                        ? 'user'
                        : mod.chemistry === 'lifepo4'
                          ? 'assumption'
                          : 'manufacturer'
                    }
                  />
                }
              />
            </div>
            <button
              className="btn mt-3 text-xs"
              onClick={() =>
                update((d) => {
                  delete d.battery.chargeEfficiencyPct;
                  delete d.battery.peukertExponent;
                })
              }
            >
              Reset to chemistry defaults
            </button>
          </details>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Sizing for your target">
            <KeyValue
              items={[
                {
                  label: 'Daily energy from battery',
                  value: `${fmt(a.consumption.batteryWhPerDay)} Wh`,
                },
                {
                  label: `Capacity for ${design.battery.autonomyTargetDays} days`,
                  value: `${fmt(b.requiredAhForTarget)} Ah`,
                },
                { label: 'Modules in parallel needed', value: b.recommendedParallel },
                { label: 'Peukert factor', value: `${fmt(b.peukertFactor * 100, 1)}%` },
                { label: 'Design minimum voltage', value: `${fmt(b.minimumVoltage, 1)} V` },
                {
                  label: 'Total weight',
                  value: b.bank.weightKg !== null ? `${fmt(b.bank.weightKg, 1)} kg` : '—',
                },
              ]}
            />
            {b.recommendedParallel !== design.battery.parallel && (
              <button
                className="btn mt-3 w-full"
                onClick={() => update((d) => void (d.battery.parallel = b.recommendedParallel))}
              >
                <Check size={14} /> Use {b.recommendedParallel} in parallel
              </button>
            )}
          </Card>
          <Card
            title="Current limits"
            subtitle={
              b.bank.limitsFromDatasheet
                ? 'From the module datasheet'
                : 'Some limits use chemistry assumptions'
            }
          >
            <div className="space-y-4">
              <Meter
                label="Continuous discharge"
                value={b.continuousDischargeA}
                limit={b.bank.maxContinuousDischargeA}
                unit="A"
              />
              <Meter
                label="Peak discharge"
                value={b.peakDischargeA}
                limit={b.bank.peakDischargeA ?? b.bank.maxContinuousDischargeA}
                unit="A"
              />
              <Meter
                label="All chargers together"
                value={a.charging.simultaneousCurrentA}
                limit={b.bank.maxContinuousChargeA}
                unit="A"
              />
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="12 V vs 24 V vs 48 V"
          subtitle="Same stored energy and loads at each system voltage"
        >
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>System</th>
                  <th className="text-right">Bank Ah</th>
                  <th className="text-right">Inverter DC current</th>
                  <th className="text-right">Peak DC current</th>
                  <th className="text-right">Inverter cable</th>
                  <th className="text-right">Cable loss</th>
                  <th className="text-right">Solar current</th>
                </tr>
              </thead>
              <tbody>
                {voltageOptions.map((o) => (
                  <tr
                    key={o.voltage}
                    className={o.voltage === design.systemVoltage ? 'bg-accent-soft/50' : ''}
                  >
                    <td className="font-medium">
                      {o.voltage} V{' '}
                      {o.voltage === design.systemVoltage && (
                        <span className="text-xs text-accent">(current)</span>
                      )}
                    </td>
                    <td className="num text-right">{fmt(o.bankAh)}</td>
                    <td className="num text-right">{fmt(o.inverterContinuousA)} A</td>
                    <td className="num text-right">{fmt(o.inverterPeakA)} A</td>
                    <td className="num text-right">
                      {o.inverterCableMm2 !== null ? `${o.inverterCableMm2} mm²` : '—'}
                    </td>
                    <td className="num text-right">{fmt(o.inverterCableLossW, 1)} W</td>
                    <td className="num text-right">{fmt(o.solarCurrentA, 1)} A</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-ink2">
            {voltageOptions.map((o) => (
              <li key={o.voltage}>
                <b className="text-ink">{o.voltage} V:</b> {o.notes.join(' ')}
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title={mod.chemistry === 'lifepo4' ? 'Rate capacity' : 'Peukert effect'}
          subtitle="Capacity available versus discharge time"
        >
          {mod.chemistry === 'lifepo4' ? (
            <p className="text-sm text-ink2">
              LiFePO4 capacity depends very little on discharge rate, so VanVolt applies no Peukert
              reduction below 1C.
            </p>
          ) : (
            <PeukertChart
              curve={peukertCurve(b.bank.capacityAh, b.peukertExponent, chem.ratedHours)}
            />
          )}
          <div className="mt-3 border-t border-line pt-3 text-xs">
            <p className="mb-1 font-medium text-ink">
              {mod.manufacturer} {mod.model}
            </p>
            {mod.notes && <p className="mb-1 text-ink2">{mod.notes}</p>}
            <SourceLink source={mod.source} />
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Callout>{chem.notes}</Callout>
      </div>
    </>
  );
}
