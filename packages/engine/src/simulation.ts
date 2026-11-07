/**
 * Hourly state-of-charge simulation.
 *
 * Solar: the month's daily energy is spread over daylight hours with a half-sine profile.
 * Day length comes from solar declination (Cooper's equation) and the location latitude:
 *   δ = 23.45° · sin(360/365 · (284 + n))
 *   day length (h) = (2/15) · acos(−tan φ · tan δ)
 * Loads: each appliance's daily energy is spread evenly across its usage window.
 * Alternator / shore: deliver their rated current while active.
 *
 * Each hour, charging sources first supply the loads directly; any surplus charges the
 * battery (× charge efficiency, limited by the battery's charge current and taper); any
 * deficit is drawn from the battery down to the depth-of-discharge floor, beyond which
 * the load is recorded as unmet.
 */
import type { Appliance, UsageProfile } from './types';
import { clamp, midMonthDayOfYear, pct, safe } from './units';

export const PROFILE_WINDOWS: Record<UsageProfile, [number, number]> = {
  allday: [0, 24],
  morning: [6, 10],
  daytime: [10, 17],
  evening: [17, 23],
  night: [22, 30], // 22:00 → 06:00 next day
};

export function declinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
}

/** Day length in hours for a latitude and day of year (0 polar night, 24 polar day). */
export function dayLengthHours(latDeg: number, dayOfYear: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const delta = (declinationDeg(dayOfYear) * Math.PI) / 180;
  const x = -Math.tan(phi) * Math.tan(delta);
  if (x >= 1) return 0;
  if (x <= -1) return 24;
  return (2 / 15) * ((Math.acos(x) * 180) / Math.PI);
}

/** Fraction of daily solar energy in each hour (24 values summing to 1, or all 0). */
export function solarHourlyProfile(latDeg: number, month: number): number[] {
  const len = dayLengthHours(latDeg, midMonthDayOfYear(month));
  const out = new Array<number>(24).fill(0);
  if (len <= 0) return out;
  const sunrise = 12 - len / 2;
  const steps = 12;
  let total = 0;
  for (let h = 0; h < 24; h++) {
    let acc = 0;
    for (let s = 0; s < steps; s++) {
      const t = h + (s + 0.5) / steps;
      const x = (t - sunrise) / len;
      if (x > 0 && x < 1) acc += Math.sin(Math.PI * x);
    }
    out[h] = acc;
    total += acc;
  }
  return total > 0 ? out.map((v) => v / total) : out;
}

/** Fraction of an appliance's daily energy in each hour for a usage profile. */
export function usageHourlyProfile(profile: UsageProfile): number[] {
  const [start, end] = PROFILE_WINDOWS[profile];
  const out = new Array<number>(24).fill(0);
  const span = end - start;
  for (let h = start; h < end; h++) out[h % 24] = (out[h % 24] ?? 0) + 1 / span;
  return out;
}

/** Hours [start, start+duration) as a 24-value fraction-of-hour array (wraps midnight). */
export function windowMask(startHour: number, durationHours: number): number[] {
  const out = new Array<number>(24).fill(0);
  let remaining = clamp(durationHours, 0, 24);
  let h = Math.floor(clamp(startHour, 0, 23));
  while (remaining > 0) {
    const f = Math.min(1, remaining);
    out[h % 24] = f;
    remaining -= f;
    h++;
  }
  return out;
}

export interface SimulationInputs {
  appliances: readonly Appliance[];
  /** Inverter average efficiency (%) for AC loads, 100 if no inverter. */
  inverterEfficiencyPct: number;
  inverterIdleW: number;
  inverterOnHoursPerDay: number;
  hasAcLoads: boolean;
  /** Daily solar energy at the battery terminals for the month (Wh). */
  solarWhPerDay: number;
  latitude: number;
  month: number;
  days: number;
  startSocPct: number;
  /** Battery nominal energy (Wh) and usable fraction. */
  nominalWh: number;
  dodPct: number;
  chargeEfficiencyPct: number;
  /** Max battery charge power (W). */
  maxChargeW: number;
  taperStartSoc: number;
  alternator: { enabled: boolean; powerW: number; hoursPerDay: number; daysPerWeek: number; startHour: number };
  shore: { enabled: boolean; powerW: number; hoursPerDay: number; daysPerWeek: number; startHour: number };
}

export interface SimulationStep {
  hour: number; // hours since start
  day: number;
  hourOfDay: number;
  socPct: number;
  solarW: number;
  alternatorW: number;
  shoreW: number;
  loadW: number;
  /** Load supplied through the inverter, incl. conversion loss and idle (W, DC side). */
  acLoadW: number;
  /** Direct DC load (W). */
  dcLoadW: number;
  /** Positive = charging, negative = discharging (W at battery). */
  batteryW: number;
  unmetWh: number;
  curtailedWh: number;
}

export interface SimulationResult {
  steps: SimulationStep[];
  minSocPct: number;
  endSocPct: number;
  totalLoadWh: number;
  totalUnmetWh: number;
  totalCurtailedWh: number;
  totalChargeWh: number;
  /** Hours in which some load could not be supplied. */
  hoursWithShortfall: number;
  /** First hour at which the battery hit its DoD floor, or null. */
  firstEmptyHour: number | null;
}

