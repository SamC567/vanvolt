/**
 * Cable and protection calculator.
 *
 * Voltage drop (DC, two-wire circuit):
 *   R(T)   = R20 × (1 + α (T − 20)),   α(Cu) = 0.00393 /°C
 *   V_drop = I × R(T) × 2L           (L = one-way length, km)
 *
 * Conductor selection: the smallest standard size that
 *   1. keeps the voltage drop within the limit, and
 *   2. has a derated ampacity ≥ the fuse rating that protects it, where
 *   3. the fuse rating is the smallest standard rating ≥ 1.25 × design current.
 *
 * Ampacity derating: base (table) ampacity × ambient factor × grouping factor.
 * Ambient factor: 1.0 up to the table's 30 °C reference, then linear interpolation to the
 * ISO 10133 60 °C (engine-room) factor for the insulation rating. Above 60 °C the 60 °C factor
 * is used and a warning is raised.
 */
import type { CableRunInput, Installation, SourceRef } from './types';
import { safe } from './units';

export interface ConductorSpec {
  csaMm2: number;
  /** Max DC resistance at 20 °C, Class 5 flexible copper (Ω/km). */
  resistanceOhmPerKm: number;
  /** Nearest AWG size, for reference. */
  awg?: string;
}

export interface AmpacityTable {
  id: string;
  label: string;
  /** Conductor insulation temperature rating the table applies to (°C). */
  insulationRatingC: number;
  /** Ambient temperature the table values apply to (°C). */
  referenceAmbientC: number;
  /** Installation condition the table applies to. */
  condition: string;
  /** Ampacity by cross-section (mm² → A). */
  values: Record<string, number>;
  source: SourceRef;
}

export interface GroupingFactor {
  count: number;
  factor: number;
}

export interface FuseFamily {
  id: string;
  name: string;
  minA: number;
  maxA: number;
  /** Maximum DC voltage rating (V). */
  maxVoltageDc: number;
  /** Interrupt (breaking) capacity (A) at the stated voltage. */
  interruptRatingA: number | null;
  interruptNote?: string;
  /** Ratings this family is commonly available in (A). */
  ratings: number[];
  /** Suitable as the main battery fuse for high short-circuit-current (lithium) banks. */
  highInterrupt: boolean;
  source?: SourceRef;
}

export interface CableTables {
  conductors: ConductorSpec[];
  ampacity: AmpacityTable[];
  grouping: GroupingFactor[];
  /** Ampacity factor at 60 °C ambient by insulation rating (°C → factor). */
  ambient60Factors: Record<number, number>;
  /** Additional factor for cables enclosed in conduit/trunking. */
  conduitFactor: number;
  fuses: FuseFamily[];
}

export const COPPER_ALPHA = 0.00393;
/** Fuse rating ≥ this multiple of the continuous design current. */
export const FUSE_CONTINUOUS_FACTOR = 1.25;

export function resistanceAt(r20OhmPerKm: number, conductorTempC: number): number {
  return r20OhmPerKm * (1 + COPPER_ALPHA * (conductorTempC - 20));
}

/** Voltage drop (V) of a two-wire DC run. */
export function voltageDrop(
  currentA: number,
  oneWayLengthM: number,
  r20OhmPerKm: number,
  conductorTempC: number,
): number {
  const rPerM = resistanceAt(r20OhmPerKm, conductorTempC) / 1000;
  return safe(currentA) * rPerM * 2 * safe(oneWayLengthM);
}

/** Minimum theoretical cross-section (mm²) to stay within a drop, using copper resistivity. */
export function minimumCsaForDrop(
  currentA: number,
  oneWayLengthM: number,
  voltage: number,
  maxDropPct: number,
  conductorTempC: number,
): number {
  const rho20 = 0.017241; // Ω·mm²/m, annealed copper (IACS 100 %)
  const rho = rho20 * (1 + COPPER_ALPHA * (conductorTempC - 20));
  const dvMax = (voltage * maxDropPct) / 100;
  if (dvMax <= 0) return Infinity;
  return (2 * safe(oneWayLengthM) * safe(currentA) * rho) / dvMax;
}

export function ambientFactor(
  tables: CableTables,
  insulationRatingC: number,
  ambientC: number,
  referenceAmbientC: number,
): number {
  const f60 = tables.ambient60Factors[insulationRatingC] ?? 0.75;
  if (ambientC <= referenceAmbientC) return 1;
  if (ambientC >= 60) return f60;
  const t = (ambientC - referenceAmbientC) / (60 - referenceAmbientC);
  return 1 - t * (1 - f60);
}

export function groupingFactor(table: readonly GroupingFactor[], count: number): number {
  const n = Math.max(1, Math.floor(count));
  let factor = 1;
  for (const g of [...table].sort((a, b) => a.count - b.count)) {
    if (n >= g.count) factor = g.factor;
  }
  return factor;
}

