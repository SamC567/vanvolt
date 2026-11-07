import {
  deepClone,
  IRRADIANCE_LOCATIONS,
  MONTHS,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
  type SolarConfig,
  type SolarPanel,
} from '@vanvolt/engine';
import {
  Callout,
  Card,
  KeyValue,
  NumberField,
  PageHeader,
  ProvenanceBadge,
  Segmented,
  SelectField,
  SliderField,
  SourceLink,
  Stat,
  StatusIcon,
  Toggle,
} from '../components/ui';
import { MonthlySolarChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';

const CUSTOM = '__custom__';

export function SolarPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const s = design.solar;
  const r = a.solar;
  const st = r.strings;
  const set = <K extends keyof SolarConfig>(k: K, v: SolarConfig[K]) =>
    update((d) => void (d.solar[k] = v));
  const setPanel = <K extends keyof SolarPanel>(k: K, v: SolarPanel[K]) =>
    update((d) => {
      d.solar.panel[k] = v;
      d.solar.panel.provenance = 'user';
    });
  const panelLib = SOLAR_PANELS.find((p) => p.id === s.panel.id);
  const panelCustom = !panelLib || s.panel.provenance === 'user';

  const lossSliders: { key: keyof SolarConfig; label: string; hint: string; max: number }[] = [
    {
      key: 'shadingLossPct',
      label: 'Shading',
      hint: 'Roof fittings, trees, buildings, parking in shade',
      max: 60,
    },
    {
      key: 'orientationLossPct',
      label: 'Orientation / tilt',
      hint: 'Extra loss if tilted panels often face away from the sun',
      max: 40,
    },
    {
      key: 'temperatureLossPct',
      label: 'Temperature',
      hint: 'Roof-mounted panels with little airflow run hot',
      max: 25,
    },
    { key: 'soilingLossPct', label: 'Soiling', hint: 'Dust, pollen, bird droppings', max: 20 },
    {
      key: 'reflectionLossPct',
      label: 'Reflection',
      hint: 'Low sun angles; PVGIS cites 2–4 % typically',
      max: 10,
    },
    {
      key: 'wiringLossPct',
      label: 'Wiring & mismatch',
      hint: 'Cable losses and panel mismatch',
      max: 15,
    },
  ];

  const customPsh = s.customMonthlyPsh ?? new Array(12).fill(2);

  return (
    <>
      <PageHeader
        title="Solar"
        subtitle="Monthly yield from PVGIS irradiation data for your location, after shading, temperature, soiling, reflection, wiring and controller losses."
        actions={
          <Toggle checked={s.enabled} onChange={(v) => set('enabled', v)} label="Solar enabled" />
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Installed"
          value={fmt(r.installedW)}
          unit="W"
          sub={`${s.quantity} × ${fmt(s.panel.powerW)} W · ${st.strings} string(s)`}
        />
        <Stat
          label="Summer average"
          value={fmt(r.summerWhPerDay)}
          unit="Wh/day"
          sub={`Best: ${MONTHS[r.bestMonth.month - 1]} ${fmt(r.bestMonth.whPerDay)} Wh/day`}
        />
        <Stat
          label="Winter average"
          value={fmt(r.winterWhPerDay)}
          unit="Wh/day"
          sub={`Worst: ${MONTHS[r.worstMonth.month - 1]} ${fmt(r.worstMonth.whPerDay)} Wh/day`}
        />
        <Stat
          label="System efficiency"
          value={fmt(r.losses.overall * 100, 1)}
          unit="%"
          sub="Share of STC energy reaching the battery"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Monthly yield"
          subtitle={`${a.location.name} · ${s.mounting === 'flat' ? 'flat (horizontal) panels' : `${a.location.tiltDeg ?? 35}° tilt facing the equator`} · dashed line = daily consumption`}
        >
          <MonthlySolarChart monthly={r.monthly} consumptionWh={a.consumption.batteryWhPerDay} />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink2">
            Irradiation data: <SourceLink source={a.location.source} />
          </div>
        </Card>
        <Card title="Sizing guidance">
          <KeyValue
            items={[
              {
                label: 'Panel power to cover the worst month',
                value: Number.isFinite(r.requiredWForWorstMonth)
                  ? `${fmt(r.requiredWForWorstMonth)} W`
                  : 'not achievable',
              },
              {
                label: 'Panel power to cover summer',
                value: Number.isFinite(r.requiredWForSummer)
                  ? `${fmt(r.requiredWForSummer)} W`
                  : '—',
              },
              { label: 'Annual average', value: `${fmt(r.annualAvgWhPerDay)} Wh/day` },
              { label: 'Peak sun hours (worst month)', value: `${fmt(r.worstMonth.psh, 2)} h` },
              { label: 'Peak sun hours (best month)', value: `${fmt(r.bestMonth.psh, 2)} h` },
            ]}
          />
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink3">
              Controller checks
            </p>
            {s.controllerType === 'mppt' && s.controller ? (
              <>
                <p className="flex items-center gap-2">
                  <StatusIcon status={st.vocOk === false ? 'critical' : 'ok'} />
                  Cold Voc {st.arrayVocColdV !== null
                    ? `${fmt(st.arrayVocColdV, 1)} V`
                    : '—'} vs {s.controller.maxPvVoltageV} V max
                </p>
                <p className="flex items-center gap-2">
                  <StatusIcon status={st.controllerCurrentOk === false ? 'warning' : 'ok'} />
                  Output ≈ {fmt(st.maxOutputCurrentA, 1)} A vs {s.controller.maxChargeCurrentA} A
                  rating
                </p>
                {st.controllerPowerOk !== null && (
                  <p className="flex items-center gap-2">
                    <StatusIcon status={st.controllerPowerOk ? 'ok' : 'warning'} />
                    {fmt(r.installedW)} W vs {s.controller.maxPvPowerW?.[design.systemVoltage]} W
                    nominal PV at {design.systemVoltage} V
                  </p>
                )}
              </>
            ) : s.controllerType === 'pwm' ? (
              <p className="text-ink2">
                PWM factor {fmt(r.losses.pwm * 100)}% — panel held near battery voltage.
              </p>
            ) : (
              <p className="text-ink2">Select an MPPT model for voltage and current checks.</p>
            )}
            {st.unevenStrings && (
              <p className="flex items-center gap-2">
                <StatusIcon status="warning" /> Panel count does not divide evenly into strings.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Panels and location">
          <div className="space-y-3">
            <SelectField
              label="Panel"
              value={panelCustom ? CUSTOM : s.panel.id}
              badge={<ProvenanceBadge provenance={s.panel.provenance} source={s.panel.source} />}
              options={[
                ...SOLAR_PANELS.map((p) => ({
                  value: p.id,
                  label: `${p.manufacturer} ${p.model}`,
                  group: p.manufacturer,
                })),
                { value: CUSTOM, label: 'Custom panel…', group: 'Custom' },
              ]}
              onChange={(id) =>
                update((d) => {
                  if (id === CUSTOM) {
                    d.solar.panel = {
                      ...d.solar.panel,
                      id: `custom-${Date.now()}`,
                      manufacturer: 'Custom',
                      model: 'Custom panel',
                      provenance: 'user',
                    };
                    return;
                  }
                  const p = SOLAR_PANELS.find((x) => x.id === id);
                  if (p) d.solar.panel = deepClone(p);
                })
              }
            />
            {panelCustom && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3">
                <NumberField
                  label="Pmax"
                  unit="W"
                  min={1}
                  value={s.panel.powerW}
                  onChange={(v) => setPanel('powerW', v)}
                />
                <NumberField
                  label="Vmp"
                  unit="V"
                  min={0}
                  step={0.1}
                  value={s.panel.vmpV ?? 0}
                  onChange={(v) => setPanel('vmpV', v)}
                />
                <NumberField
                  label="Voc"
                  unit="V"
                  min={0}
                  step={0.1}
                  value={s.panel.vocV ?? 0}
                  onChange={(v) => setPanel('vocV', v)}
                />
                <NumberField
                  label="Isc"
                  unit="A"
                  min={0}
                  step={0.01}
                  value={s.panel.iscA ?? 0}
                  onChange={(v) => setPanel('iscA', v)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Number of panels"
                min={0}
                max={20}
                value={s.quantity}
                onChange={(v) => set('quantity', Math.round(v))}
              />
              <NumberField
                label="Panels per series string"
                min={1}
                max={10}
                value={s.panelsInSeries}
                onChange={(v) => set('panelsInSeries', Math.round(v))}
              />
            </div>
            <SelectField
              label="Location (PVGIS data)"
              value={s.locationId}
              options={[
                ...IRRADIANCE_LOCATIONS.map((l) => ({
                  value: l.id,
                  label: `${l.name}, ${l.country}`,
                  group: 'PVGIS 5.3',
                })),
                { value: 'custom', label: 'Custom irradiation…', group: 'Custom' },
              ]}
              onChange={(v) =>
                update((d) => {
                  d.solar.locationId = v;
                  if (v === 'custom' && !d.solar.customMonthlyPsh)
                    d.solar.customMonthlyPsh = [...a.location.horizontal];
                })
              }
            />
            {s.locationId === 'custom' && (
              <div className="rounded-lg border border-line p-3">
                <p className="mb-2 text-xs text-ink2">
                  Average daily irradiation on the panel plane (kWh/m²/day = peak sun hours).
                </p>
                <NumberField
                  label="Latitude"
                  unit="°"
                  min={-80}
                  max={80}
                  step={0.1}
                  value={s.customLatitude ?? 50}
                  onChange={(v) => set('customLatitude', v)}
                />
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {MONTHS.map((m, i) => (
                    <NumberField
                      key={m}
                      label={m}
                      min={0}
                      max={10}
                      step={0.01}
                      value={customPsh[i] ?? 0}
                      onChange={(v) =>
                        update((d) => {
                          const arr = [...(d.solar.customMonthlyPsh ?? customPsh)];
                          arr[i] = v;
                          d.solar.customMonthlyPsh = arr;
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <span className="label">Mounting</span>
              <Segmented
                ariaLabel="Mounting"
                value={s.mounting}
                options={[
                  { value: 'flat', label: 'Flat on roof' },
                  { value: 'tilted', label: 'Tilted 35°' },
                ]}
                onChange={(v) => set('mounting', v)}
              />
            </div>
          </div>
        </Card>

        <Card title="Losses" subtitle="Each is an engineering assumption you can change">
          <div className="space-y-4">
            {lossSliders.map((l) => (
              <SliderField
                key={l.key}
                label={l.label}
                unit="%"
                min={0}
                max={l.max}
                value={s[l.key] as number}
                onChange={(v) => set(l.key, v as never)}
                hint={l.hint}
              />
            ))}
          </div>
        </Card>

        <Card title="Charge controller">
          <div className="space-y-3">
            <Segmented
              ariaLabel="Controller type"
              value={s.controllerType}
              options={[
                { value: 'mppt', label: 'MPPT' },
                { value: 'pwm', label: 'PWM' },
              ]}
              onChange={(v) => set('controllerType', v)}
            />
            {s.controllerType === 'mppt' && (
              <SelectField
                label="MPPT model"
                value={s.controller?.id ?? ''}
                badge={
                  s.controller && (
                    <ProvenanceBadge
                      provenance={s.controller.provenance}
                      source={s.controller.source}
                    />
                  )
                }
                options={[
                  { value: '', label: 'None selected' },
                  ...MPPT_CONTROLLERS.map((m) => ({
                    value: m.id,
                    label: `${m.manufacturer} ${m.model}`,
                  })),
                ]}
                onChange={(id) =>
                  update((d) => {
                    const m = MPPT_CONTROLLERS.find((x) => x.id === id);
                    if (m) {
                      d.solar.controller = deepClone(m);
                      d.solar.controllerEfficiencyPct =
                        m.maxEfficiencyPct ?? d.solar.controllerEfficiencyPct;
                    } else delete d.solar.controller;
                  })
                }
              />
            )}
            <NumberField
              label="Controller efficiency"
              unit="%"
              min={50}
              max={100}
              step={0.5}
              value={s.controllerEfficiencyPct}
              onChange={(v) => set('controllerEfficiencyPct', v)}
              hint="Datasheet maximum; real average is a little lower"
            />
            {s.controller && s.controllerType === 'mppt' && (
              <KeyValue
                items={[
                  { label: 'Max PV voltage', value: `${s.controller.maxPvVoltageV} V` },
                  { label: 'Max charge current', value: `${s.controller.maxChargeCurrentA} A` },
                  {
                    label: `Nominal PV power at ${design.systemVoltage} V`,
                    value: s.controller.maxPvPowerW?.[design.systemVoltage]
                      ? `${s.controller.maxPvPowerW[design.systemVoltage]} W`
                      : 'not listed',
                  },
                ]}
              />
            )}
            <SourceLink source={s.controllerType === 'mppt' ? s.controller?.source : undefined} />
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Callout>
          Flat roof panels collect far less in winter than tilted ones at high latitudes. In PVGIS
          data for London, flat panels get about 40 % of the December energy of panels tilted at
          35°, but slightly more in mid-summer. Parked orientation, nearby buildings and trees all
          reduce output, so set the shading loss honestly.
        </Callout>
      </div>
    </>
  );
}