/** Charge acceptance fraction at a state of charge (simple linear taper). */
export function chargeAcceptance(soc: number, taperStartSoc: number): number {
  if (soc < taperStartSoc) return 1;
  if (soc >= 1) return 0;
  const t = (soc - taperStartSoc) / (1 - taperStartSoc);
  return Math.max(0.05, 1 - t * 0.95);
}

function activeDay(day: number, daysPerWeek: number): boolean {
  return day % 7 < clamp(Math.round(daysPerWeek), 0, 7);
}

export function simulate(input: SimulationInputs): SimulationResult {
  const eff = input.inverterEfficiencyPct > 0 ? pct(input.inverterEfficiencyPct) : 1;
  const chargeEff = pct(input.chargeEfficiencyPct);
  const solarProfile = solarHourlyProfile(input.latitude, input.month);
  const capacity = safe(input.nominalWh);
  const floorWh = capacity * (1 - pct(input.dodPct));
  let energy = capacity * pct(input.startSocPct);
  energy = Math.max(energy, floorWh);

  // Pre-compute hourly load (W) for a use-day and non-use day per appliance.
  const appliances = input.appliances.filter((a) => a.enabled);
  const loadProfiles = appliances.map((a) => {
    const qty = Math.max(0, Math.floor(safe(a.quantity)));
    const hours = clamp(safe(a.hoursPerDay), 0, 24);
    const onWh = safe(a.powerW) * hours * pct(safe(a.dutyCyclePct, 100)) * qty;
    const standbyWh = safe(a.standbyW) * (24 - hours) * qty;
    const factor = a.supply === 'ac' ? 1 / eff : 1;
    const profile = usageHourlyProfile(a.profile);
    return {
      a,
      useDay: profile.map((p) => (onWh * p + standbyWh / 24) * factor),
      offDay: new Array<number>(24).fill(((safe(a.standbyW) * 24 * qty) / 24) * factor),
    };
  });
  const idleW = input.hasAcLoads ? safe(input.inverterIdleW) * (clamp(input.inverterOnHoursPerDay, 0, 24) / 24) : 0;
  const altMask = windowMask(input.alternator.startHour, input.alternator.hoursPerDay);
  const shoreMask = windowMask(input.shore.startHour, input.shore.hoursPerDay);

  const steps: SimulationStep[] = [];
  let minSoc = capacity > 0 ? (energy / capacity) * 100 : 0;
  let totalLoad = 0;
  let totalUnmet = 0;
  let totalCurtailed = 0;
  let totalCharge = 0;
  let shortfallHours = 0;
  let firstEmpty: number | null = null;
  const days = Math.max(1, Math.floor(input.days));

  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      let acLoadW = idleW;
      let dcLoadW = 0;
      for (const lp of loadProfiles) {
        const w = activeDay(d, lp.a.daysPerWeek) ? lp.useDay[h]! : lp.offDay[h]!;
        if (lp.a.supply === 'ac') acLoadW += w;
        else dcLoadW += w;
      }
      const loadW = acLoadW + dcLoadW;
      const solarW = safe(input.solarWhPerDay) * (solarProfile[h] ?? 0);
      const altW =
        input.alternator.enabled && activeDay(d, input.alternator.daysPerWeek)
          ? input.alternator.powerW * (altMask[h] ?? 0)
          : 0;
      const shoreW =
        input.shore.enabled && activeDay(d, input.shore.daysPerWeek) ? input.shore.powerW * (shoreMask[h] ?? 0) : 0;

      const supply = solarW + altW + shoreW;
      let batteryW = 0;
      let unmet = 0;
      let curtailed = 0;
      if (supply >= loadW) {
        const surplus = supply - loadW;
        const soc = capacity > 0 ? energy / capacity : 1;
        const maxIn = input.maxChargeW * chargeAcceptance(soc, input.taperStartSoc);
        const headroomWh = capacity - energy;
        const accepted = Math.min(surplus, maxIn, chargeEff > 0 ? headroomWh / chargeEff : 0);
        energy += accepted * chargeEff;
        batteryW = accepted;
        totalCharge += accepted;
        // Only solar is "wasted"; alternator/shore simply deliver less.
        curtailed = Math.min(solarW, Math.max(0, surplus - accepted));
      } else {
        const deficit = loadW - supply;
        const available = Math.max(0, energy - floorWh);
        const drawn = Math.min(deficit, available);
        energy -= drawn;
        batteryW = -drawn;
        unmet = deficit - drawn;
        if (unmet > 1e-6) {
          shortfallHours++;
          if (firstEmpty === null) firstEmpty = d * 24 + h;
        }
      }
      totalLoad += loadW;
      totalUnmet += unmet;
      totalCurtailed += curtailed;
      const socPct = capacity > 0 ? (energy / capacity) * 100 : 0;
      minSoc = Math.min(minSoc, socPct);
      steps.push({
        hour: d * 24 + h,
        day: d,
        hourOfDay: h,
        socPct,
        solarW,
        alternatorW: altW,
        shoreW,
        loadW,
        acLoadW,
        dcLoadW,
        batteryW,
        unmetWh: unmet,
        curtailedWh: curtailed,
      });
    }
  }

  return {
    steps,
    minSocPct: minSoc,
    endSocPct: capacity > 0 ? (energy / capacity) * 100 : 0,
    totalLoadWh: totalLoad,
    totalUnmetWh: totalUnmet,
    totalCurtailedWh: totalCurtailed,
    totalChargeWh: totalCharge,
    hoursWithShortfall: shortfallHours,
    firstEmptyHour: firstEmpty,
  };
}
