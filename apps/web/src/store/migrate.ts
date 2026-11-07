/**
 * Validate, sanitise and migrate design JSON from localStorage or an imported file.
 *
 * Imported files are untrusted: every field is type-, range- and enum-checked against a
 * fresh default design, lists are capped, invalid items are dropped, and only http(s)
 * source URLs are kept. Imported sources may not claim `verification: 'document'` unless
 * they match the built-in library entry exactly — otherwise they are downgraded to
 * `secondary` so a shared file cannot pass off unchecked data as verified.
 */
import {
  AC_CHARGERS,
  APPLIANCE_PRESETS,
  BATTERY_MODULES,
  createDesign,
  DCDC_CHARGERS,
  INVERTER_MODELS,
  MAX_SIMULATION_DAYS,
  MPPT_CONTROLLERS,
  SOLAR_PANELS,
  uid,
  type AcCharger,
  type Appliance,
  type BatteryModule,
  type CableRunSettings,
  type DcDcCharger,
  type Design,
  type InverterModel,
  type MpptController,
  type SolarPanel,
  type SourceRef,
} from '@vanvolt/engine';

export class DesignImportError extends Error {}

export interface MigrateOptions {
  /** True for files the user imported (untrusted provenance claims). */
  imported?: boolean;
}

export const MAX_APPLIANCES = 200;
export const MAX_CABLE_RUNS = 100;
const ID_RE = /^[\w-]{1,80}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

/** Safe identifier: word characters only, never an Object.prototype key. */
export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v) && !RESERVED_IDS.has(v);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function optNum(v: unknown, min = 0, max = Infinity): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}
function str(v: unknown, fallback: string, maxLen = 300): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : fallback;
}
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

const PROVENANCE = [
  'manufacturer',
  'standard',
  'user',
  'assumption',
  'estimate',
  'calculated',
] as const;
const CHEMISTRY = ['lifepo4', 'agm', 'gel', 'flooded'] as const;
const VOLTAGES = [12, 24, 48] as const;
const CATEGORIES = [
  'refrigeration',
  'heating',
  'cooking',
  'lighting',
  'water',
  'ventilation',
  'electronics',
  'communications',
  'personal-care',
  'tools',
  'other',
] as const;
const KINDS = [
  'resistive',
  'motor',
  'compressor',
  'electronic',
  'lighting',
  'induction',
  'microwave',
] as const;
const PROFILES = ['allday', 'morning', 'daytime', 'evening', 'night'] as const;
const ROLES = [
  'battery-main',
  'battery-inverter',
  'dc-distribution',
  'mppt-battery',
  'pv-mppt',
  'dcdc-input',
  'dcdc-output',
  'charger-battery',
  'custom',
] as const;
const INSTALLATIONS = ['free-air', 'bundled', 'conduit'] as const;
const NODE_IDS = [
  'solar',
  'mppt',
  'vehicle',
  'dcdc',
  'shore',
  'charger',
  'battery',
  'busbar',
  'inverter',
  'acloads',
  'dcloads',
];

function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

function source(
  v: unknown,
  library: SourceRef | undefined,
  opts: MigrateOptions,
): SourceRef | undefined {
  if (!isObj(v)) return undefined;
  const s: SourceRef = { title: str(v.title, 'Source', 300), url: safeUrl(v.url) };
  if (typeof v.publisher === 'string') s.publisher = str(v.publisher, '', 120);
  if (typeof v.accessed === 'string') s.accessed = str(v.accessed, '', 40);
  if (typeof v.note === 'string') s.note = str(v.note, '', 600);
  let verification = oneOf(v.verification, ['document', 'secondary'] as const, 'secondary');
  const matchesLibrary =
    library !== undefined && library.url === s.url && library.verification === verification;
  if (opts.imported && verification === 'document' && !matchesLibrary) {
    verification = 'secondary';
    s.note = `${s.note ? `${s.note} ` : ''}Imported file claimed this was verified; VanVolt has not checked it.`;
  }
  s.verification = verification;
  return s;
}

function provenance(v: unknown, fallback: Design['appliances'][number]['provenance']) {
  return oneOf(v, PROVENANCE, fallback);
}

