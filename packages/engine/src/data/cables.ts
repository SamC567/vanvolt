/**
 * Cable and fuse reference data.
 *
 * - Conductor resistance: IEC 60228 Class 5 (flexible) plain annealed copper, max DC
 *   resistance at 20 °C. Read from Bayka's reproduction of EN 60228.
 * - Ampacity: ISO 10133:2000 Table A.1 (small craft, extra-low-voltage DC installations),
 *   single conductors at 30 °C ambient. Read from the document.
 * - Grouping (bundling) factors: ABYC E-11 as reproduced by Blue Sea Systems (secondary).
 * - Fuse families: manufacturer data (secondary — manufacturer sites block automated access).
 */
import type {
  AmpacityTable,
  CableTables,
  ConductorSpec,
  FuseFamily,
  GroupingFactor,
} from '../cables';
import type { SourceRef } from '../types';

export const IEC60228_SOURCE: SourceRef = {
  title: 'Bayka — Conductor resistance (EN/IEC 60228, Class 5, plain copper)',
  url: 'https://www.bayka.de/en/service/technical-information/conductor-resistance/',
  publisher: 'Bayerische Kabelwerke AG',
  accessed: '2026-11-07',
  verification: 'document',
};

export const ISO10133_SOURCE: SourceRef = {
  title:
    'ISO 10133:2000 Small craft — Electrical systems — Extra-low-voltage d.c. installations, Table A.1',
  url: 'https://www.iso.org/search.html?q=ISO%2010133',
  publisher: 'ISO',
  accessed: '2026-11-07',
  verification: 'document',
  note: 'Values read from a copy of the 2000 edition. The standard has since been revised; check the current edition for compliance work.',
};

export const VICTRON_CABLE_SOURCE: SourceRef = {
  title: 'Victron Energy — Recommended battery cables (max current for 0.259 V drop)',
  url: 'https://www.victronenergy.com/upload/documents/BatteryCables.pdf',
  publisher: 'Victron Energy',
  accessed: '2026-11-07',
  verification: 'document',
};

export const VICTRON_WIRING_UNLIMITED: SourceRef = {
  title: 'Victron Energy — Wiring Unlimited (theory: aim for ≤ 2.5 % voltage drop)',
  url: 'https://www.victronenergy.com/media/pg/The_Wiring_Unlimited_book/en/theory.html',
  publisher: 'Victron Energy',
  accessed: '2026-11-07',
  verification: 'secondary',
};

export const ABYC_VOLTAGE_DROP: SourceRef = {
  title: 'ABYC — What is voltage drop? (3 % critical / 10 % non-critical circuits, E-11)',
  url: 'https://abycinc.org/what-is-voltage-drop/',
  publisher: 'American Boat & Yacht Council',
  accessed: '2026-11-07',
  verification: 'secondary',
};

/** IEC 60228 Class 5 plain copper, max resistance at 20 °C (Ω/km). */
export const CONDUCTORS: ConductorSpec[] = [
  { csaMm2: 0.75, resistanceOhmPerKm: 26.0, awg: '18' },
  { csaMm2: 1, resistanceOhmPerKm: 19.5, awg: '17' },
  { csaMm2: 1.5, resistanceOhmPerKm: 13.3, awg: '16' },
  { csaMm2: 2.5, resistanceOhmPerKm: 7.98, awg: '14' },
  { csaMm2: 4, resistanceOhmPerKm: 4.95, awg: '12' },
  { csaMm2: 6, resistanceOhmPerKm: 3.3, awg: '10' },
  { csaMm2: 10, resistanceOhmPerKm: 1.91, awg: '8' },
  { csaMm2: 16, resistanceOhmPerKm: 1.21, awg: '6' },
  { csaMm2: 25, resistanceOhmPerKm: 0.78, awg: '4' },
  { csaMm2: 35, resistanceOhmPerKm: 0.554, awg: '2' },
  { csaMm2: 50, resistanceOhmPerKm: 0.386, awg: '1/0' },
  { csaMm2: 70, resistanceOhmPerKm: 0.272, awg: '2/0' },
  { csaMm2: 95, resistanceOhmPerKm: 0.206, awg: '3/0' },
  { csaMm2: 120, resistanceOhmPerKm: 0.161, awg: '4/0' },
];

