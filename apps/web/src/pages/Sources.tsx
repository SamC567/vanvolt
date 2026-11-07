import { useState, type ReactNode } from 'react';
import {
  AC_CHARGERS,
  APPLIANCE_PRESETS,
  BATTERY_MODULES,
  CABLE_TABLES,
  CHEMISTRIES,
  DCDC_CHARGERS,
  IEC60228_SOURCE,
  INVERTER_MODELS,
  IRRADIANCE_LOCATIONS,
  ISO10133_SOURCE,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
  VICTRON_CABLE_SOURCE,
  GROUPING_SOURCE,
  type Provenance,
} from '@vanvolt/engine';
import { Callout, Card, PageHeader, PROVENANCE_META, ProvenanceBadge, SourceLink } from '../components/ui';
import { useAnalysis } from '../lib/useAnalysis';
import { fmt } from '../lib/format';

type Tab = 'assumptions' | 'batteries' | 'inverters' | 'solar' | 'chargers' | 'appliances' | 'irradiance' | 'cables';

const TABS: { id: Tab; label: string }[] = [
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'batteries', label: 'Batteries' },
  { id: 'inverters', label: 'Inverters' },
  { id: 'solar', label: 'Panels & MPPT' },
  { id: 'chargers', label: 'Chargers' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'irradiance', label: 'Irradiance' },
  { id: 'cables', label: 'Cables & fuses' },
];

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j > 0 && typeof c === 'string' && /^[\d.,–\- ]+/.test(c) ? 'num' : ''}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourcesPage() {
  const [tab, setTab] = useState<Tab>('assumptions');
  const a = useAnalysis();

  return (
    <>
      <PageHeader
        title="Data and sources"
        subtitle="Everything VanVolt knows, where it came from, and how it was checked."
      />

      <Card className="mb-4" title="How to read the labels">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PROVENANCE_META) as Provenance[]).map((p) => (
            <div key={p} className="flex items-start gap-2 text-sm">
              <ProvenanceBadge provenance={p} />
              <span className="text-ink2">{PROVENANCE_META[p].title}.</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink2">
          Source links marked <b>verified</b> were checked against the cited document. Links marked <b>secondary — verify</b> (and
          badges with *) were reported from the source but could not be opened for checking, usually because the
          manufacturer site blocks automated access. Check those values on the datasheet before buying or installing.
        </p>
      </Card>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink2 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assumptions' && (
        <Card title="Assumptions in the current design" bodyClassName="p-0">
          <Table
            head={['Area', 'Item', 'Value', 'Type', 'Source']}
            rows={a.assumptions.map((x) => [
              <span className="capitalize text-ink2">{x.module}</span>,
              <span className="font-medium">{x.label}</span>,
              <span className="text-ink2">{x.value}</span>,
              <ProvenanceBadge provenance={x.provenance} source={x.source} />,
              <SourceLink source={x.source} compact />,
            ])}
          />
          <div className="p-4">
            <p className="mb-2 text-sm font-medium">Battery chemistry parameters</p>
            <Table
              head={['Chemistry', 'Default DoD', 'Round-trip efficiency', 'Peukert', 'Min. voltage / 12 V block']}
              rows={Object.values(CHEMISTRIES).map((c) => [c.label, `${c.defaultDodPct}%`, `${c.chargeEfficiencyPct}%`, c.peukertExponent.toFixed(2), `${c.minVoltagePer12V} V`])}
            />
            <div className="mt-2 flex flex-col gap-1">
              {CHEMISTRIES.agm.sources.concat(CHEMISTRIES.lifepo4.sources.slice(1, 2)).map((s) => (
                <SourceLink key={s.url} source={s} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab === 'batteries' && (
        <Card bodyClassName="p-0">
          <Table
            head={['Battery', 'Chemistry', 'V', 'Ah', 'Max discharge', 'Max charge', 'Weight', 'Source']}
            rows={BATTERY_MODULES.map((m) => [
              <span className="font-medium">{m.manufacturer} {m.model}</span>,
              m.chemistry.toUpperCase(),
              fmt(m.nominalVoltage, 1),
              fmt(m.capacityAh),
              m.maxContinuousDischargeA ? `${m.maxContinuousDischargeA} A` : '—',
              m.maxContinuousChargeA ? `${m.maxContinuousChargeA} A` : '—',
              m.weightKg ? `${m.weightKg} kg` : '—',
              <SourceLink source={m.source} compact />,
            ])}
          />
        </Card>
      )}

      {tab === 'inverters' && (
        <Card bodyClassName="p-0">
          <Table
            head={['Inverter', 'Input', 'Cont. 25 °C', 'Cont. 40 °C', 'Peak', 'Max eff.', 'Idle', 'Charger', 'Source']}
            rows={INVERTER_MODELS.map((m) => [
              <span className="font-medium">{m.manufacturer} {m.model}</span>,
              `${m.inputVoltage} V`,
              `${m.continuousW} W`,
              m.continuousW40C ? `${m.continuousW40C} W` : '—',
              `${m.peakW} W`,
              `${m.maxEfficiencyPct}%`,
              `${m.idleW} W`,
              m.chargerA ? `${m.chargerA} A` : '—',
              <SourceLink source={m.source} compact />,
            ])}
          />
        </Card>
      )}

      {tab === 'solar' && (
        <div className="space-y-4">
          <Card title="Solar panels (STC)" bodyClassName="p-0">
            <Table
              head={['Panel', 'Pmax', 'Vmp', 'Imp', 'Voc', 'Isc', 'γ Pmax', 'Weight', 'Source']}
              rows={SOLAR_PANELS.map((p) => [
                <span className="font-medium">{p.manufacturer} {p.model}</span>,
                `${p.powerW} W`,
                `${p.vmpV} V`,
                `${p.impA} A`,
                `${p.vocV} V`,
                `${p.iscA} A`,
                `${p.tempCoeffPmaxPctPerC} %/°C`,
                `${p.weightKg} kg`,
                <SourceLink source={p.source} compact />,
              ])}
            />
          </Card>
          <Card title="MPPT charge controllers" bodyClassName="p-0">
            <Table
              head={['Controller', 'Max PV V', 'Max charge', 'PV power 12/24/48 V', 'Max eff.', 'Source']}
              rows={MPPT_CONTROLLERS.map((m) => [
                <span className="font-medium">{m.manufacturer} {m.model}</span>,
                `${m.maxPvVoltageV} V`,
                `${m.maxChargeCurrentA} A`,
                [12, 24, 48].map((v) => m.maxPvPowerW?.[v as 12] ?? '—').join(' / ') + ' W',
                m.maxEfficiencyPct ? `${m.maxEfficiencyPct}%` : '—',
                <SourceLink source={m.source} compact />,
              ])}
            />
          </Card>
        </div>
      )}

      {tab === 'chargers' && (
        <div className="space-y-4">
          <Card title="DC-DC chargers" bodyClassName="p-0">
            <Table
              head={['Charger', 'Output', 'Efficiency', 'Source']}
              rows={DCDC_CHARGERS.map((c) => [<span className="font-medium">{c.manufacturer} {c.model}</span>, `${c.outputCurrentA} A`, `${c.efficiencyPct}%`, <SourceLink source={c.source} compact />])}
            />
          </Card>
          <Card title="Shore (AC) chargers" bodyClassName="p-0">
            <Table
              head={['Charger', 'Output', 'Efficiency', 'Source']}
              rows={AC_CHARGERS.map((c) => [<span className="font-medium">{c.manufacturer} {c.model}</span>, `${c.outputCurrentA} A`, `${c.efficiencyPct}%`, <SourceLink source={c.source} compact />])}
            />
          </Card>
        </div>
      )}

      {tab === 'appliances' && (
        <Card bodyClassName="p-0">
          <Table
            head={['Appliance', 'Supply', 'Power', 'Surge', 'Type', 'Source']}
            rows={APPLIANCE_PRESETS.map((p) => [
              <span className="font-medium">{p.name}</span>,
              p.supply.toUpperCase(),
              `${fmt(p.powerW, p.powerW < 100 ? 1 : 0)} W`,
              `${fmt(p.surgeW)} W`,
              <ProvenanceBadge provenance={p.provenance} source={p.source} />,
              p.source ? <SourceLink source={p.source} compact /> : <span className="text-xs text-ink3">{p.notes}</span>,
            ])}
          />
        </Card>
      )}

      {tab === 'irradiance' && (
        <Card title="Monthly average daily irradiation, flat panels (kWh/m²/day)" subtitle="PVGIS 5.3 — European Commission Joint Research Centre" bodyClassName="p-0">
          <Table
            head={['Location', 'Database', 'Jan', 'Mar', 'Jun', 'Sep', 'Dec', 'Source']}
            rows={IRRADIANCE_LOCATIONS.map((l) => [
              <span className="font-medium">{l.name}, {l.country}</span>,
              l.database,
              fmt(l.horizontal[0], 2),
              fmt(l.horizontal[2], 2),
              fmt(l.horizontal[5], 2),
              fmt(l.horizontal[8], 2),
              fmt(l.horizontal[11], 2),
              <SourceLink source={l.source} compact />,
            ])}
          />
        </Card>
      )}

      {tab === 'cables' && (
        <div className="space-y-4">
          <Card title="Conductors and current capacity" subtitle="Copper Class 5 resistance at 20 °C; ISO 10133 current at 30 °C by insulation rating" bodyClassName="p-0">
            <Table
              head={['Size', 'AWG ≈', 'Ω/km', '70 °C', '85–90 °C', '105 °C', '125 °C']}
              rows={CABLE_TABLES.conductors.map((c) => [
                `${c.csaMm2} mm²`,
                c.awg ?? '—',
                String(c.resistanceOhmPerKm),
                ...CABLE_TABLES.ampacity.map((t) => `${t.values[String(c.csaMm2)]} A`),
              ])}
            />
            <div className="flex flex-col gap-1 p-4">
              <SourceLink source={IEC60228_SOURCE} />
              <SourceLink source={ISO10133_SOURCE} />
              <SourceLink source={GROUPING_SOURCE} />
              <SourceLink source={VICTRON_CABLE_SOURCE} />
            </div>
          </Card>
          <Card title="Fuse families" bodyClassName="p-0">
            <Table
              head={['Family', 'Range', 'Max DC voltage', 'Interrupt rating', 'Source']}
              rows={CABLE_TABLES.fuses.map((f) => [
                <span className="font-medium">{f.name}</span>,
                `${f.minA}–${f.maxA} A`,
                `${f.maxVoltageDc} V`,
                f.interruptRatingA ? `${fmt(f.interruptRatingA)} A ${f.interruptNote ?? ''}` : '—',
                <SourceLink source={f.source} compact />,
              ])}
            />
          </Card>
        </div>
      )}

      <div className="mt-4">
        <Callout tone="warn">
          VanVolt is a planning and design tool. It does not replace verification of the installation by a competent
          person against current standards and the manufacturers' installation instructions.
        </Callout>
      </div>
    </>
  );
}