export function deratedAmpacity(
  tables: CableTables,
  table: AmpacityTable,
  csaMm2: number,
  installation: Installation,
  bundledCount: number,
  ambientC: number,
): number | null {
  const base = table.values[String(csaMm2)];
  if (base === undefined) return null;
  const kTemp = ambientFactor(tables, table.insulationRatingC, ambientC, table.referenceAmbientC);
  const kGroup = installation === 'free-air' ? 1 : groupingFactor(tables.grouping, bundledCount);
  const kConduit = installation === 'conduit' ? tables.conduitFactor : 1;
  return base * kTemp * kGroup * kConduit;
}

/** All standard fuse ratings across families, sorted. */
export function standardFuseRatings(tables: CableTables): number[] {
  const set = new Set<number>();
  for (const f of tables.fuses) for (const r of f.ratings) set.add(r);
  return [...set].sort((a, b) => a - b);
}

/**
 * Maximum charging voltage relative to nominal (e.g. 14.4 V on a 12 V lead-acid system).
 * A fuse's DC voltage rating must be at least this.
 */
export const MAX_CHARGE_VOLTAGE_FACTOR = 1.2;

export interface FuseOptions {
  /** Main battery fuse (first protection device after the battery). */
  mainBattery?: boolean;
  lithium?: boolean;
  /** PV string circuit — not protected with automotive fuses. */
  pv?: boolean;
}

/** Fuse families suitable for a circuit voltage and position. */
export function eligibleFuseFamilies(
  tables: CableTables,
  circuitVoltage: number,
  opts: FuseOptions = {},
): FuseFamily[] {
  return tables.fuses.filter(
    (f) =>
      f.maxVoltageDc >= circuitVoltage * MAX_CHARGE_VOLTAGE_FACTOR - 1e-9 &&
      (!opts.mainBattery || !opts.lithium || f.highInterrupt),
  );
}

export interface FuseSelection {
  minRatingA: number;
  ratingA: number | null;
  families: FuseFamily[];
  /** True when no library family is rated for this voltage/position. */
  noEligibleFamily: boolean;
}

/** Smallest available rating ≥ 1.25 × design current among suitable families. */
export function selectFuseRating(
  tables: CableTables,
  designCurrentA: number,
  circuitVoltage: number,
  opts: FuseOptions = {},
): FuseSelection {
  const minRatingA = safe(designCurrentA) * FUSE_CONTINUOUS_FACTOR;
  const fams = eligibleFuseFamilies(tables, circuitVoltage, opts);
  const pool = fams.length
    ? [...new Set(fams.flatMap((f) => f.ratings))].sort((a, b) => a - b)
    : standardFuseRatings(tables);
  const ratingA = pool.find((r) => r >= minRatingA - 1e-9) ?? null;
  const families = ratingA === null ? [] : fams.filter((f) => f.ratings.includes(ratingA));
  return { minRatingA, ratingA, families, noEligibleFamily: fams.length === 0 };
}

export interface FuseRecommendation {
  /** Minimum rating to avoid nuisance blowing (A). */
  minRatingA: number;
  /** Maximum rating that still protects the cable (A). */
  maxRatingA: number;
  ratingA: number | null;
  ok: boolean;
  families: FuseFamily[];
  notes: string[];
}

export const PV_FUSE_NOTE =
  'PV string circuits: string fuses are generally only needed where three or more strings are paralleled (reverse-current risk). Where used they must be PV-rated (gPV) DC fuses or breakers — check the panel’s maximum series fuse rating.';

export function recommendFuse(
  tables: CableTables,
  designCurrentA: number,
  cableAmpacityA: number,
  circuitVoltage: number,
  opts: FuseOptions = {},
): FuseRecommendation {
  if (opts.pv) {
    return {
      minRatingA: 0,
      maxRatingA: cableAmpacityA,
      ratingA: null,
      ok: cableAmpacityA + 1e-9 >= safe(designCurrentA),
      families: [],
      notes: [PV_FUSE_NOTE],
    };
  }
  const sel = selectFuseRating(tables, designCurrentA, circuitVoltage, opts);
  const { minRatingA, ratingA } = sel;
  const ok = ratingA !== null && ratingA <= cableAmpacityA + 1e-9;
  const notes: string[] = [];
  if (sel.noEligibleFamily)
    notes.push(
      `No fuse family in the VanVolt library is rated for this position at ≥ ${Math.ceil(circuitVoltage * MAX_CHARGE_VOLTAGE_FACTOR)} V DC — choose one whose DC voltage and interrupt ratings suit the circuit.`,
    );
  if (ratingA === null)
    notes.push('Current is above the largest fuse in the library; specialist protection needed.');
  if (ratingA !== null && !ok)
    notes.push(
      `A ${ratingA} A fuse would not protect a cable rated ${Math.floor(cableAmpacityA)} A — increase the conductor size.`,
    );
  if (opts.mainBattery && opts.lithium)
    notes.push(
      'Lithium banks can deliver very high short-circuit currents: use a main fuse with a high interrupt rating (e.g. Class T) close to the battery positive terminal.',
    );
  if (opts.mainBattery && !opts.lithium)
    notes.push('Fit the main fuse as close as practical to the battery positive terminal.');
  return { minRatingA, maxRatingA: cableAmpacityA, ratingA, ok, families: sel.families, notes };
}

