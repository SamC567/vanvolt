import { ArrowRight, BatteryCharging, Gauge, Plug, SunMedium, Waves, Zap } from 'lucide-react';
import { MONTHS } from '@vanvolt/engine';
import { Card, FindingsList, Grid, PageHeader, Stat, StatusPill, TextField } from '../components/ui';
import { MonthlyBalanceChart } from '../components/charts';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt, fmtSigned, fmtWh } from '../lib/format';
import { navigate, type Route } from '../lib/router';

const MODULE_ROUTE: Record<string, Route> = {
  consumption: 'loads',
  battery: 'battery',
  solar: 'solar',
  inverter: 'inverter',
  charging: 'charging',
  cables: 'cables',
  system: 'simulation',
};

export function OverviewPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const s = a.summary;
  const autonomy = Number.isFinite(s.autonomyDays) ? fmt(s.autonomyDays, 1) : '∞';
  const worst = a.charging.worstMonth;
  const groups = ['critical', 'warning', 'info'] as const;

  return (
    <>
      <PageHeader
        title={design.name}
        subtitle={
          <>
            {design.systemVoltage} V system · {a.location.name} · {design.appliances.filter((x) => x.enabled).length} loads · updated live as you edit
          </>
        }
        actions={<StatusPill status={a.status} />}
      />

      <Grid cols={4}>
        <Stat
          label="Daily consumption"
          value={fmt(s.dailyWh)}
          unit="Wh/day"
          icon={<Plug size={16} />}
          sub={`${fmt(s.dailyAh, 1)} Ah/day · ${fmtWh(s.weeklyWh)} per week`}
        />
        <Stat
          label="Usable battery"
          value={fmt(s.usableWh)}
          unit="Wh"
          icon={<BatteryCharging size={16} />}
          sub={`${autonomy} days autonomy without charging`}
        />
        <Stat
          label="Solar array"
          value={fmt(s.installedSolarW)}
          unit="W"
          icon={<SunMedium size={16} />}
          sub={`${fmt(s.solarSummerWhPerDay)} Wh/day summer · ${fmt(s.solarWinterWhPerDay)} winter`}
        />
        <Stat
          label={`Worst month (${MONTHS[worst.month - 1]})`}
          value={fmtSigned(worst.netWh)}
          unit="Wh/day"
          icon={<Gauge size={16} />}
          tone={worst.netWh < 0 ? 'crit' : undefined}
          sub={`Charging covers ${fmt(worst.coveragePct)}% of daily use`}
        />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Monthly energy balance"
          subtitle="Average daily charge energy stored by source, after battery efficiency, against daily consumption (dashed)"
        >
          <MonthlyBalanceChart monthly={a.charging.monthly} efficiency={a.battery.chargeEfficiencyPct / 100} />
        </Card>
        <Card title="Key ratings">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink2"><BatteryCharging size={15} /> Battery bank</span>
              <span className="num text-right font-medium">
                {fmt(a.battery.bank.nominalVoltage, 1)} V · {fmt(a.battery.bank.capacityAh)} Ah
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink2"><Waves size={15} /> Inverter</span>
              <span className="num text-right font-medium">
                {design.inverter.enabled ? `${fmt(design.inverter.model.continuousW)} W / ${fmt(design.inverter.model.peakW)} W peak` : 'None'}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink2"><Zap size={15} /> AC demand</span>
              <span className="num text-right font-medium">
                {fmt(a.consumption.ac.continuousW)} W cont. · {fmt(a.consumption.ac.peakW)} W peak
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink2"><Zap size={15} /> Peak battery current</span>
              <span className="num text-right font-medium">{fmt(a.battery.peakDischargeA)} A</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink2"><Gauge size={15} /> Simulated minimum SoC</span>
              <span className="num text-right font-medium">
                {fmt(s.simMinSocPct)}% ({MONTHS[design.simulation.month - 1]})
              </span>
            </li>
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Recommendations</p>
            <ul className="space-y-1.5 text-sm text-ink2">
              <li>
                Battery for {design.battery.autonomyTargetDays} days autonomy: <b className="num text-ink">{fmt(a.battery.requiredAhForTarget)} Ah</b> at {fmt(a.bankVoltage, 1)} V
              </li>
              <li>
                Solar to cover the worst month: <b className="num text-ink">{Number.isFinite(a.solar.requiredWForWorstMonth) ? `${fmt(a.solar.requiredWForWorstMonth)} W` : 'not achievable'}</b>
              </li>
              <li>
                Solar to cover summer: <b className="num text-ink">{Number.isFinite(a.solar.requiredWForSummer) ? `${fmt(a.solar.requiredWForSummer)} W` : '—'}</b>
              </li>
              {a.inverter.hasAcLoads && (
                <li>
                  Inverter: <b className="text-ink">{a.inverter.recommended?.model ?? 'no library model large enough'}</b>
                </li>
              )}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Design checks" subtitle="Problems and advice from every module">
          <FindingsList findings={a.findings} />
          {a.findings.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...new Set(a.findings.map((f) => f.module))].map((m) => (
                <button key={m} className="btn text-xs" onClick={() => navigate(MODULE_ROUTE[m] ?? 'overview')}>
                  Go to {m} <ArrowRight size={13} />
                </button>
              ))}
            </div>
          )}
          <p className="sr-only">
            {groups.map((g) => `${a.findings.filter((f) => f.severity === g).length} ${g}`).join(', ')}
          </p>
        </Card>
        <Card title="Design notes">
          <div className="space-y-3">
            <TextField label="Name" value={design.name} onChange={(v) => update((d) => void (d.name = v))} />
            <TextField
              label="Description"
              multiline
              value={design.description}
              placeholder="Vehicle, use case, travel plans…"
              onChange={(v) => update((d) => void (d.description = v))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