function isoColumn(id: string, insulationRatingC: number, values: number[]): AmpacityTable {
  const sizes = [0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
  const map: Record<string, number> = {};
  sizes.forEach((s, i) => {
    map[String(s)] = values[i]!;
  });
  return {
    id,
    label: `ISO 10133 — ${insulationRatingC === 90 ? '85–90' : insulationRatingC} °C insulation`,
    insulationRatingC,
    referenceAmbientC: 30,
    condition: 'Single conductor, 30 °C ambient',
    values: map,
    source: ISO10133_SOURCE,
  };
}

/** ISO 10133:2000 Table A.1, columns by insulation temperature rating (A). */
export const AMPACITY_TABLES: AmpacityTable[] = [
  isoColumn('iso10133-70', 70, [10, 14, 18, 25, 35, 45, 65, 90, 120, 160, 210, 265, 310, 360]),
  isoColumn('iso10133-90', 90, [12, 18, 21, 30, 40, 50, 70, 100, 140, 185, 230, 285, 330, 400]),
  isoColumn('iso10133-105', 105, [16, 20, 25, 35, 45, 60, 90, 130, 170, 210, 270, 330, 390, 450]),
  isoColumn('iso10133-125', 125, [20, 25, 30, 40, 50, 70, 100, 150, 185, 225, 300, 360, 410, 480]),
];

/**
 * ISO 10133 derating at 60 °C ambient (engine rooms) by insulation rating. VanVolt
 * interpolates linearly between 1.0 at 30 °C and these factors at 60 °C.
 */
export const ISO10133_60C_FACTORS: Record<number, number> = {
  70: 0.75,
  90: 0.82,
  105: 0.86,
  125: 0.89,
};

/** Bundling factors (ABYC E-11 via Blue Sea Systems; secondary). */
export const GROUPING_FACTORS: GroupingFactor[] = [
  { count: 1, factor: 1 },
  { count: 2, factor: 0.7 },
  { count: 4, factor: 0.6 },
  { count: 7, factor: 0.5 },
  { count: 25, factor: 0.4 },
];

export const GROUPING_SOURCE: SourceRef = {
  title: 'Blue Sea Systems — ABYC ampacity rating table (bundling derating)',
  url: 'https://assets.bluesea.com/files/resources/reference/21731.pdf',
  publisher: 'Blue Sea Systems',
  accessed: '2026-11-07',
  verification: 'secondary',
  note: 'Up to 3 conductors ×0.70, 4–6 ×0.60, 7–24 ×0.50, 25+ ×0.40 relative to a single conductor in free air.',
};

const LITTELFUSE = (title: string, url: string): SourceRef => ({
  title,
  url,
  publisher: 'Littelfuse',
  accessed: '2026-11-07',
  verification: 'secondary',
});

export const FUSE_FAMILIES: FuseFamily[] = [
  {
    id: 'ato',
    name: 'Blade fuse (ATO/ATC)',
    minA: 1,
    maxA: 40,
    maxVoltageDc: 32,
    interruptRatingA: 1000,
    interruptNote: 'at 32 V DC',
    ratings: [1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 35, 40],
    highInterrupt: false,
    source: LITTELFUSE(
      'Littelfuse ATO fuse datasheet',
      'https://www.littelfuse.com/assetdocs/littelfuse-datasheet-ato?assetguid=bba6ed2a-96e5-4b07-ab5d-0e8d267c0bd1',
    ),
  },
  {
    id: 'maxi',
    name: 'MAXI blade fuse',
    minA: 20,
    maxA: 80,
    maxVoltageDc: 32,
    interruptRatingA: 1000,
    interruptNote: 'at 32 V DC',
    ratings: [20, 25, 30, 35, 40, 50, 60, 70, 80],
    highInterrupt: false,
    source: LITTELFUSE(
      'Littelfuse MAXI 32V datasheet',
      'https://www.littelfuse.com/assetdocs/littelfuse-datasheet-299-maxi32v?assetguid=68b8bbe8-3e51-4c7b-bbda-3c71667f75f3',
    ),
  },
  {
    id: 'midi',
    name: 'MIDI bolt-down fuse',
    minA: 30,
    maxA: 200,
    maxVoltageDc: 32,
    interruptRatingA: 2000,
    interruptNote: 'at 32 V DC (150–200 A for short-circuit protection only)',
    ratings: [30, 40, 50, 60, 70, 80, 100, 125, 150, 175, 200],
    highInterrupt: false,
    source: LITTELFUSE(
      'Littelfuse MIDI 32V bolt-down datasheet',
      'https://www.littelfuse.com/assetdocs/midi-32v-bolt-down-series-data-sheet?assetguid=b55e8034-180d-40f6-a0a7-bebc2d4a94f5',
    ),
  },
  {
    id: 'mega',
    name: 'MEGA bolt-down fuse',
    minA: 40,
    maxA: 500,
    maxVoltageDc: 32,
    interruptRatingA: 2000,
    interruptNote: 'at 32 V DC (300–500 A for short-circuit protection only)',
    ratings: [40, 60, 80, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500],
    highInterrupt: false,
    source: LITTELFUSE(
      'Littelfuse MEGA 32V datasheet',
      'https://www.littelfuse.com/assetdocs/littelfuse-datasheet-mega-32v?assetguid=9fe0cd60-17bf-4fd7-b18d-977d32179af9',
    ),
  },
  {
    id: 'mrbf',
    name: 'MRBF terminal fuse',
    minA: 50,
    maxA: 300,
    maxVoltageDc: 58,
    interruptRatingA: 10000,
    interruptNote: '10 kA at 14 V DC, 5 kA at 32 V DC, 2 kA at 58 V DC',
    ratings: [50, 90, 100, 125, 150, 200, 250, 300],
    highInterrupt: true,
    source: {
      title: 'Blue Sea Systems — MRBF terminal fuse',
      url: 'https://www.bluesea.com/products/5187/MRBF_Terminal_Fuse_-_200A',
      publisher: 'Blue Sea Systems',
      accessed: '2026-11-07',
      verification: 'secondary',
      note: 'Only ratings seen on manufacturer pages are listed.',
    },
  },
  {
    id: 'class-t',
    name: 'Class T fuse',
    minA: 150,
    maxA: 400,
    maxVoltageDc: 125,
    interruptRatingA: 20000,
    interruptNote: '20 kA at 125 V DC',
    ratings: [150, 200, 225, 300, 350, 400],
    highInterrupt: true,
    source: {
      title: 'Blue Sea Systems — Class T fuses',
      url: 'https://www.bluesea.com/products/category/15/47/Fuses/Class_T_Fuses',
      publisher: 'Blue Sea Systems',
      accessed: '2026-11-07',
      verification: 'secondary',
      note: 'Only ratings seen on manufacturer pages are listed; other ratings exist.',
    },
  },
];

export const CABLE_TABLES: CableTables = {
  conductors: CONDUCTORS,
  ampacity: AMPACITY_TABLES,
  grouping: GROUPING_FACTORS,
  ambient60Factors: ISO10133_60C_FACTORS,
  conduitFactor: 1,
  fuses: FUSE_FAMILIES,
};

/** Default maximum voltage drop by circuit role (%). */
export const DEFAULT_MAX_DROP_PCT = {
  /** Victron: aim for ≤ 2.5 %. Used for battery, inverter and charger cables. */
  main: 2.5,
  /** ABYC critical circuits. */
  critical: 3,
  /** ABYC non-critical circuits. */
  nonCritical: 10,
} as const;
