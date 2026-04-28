/**
 * Helpers sûrs pour les paths JSON IA.
 *
 * Supporte la dot-notation avec index de tableau :
 * `heating.installations[0].type_value` → ["heating", "installations", "0", "type_value"].
 */

import { v4 as uuidv4 } from "uuid";
import { emptyField } from "@/shared/types/json-state.field";

type JsonObject = Record<string, unknown>;

export function parseJsonPath(path: string): string[] {
  const segments: string[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(path)) !== null) {
    const segment = match[1] ?? match[2];
    if (segment) segments.push(segment);
  }

  return segments;
}

export function walkJsonPath(
  root: JsonObject,
  path: string | string[],
): { parent: JsonObject | null; key: string | null } {
  const segments = Array.isArray(path) ? path : parseJsonPath(path);
  if (segments.length < 2) return { parent: null, key: null };

  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (!cur || typeof cur !== "object") return { parent: null, key: null };
    cur = (cur as JsonObject)[segments[i]!];
  }

  if (!cur || typeof cur !== "object") return { parent: null, key: null };
  return { parent: cur as JsonObject, key: segments[segments.length - 1]! };
}

export function ensureKnownPatchTarget(
  root: JsonObject,
  path: string | string[],
): boolean {
  const segments = Array.isArray(path) ? path : parseJsonPath(path);
  if (segments.length < 4 || segments[1] !== "installations") return true;

  const sectionKey = segments[0]!;
  const index = Number(segments[2]);
  const fieldKey = segments[3]!;
  const build = INSTALLATION_BUILDERS[sectionKey];
  if (!build || !Number.isInteger(index) || index < 0) return false;

  const section = root[sectionKey];
  if (!section || typeof section !== "object") return false;
  const sectionObject = section as JsonObject;
  if (sectionObject.installations === undefined) sectionObject.installations = [];
  const list = sectionObject.installations;
  if (!Array.isArray(list) || index > list.length) return false;

  const skeleton = build();
  if (!Object.prototype.hasOwnProperty.call(skeleton, fieldKey)) return false;

  if (index === list.length) {
    list.push(skeleton);
    return true;
  }

  const item = list[index];
  if (!item || typeof item !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(item, fieldKey)) {
    (item as JsonObject)[fieldKey] = skeleton[fieldKey];
  }
  return true;
}

const INSTALLATION_BUILDERS: Record<string, () => JsonObject> = {
  heating: () => ({
    id: uuidv4(),
    type_value: emptyField<string>(),
    type_other: emptyField<string>(),
    fuel_value: emptyField<string>(),
    fuel_other: emptyField<string>(),
    brand: emptyField<string>(),
    power_kw: emptyField<number>(),
    installation_year: emptyField<number>(),
    efficiency_pct: emptyField<number>(),
    custom_fields: [],
  }),
  ecs: () => ({
    id: uuidv4(),
    type_value: emptyField<string>(),
    type_other: emptyField<string>(),
    fuel_value: emptyField<string>(),
    fuel_other: emptyField<string>(),
    brand: emptyField<string>(),
    capacity_l: emptyField<number>(),
    installation_year: emptyField<number>(),
    custom_fields: [],
  }),
  ventilation: () => ({
    id: uuidv4(),
    type_value: emptyField<string>(),
    type_other: emptyField<string>(),
    brand: emptyField<string>(),
    installation_year: emptyField<number>(),
    flow_rate_m3_h: emptyField<number>(),
    custom_fields: [],
  }),
};