function appliance(v: unknown, opts: MigrateOptions): Appliance | null {
  if (!isObj(v)) return null;
  const libraryId = typeof v.libraryId === 'string' ? v.libraryId.slice(0, 80) : undefined;
  const lib = libraryId ? APPLIANCE_PRESETS.find((p) => p.presetId === libraryId) : undefined;
  const powerW = num(v.powerW, 0, 0, 100_000);
  const a: Appliance = {
    id: isSafeId(v.id) ? v.id : uid('app'),
    name: str(v.name, 'Appliance', 120),
    category: oneOf(v.category, CATEGORIES, 'other'),
    supply: oneOf(v.supply, ['dc', 'ac'] as const, 'dc'),
    kind: oneOf(v.kind, KINDS, 'electronic'),
    powerW,
    surgeW: Math.max(powerW, num(v.surgeW, powerW, 0, 200_000)),
    quantity: int(v.quantity, 1, 0, 100),
    hoursPerDay: num(v.hoursPerDay, 0, 0, 24),
    dutyCyclePct: num(v.dutyCyclePct, 100, 0, 100),
    daysPerWeek: int(v.daysPerWeek, 7, 0, 7),
    standbyW: num(v.standbyW, 0, 0, 10_000),
    concurrent: bool(v.concurrent, true),
    profile: oneOf(v.profile, PROFILES, 'allday'),
    enabled: bool(v.enabled, true),
    provenance: provenance(v.provenance, 'user'),
  };
  const src = source(v.source, lib?.source, opts);
  if (src) a.source = src;
  if (typeof v.notes === 'string') a.notes = str(v.notes, '', 600);
  if (libraryId) a.libraryId = libraryId;
  return a;
}

function batteryModule(v: unknown, d: BatteryModule, opts: MigrateOptions): BatteryModule {
  if (!isObj(v)) return d;
  const id = typeof v.id === 'string' ? v.id.slice(0, 80) : d.id;
  const lib = BATTERY_MODULES.find((m) => m.id === id);
  const m: BatteryModule = {
    id,
    manufacturer: str(v.manufacturer, d.manufacturer, 80),
    model: str(v.model, d.model, 120),
    chemistry: oneOf(v.chemistry, CHEMISTRY, d.chemistry),
    nominalVoltage: num(v.nominalVoltage, d.nominalVoltage, 1, 100),
    capacityAh: num(v.capacityAh, d.capacityAh, 1, 10_000),
    provenance: provenance(v.provenance, 'user'),
  };
  const opt = (
    k: 'maxContinuousDischargeA' | 'maxContinuousChargeA' | 'peakDischargeA' | 'weightKg',
    max: number,
  ) => {
    const n = optNum(v[k], 0, max);
    if (n !== undefined) m[k] = n;
  };
  opt('maxContinuousDischargeA', 10_000);
  opt('maxContinuousChargeA', 10_000);
  opt('peakDischargeA', 50_000);
  opt('weightKg', 2_000);
  if (Array.isArray(v.cycleLife))
    m.cycleLife = v.cycleLife
      .filter(isObj)
      .slice(0, 20)
      .map((p) => ({ dodPct: num(p.dodPct, 50, 1, 100), cycles: num(p.cycles, 1, 1, 1_000_000) }));
  const src = source(v.source, lib?.source, opts);
  if (src) m.source = src;
  if (typeof v.notes === 'string') m.notes = str(v.notes, '', 600);
  return m;
}

function panel(v: unknown, d: SolarPanel, opts: MigrateOptions): SolarPanel {
  if (!isObj(v)) return d;
  const id = typeof v.id === 'string' ? v.id.slice(0, 80) : d.id;
  const lib = SOLAR_PANELS.find((p) => p.id === id);
  const p: SolarPanel = {
    id,
    manufacturer: str(v.manufacturer, d.manufacturer, 80),
    model: str(v.model, d.model, 120),
    powerW: num(v.powerW, d.powerW, 0, 2_000),
    provenance: provenance(v.provenance, 'user'),
  };
  for (const k of ['vmpV', 'impA', 'vocV', 'iscA', 'weightKg'] as const) {
    const n = optNum(v[k], 0, 1_000);
    if (n !== undefined) p[k] = n;
  }
  for (const k of ['tempCoeffPmaxPctPerC', 'tempCoeffVocPctPerC'] as const) {
    const n = optNum(v[k], -2, 0);
    if (n !== undefined) p[k] = n;
  }
  if (typeof v.flexible === 'boolean') p.flexible = v.flexible;
  const src = source(v.source, lib?.source, opts);
  if (src) p.source = src;
  return p;
}

