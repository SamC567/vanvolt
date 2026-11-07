import { MONTHS } from '@vanvolt/engine';
import {
  Callout,
  Card,
  KeyValue,
  PageHeader,
  SelectField,
  SliderField,
  Stat,
} from '../components/ui';
import { PowerFlowChart, SocChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';
import { MONTH_NAMES } from '../lib/format';

export function SimulationPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const sim = a.simulation;
  const sset = design.simulation;
  const floor = 100 - design.battery.dodPct;
  const solarTotal = sim.steps.reduce((t, s) => t + s.solarW, 0);
  const altTotal = sim.steps.reduce((t, s) => t + s.alternatorW, 0);
  const shoreTotal = sim.steps.reduce((t, s) => t + s.shoreW, 0);

  return (
    <>
      <PageHeader
        title="Hour-by-hour simulation"
        subtitle="Battery state of charge across a typical stretch of days, with solar following the sun and loads in their usual time slots."
      />

      <Card className="mb-4" title="Scenario">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <SelectField
            label="Month"
            value={sset.month}
            options={MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }))}
            onChange={(v) => update((d) => void (d.simulation.month = v))}
          />
          <SliderField
            label="Days to simulate"
            unit="days"
            min={1}
            max={14}
            value={sset.days}
            onChange={(v) => update((d) => void (d.simulation.days = v))}
            hint="Driving and shore days repeat weekly from day 1"
          />
          <SliderField
            label="Starting state of charge"
            unit="%"
            min={floor}
            max={100}
            value={Math.max(floor, sset.startSocPct)}
            onChange={(v) => update((d) => void (d.simulation.startSocPct = v))}
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Minimum SoC"
          value={fmt(sim.minSocPct)}
          unit="%"
          tone={sim.minSocPct <= floor + 0.5 ? 'crit' : undefined}
          sub={`DoD floor ${fmt(floor)}%`}
        />
        <Stat
          label="End SoC"
          value={fmt(sim.endSocPct)}
          unit="%"
          sub={`Started at ${fmt(Math.max(floor, sset.startSocPct))}%`}
        />
        <Stat
          label="Unsupplied energy"
          value={fmt(sim.totalUnmetWh)}
          unit="Wh"
          tone={sim.totalUnmetWh > 1 ? 'crit' : undefined}
          sub={
            sim.firstEmptyHour !== null
              ? `Battery empty from day ${Math.floor(sim.firstEmptyHour / 24) + 1}, ${String(sim.firstEmptyHour % 24).padStart(2, '0')}:00`
              : 'All loads supplied'
          }
        />
        <Stat
          label="Solar wasted (battery full)"
          value={fmt(sim.totalCurtailedWh)}
          unit="Wh"
          sub={`${fmt(solarTotal > 0 ? (sim.totalCurtailedWh / solarTotal) * 100 : 0)}% of solar`}
        />
      </div>

      <Card
        className="mt-4"
        title={`State of charge — ${MONTHS[sset.month - 1]}`}
        subtitle="Red dashed line: depth-of-discharge limit"
      >
        <SocChart steps={sim.steps} floorPct={floor} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Power flows"
          subtitle="Charging sources (stacked) and load at the battery"
        >
          <PowerFlowChart steps={sim.steps} />
        </Card>
        <Card title="Energy totals">
          <KeyValue
            items={[
              { label: 'Loads', value: `${fmt(sim.totalLoadWh)} Wh` },
              { label: 'Solar', value: `${fmt(solarTotal)} Wh` },
              { label: 'Alternator', value: `${fmt(altTotal)} Wh` },
              { label: 'Shore', value: `${fmt(shoreTotal)} Wh` },
              { label: 'Into battery', value: `${fmt(sim.totalChargeWh)} Wh` },
              { label: 'Hours with shortfall', value: sim.hoursWithShortfall },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Callout>
          The simulation uses average days for the month. Real weather varies, and several dull days
          in a row will drain the battery faster than shown. Treat the result as a typical case, not
          a worst case.
        </Callout>
      </div>
    </>
  );
}
