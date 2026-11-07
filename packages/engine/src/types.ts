/**
 * Core domain types for the VanVolt calculation engine.
 *
 * The engine is pure TypeScript with no runtime dependencies so that it can be
 * unit-tested in isolation and reused by any interface (web, CLI, server).
 */

/** Nominal DC system voltage classes supported by the designer. */
export type SystemVoltage = 12 | 24 | 48;
export const SYSTEM_VOLTAGES: readonly SystemVoltage[] = [12, 24, 48] as const;

/**
 * Where a value came from. Every user-facing number in VanVolt is tagged with
 * one of these so the interface can distinguish verified data from guesses.
 *
 * - `manufacturer`: read from a manufacturer datasheet / manual (with source).
 * - `standard`: taken from a published standard or recognised technical reference.
 * - `user`: entered by the user.
 * - `assumption`: an engineering assumption chosen by VanVolt (documented, editable).
 * - `estimate`: a typical/generic figure, not tied to a specific product.
 * - `calculated`: an output of the engine (always an estimate of real behaviour).
 */
export type Provenance =
  | 'manufacturer'
  | 'standard'
  | 'user'
  | 'assumption'
  | 'estimate'
  | 'calculated';

/**
 * How a sourced value was checked:
 * - `document`: read directly from the cited document by the VanVolt maintainers.
 * - `secondary`: reported from the cited source via search-engine extracts or a
 *   third-party reproduction; the document itself could not be opened. Verify before relying on it.
 */
export type Verification = 'document' | 'secondary';

export interface SourceRef {
  title: string;
  url: string;
  publisher?: string;
  /** ISO date the source was consulted. */
  accessed?: string;
  note?: string;
  verification?: Verification;
}

export type Severity = 'info' | 'warning' | 'critical';

export type ModuleId =
  | 'consumption'
  | 'battery'
  | 'solar'
  | 'inverter'
  | 'charging'
  | 'cables'
  | 'system';

export interface Finding {
  id: string;
  module: ModuleId;
  severity: Severity;
  message: string;
  /** Optional suggested remedy. */
  advice?: string;
}

export interface Assumption {
  id: string;
  module: ModuleId;
  label: string;
  value: string;
  provenance: Provenance;
  source?: SourceRef;
}

/* ------------------------------------------------------------------ */
/* Loads                                                               */
/* ------------------------------------------------------------------ */

export type LoadSupply = 'dc' | 'ac';

/**
 * Electrical character of a load. Used for inverter compatibility checks
 * (start-up surge, waveform sensitivity).
 */
export type LoadKind =
  | 'resistive'
  | 'motor'
  | 'compressor'
  | 'electronic'
  | 'lighting'
  | 'induction'
  | 'microwave';

export type ApplianceCategory =
  | 'refrigeration'
  | 'heating'
  | 'cooking'
  | 'lighting'
  | 'water'
  | 'ventilation'
  | 'electronics'
  | 'communications'
  | 'personal-care'
  | 'tools'
  | 'other';

/** Time-of-day window in which an appliance's energy is used (for simulation). */
export type UsageProfile = 'allday' | 'morning' | 'daytime' | 'evening' | 'night';

export interface Appliance {
  id: string;
  name: string;
  category: ApplianceCategory;
  supply: LoadSupply;
  kind: LoadKind;
  /** Running power while operating, per unit (W). For AC loads this is AC-side power. */
  powerW: number;
  /** Peak / start-up power per unit (W). Equal to powerW when there is no surge. */
  surgeW: number;
  quantity: number;
  /** Hours per usage day that the appliance is switched on. */
  hoursPerDay: number;
  /** Percentage of "on" time actually drawing powerW (e.g. fridge compressor cycling). */
  dutyCyclePct: number;
  /** Number of days per week the appliance is used (0-7). */
  daysPerWeek: number;
  /** Standby power per unit when switched off (W). */
  standbyW: number;
  /** Whether this load can run at the same time as other concurrent loads (for peak sizing). */
  concurrent: boolean;
  profile: UsageProfile;
  enabled: boolean;
  provenance: Provenance;
  source?: SourceRef;
  notes?: string;
  /** Library preset this appliance was created from, if any. */
  libraryId?: string;
}

/* ------------------------------------------------------------------ */
/* Battery                                                             */
/* ------------------------------------------------------------------ */

export type Chemistry = 'lifepo4' | 'agm' | 'gel' | 'flooded';

export interface CycleLifePoint {
  dodPct: number;
  cycles: number;
}