export interface CableResult {
  input: CableRunInput;
  selectedCsaMm2: number | null;
  awg?: string;
  /** What determined the size. */
  limitedBy: 'voltage-drop' | 'ampacity' | 'override' | 'none';
  minimumCsaForDropMm2: number;
  ampacityA: number | null;
  dropV: number;
  dropPct: number;
  powerLossW: number;
  fuse: FuseRecommendation;
  ok: boolean;
  messages: string[];
}

export interface CableSizingOptions extends FuseOptions {
  conductorTempC: number;
  insulationRatingC: number;
}

function pickTable(tables: CableTables, insulationRatingC: number): AmpacityTable {
  const exact = tables.ampacity.find((t) => t.insulationRatingC === insulationRatingC);
  return exact ?? tables.ampacity[0]!;
}

export function sizeCable(
  tables: CableTables,
  input: CableRunInput,
  opts: CableSizingOptions,
): CableResult {
  const table = pickTable(tables, opts.insulationRatingC);
  const current = safe(input.currentA);
  const length = safe(input.lengthM);
  const dropLimitV = (safe(input.voltageV) * safe(input.maxDropPct)) / 100;
  // The cable must carry the fuse rating (or, for PV circuits, the design current).
  const fuseRating = opts.pv
    ? current
    : (selectFuseRating(tables, current, input.voltageV, opts).ratingA ??
      current * FUSE_CONTINUOUS_FACTOR);

  const evaluate = (c: ConductorSpec) => {
    const amp = deratedAmpacity(
      tables,
      table,
      c.csaMm2,
      input.installation,
      input.bundledCount,
      input.ambientC,
    );
    const dropV = voltageDrop(current, length, c.resistanceOhmPerKm, opts.conductorTempC);
    return { c, amp, dropV };
  };

  const candidates = [...tables.conductors].sort((a, b) => a.csaMm2 - b.csaMm2).map(evaluate);
  let chosen: ReturnType<typeof evaluate> | undefined;
  let limitedBy: CableResult['limitedBy'] = 'none';

  if (input.overrideCsaMm2 !== undefined) {
    chosen = candidates.find((x) => x.c.csaMm2 === input.overrideCsaMm2);
    limitedBy = 'override';
  } else {
    const firstDropOk = candidates.find((x) => x.dropV <= dropLimitV + 1e-9);
    chosen = candidates.find(
      (x) => x.dropV <= dropLimitV + 1e-9 && x.amp !== null && x.amp >= fuseRating - 1e-9,
    );
    if (chosen) {
      limitedBy =
        firstDropOk && firstDropOk.c.csaMm2 === chosen.c.csaMm2 && (chosen.amp ?? 0) >= fuseRating
          ? 'voltage-drop'
          : 'ampacity';
      // If the drop-limited size already satisfied ampacity it is drop-limited, otherwise ampacity-limited.
      const smallestAmpOk = candidates.find((x) => x.amp !== null && x.amp >= fuseRating - 1e-9);
      if (
        smallestAmpOk &&
        smallestAmpOk.c.csaMm2 === chosen.c.csaMm2 &&
        !(firstDropOk && firstDropOk.c.csaMm2 === chosen.c.csaMm2)
      ) {
        limitedBy = 'ampacity';
      }
    }
  }

  const minimumCsaForDropMm2 = minimumCsaForDrop(
    current,
    length,
    input.voltageV,
    input.maxDropPct,
    opts.conductorTempC,
  );
  const messages: string[] = [];

  if (!chosen) {
    const fuse = recommendFuse(tables, current, 0, input.voltageV, opts);
    messages.push(
      'No standard conductor size in the table satisfies both voltage drop and current capacity. Shorten the run, raise the system voltage or use parallel conductors.',
    );
    return {
      input,
      selectedCsaMm2: null,
      limitedBy: 'none',
      minimumCsaForDropMm2,
      ampacityA: null,
      dropV: 0,
      dropPct: 0,
      powerLossW: 0,
      fuse,
      ok: false,
      messages,
    };
  }

  const ampacityA = chosen.amp;
  const dropPct = input.voltageV > 0 ? (chosen.dropV / input.voltageV) * 100 : 0;
  const fuse = recommendFuse(tables, current, ampacityA ?? 0, input.voltageV, opts);
  let ok = fuse.ok && chosen.dropV <= dropLimitV + 1e-9;
  if (limitedBy === 'override') {
    if (chosen.dropV > dropLimitV + 1e-9)
      messages.push(
        `Voltage drop ${dropPct.toFixed(1)}% exceeds the ${input.maxDropPct}% limit for this circuit.`,
      );
    if (ampacityA !== null && ampacityA < current) {
      messages.push(
        `Design current ${current.toFixed(1)} A exceeds the cable's derated capacity of ${ampacityA.toFixed(0)} A — overheating risk.`,
      );
      ok = false;
    }
  }
  return {
    input,
    selectedCsaMm2: chosen.c.csaMm2,
    awg: chosen.c.awg,
    limitedBy,
    minimumCsaForDropMm2,
    ampacityA,
    dropV: chosen.dropV,
    dropPct,
    powerLossW: current * chosen.dropV,
    fuse,
    ok,
    messages,
  };
}
