import {
  AC_CHARGERS,
  DCDC_CHARGERS,
  deepClone,
  MONTHS,
  type AlternatorChargingConfig,
  type ShoreChargingConfig,
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
  SourceLink,
  Stat,
  Toggle,
} from '../components/ui';
import { MonthlyBalanceChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt, fmtSigned } from '../lib/format';

export function ChargingPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const alt = design.charging.alternator;
  const shore = design.charging.shore;
  const ch = a.charging;
  const setAlt = <K extends keyof AlternatorChargingConfig>(k: K, v: AlternatorChargingConfig[K]) =>
    update((d) => void (d.charging.alternator[k] = v));
  const setShore = <K extends keyof ShoreChargingConfig>(k: K, v: ShoreChargingConfig[K]) =>
    update((d) => void (d.charging.shore[k] = v));
  const altSrc = ch.sources.find((s) => s.id === 'alternator')!;
  const hoursNeeded = ch.alternatorHoursPerDayNeeded;

  return (
    <>
      <PageHeader
        title="Charging system"
        subtitle="Solar, alternator (DC-DC charger or relay) and shore power, separately or together. All sources share the battery's charge-current limit."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ch.sources.map((s) => (
          <Stat
            key={s.id}
            label={s.label}
            value={s.enabled ? fmt(s.whPerDayAvg) : 'Off'}
            unit={s.enabled ? 'Wh/day' : undefined}
            sub={s.enabled ? `${fmt(s.currentA, 1)} A max${s.id !== 'solar' ? ` · ${fmt(s.whPerActiveDay)} Wh on an active day` : ' · annual average'}` : 'Not enabled'}
          />
        ))}
        <Stat
          label={`Worst month (${MONTHS[ch.worstMonth.month - 1]})`}
          value={fmtSigned(ch.worstMonth.netWh)}
          unit="Wh/day"
          tone={ch.worstMonth.netWh < 0 ? 'crit' : undefined}
          sub={hoursNeeded > 0 ? (Number.isFinite(hoursNeeded) ? `≈ ${fmt(hoursNeeded, 1)} h/day alternator charging to balance` : 'No alternator charging to make up the deficit') : 'Balanced all year'}
        />
      </div>

      <Card className="mt-4" title="Energy balance by month" subtitle="Stored charge energy by source vs daily consumption (dashed)">
        <MonthlyBalanceChart monthly={ch.monthly} efficiency={a.battery.chargeEfficiencyPct / 100} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Alternator charging" actions={<Toggle checked={alt.enabled} onChange={(v) => setAlt('enabled', v)} />}>
          <div className={alt.enabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-50'}>
            <Segmented
              ariaLabel="Alternator charging method"
              value={alt.method}
              options={[
                { value: 'dcdc', label: 'DC-DC charger' },
                { value: 'vsr', label: 'Relay (VSR)' },
              ]}
              onChange={(v) => setAlt('method', v)}
            />
            {alt.method === 'dcdc' ? (
              <>
                <SelectField
                  label="DC-DC charger"
                  value={alt.dcdc.id}
                  badge={<ProvenanceBadge provenance={alt.dcdc.provenance} source={alt.dcdc.source} />}
                  options={DCDC_CHARGERS.map((c) => ({ value: c.id, label: `${c.manufacturer} ${c.model}` }))}
                  onChange={(id) => {
                    const c = DCDC_CHARGERS.find((x) => x.id === id);
                    if (c) update((d) => void (d.charging.alternator.dcdc = deepClone(c)));
                  }}
                />
                <NumberField label="Chargers in parallel" min={1} max={4} value={alt.dcdcCount} onChange={(v) => setAlt('dcdcCount', Math.round(v))} />
                <KeyValue
                  items={[
                    { label: 'Output current', value: `${fmt(altSrc.currentA)} A` },
                    { label: 'Efficiency', value: `${alt.dcdc.efficiencyPct}%` },
                    { label: 'Current from vehicle side', value: `≈ ${fmt(altSrc.inputCurrentA ?? 0)} A` },
                  ]}
                />
                <SourceLink source={alt.dcdc.source} />
              </>
            ) : (
              <>
                <NumberField label="Estimated charge current" unit="A" min={0} max={200} value={alt.vsrCurrentA} onChange={(v) => setAlt('vsrCurrentA', v)} hint="Your estimate — a relay's current depends on alternator, cables and battery state" />
                <Callout tone="warn">
                  A relay connects the batteries directly. Smart (Euro 6) alternators and lithium batteries generally
                  need a DC-DC charger instead — see Victron's and Sterling's guidance.
                </Callout>
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Driving h/day" min={0} max={24} step={0.25} value={alt.drivingHoursPerDay} onChange={(v) => setAlt('drivingHoursPerDay', v)} />
              <NumberField label="Days/week" min={0} max={7} value={alt.drivingDaysPerWeek} onChange={(v) => setAlt('drivingDaysPerWeek', Math.round(v))} />
              <NumberField label="Start hour" min={0} max={23} value={alt.startHour} onChange={(v) => setAlt('startHour', Math.round(v))} />
            </div>
          </div>
        </Card>

        <Card title="Shore power" actions={<Toggle checked={shore.enabled} onChange={(v) => setShore('enabled', v)} />}>
          <div className={shore.enabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-50'}>
            <Toggle
              checked={shore.useInverterCharger}
              onChange={(v) => setShore('useInverterCharger', v)}
              label="Use the inverter/charger"
              description={design.inverter.model.chargerA ? `${design.inverter.model.model}: ${design.inverter.model.chargerA} A charger` : 'Selected inverter has no charger'}
            />
            {!shore.useInverterCharger && (
              <>
                <SelectField
                  label="Shore charger"
                  value={shore.charger.id}
                  badge={<ProvenanceBadge provenance={shore.charger.provenance} source={shore.charger.source} />}
                  options={AC_CHARGERS.map((c) => ({ value: c.id, label: `${c.manufacturer} ${c.model}` }))}
                  onChange={(id) => {
                    const c = AC_CHARGERS.find((x) => x.id === id);
                    if (c) update((d) => void (d.charging.shore.charger = deepClone(c)));
                  }}
                />
                <SourceLink source={shore.charger.source} />
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Hook-up h/day" min={0} max={24} step={0.5} value={shore.hoursPerDay} onChange={(v) => setShore('hoursPerDay', v)} />
              <NumberField label="Days/week" min={0} max={7} value={shore.daysPerWeek} onChange={(v) => setShore('daysPerWeek', Math.round(v))} />
              <NumberField label="Start hour" min={0} max={23} value={shore.startHour} onChange={(v) => setShore('startHour', Math.round(v))} />
            </div>
            <p className="text-xs text-ink3">
              A 230 V hook-up needs an RCD-protected installation to the applicable standard (e.g. BS 7671 Section 721 in the UK).
            </p>
          </div>
        </Card>

        <Card title="Simultaneous charging" subtitle="All enabled sources running at once (e.g. driving on a sunny day)">
          <Meter label="Combined charge current" value={ch.simultaneousCurrentA} limit={ch.batteryMaxChargeA} unit="A" />
          <div className="mt-4">
            <KeyValue
              items={ch.sources.map((s) => ({ label: s.label, value: s.enabled ? `${fmt(s.currentA, 1)} A` : '—' }))}
            />
          </div>
          <p className="mt-3 text-xs text-ink2">
            If the total exceeds the battery's limit, chargers must be current-limited (or coordinated over a
            communication bus) so the battery management system does not disconnect.
          </p>
        </Card>
      </div>
    </>
  );
}
