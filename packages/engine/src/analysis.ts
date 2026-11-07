/**
 * analyseDesign: the single entry point the UI uses. A pure function of the Design.
 */
import type {
  Assumption,
  CableRole,
  CableRunInput,
  CableRunSettings,
  Design,
  Finding,
  ModuleId,
  Severity,
  SystemVoltage,
} from './types';
import { calculateConsumption, type ConsumptionResult } from './consumption';
import { analyseBattery, PEUKERT_ACTIVE_HOURS, type BatteryAnalysis } from './battery';
import {
  analyseSolar,
  CHARGE_VOLTAGE_RATIO,
  DESIGN_MIN_CELL_TEMP_C,
  FALLBACK_VOC_COEFF_PCT_PER_C,
  PWM_FALLBACK_FACTOR,
  type IrradianceLocation,
  type SolarAnalysis,
} from './solar';
import { analyseInverter, NEAR_LIMIT_FRACTION, type InverterAnalysis } from './inverter';
import {
  analyseCharging,
  dcdcInputCurrent,
  DEFAULT_VEHICLE_VOLTAGE,
  type ChargingAnalysis,
} from './charging';
import { FUSE_CONTINUOUS_FACTOR, sizeCable, type CableResult } from './cables';
import { simulate, type SimulationResult } from './simulation';
import {
  CABLE_TABLES,
  CHEMISTRIES,
  GROUPING_SOURCE,
  INVERTER_MODELS,
  IRRADIANCE_LOCATIONS,
  ISO10133_SOURCE,
  IEC60228_SOURCE,
  MSW_SOURCE,
  VICTRON_WIRING_UNLIMITED,
} from './data';
import { MONTHS, voltageClass } from './units';

export interface CableRunAnalysis extends CableResult {
  id: string;
  role: CableRole;
  name: string;
}

export type DesignStatus = 'ok' | 'warning' | 'critical';

export interface SystemAnalysis {
  designId: string;
  systemVoltage: SystemVoltage;
  bankVoltage: number;
  location: IrradianceLocation;
  consumption: ConsumptionResult;
  battery: BatteryAnalysis;
  solar: SolarAnalysis;
  inverter: InverterAnalysis;
  charging: ChargingAnalysis;
  cables: CableRunAnalysis[];
  simulation: SimulationResult;
  findings: Finding[];
  assumptions: Assumption[];
  status: DesignStatus;
  summary: {
    dailyWh: number;
    dailyAh: number;
    weeklyWh: number;
    usableWh: number;
    autonomyDays: number;
    installedSolarW: number;
    solarSummerWhPerDay: number;
    solarWinterWhPerDay: number;
    worstMonthNetWh: number;
    worstMonth: number;
    inverterW: number;
    acPeakW: number;
    totalWeightKg: number | null;
    simMinSocPct: number;
    simUnmetWh: number;
  };
}

/** Default one-way lengths (m) and drop limits for automatically generated runs. */
export const DEFAULT_RUN_SETTINGS: Record<
  Exclude<CableRole, 'custom'>,
  { name: string; lengthM: number; maxDropPct: number }
> = {
  'battery-main': { name: 'Battery → main fuse / busbar', lengthM: 0.5, maxDropPct: 1 },
  'battery-inverter': { name: 'Busbar → inverter', lengthM: 1.5, maxDropPct: 2.5 },
  'dc-distribution': { name: 'Busbar → DC fuse box', lengthM: 2, maxDropPct: 2.5 },
  'mppt-battery': { name: 'MPPT → busbar', lengthM: 1, maxDropPct: 2.5 },
  'pv-mppt': { name: 'Solar array → MPPT', lengthM: 5, maxDropPct: 3 },
  'dcdc-input': { name: 'Starter battery → DC-DC charger', lengthM: 5, maxDropPct: 5 },
  'dcdc-output': { name: 'DC-DC charger → busbar', lengthM: 1, maxDropPct: 2.5 },
  'charger-battery': { name: 'Shore charger → busbar', lengthM: 1, maxDropPct: 2.5 },
};

export function findLocation(id: string): IrradianceLocation | undefined {
  return IRRADIANCE_LOCATIONS.find((l) => l.id === id);
}

