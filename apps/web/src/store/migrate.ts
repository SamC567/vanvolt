/**
 * Validate and migrate design JSON (from localStorage or an imported file).
 * Missing fields are filled from a fresh default design so older files keep working.
 */
import { createDesign, deepClone, type Design } from '@vanvolt/engine';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fill<T>(defaults: T, value: unknown): T {
  if (!isObject(defaults) || !isObject(value)) return (value === undefined ? defaults : value) as T;
  const out: Record<string, unknown> = { ...value };
  for (const [k, dv] of Object.entries(defaults)) {
    if (!(k in value)) out[k] = deepClone(dv);
    else if (isObject(dv) && isObject(value[k])) out[k] = fill(dv, value[k]);
  }
  return out as T;
}

export class DesignImportError extends Error {}

export function migrateDesign(raw: unknown): Design {
  if (!isObject(raw)) throw new DesignImportError('File does not contain a VanVolt design object.');
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)
    throw new DesignImportError(`Unsupported design schema version: ${String(raw.schemaVersion)}.`);
  if (!Array.isArray(raw.appliances) || !isObject(raw.battery) || !isObject(raw.solar))
    throw new DesignImportError('File is missing required sections (appliances, battery, solar).');
  const defaults = createDesign();
  const d = fill(defaults, raw) as Design;
  d.schemaVersion = 1;
  if (typeof d.id !== 'string' || !d.id) d.id = defaults.id;
  if (typeof d.name !== 'string' || !d.name) d.name = 'Imported design';
  if (![12, 24, 48].includes(d.systemVoltage)) d.systemVoltage = 12;
  return d;
}