function controller(v: unknown, opts: MigrateOptions): MpptController | undefined {
  if (!isObj(v)) return undefined;
  const id = str(v.id, 'custom-mppt', 80);
  const lib = MPPT_CONTROLLERS.find((m) => m.id === id);
  const c: MpptController = {
    id,
    manufacturer: str(v.manufacturer, 'Custom', 80),
    model: str(v.model, 'MPPT', 120),
    maxPvVoltageV: num(v.maxPvVoltageV, 100, 1, 1_000),
    maxChargeCurrentA: num(v.maxChargeCurrentA, 30, 1, 1_000),
    provenance: provenance(v.provenance, 'user'),
  };
  if (isObj(v.maxPvPowerW)) {
    const pv: Partial<Record<12 | 24 | 48, number>> = {};
    for (const volt of VOLTAGES) {
      const n = optNum(v.maxPvPowerW[String(volt)], 0, 100_000);
      if (n !== undefined) pv[volt] = n;
    }
    c.maxPvPowerW = pv;
  }
  const eff = optNum(v.maxEfficiencyPct, 1, 100);
  if (eff !== undefined) c.maxEfficiencyPct = eff;
  const sc = optNum(v.selfConsumptionMa, 0, 10_000);
  if (sc !== undefined) c.selfConsumptionMa = sc;
  const src = source(v.source, lib?.source, opts);
  if (src) c.source = src;
  return c;
}

function inverterModel(v: unknown, d: InverterModel, opts: MigrateOptions): InverterModel {
  if (!isObj(v)) return d;
  const id = str(v.id, d.id, 80);
  const lib = INVERTER_MODELS.find((m) => m.id === id);
  const continuousW = num(v.continuousW, d.continuousW, 0, 100_000);
  const m: InverterModel = {
    id,
    manufacturer: str(v.manufacturer, d.manufacturer, 80),
    model: str(v.model, d.model, 120),
    inputVoltage: oneOf(v.inputVoltage, VOLTAGES, d.inputVoltage),
    continuousW,
    peakW: Math.max(continuousW, num(v.peakW, d.peakW, 0, 200_000)),
    maxEfficiencyPct: num(v.maxEfficiencyPct, d.maxEfficiencyPct, 1, 100),
    idleW: num(v.idleW, d.idleW, 0, 1_000),
    waveform: oneOf(v.waveform, ['pure-sine', 'modified-sine'] as const, 'pure-sine'),
    provenance: provenance(v.provenance, 'user'),
  };
  for (const [k, max] of [
    ['continuousW40C', 100_000],
    ['continuousVA', 100_000],
    ['chargerA', 1_000],
  ] as const) {
    const n = optNum(v[k], 0, max);
    if (n !== undefined) m[k] = n;
  }
  const src = source(v.source, lib?.source, opts);
  if (src) m.source = src;
  return m;
}

function charger<T extends DcDcCharger | AcCharger>(
  v: unknown,
  d: T,
  library: readonly T[],
  opts: MigrateOptions,
): T {
  if (!isObj(v)) return d;
  const id = str(v.id, d.id, 80);
  const lib = library.find((x) => x.id === id);
  const c = {
    id,
    manufacturer: str(v.manufacturer, d.manufacturer, 80),
    model: str(v.model, d.model, 120),
    outputCurrentA: num(v.outputCurrentA, d.outputCurrentA, 0, 1_000),
    efficiencyPct: num(v.efficiencyPct, d.efficiencyPct, 1, 100),
    provenance: provenance(v.provenance, 'user'),
  } as T;
  if (VOLTAGES.includes(v.outputVoltage as 12)) c.outputVoltage = v.outputVoltage as 12 | 24 | 48;
  if ('inputVoltage' in d || 'inputVoltage' in v) {
    if (VOLTAGES.includes(v.inputVoltage as 12))
      (c as DcDcCharger).inputVoltage = v.inputVoltage as 12 | 24 | 48;
  }
  const src = source(v.source, lib?.source, opts);
  if (src) c.source = src;
  return c;
}