export function resolveLocation(design: Design): IrradianceLocation {
  const s = design.solar;
  if (s.locationId === 'custom' && s.customMonthlyPsh && s.customMonthlyPsh.length === 12) {
    return {
      id: 'custom',
      name: 'Custom location',
      country: '',
      lat: s.customLatitude ?? 50,
      lon: 0,
      database: 'User input',
      horizontal: s.customMonthlyPsh,
      tilted: s.customMonthlyPsh,
      source: { title: 'User-entered monthly irradiation', url: '' },
    };
  }
  return findLocation(s.locationId) ?? IRRADIANCE_LOCATIONS[0]!;
}

function settingsFor(design: Design, role: CableRole): CableRunSettings | undefined {
  return design.cables.runs.find((r) => r.role === role);
}

/** Build the cable run inputs from the design and partial analysis. */
export function deriveCableRuns(
  design: Design,
  ctx: {
    bankVoltage: number;
    minimumVoltage: number;
    consumption: ConsumptionResult;
    inverter: InverterAnalysis;
    solar: SolarAnalysis;
    charging: ChargingAnalysis;
  },
): { input: CableRunInput; mainBattery: boolean }[] {
  const out: { input: CableRunInput; mainBattery: boolean }[] = [];
  const amb = design.cables.ambientC;
  const make = (
    role: Exclude<CableRole, 'custom'>,
    currentA: number,
    voltageV: number,
    mainBattery = false,
  ) => {
    const d = DEFAULT_RUN_SETTINGS[role];
    const s = settingsFor(design, role);
    out.push({
      mainBattery,
      input: {
        id: s?.id ?? role,
        role,
        name: s?.name ?? d.name,
        lengthM: s?.lengthM ?? d.lengthM,
        currentA,
        voltageV,
        maxDropPct: s?.maxDropPct ?? d.maxDropPct,
        installation: s?.installation ?? 'free-air',
        bundledCount: s?.bundledCount ?? 1,
        ambientC: amb,
        ...(s?.overrideCsaMm2 !== undefined ? { overrideCsaMm2: s.overrideCsaMm2 } : {}),
      },
    });
  };
  const v = ctx.bankVoltage;
  const vMin = ctx.minimumVoltage;
  const inv = design.inverter;
  const invOn = inv.enabled && ctx.inverter.hasAcLoads;
  const dcLoadA = vMin > 0 ? ctx.consumption.dc.continuousW / vMin : 0;
  const invA = invOn ? ctx.inverter.ratedDcCurrentA : 0;
  const chargeA = ctx.charging.simultaneousCurrentA;

  make('battery-main', Math.max(invA + dcLoadA, chargeA), v, true);
  if (invOn) make('battery-inverter', invA, v);
  if (ctx.consumption.dc.continuousW > 0) make('dc-distribution', dcLoadA, v);
  if (ctx.solar.installedW > 0) {
    const ctrl = design.solar.controllerType === 'mppt' ? design.solar.controller : undefined;
    make('mppt-battery', ctrl ? ctrl.maxChargeCurrentA : ctx.solar.strings.maxOutputCurrentA, v);
    const p = design.solar.panel;
    const strings = Math.max(1, ctx.solar.strings.strings);
    const pvCurrent = p.iscA
      ? p.iscA * strings * FUSE_CONTINUOUS_FACTOR
      : p.impA
        ? p.impA * strings * FUSE_CONTINUOUS_FACTOR
        : ctx.solar.installedW / (v * CHARGE_VOLTAGE_RATIO);
    const pvVoltage = ctx.solar.strings.arrayVmpV ?? v * CHARGE_VOLTAGE_RATIO;
    make('pv-mppt', pvCurrent, pvVoltage);
  }
  const alt = design.charging.alternator;
  if (alt.enabled) {
    const outA = ctx.charging.sources.find((s) => s.id === 'alternator')?.currentA ?? 0;
    if (alt.method === 'dcdc') {
      const vehicleV = alt.dcdc.inputVoltage ?? DEFAULT_VEHICLE_VOLTAGE;
      make('dcdc-input', dcdcInputCurrent(outA, v, alt.dcdc.efficiencyPct, vehicleV), vehicleV);
      make('dcdc-output', outA, v);
    } else {
      make('dcdc-input', outA, DEFAULT_VEHICLE_VOLTAGE);
    }
  }
  const shore = design.charging.shore;
  if (shore.enabled && !shore.useInverterCharger) {
    make('charger-battery', shore.charger.outputCurrentA, v);
  }
  for (const r of design.cables.runs.filter((x) => x.role === 'custom')) {
    out.push({
      mainBattery: false,
      input: {
        id: r.id,
        role: 'custom',
        name: r.name,
        lengthM: r.lengthM,
        currentA: r.currentA ?? 0,
        voltageV: r.voltageV ?? v,
        maxDropPct: r.maxDropPct,
        installation: r.installation,
        bundledCount: r.bundledCount,
        ambientC: amb,
        ...(r.overrideCsaMm2 !== undefined ? { overrideCsaMm2: r.overrideCsaMm2 } : {}),
      },
    });
  }
  return out;
}