export interface BatteryModule {
  id: string;
  manufacturer: string;
  model: string;
  chemistry: Chemistry;
  /** Nominal voltage of one module (V), e.g. 12.8 for a 4-cell LiFePO4 module. */
  nominalVoltage: number;
  /** Rated capacity (Ah). For lead-acid this is the 20-hour (C20) rating. */
  capacityAh: number;
  maxContinuousDischargeA?: number;
  maxContinuousChargeA?: number;
  peakDischargeA?: number;
  weightKg?: number;
  cycleLife?: CycleLifePoint[];
  provenance: Provenance;
  source?: SourceRef;
  notes?: string;
}

export interface BatteryConfig {
  module: BatteryModule;
  /** Modules connected in series (raises voltage). */
  series: number;
  /** Strings connected in parallel (raises capacity). */
  parallel: number;
  /** Usable depth of discharge (%). */
  dodPct: number;
  /** Desired autonomy with no charging (days). */
  autonomyTargetDays: number;
  /** Override round-trip charge efficiency (%). Undefined uses the chemistry default. */
  chargeEfficiencyPct?: number;
  /** Override Peukert exponent. Undefined uses the chemistry default. */
  peukertExponent?: number;
}

/* ------------------------------------------------------------------ */
/* Solar                                                               */
/* ------------------------------------------------------------------ */

export interface SolarPanel {
  id: string;
  manufacturer: string;
  model: string;
  /** Rated maximum power at STC (W). */
  powerW: number;
  vmpV?: number;
  impA?: number;
  vocV?: number;
  iscA?: number;
  /** Temperature coefficient of Pmax (%/°C, negative). */
  tempCoeffPmaxPctPerC?: number;
  /** Temperature coefficient of Voc (%/°C, negative). */
  tempCoeffVocPctPerC?: number;
  flexible?: boolean;
  weightKg?: number;
  provenance: Provenance;
  source?: SourceRef;
}

export type SolarMounting = 'flat' | 'tilted';
export type ControllerType = 'mppt' | 'pwm';

export interface MpptController {
  id: string;
  manufacturer: string;
  model: string;
  maxPvVoltageV: number;
  /** Rated output (battery) current (A). */
  maxChargeCurrentA: number;
  /** Nominal maximum PV power by battery voltage (W). */
  maxPvPowerW?: Partial<Record<SystemVoltage, number>>;
  maxEfficiencyPct?: number;
  selfConsumptionMa?: number;
  provenance: Provenance;
  source?: SourceRef;
}

export interface SolarConfig {
  enabled: boolean;
  panel: SolarPanel;
  quantity: number;
  /** Panels wired in series per string. Strings = quantity / panelsInSeries. */
  panelsInSeries: number;
  locationId: string;
  /** Monthly PSH (kWh/m²/day) used when locationId is 'custom'. */
  customMonthlyPsh?: number[];
  /** Latitude used with custom irradiance (°, north positive). */
  customLatitude?: number;
  mounting: SolarMounting;
  /** Loss from shading (roof furniture, trees, parking) (%). */
  shadingLossPct: number;
  /** Extra loss for non-ideal orientation/tilt not captured by the irradiance data (%). */
  orientationLossPct: number;
  /** Loss from elevated cell temperature (%). */
  temperatureLossPct: number;
  /** Soiling / dirt loss (%). */
  soilingLossPct: number;
  /** Reflection / angle-of-incidence loss for shallow sun angles (%). */
  reflectionLossPct: number;
  /** Wiring and module mismatch loss (%). */
  wiringLossPct: number;
  controllerType: ControllerType;
  controller?: MpptController;
  /** Controller conversion efficiency (%). */
  controllerEfficiencyPct: number;
}

/* ------------------------------------------------------------------ */
/* Inverter                                                            */
/* ------------------------------------------------------------------ */

export type Waveform = 'pure-sine' | 'modified-sine';

export interface InverterModel {
  id: string;
  manufacturer: string;
  model: string;
  inputVoltage: SystemVoltage;
  /** Continuous output power at 25 °C (W). */
  continuousW: number;
  /** Continuous output power at 40 °C (W), if published. */
  continuousW40C?: number;
  continuousVA?: number;
  peakW: number;
  maxEfficiencyPct: number;
  /** Zero-load (idle) power draw (W). */
  idleW: number;
  waveform: Waveform;
  /** Built-in charger output current (A), for inverter/chargers. */
  chargerA?: number;
  provenance: Provenance;
  source?: SourceRef;
}