function cableRun(v: unknown): CableRunSettings | null {
  if (!isObj(v)) return null;
  const role = oneOf(v.role, ROLES, 'custom');
  const r: CableRunSettings = {
    id: isSafeId(v.id) ? v.id : role === 'custom' ? uid('run') : role,
    role,
    name: str(v.name, 'Circuit', 120),
    lengthM: num(v.lengthM, 1, 0.01, 200),
    maxDropPct: num(v.maxDropPct, 3, 0.1, 50),
    installation: oneOf(v.installation, INSTALLATIONS, 'free-air'),
    bundledCount: int(v.bundledCount, 1, 1, 100),
  };
  const ov = optNum(v.overrideCsaMm2, 0.1, 1_000);
  if (ov !== undefined) r.overrideCsaMm2 = ov;
  if (role === 'custom') {
    r.currentA = num(v.currentA, 0, 0, 10_000);
    r.voltageV = num(v.voltageV, 12, 1, 1_000);
  }
  return r;
}

export function migrateDesign(raw: unknown, opts: MigrateOptions = {}): Design {
  if (!isObj(raw)) throw new DesignImportError('File does not contain a VanVolt design object.');
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)
    throw new DesignImportError(`Unsupported design schema version: ${String(raw.schemaVersion)}.`);
  if (!Array.isArray(raw.appliances) || !isObj(raw.battery) || !isObj(raw.solar))
    throw new DesignImportError('File is missing required sections (appliances, battery, solar).');
  if (raw.appliances.length > MAX_APPLIANCES)
    throw new DesignImportError(
      `Too many appliances (${raw.appliances.length}); the maximum is ${MAX_APPLIANCES}.`,
    );

  const def = createDesign();
  const b = raw.battery;
  const s = raw.solar;
  const inv = isObj(raw.inverter) ? raw.inverter : {};
  const ch = isObj(raw.charging) ? raw.charging : {};
  const alt = isObj(ch.alternator) ? ch.alternator : {};
  const shore = isObj(ch.shore) ? ch.shore : {};
  const cab = isObj(raw.cables) ? raw.cables : {};
  const sim = isObj(raw.simulation) ? raw.simulation : {};
  const diag = isObj(raw.diagram) && isObj(raw.diagram.positions) ? raw.diagram.positions : {};

  const appliances = raw.appliances
    .map((a) => appliance(a, opts))
    .filter((a): a is Appliance => a !== null);
  const seen = new Set<string>();
  for (const a of appliances) {
    if (seen.has(a.id)) a.id = uid('app');
    seen.add(a.id);
  }

  const positions: Design['diagram']['positions'] = {};
  for (const id of NODE_IDS) {
    const p = diag[id];
    if (isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y))
      positions[id] = { x: num(p.x, 0, -1e5, 1e5), y: num(p.y, 0, -1e5, 1e5) };
  }

  const runs = Array.isArray(cab.runs)
    ? cab.runs
        .slice(0, MAX_CABLE_RUNS)
        .map(cableRun)
        .filter((r): r is CableRunSettings => r !== null)
    : def.cables.runs;

  const design: Design = {
    schemaVersion: 1,
    id: isSafeId(raw.id) ? raw.id : uid('design'),
    name: str(raw.name, 'Imported design', 120) || 'Imported design',
    description: str(raw.description, '', 2_000),
    createdAt: str(raw.createdAt, def.createdAt, 40),
    updatedAt: str(raw.updatedAt, def.updatedAt, 40),
    systemVoltage: oneOf(raw.systemVoltage, VOLTAGES, 12),
    appliances,
    battery: {
      module: batteryModule(b.module, def.battery.module, opts),
      series: int(b.series, 1, 1, 32),
      parallel: int(b.parallel, 1, 1, 32),
      dodPct: num(b.dodPct, def.battery.dodPct, 1, 100),
      autonomyTargetDays: num(b.autonomyTargetDays, 2, 0.1, 30),
    },
    solar: {
      enabled: bool(s.enabled, true),
      panel: panel(s.panel, def.solar.panel, opts),
      quantity: int(s.quantity, def.solar.quantity, 0, 100),
      panelsInSeries: int(s.panelsInSeries, 1, 1, 20),
      locationId: str(s.locationId, def.solar.locationId, 80),
      mounting: oneOf(s.mounting, ['flat', 'tilted'] as const, 'flat'),
      shadingLossPct: num(s.shadingLossPct, def.solar.shadingLossPct, 0, 100),
      orientationLossPct: num(s.orientationLossPct, def.solar.orientationLossPct, 0, 100),
      temperatureLossPct: num(s.temperatureLossPct, def.solar.temperatureLossPct, 0, 100),
      soilingLossPct: num(s.soilingLossPct, def.solar.soilingLossPct, 0, 100),
      reflectionLossPct: num(s.reflectionLossPct, def.solar.reflectionLossPct, 0, 100),
      wiringLossPct: num(s.wiringLossPct, def.solar.wiringLossPct, 0, 100),
      controllerType: oneOf(s.controllerType, ['mppt', 'pwm'] as const, 'mppt'),
      controllerEfficiencyPct: num(
        s.controllerEfficiencyPct,
        def.solar.controllerEfficiencyPct,
        1,
        100,
      ),
    },
    inverter: {
      enabled: bool(inv.enabled, def.inverter.enabled),
      model: inverterModel(inv.model, def.inverter.model, opts),
      averageEfficiencyPct: num(
        inv.averageEfficiencyPct,
        def.inverter.averageEfficiencyPct,
        1,
        100,
      ),
      onHoursPerDay: num(inv.onHoursPerDay, def.inverter.onHoursPerDay, 0, 24),
      sizingMarginPct: num(inv.sizingMarginPct, def.inverter.sizingMarginPct, 0, 200),
    },
    charging: {
      alternator: {
        enabled: bool(alt.enabled, def.charging.alternator.enabled),
        method: oneOf(alt.method, ['dcdc', 'vsr'] as const, 'dcdc'),
        dcdc: charger(alt.dcdc, def.charging.alternator.dcdc, DCDC_CHARGERS, opts),
        dcdcCount: int(alt.dcdcCount, 1, 1, 8),
        vsrCurrentA: num(alt.vsrCurrentA, def.charging.alternator.vsrCurrentA, 0, 1_000),
        drivingHoursPerDay: num(
          alt.drivingHoursPerDay,
          def.charging.alternator.drivingHoursPerDay,
          0,
          24,
        ),
        drivingDaysPerWeek: int(
          alt.drivingDaysPerWeek,
          def.charging.alternator.drivingDaysPerWeek,
          0,
          7,
        ),
        startHour: int(alt.startHour, 10, 0, 23),
      },
      shore: {
        enabled: bool(shore.enabled, def.charging.shore.enabled),
        useInverterCharger: bool(shore.useInverterCharger, false),
        charger: charger(shore.charger, def.charging.shore.charger, AC_CHARGERS, opts),
        hoursPerDay: num(shore.hoursPerDay, def.charging.shore.hoursPerDay, 0, 24),
        daysPerWeek: int(shore.daysPerWeek, def.charging.shore.daysPerWeek, 0, 7),
        startHour: int(shore.startHour, 18, 0, 23),
      },
    },
    cables: {
      runs,
      ambientC: num(cab.ambientC, def.cables.ambientC, -40, 80),
      conductorTempC: num(cab.conductorTempC, def.cables.conductorTempC, 0, 150),
      insulationRatingC: oneOf(cab.insulationRatingC, [70, 90, 105, 125] as const, 90),
    },
    simulation: {
      month: int(sim.month, def.simulation.month, 1, 12),
      days: int(sim.days, def.simulation.days, 1, MAX_SIMULATION_DAYS),
      startSocPct: num(sim.startSocPct, 100, 0, 100),
    },
    diagram: { positions },
  };

  const ctrl = controller(s.controller, opts);
  if (ctrl) design.solar.controller = ctrl;
  if (Array.isArray(s.customMonthlyPsh) && s.customMonthlyPsh.length === 12)
    design.solar.customMonthlyPsh = s.customMonthlyPsh.map((x) => num(x, 0, 0, 15));
  const lat = optNum(s.customLatitude, -90, 90);
  if (lat !== undefined) design.solar.customLatitude = lat;
  const eff = optNum(b.chargeEfficiencyPct, 1, 100);
  if (eff !== undefined) design.battery.chargeEfficiencyPct = eff;
  const k = optNum(b.peukertExponent, 1, 2);
  if (k !== undefined) design.battery.peukertExponent = k;
  return design;
}