export function analyseDesign(design: Design): SystemAnalysis {
  const findings: Finding[] = [];
  const add = (
    module: ModuleId,
    severity: Severity,
    id: string,
    message: string,
    advice?: string,
  ) =>
    findings.push({
      id: `${module}:${id}`,
      module,
      severity,
      message,
      ...(advice ? { advice } : {}),
    });

  const chem = CHEMISTRIES[design.battery.module.chemistry];
  const sysV = design.systemVoltage;
  const bankV =
    design.battery.module.nominalVoltage * Math.max(1, Math.floor(design.battery.series));
  const inv = design.inverter;

  /* Consumption ------------------------------------------------------ */
  const consumption = calculateConsumption(design.appliances, bankV, {
    enabled: inv.enabled,
    averageEfficiencyPct: inv.averageEfficiencyPct,
    idleW: inv.model.idleW,
    onHoursPerDay: inv.onHoursPerDay,
  });
  const hasAc = design.appliances.some((a) => a.enabled && a.supply === 'ac');
  if (!design.appliances.some((a) => a.enabled)) {
    add('consumption', 'info', 'no-loads', 'No appliances yet — add loads to size the system.');
  }
  if (hasAc && !inv.enabled) {
    add(
      'consumption',
      'critical',
      'ac-no-inverter',
      'AC appliances are listed but no inverter is enabled.',
      'Enable an inverter or switch those loads to 12 V DC versions.',
    );
  }

  /* Battery ---------------------------------------------------------- */
  const battery = analyseBattery(
    design.battery,
    chem,
    consumption.batteryWhPerDay,
    consumption.battery.continuousW,
    consumption.battery.peakW,
  );
  const bank = battery.bank;
  if (bank.voltageClass !== sysV) {
    add(
      'battery',
      'critical',
      'voltage-mismatch',
      `Battery bank is ${bank.nominalVoltage.toFixed(1)} V nominal but the system is set to ${sysV} V.`,
      `Use ${Math.round(sysV / design.battery.module.nominalVoltage) || 1} module(s) in series, or change the system voltage.`,
    );
  }
  if (design.battery.dodPct > chem.maxRecommendedDodPct) {
    add(
      'battery',
      'warning',
      'dod-high',
      `Depth of discharge ${design.battery.dodPct}% is above the ${chem.maxRecommendedDodPct}% recommended for ${chem.label}.`,
      'Deep discharges shorten battery life.',
    );
  }
  if (
    Number.isFinite(battery.autonomyDays) &&
    battery.autonomyDays < design.battery.autonomyTargetDays
  ) {
    add(
      'battery',
      'warning',
      'autonomy-short',
      `Autonomy is ${battery.autonomyDays.toFixed(1)} days, short of the ${design.battery.autonomyTargetDays}-day target.`,
      `About ${Math.ceil(battery.requiredAhForTarget)} Ah is needed — ${battery.recommendedParallel} × ${design.battery.module.capacityAh} Ah in parallel.`,
    );
  }
  if (battery.continuousDischargeA > bank.maxContinuousDischargeA) {
    add(
      'battery',
      'critical',
      'discharge-limit',
      `Continuous load draws about ${Math.round(battery.continuousDischargeA)} A, above the bank's ${Math.round(bank.maxContinuousDischargeA)} A continuous limit.`,
      'Add batteries in parallel, raise the system voltage or reduce simultaneous loads.',
    );
  } else if (battery.peakDischargeA > (bank.peakDischargeA ?? bank.maxContinuousDischargeA)) {
    add(
      'battery',
      'warning',
      'peak-limit',
      `Peak load may draw about ${Math.round(battery.peakDischargeA)} A, above the bank's ${bank.peakDischargeA ? 'peak' : 'continuous'} rating.`,
      'The BMS may disconnect on start-up surges.',
    );
  }
  if (!bank.limitsFromDatasheet) {
    add(
      'battery',
      'info',
      'fallback-limits',
      `Battery current limits are not all available from the datasheet; VanVolt assumes ${chem.fallbackMaxChargeC}C charge / ${chem.fallbackMaxDischargeC}C discharge where missing.`,
      'Enter the values from your battery datasheet.',
    );
  }

  /* Solar ------------------------------------------------------------ */
  const location = resolveLocation(design);
  const solar = analyseSolar(design.solar, location, sysV, consumption.batteryWhPerDay);
  const st = solar.strings;
  if (solar.installedW === 0) {
    add('solar', 'info', 'no-solar', 'No solar array configured.');
  } else {
    if (st.unevenStrings)
      add(
        'solar',
        'warning',
        'uneven',
        `${design.solar.quantity} panels cannot be split evenly into strings of ${design.solar.panelsInSeries}.`,
        'Use a panel count that is a multiple of the panels per string.',
      );
    if (st.vocOk === false)
      add(
        'solar',
        'critical',
        'voc',
        `Cold-weather array Voc ≈ ${st.arrayVocColdV?.toFixed(0)} V exceeds the controller's ${design.solar.controller?.maxPvVoltageV} V maximum — this can destroy the controller.`,
        'Put fewer panels in series or choose a higher-voltage controller.',
      );
    if (st.controllerCurrentOk === false)
      add(
        'solar',
        'warning',
        'clipping',
        `The array can produce about ${st.maxOutputCurrentA.toFixed(0)} A, above the controller's ${design.solar.controller?.maxChargeCurrentA} A rating — output will be clipped at midday.`,
      );
    if (st.controllerPowerOk === false)
      add(
        'solar',
        'info',
        'oversized',
        `Installed ${solar.installedW} W exceeds the controller's nominal PV power at ${sysV} V.`,
      );
    if (design.solar.controllerType === 'pwm')
      add(
        'solar',
        'info',
        'pwm',
        `PWM controller: the panel operates near battery voltage, delivering about ${(solar.losses.pwm * 100).toFixed(0)}% of its rated power at 25 °C.`,
        'An MPPT controller recovers this loss, especially in cold weather and low light.',
      );
    if (design.solar.controllerType === 'mppt' && !design.solar.controller)
      add(
        'solar',
        'warning',
        'no-controller',
        'No MPPT controller model selected — voltage and current checks skipped.',
      );
  }

  /* Inverter --------------------------------------------------------- */
  const inverter = analyseInverter({
    appliances: design.appliances,
    acContinuousW: consumption.ac.continuousW,
    acPeakW: consumption.ac.peakW,
    config: inv,
    systemVoltage: sysV,
    minimumVoltage: battery.minimumVoltage,
    batteryMaxDischargeA: bank.maxContinuousDischargeA,
    minVoltageRatio: bank.nominalVoltage > 0 ? battery.minimumVoltage / bank.nominalVoltage : 0.9,
    library: INVERTER_MODELS,
  });
  if (inv.enabled && hasAc) {
    if (!inverter.inputVoltageMatches)
      add(
        'inverter',
        'critical',
        'input-voltage',
        `The ${inv.model.model} is a ${inv.model.inputVoltage} V inverter but the system is ${sysV} V.`,
      );
    const rec = inverter.recommended
      ? `Smallest suitable library model: ${inverter.recommended.model}${inverter.recommendedMeetsMargin ? '' : ' (meets demand but not the margin)'}.`
      : 'No library inverter at this voltage meets the demand — reduce simultaneous AC loads or raise the system voltage.';
    if (!inverter.continuousOk)
      add(
        'inverter',
        'critical',
        'continuous',
        `Inverter continuous rating ${inv.model.continuousW} W is below the ${Math.round(inverter.acContinuousW)} W continuous AC demand.`,
        rec,
      );
    else if (!inverter.marginOk)
      add(
        'inverter',
        'warning',
        'margin',
        `Inverter continuous rating ${inv.model.continuousW} W covers the ${Math.round(inverter.acContinuousW)} W demand but not the ${inv.sizingMarginPct}% sizing margin (${Math.round(inverter.requiredContinuousW)} W).`,
        rec,
      );
    if (!inverter.peakOk)
      add(
        'inverter',
        'warning',
        'peak',
        `Peak AC demand ${Math.round(inverter.acPeakW)} W exceeds the inverter's ${inv.model.peakW} W peak rating.`,
      );
    if (inverter.ratedDcCurrentA > bank.maxContinuousDischargeA)
      add(
        'inverter',
        'warning',
        'bms',
        `At full output the inverter draws ≈ ${Math.round(inverter.ratedDcCurrentA)} A, above the battery's ${Math.round(bank.maxContinuousDischargeA)} A continuous limit.`,
        'The battery BMS may shut down under heavy AC loads.',
      );
    const bad = inverter.loadChecks.filter((l) => l.status === 'incompatible');
    const warn = inverter.loadChecks.filter((l) => l.status === 'warning');
    if (bad.length)
      add(
        'inverter',
        'critical',
        'incompatible-loads',
        `${bad.length} AC load(s) are incompatible with the inverter or battery: ${bad.map((b) => b.name).join(', ')}.`,
      );
    if (warn.length)
      add(
        'inverter',
        'warning',
        'marginal-loads',
        `${warn.length} AC load(s) are marginal: ${warn.map((b) => b.name).join(', ')}.`,
      );
    if (
      inv.model.idleW * inv.onHoursPerDay > consumption.batteryWhPerDay * 0.15 &&
      inv.onHoursPerDay > 4
    )
      add(
        'inverter',
        'info',
        'idle',
        `Inverter idle draw is ${Math.round(inv.model.idleW * inv.onHoursPerDay)} Wh/day — ${Math.round(((inv.model.idleW * inv.onHoursPerDay) / Math.max(1, consumption.batteryWhPerDay)) * 100)}% of daily use.`,
        'Switch the inverter off when not needed, or use its eco/search mode.',
      );
  }

  /* Charging --------------------------------------------------------- */
  const charging = analyseCharging({
    config: design.charging,
    inverter: inv,
    solar,
    systemVoltage: sysV,
    bankVoltage: bankV,
    chemistry: design.battery.module.chemistry,
    chargeEfficiencyPct: battery.chargeEfficiencyPct,
    batteryMaxChargeA: bank.maxContinuousChargeA,
    dailyConsumptionWh: consumption.batteryWhPerDay,
  });
  const alt = design.charging.alternator;
  if (!charging.simultaneousOk)
    add(
      'charging',
      'warning',
      'charge-current',
      `All charging sources together can deliver ≈ ${Math.round(charging.simultaneousCurrentA)} A, above the battery's ${Math.round(bank.maxContinuousChargeA)} A charge limit.`,
      'Limit charger currents or add battery capacity.',
    );
  if (charging.worstMonth.netWh < 0) {
    const h = charging.alternatorHoursPerDayNeeded;
    add(
      'charging',
      'warning',
      'deficit',
      `In ${charging.worstMonth.label} charging covers only ${charging.worstMonth.coveragePct.toFixed(0)}% of daily use (deficit ${Math.round(-charging.worstMonth.netWh)} Wh/day).`,
      Number.isFinite(h)
        ? `About ${h.toFixed(1)} h of alternator charging per day would balance it.`
        : 'Add solar, alternator or shore charging.',
    );
  }
  if (alt.enabled && alt.method === 'vsr') {
    if (sysV !== 12)
      add(
        'charging',
        'critical',
        'vsr-voltage',
        'A voltage-sensing relay can only join batteries of the same voltage — a 12 V vehicle cannot charge a 24 V or 48 V bank this way.',
        'Use a DC-DC charger with the right output voltage.',
      );
    if (design.battery.module.chemistry === 'lifepo4')
      add(
        'charging',
        'warning',
        'vsr-lithium',
        'Lithium batteries connected to the alternator through a relay can draw very high currents and overload the alternator; smart (Euro 6) alternators also vary their voltage.',
        'Victron and Sterling recommend a DC-DC charger for these cases.',
      );
  }
  if (
    alt.enabled &&
    alt.method === 'dcdc' &&
    alt.dcdc.outputVoltage &&
    alt.dcdc.outputVoltage !== sysV
  )
    add(
      'charging',
      'critical',
      'dcdc-voltage',
      `DC-DC charger output is ${alt.dcdc.outputVoltage} V but the system is ${sysV} V.`,
    );
  const shore = design.charging.shore;
  if (
    shore.enabled &&
    !shore.useInverterCharger &&
    shore.charger.outputVoltage &&
    shore.charger.outputVoltage !== sysV
  )
    add(
      'charging',
      'critical',
      'charger-voltage',
      `Shore charger output is ${shore.charger.outputVoltage} V but the system is ${sysV} V.`,
    );
  if (shore.enabled && shore.useInverterCharger && !inv.model.chargerA)
    add(
      'charging',
      'warning',
      'no-inverter-charger',
      `The ${inv.model.model} has no built-in charger.`,
      'Select an inverter/charger or a standalone shore charger.',
    );

  /* Cables ----------------------------------------------------------- */
  const runs = deriveCableRuns(design, {
    bankVoltage: bankV,
    minimumVoltage: battery.minimumVoltage,
    consumption,
    inverter,
    solar,
    charging,
  });
  const lithium = design.battery.module.chemistry === 'lifepo4';
  const cables: CableRunAnalysis[] = runs.map(({ input, mainBattery }) => ({
    id: input.id,
    role: input.role,
    name: input.name,
    ...sizeCable(CABLE_TABLES, input, {
      conductorTempC: design.cables.conductorTempC,
      insulationRatingC: design.cables.insulationRatingC,
      mainBattery,
      lithium,
      pv: input.role === 'pv-mppt',
    }),
  }));
  for (const c of cables) {
    if (c.selectedCsaMm2 === null)
      add(
        'cables',
        'critical',
        `run-${c.id}`,
        `${c.name}: no standard cable size meets the requirements at ${c.input.currentA.toFixed(0)} A over ${c.input.lengthM} m.`,
        'Shorten the run, use parallel conductors or raise the system voltage.',
      );
    else if (!c.ok)
      add(
        'cables',
        'warning',
        `run-${c.id}`,
        `${c.name}: ${c.messages[0] ?? c.fuse.notes[0] ?? 'check sizing.'}`,
      );
  }
  if (design.cables.ambientC > 60)
    add(
      'cables',
      'warning',
      'ambient',
      'Ambient temperature above 60 °C is outside the ampacity data used; ratings are extrapolated.',
    );

  /* Simulation ------------------------------------------------------- */
  const month = Math.min(12, Math.max(1, Math.round(design.simulation.month) || 1));
  const altSrc = charging.sources.find((s) => s.id === 'alternator')!;
  const shoreSrc = charging.sources.find((s) => s.id === 'shore')!;
  const simulation = simulate({
    appliances: design.appliances,
    inverterEfficiencyPct: inv.enabled ? inv.averageEfficiencyPct : 100,
    inverterIdleW: inv.enabled ? inv.model.idleW : 0,
    inverterOnHoursPerDay: inv.onHoursPerDay,
    hasAcLoads: hasAc && inv.enabled,
    solarWhPerDay: solar.monthly[month - 1]?.whPerDay ?? 0,
    latitude: location.lat,
    month,
    days: design.simulation.days,
    startSocPct: design.simulation.startSocPct,
    nominalWh: bank.nominalWh,
    dodPct: design.battery.dodPct,
    chargeEfficiencyPct: battery.chargeEfficiencyPct,
    maxChargeW: bank.maxContinuousChargeA * bankV,
    taperStartSoc: chem.taperStartSoc,
    alternator: {
      enabled: alt.enabled,
      powerW: altSrc.currentA * bankV,
      hoursPerDay: alt.drivingHoursPerDay,
      daysPerWeek: alt.drivingDaysPerWeek,
      startHour: alt.startHour,
    },
    shore: {
      enabled: shore.enabled,
      powerW: shoreSrc.currentA * bankV,
      hoursPerDay: shore.hoursPerDay,
      daysPerWeek: shore.daysPerWeek,
      startHour: shore.startHour,
    },
  });
  if (simulation.totalUnmetWh > 1) {
    const day =
      simulation.firstEmptyHour !== null ? Math.floor(simulation.firstEmptyHour / 24) + 1 : null;
    add(
      'system',
      'warning',
      'sim-empty',
      `In the ${design.simulation.days}-day ${MONTHS[month - 1]} simulation the battery reaches its ${design.battery.dodPct}% DoD limit${day ? ` on day ${day}` : ''}; ${Math.round(simulation.totalUnmetWh)} Wh of loads go unsupplied.`,
      'Increase battery or charging capacity, or reduce consumption.',
    );
  }

  /* Assumptions ------------------------------------------------------ */
  const assumptions: Assumption[] = [
    {
      id: 'inv-eff',
      module: 'consumption',
      label: 'Inverter average efficiency',
      value: `${inv.averageEfficiencyPct}% (datasheet maximum ${inv.model.maxEfficiencyPct}%)`,
      provenance: 'assumption',
    },
    {
      id: 'peak',
      module: 'consumption',
      label: 'Peak demand',
      value:
        'All concurrent loads running plus the largest single start-up surge; exclusive loads never overlap each other',
      provenance: 'assumption',
    },
    {
      id: 'inv-margin',
      module: 'inverter',
      label: 'Inverter sizing margin',
      value: `${inv.sizingMarginPct}% above continuous demand`,
      provenance: 'assumption',
    },
    {
      id: 'near-limit',
      module: 'inverter',
      label: 'Near-limit warning',
      value: `Above ${NEAR_LIMIT_FRACTION * 100}% of a rating`,
      provenance: 'assumption',
    },
    {
      id: 'msw',
      module: 'inverter',
      label: 'Modified-sine-wave sensitivity',
      value:
        'Motors, compressors, microwaves, induction hobs, some electronics and dimmable lighting',
      provenance: 'standard',
      source: MSW_SOURCE,
    },
    {
      id: 'vmin',
      module: 'battery',
      label: 'Design minimum battery voltage',
      value: `${battery.minimumVoltage.toFixed(1)} V (used for worst-case DC currents)`,
      provenance: 'assumption',
    },
    {
      id: 'peukert',
      module: 'battery',
      label: 'Peukert evaluation current',
      value: `Daily consumption spread over ${PEUKERT_ACTIVE_HOURS} h (${battery.peukertCurrentA.toFixed(1)} A); factor capped at 1.0`,
      provenance: 'assumption',
    },
    {
      id: 'chem-eff',
      module: 'battery',
      label: `${chem.label} round-trip efficiency`,
      value: `${battery.chargeEfficiencyPct}%`,
      provenance: design.battery.chargeEfficiencyPct !== undefined ? 'user' : 'manufacturer',
      ...(chem.sources[0] ? { source: chem.sources[0] } : {}),
    },
    {
      id: 'solar-psh',
      module: 'solar',
      label: 'Solar irradiation data',
      value: `${location.name} — ${location.database}, ${design.solar.mounting === 'tilted' ? `${location.tiltDeg ?? 35}° tilt` : 'flat (horizontal)'}`,
      provenance: location.id === 'custom' ? 'user' : 'standard',
      ...(location.source.url ? { source: location.source } : {}),
    },
    {
      id: 'solar-losses',
      module: 'solar',
      label: 'Solar loss chain',
      value: `${(solar.losses.overall * 100).toFixed(1)}% of STC energy reaches the battery`,
      provenance: 'assumption',
    },
    {
      id: 'pwm',
      module: 'solar',
      label: 'PWM factor',
      value: `Battery charging voltage (${CHARGE_VOLTAGE_RATIO.toFixed(3)} × nominal) ÷ array Vmp; ${PWM_FALLBACK_FACTOR} if Vmp unknown`,
      provenance: 'assumption',
    },
    {
      id: 'voc-cold',
      module: 'solar',
      label: 'Cold Voc check',
      value: `Cell temperature ${DESIGN_MIN_CELL_TEMP_C} °C; Voc coefficient from datasheet or ${FALLBACK_VOC_COEFF_PCT_PER_C} %/°C`,
      provenance: 'assumption',
    },
    {
      id: 'charge-energy',
      module: 'charging',
      label: 'Charging energy',
      value:
        'Rated charger current × battery nominal voltage × hours; monthly balance assumes all charge passes through the battery (conservative)',
      provenance: 'assumption',
    },
    {
      id: 'vehicle-v',
      module: 'charging',
      label: 'Vehicle electrical system',
      value: `${DEFAULT_VEHICLE_VOLTAGE} V unless the DC-DC charger specifies otherwise`,
      provenance: 'assumption',
    },
    {
      id: 'cable-r',
      module: 'cables',
      label: 'Conductor resistance',
      value: `IEC 60228 Class 5 copper, corrected to ${design.cables.conductorTempC} °C conductor temperature`,
      provenance: 'standard',
      source: IEC60228_SOURCE,
    },
    {
      id: 'cable-amp',
      module: 'cables',
      label: 'Current-carrying capacity',
      value: `ISO 10133 Table A.1, ${design.cables.insulationRatingC === 90 ? '85–90' : design.cables.insulationRatingC} °C insulation, ${design.cables.ambientC} °C ambient`,
      provenance: 'standard',
      source: ISO10133_SOURCE,
    },
    {
      id: 'cable-group',
      module: 'cables',
      label: 'Bundling derating',
      value: '2–3 conductors ×0.70, 4–6 ×0.60, 7–24 ×0.50, 25+ ×0.40',
      provenance: 'standard',
      source: GROUPING_SOURCE,
    },
    {
      id: 'cable-drop',
      module: 'cables',
      label: 'Voltage drop targets',
      value:
        '≤ 2.5 % for battery, inverter and charger output circuits; 3 % for PV; 1 % battery → busbar; length is one-way × 2',
      provenance: 'standard',
      source: VICTRON_WIRING_UNLIMITED,
    },
    {
      id: 'cable-dcdc',
      module: 'cables',
      label: 'DC-DC charger input drop',
      value:
        '5 % — the charger regulates its output, so more input drop is tolerable; check the manufacturer’s cable table',
      provenance: 'assumption',
    },
    {
      id: 'fuse-voltage',
      module: 'cables',
      label: 'Fuse voltage rating',
      value: 'Fuse DC voltage rating ≥ 1.2 × system nominal (maximum charging voltage)',
      provenance: 'assumption',
    },
    {
      id: 'fuse',
      module: 'cables',
      label: 'Fuse rating rule',
      value: `Smallest standard rating ≥ ${FUSE_CONTINUOUS_FACTOR} × design current, and ≤ the cable's derated capacity`,
      provenance: 'assumption',
    },
    {
      id: 'sim-profile',
      module: 'system',
      label: 'Simulation profiles',
      value:
        'Solar: half-sine over daylight hours; loads spread evenly across their usage window; alternator/shore at rated current while active',
      provenance: 'assumption',
    },
  ];

  const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const status: DesignStatus = findings.some((f) => f.severity === 'critical')
    ? 'critical'
    : findings.some((f) => f.severity === 'warning')
      ? 'warning'
      : 'ok';

  const weight = bank.weightKg;
  return {
    designId: design.id,
    systemVoltage: sysV,
    bankVoltage: bankV,
    location,
    consumption,
    battery,
    solar,
    inverter,
    charging,
    cables,
    simulation,
    findings,
    assumptions,
    status,
    summary: {
      dailyWh: consumption.batteryWhPerDay,
      dailyAh: consumption.batteryAhPerDay,
      weeklyWh: consumption.batteryWhPerWeek,
      usableWh: battery.usableWh,
      autonomyDays: battery.autonomyDays,
      installedSolarW: solar.installedW,
      solarSummerWhPerDay: solar.summerWhPerDay,
      solarWinterWhPerDay: solar.winterWhPerDay,
      worstMonthNetWh: charging.worstMonth.netWh,
      worstMonth: charging.worstMonth.month,
      inverterW: inv.enabled ? inv.model.continuousW : 0,
      acPeakW: consumption.ac.peakW,
      totalWeightKg: weight,
      simMinSocPct: simulation.minSocPct,
      simUnmetWh: simulation.totalUnmetWh,
    },
  };
}

/** True when a bank voltage matches the selected system voltage class. */
export function bankMatchesSystem(bankV: number, sys: SystemVoltage): boolean {
  return voltageClass(bankV) === sys;
}
