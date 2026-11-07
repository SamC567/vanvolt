import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  CABLE_TABLES,
  uid,
  type CableRunSettings,
  type InsulationRating,
  type Installation,
} from '@vanvolt/engine';
import type { CableRunAnalysis } from '@vanvolt/engine';
import {
  Callout,
  Card,
  NumberField,
  PageHeader,
  ProvenanceBadge,
  SelectField,
  SourceLink,
  StatusIcon,
  TextField,
} from '../components/ui';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';

const LIMITED_BY: Record<CableRunAnalysis['limitedBy'], string> = {
  'voltage-drop': 'Voltage drop',
  ampacity: 'Current capacity',
  override: 'Your choice',
  none: '—',
};

function RunRow({ c }: { c: CableRunAnalysis }) {
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const isCustom = c.role === 'custom';
  const setRun = (patch: Partial<CableRunSettings>) =>
    update((d) => {
      let r = d.cables.runs.find((x) => x.id === c.id) ?? d.cables.runs.find((x) => x.role === c.role && c.role !== 'custom');
      if (!r) {
        r = { id: c.id, role: c.role, name: c.name, lengthM: c.input.lengthM, maxDropPct: c.input.maxDropPct, installation: 'free-air', bundledCount: 1 };
        d.cables.runs.push(r);
      }
      Object.assign(r, patch);
      if (patch.overrideCsaMm2 === undefined && 'overrideCsaMm2' in patch) delete r.overrideCsaMm2;
    });
  const status = c.selectedCsaMm2 === null ? 'critical' : c.ok ? 'ok' : 'warning';
  return (
    <Fragment>
      <tr className="cursor-pointer hover:bg-surface2/50" onClick={() => setOpen(!open)}>
        <td className="w-8">
          <button className="btn btn-ghost px-1" aria-label={`Details for ${c.name}`} aria-expanded={open}>
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </td>
        <td>
          <span className="flex items-center gap-2">
            <StatusIcon status={status} />
            <span className="font-medium">{c.name}</span>
          </span>
        </td>
        <td className="num text-right">{fmt(c.input.currentA, 1)} A</td>
        <td className="num text-right">{fmt(c.input.lengthM, 1)} m</td>
        <td className="num text-right font-semibold">
          {c.selectedCsaMm2 !== null ? `${c.selectedCsaMm2} mm²` : '—'}
          {c.awg && <span className="ml-1 text-xs font-normal text-ink3">≈{c.awg} AWG</span>}
        </td>
        <td className="num text-right">
          {fmt(c.dropPct, 2)}% <span className="text-xs text-ink3">({fmt(c.dropV, 2)} V)</span>
        </td>
        <td className="num text-right">{fmt(c.powerLossW, 1)} W</td>
        <td className="num text-right">
          {c.fuse.ratingA !== null ? `${c.fuse.ratingA} A` : c.role === 'pv-mppt' ? 'PV' : '—'}
          {c.fuse.families.length > 0 && <span className="block text-xs text-ink3">{c.fuse.families.map((f) => f.name.replace(' fuse', '')).join(', ')}</span>}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-surface2/40">
            <div className="grid grid-cols-2 gap-3 py-2 md:grid-cols-4 xl:grid-cols-6">
              {isCustom && (
                <>
                  <div className="col-span-2">
                    <TextField label="Name" value={c.name} onChange={(v) => setRun({ name: v })} />
                  </div>
                  <NumberField label="Design current" unit="A" min={0} step={0.5} value={c.input.currentA} onChange={(v) => setRun({ currentA: v })} />
                  <NumberField label="Circuit voltage" unit="V" min={1} step={0.1} value={c.input.voltageV} onChange={(v) => setRun({ voltageV: v })} />
                </>
              )}
              <NumberField label="One-way length" unit="m" min={0.1} max={50} step={0.1} value={c.input.lengthM} onChange={(v) => setRun({ lengthM: v })} />
              <NumberField label="Max voltage drop" unit="%" min={0.5} max={15} step={0.5} value={c.input.maxDropPct} onChange={(v) => setRun({ maxDropPct: v })} />
              <SelectField
                label="Installation"
                value={c.input.installation}
                options={[
                  { value: 'free-air' as Installation, label: 'Free air / separate' },
                  { value: 'bundled' as Installation, label: 'Bundled' },
                  { value: 'conduit' as Installation, label: 'In conduit / trunking' },
                ]}
                onChange={(v) => setRun({ installation: v })}
              />
              {c.input.installation !== 'free-air' && (
                <NumberField label="Loaded cables together" min={1} max={40} value={c.input.bundledCount} onChange={(v) => setRun({ bundledCount: Math.round(v) })} />
              )}
              <SelectField
                label="Conductor size"
                value={c.input.overrideCsaMm2 ?? 0}
                options={[{ value: 0, label: 'Automatic' }, ...CABLE_TABLES.conductors.map((x) => ({ value: x.csaMm2, label: `${x.csaMm2} mm²` }))]}
                onChange={(v) => setRun({ overrideCsaMm2: v === 0 ? undefined : v })}
              />
              {isCustom && (
                <div className="flex items-end">
                  <button
                    className="btn text-crit"
                    onClick={(e) => {
                      e.stopPropagation();
                      update((d) => void (d.cables.runs = d.cables.runs.filter((r) => r.id !== c.id)));
                    }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 pb-2 text-xs text-ink2 md:grid-cols-2">
              <div>
                <p>
                  Sized by: <b className="text-ink">{LIMITED_BY[c.limitedBy]}</b>. Minimum theoretical size for the drop:{' '}
                  <span className="num">{fmt(c.minimumCsaForDropMm2, 1)} mm²</span>.
                </p>
                <p>
                  Derated current capacity: <span className="num">{c.ampacityA !== null ? `${fmt(c.ampacityA)} A` : '—'}</span>. Fuse
                  window: <span className="num">{fmt(c.fuse.minRatingA)}–{fmt(c.fuse.maxRatingA)} A</span>.
                </p>
              </div>
              <ul className="list-disc space-y-0.5 pl-4">
                {[...c.messages, ...c.fuse.notes].map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
                {c.fuse.families.map((f) => (
                  <li key={f.id}>
                    {f.name}: {f.minA}–{f.maxA} A, {f.maxVoltageDc} V DC
                    {f.interruptRatingA ? `, interrupt ${fmt(f.interruptRatingA)} A ${f.interruptNote ?? ''}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function CablesPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const cfg = design.cables;
  const addCustom = () =>
    update((d) =>
      void d.cables.runs.push({
        id: uid('run'),
        role: 'custom',
        name: 'Custom circuit',
        lengthM: 3,
        maxDropPct: 3,
        installation: 'free-air',
        bundledCount: 1,
        currentA: 10,
        voltageV: a.bankVoltage,
      }),
    );
  const assumptions = a.assumptions.filter((x) => x.module === 'cables');

  return (
    <>
      <PageHeader
        title="Cables and protection"
        subtitle="Conductor size, voltage drop, losses and fuse guidance for each run. Runs are generated from your design; click a row to change its length or installation."
        actions={
          <button className="btn" onClick={addCustom}>
            <Plus size={15} /> Add circuit
          </button>
        }
      />

      <Card title="Installation conditions" className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField label="Ambient temperature" unit="°C" min={-20} max={80} value={cfg.ambientC} onChange={(v) => update((d) => void (d.cables.ambientC = v))} hint="Above 30 °C reduces current capacity" />
          <NumberField label="Conductor temperature for resistance" unit="°C" min={20} max={105} value={cfg.conductorTempC} onChange={(v) => update((d) => void (d.cables.conductorTempC = v))} hint="Warmer copper has higher resistance" badge={<ProvenanceBadge provenance="assumption" />} />
          <SelectField
            label="Cable insulation rating"
            value={cfg.insulationRatingC}
            options={[
              { value: 70 as InsulationRating, label: '70 °C (PVC)' },
              { value: 90 as InsulationRating, label: '85–90 °C (e.g. tri-rated, rubber)' },
              { value: 105 as InsulationRating, label: '105 °C' },
              { value: 125 as InsulationRating, label: '125 °C' },
            ]}
            onChange={(v) => update((d) => void (d.cables.insulationRatingC = v))}
            hint="Check the rating printed on your cable"
          />
        </div>
      </Card>

      <Card title="Cable runs" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th />
                <th>Circuit</th>
                <th className="text-right">Current</th>
                <th className="text-right">Length</th>
                <th className="text-right">Size</th>
                <th className="text-right">Drop</th>
                <th className="text-right">Loss</th>
                <th className="text-right">Fuse</th>
              </tr>
            </thead>
            <tbody>
              {a.cables.map((c) => (
                <RunRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Assumptions used">
          <ul className="space-y-2 text-sm">
            {assumptions.map((x) => (
              <li key={x.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{x.label}</span>
                  <ProvenanceBadge provenance={x.provenance} source={x.source} />
                </div>
                <p className="text-ink2">{x.value}</p>
                {x.source && <SourceLink source={x.source} compact />}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink2">
            <li>Copper, flexible (Class 5) conductors only. Aluminium and solid conductors are not modelled.</li>
            <li>
              Current capacities come from ISO 10133 (small-craft DC installations) for single conductors at 30 °C.
              Vehicle standards and your cable manufacturer's data may differ — the most restrictive figure applies.
            </li>
            <li>Terminal, fuse-holder, switch and shunt resistances are not included; real voltage drop will be higher.</li>
            <li>Inverter cables are sized for the inverter's full rated output, as manufacturers recommend.</li>
            <li>
              Short-circuit current, fuse time–current coordination and breaking capacity must be checked against the
              battery and fuse datasheets. Fuse data marked "secondary" could not be verified against the manufacturer's document.
            </li>
            <li>230 V AC wiring, RCDs and earthing are outside the scope of this calculator.</li>
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Callout tone="warn">
          This is design guidance, not a substitute for an installation designed and inspected by a competent person to
          the applicable standards (for example BS 7671 Section 721 and BS EN 1648-2 in the UK).
        </Callout>
      </div>
    </>
  );
}