export interface InverterConfig {
  enabled: boolean;
  model: InverterModel;
  /** Average conversion efficiency used for energy accounting (%). */
  averageEfficiencyPct: number;
  /** Hours per day the inverter is switched on (idle draw applies). */
  onHoursPerDay: number;
  /** Margin applied to the continuous requirement when sizing (%). */
  sizingMarginPct: number;
}

/* ------------------------------------------------------------------ */
/* Charging                                                            */
/* ------------------------------------------------------------------ */

export interface DcDcCharger {
  id: string;
  manufacturer: string;
  model: string;
  outputCurrentA: number;
  efficiencyPct: number;
  inputVoltage?: SystemVoltage;
  outputVoltage?: SystemVoltage;
  provenance: Provenance;
  source?: SourceRef;
}

export interface AcCharger {
  id: string;
  manufacturer: string;
  model: string;
  outputCurrentA: number;
  efficiencyPct: number;
  outputVoltage?: SystemVoltage;
  provenance: Provenance;
  source?: SourceRef;
}

export type AlternatorMethod = 'dcdc' | 'vsr';

export interface AlternatorChargingConfig {
  enabled: boolean;
  method: AlternatorMethod;
  dcdc: DcDcCharger;
  /** Number of DC-DC chargers in parallel. */
  dcdcCount: number;
  /** Estimated charge current through a voltage-sensing relay (A). User estimate. */
  vsrCurrentA: number;
  drivingHoursPerDay: number;
  drivingDaysPerWeek: number;
  /** Hour of day driving starts (0-23), for simulation. */
  startHour: number;
}

export interface ShoreChargingConfig {
  enabled: boolean;
  /** Use the inverter/charger's built-in charger instead of a standalone charger. */
  useInverterCharger: boolean;
  charger: AcCharger;
  hoursPerDay: number;
  daysPerWeek: number;
  startHour: number;
}

export interface ChargingConfig {
  alternator: AlternatorChargingConfig;
  shore: ShoreChargingConfig;
}

/* ------------------------------------------------------------------ */
/* Cables                                                              */
/* ------------------------------------------------------------------ */

export type CableRole =
  | 'battery-main'
  | 'battery-inverter'
  | 'dc-distribution'
  | 'mppt-battery'
  | 'pv-mppt'
  | 'dcdc-input'
  | 'dcdc-output'
  | 'charger-battery'
  | 'custom';

export type Installation = 'free-air' | 'bundled' | 'conduit';

/** Conductor insulation temperature rating (°C), matching ISO 10133 Table A.1 columns. */
export type InsulationRating = 70 | 90 | 105 | 125;

export interface CableRunInput {
  id: string;
  role: CableRole;
  name: string;
  /** One-way run length (m). Voltage drop uses the round-trip length (×2). */
  lengthM: number;
  /** Design current (A). For auto runs this is derived from the design. */
  currentA: number;
  /** Circuit voltage (V) used for the voltage-drop percentage. */
  voltageV: number;
  /** Maximum permitted voltage drop (%). */
  maxDropPct: number;
  installation: Installation;
  /** Number of loaded cables bundled together (for derating). */
  bundledCount: number;
  ambientC: number;
  /** User-forced conductor size (mm²) instead of automatic selection. */
  overrideCsaMm2?: number;
}

export interface CableRunSettings {
  role: CableRole;
  name: string;
  lengthM: number;
  maxDropPct: number;
  installation: Installation;
  bundledCount: number;
  overrideCsaMm2?: number;
  /** Only for custom runs. */
  currentA?: number;
  voltageV?: number;
  id: string;
}

export interface CableConfig {
  runs: CableRunSettings[];
  ambientC: number;
  /** Assumed conductor operating temperature for resistance (°C). */
  conductorTempC: number;
  insulationRatingC: InsulationRating;
}

/* ------------------------------------------------------------------ */
/* Design                                                              */
/* ------------------------------------------------------------------ */

export interface NodePosition {
  x: number;
  y: number;
}

export interface SimulationSettings {
  month: number; // 1-12
  days: number;
  startSocPct: number;
}

export interface Design {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  systemVoltage: SystemVoltage;
  appliances: Appliance[];
  battery: BatteryConfig;
  solar: SolarConfig;
  inverter: InverterConfig;
  charging: ChargingConfig;
  cables: CableConfig;
  simulation: SimulationSettings;
  diagram: { positions: Record<string, NodePosition> };
}
