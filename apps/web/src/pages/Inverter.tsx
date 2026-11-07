import { Check } from 'lucide-react';
import { deepClone, INVERTER_MODELS, type InverterConfig } from '@vanvolt/engine';
import {
  Callout,
  Card,
  EmptyState,
  KeyValue,
  Meter,
  NumberField,
  PageHeader,
  ProvenanceBadge,
  SelectField,
  SliderField,
  SourceLink,
  Stat,
  StatusIcon,
  Toggle,
} from '../components/ui';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';
import { navigate } from '../lib/router';

export function InverterPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const inv = design.inverter;
  const r = a.inverter;
  const set = <K extends keyof InverterConfig>(k: K, v: InverterConfig[K]) => update((d) => void (d.inverter[k] = v));
  const selectModel = (id: string) => {
    const m = INVERTER_MODELS.find((x) => x.id === id);
    if (!m) return;
    update((d) => {
      d.inverter.model = deepClone(m);
      d.inverter.averageEfficiencyPct = m.maxEfficiencyPct - 5;
    });
  };

  return (
    <>
      <PageHeader
        title="Inverter"
        subtitle="Size the inverter for continuous and start-up loads, check every 230 V appliance, and see the DC current it draws."
        actions={<Toggle checked={inv.enabled} onChange={(v) => set('enabled', v)} label="Inverter fitted" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="AC continuous demand" value={fmt(r.acContinuousW)} unit="W" sub={`+${inv.sizingMarginPct}% margin → ${fmt(r.requiredContinuousW)} W`} />
        <Stat label="AC peak demand" value={fmt(r.acPeakW)} unit="W" sub="Largest start-up surge on top of running loads" />
        <Stat label="DC current at rated output" value={fmt(r.ratedDcCurrentA)} unit="A" sub={`at ${fmt(a.battery.minimumVoltage, 1)} V, ${inv.averageEfficiencyPct}% efficiency`} />
        <Stat label="Idle consumption" value={fmt(r.idleWhPerDay)} unit="Wh/day" sub={`${inv.model.idleW} W × ${inv.onHoursPerDay} h on`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Selected inverter">
          <div className="space-y-3">
            <SelectField
              label="Model"
              value={inv.model.id}
              badge={<ProvenanceBadge provenance={inv.model.provenance} source={inv.model.source} />}
              options={INVERTER_MODELS.map((m) => ({
                value: m.id,
                label: `${m.manufacturer} ${m.model}${m.chargerA ? ' (inverter/charger)' : ''}`,
                group: `${m.inputVoltage} V input`,
              }))}
              onChange={selectModel}
            />
            <KeyValue
              items={[
                { label: 'Continuous at 25 °C', value: `${fmt(inv.model.continuousW)} W` },
                { label: 'Continuous at 40 °C', value: inv.model.continuousW40C ? `${fmt(inv.model.continuousW40C)} W` : '—' },
                { label: 'Peak', value: `${fmt(inv.model.peakW)} W` },
                { label: 'Max efficiency', value: `${inv.model.maxEfficiencyPct}%` },
                { label: 'Zero-load power', value: `${inv.model.idleW} W` },
                { label: 'Built-in charger', value: inv.model.chargerA ? `${inv.model.chargerA} A` : 'No' },
                { label: 'Waveform', value: inv.model.waveform === 'pure-sine' ? 'Pure sine' : 'Modified sine' },
              ]}
            />
            <SourceLink source={inv.model.source} />
          </div>
        </Card>

        <Card title="Sizing">
          <div className="space-y-4">
            <Meter label="Continuous demand vs rating" value={r.acContinuousW} limit={inv.model.continuousW} unit="W" />
            <Meter label="Demand + margin vs rating" value={r.requiredContinuousW} limit={inv.model.continuousW} unit="W" />
            <Meter label="Peak demand vs peak rating" value={r.acPeakW} limit={inv.model.peakW} unit="W" />
            <Meter label="DC current vs battery limit" value={r.ratedDcCurrentA} limit={a.battery.bank.maxContinuousDischargeA} unit="A" />
          </div>
          {!r.inputVoltageMatches && (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <StatusIcon status="critical" /> This is a {inv.model.inputVoltage} V inverter on a {design.systemVoltage} V system.
            </p>
          )}
          {r.recommended && r.recommended.id !== inv.model.id && (
            <button className="btn mt-4 w-full" onClick={() => selectModel(r.recommended!.id)}>
              <Check size={14} /> Use {r.recommended.model}
            </button>
          )}
        </Card>

        <Card title="Assumptions">
          <div className="space-y-4">
            <NumberField
              label="Average efficiency"
              unit="%"
              min={50}
              max={100}
              step={0.5}
              value={inv.averageEfficiencyPct}
              onChange={(v) => set('averageEfficiencyPct', v)}
              hint={`Datasheet maximum ${inv.model.maxEfficiencyPct}%. Default is 5 points lower for part-load operation.`}
              badge={<ProvenanceBadge provenance="assumption" />}
            />
            <SliderField label="Hours switched on per day" unit="h" min={0} max={24} step={0.5} value={inv.onHoursPerDay} onChange={(v) => set('onHoursPerDay', v)} hint="Idle draw counts for every hour it is on" />
            <SliderField label="Sizing margin" unit="%" min={0} max={50} step={5} value={inv.sizingMarginPct} onChange={(v) => set('sizingMarginPct', v)} />
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="230 V appliance compatibility" bodyClassName="p-0">
        {r.loadChecks.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No 230 V AC loads" action={<button className="btn" onClick={() => navigate('loads')}>Go to loads</button>}>
              Without AC loads you may not need an inverter at all — that saves its idle consumption.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Appliance</th>
                  <th className="text-right">Running</th>
                  <th className="text-right">Surge</th>
                  <th className="text-right">DC current</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {r.loadChecks.map((l) => (
                  <tr key={l.applianceId}>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-medium capitalize">
                        <StatusIcon status={l.status} /> {l.status}
                      </span>
                    </td>
                    <td className="font-medium">{l.name}</td>
                    <td className="num text-right">{fmt(l.runningW)} W</td>
                    <td className="num text-right">{fmt(l.surgeW)} W</td>
                    <td className="num text-right">{fmt(l.dcCurrentA)} A</td>
                    <td className="max-w-md text-xs text-ink2">{l.reasons.length ? l.reasons.join(' ') : 'Within ratings.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="DC current at each system voltage" subtitle="Same AC demand; currents at the design minimum battery voltage">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>System</th>
                  <th className="text-right">Continuous</th>
                  <th className="text-right">Peak</th>
                  <th className="text-right">At inverter rating</th>
                </tr>
              </thead>
              <tbody>
                {r.currentsByVoltage.map((c) => (
                  <tr key={c.voltage} className={c.voltage === design.systemVoltage ? 'bg-accent-soft/50' : ''}>
                    <td className="font-medium">{c.voltage} V</td>
                    <td className="num text-right">{fmt(c.continuousA)} A</td>
                    <td className="num text-right">{fmt(c.peakA)} A</td>
                    <td className="num text-right">{fmt(c.ratedA)} A</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Callout>
          Size the inverter's cables and fuse for its full rated output, not just today's loads (see Cables). Motors,
          compressors and pumps can draw several times their running power for a few seconds when starting. Use a
          pure-sine inverter for motors, microwaves, induction hobs and sensitive electronics.
        </Callout>
      </div>
    </>
  );
}
