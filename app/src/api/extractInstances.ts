/**
 * Output-first parse for the composable Extract render (analyze-and-chat-ux §1).
 *
 * STRUCTURE comes from the extraction OUTPUT tree (`getDocumentExtract`), walked
 * as-received — the server already reshaped it (statement scalars hoisted to
 * root, matched charges nested as `meters[].meter_charges`, unmatched charges in
 * a synthesized top-level `account_charges`). We do NOT reassemble and do NOT
 * derive structure from the (flat) workflow schema; the schema supplies
 * labels/types by field NAME at render time.
 *
 * A `{ value, confidence }` dict is unwrapped to `{ value, confidence }`
 * (the shipped confidence rule); a bare scalar → `{ value }` with no confidence.
 * The render hides any output key with no matching schema field.
 */

import type { ExtractionSchemaDef, SchemaFieldDef } from "@/types/scenarios";

export type FieldScalar = string | number | boolean | null;

export interface FieldInstanceValue {
  value: FieldScalar;
  confidence?: number;
  /** Human label + UI type, joined from the workflow schema BY FIELD NAME (§1.3). */
  label?: string;
  type?: SchemaFieldDef["type"];
}

/**
 * Flatten a workflow schema to a `fieldId → SchemaFieldDef` dictionary across ALL
 * groups. The output-first render joins each output field to its label/type by
 * this name (a charge `line_amount` under `meter_charges` or `account_charges`
 * resolves to the same def). Last group wins on the rare duplicate id.
 */
export function buildFieldDefLookup(
  schema: ExtractionSchemaDef | null | undefined,
): Map<string, SchemaFieldDef> {
  const lookup = new Map<string, SchemaFieldDef>();
  if (!schema) return lookup;
  for (const category of schema.categories) {
    for (const field of category.fields) lookup.set(field.id, field);
  }
  return lookup;
}

export interface GroupInstance {
  /** Scalar leaf fields on this object level, keyed by output field name. */
  fields: Record<string, FieldInstanceValue>;
  /** Array-valued children (nested groups), keyed by output key. Each is one
   *  GroupInstance per array element, recursing to unbounded depth. */
  groups: Record<string, GroupInstance[]>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True for a `{ value, confidence? }` extraction dict (vs a nested object). */
function isValueDict(v: Record<string, unknown>): boolean {
  return "value" in v && (typeof v.value !== "object" || v.value === null);
}

function toInstanceValue(raw: unknown, def?: SchemaFieldDef): FieldInstanceValue {
  const label = def ? { label: def.name, type: def.type } : {};
  if (isPlainObject(raw) && isValueDict(raw)) {
    const conf = raw.confidence;
    return {
      value: (raw.value as FieldScalar) ?? null,
      ...(typeof conf === "number" ? { confidence: conf } : {}),
      ...label,
    };
  }
  return { value: (raw as FieldScalar) ?? null, ...label };
}

/**
 * Walk one object level of the output into a GroupInstance. When `lookup` is
 * provided, scalar leaf keys with no matching schema field are HIDDEN (§1.3);
 * matched fields carry their label/type. Structure containers (arrays / nested
 * objects) are always walked — they are the tree, not schema leaf fields.
 */
function walkObject(
  obj: Record<string, unknown>,
  lookup?: Map<string, SchemaFieldDef>,
): GroupInstance {
  const fields: Record<string, FieldInstanceValue> = {};
  const groups: Record<string, GroupInstance[]> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      // An array of objects → a nested repeating group (one instance per element).
      // An array of scalars is rare in this shape; treat as a group of single-field
      // instances only when elements are objects, else skip (not a leaf field).
      const objs = val.filter(isPlainObject) as Record<string, unknown>[];
      if (objs.length === val.length && val.length > 0) {
        groups[key] = objs.map((o) => walkObject(o, lookup));
      } else if (val.length === 0) {
        groups[key] = []; // empty array group → renders as a tab at count 0
      }
      // (mixed/scalar arrays are not part of the extraction output shape)
    } else if (isPlainObject(val) && !isValueDict(val)) {
      // A nested single object → a one-instance group (rare; kept general).
      groups[key] = [walkObject(val, lookup)];
    } else {
      // Scalar leaf field. Hiding rule: with a schema, drop keys with no def.
      if (lookup && !lookup.has(key)) continue;
      fields[key] = toInstanceValue(val, lookup?.get(key));
    }
  }
  return { fields, groups };
}

/**
 * Parse the extraction output object into a recursive instance tree.
 * The returned `root` is the top-level object (statement scalars at root +
 * `meters`/`account_charges` groups). Returns an empty root for null input.
 *
 * With a workflow `schema`, each output field is joined to its schema field def
 * BY NAME for label/type, and scalar output keys with no matching schema field
 * are hidden (§1.3). Without one, every scalar key is kept (pure structural walk).
 */
export function extractToInstances(
  output: unknown,
  schema?: ExtractionSchemaDef | null,
): { root: GroupInstance } {
  if (!isPlainObject(output)) return { root: { fields: {}, groups: {} } };
  const lookup = schema ? buildFieldDefLookup(schema) : undefined;
  return { root: walkObject(output, lookup) };
}

/**
 * Build a DEGENERATE instance tree from a manifest schema + flat sample values
 * (the fixture fallback for scopes with no live document). The first category's
 * fields land at the root; each later category becomes a single-instance group
 * keyed by its id — reproducing the fixture's flat one-value-per-field shape
 * through the same recursive render the live path uses. Fields with no sample
 * value render as null (honest empty), and per-value confidence carries over.
 *
 * Fixture citations carry a PAGE but no bbox, so instead of geometry this path
 * emits a `pages` map (instance path → page): the render can still jump the
 * viewer to a field's source page, it just can't draw a box there.
 */
export function manifestToInstances(
  schema: ExtractionSchemaDef,
  values: ReadonlyArray<{
    fieldId: string;
    value: FieldScalar;
    confidence?: number;
    citations?: ReadonlyArray<{ page?: number | null }>;
  }>,
): { root: GroupInstance; pages: Map<string, number> } {
  const byId = new Map(values.map((v) => [v.fieldId, v]));
  const pages = new Map<string, number>();
  const fieldsOf = (
    cat: ExtractionSchemaDef["categories"][number],
    prefix: string,
  ): Record<string, FieldInstanceValue> => {
    const fields: Record<string, FieldInstanceValue> = {};
    for (const f of cat.fields) {
      const v = byId.get(f.id);
      fields[f.id] = {
        value: v?.value ?? null,
        ...(v?.confidence != null ? { confidence: v.confidence } : {}),
        label: f.name,
        type: f.type,
      };
      const page = v?.citations?.[0]?.page;
      if (typeof page === "number") pages.set(`${prefix}${f.id}`, page);
    }
    return fields;
  };
  const [first, ...rest] = schema.categories;
  const root: GroupInstance = {
    fields: first ? fieldsOf(first, "") : {},
    groups: Object.fromEntries(
      rest.map((cat) => [cat.id, [{ fields: fieldsOf(cat, `${cat.id}/0/`), groups: {} }]]),
    ),
  };
  return { root, pages };
}

/**
 * Project an instance tree to plain JSON for the workbench's JSON render mode:
 * scalar fields as values, array groups as arrays, recursing — i.e. the
 * schema-visible slice of the extraction output in its own shape.
 */
export function instancesToJson(root: GroupInstance): unknown {
  const out: Record<string, unknown> = {};
  for (const [fieldId, v] of Object.entries(root.fields)) out[fieldId] = v.value;
  for (const [key, instances] of Object.entries(root.groups)) {
    out[key] = instances.map((i) => instancesToJson(i));
  }
  return out;
}

/** One scalar field at a specific instance position in the output tree (§1.4). */
export interface InstanceFieldEntry extends FieldInstanceValue {
  /** Instance-path key: `bill_account_id` · `meters/0/usage_amount` ·
   *  `meters/0/meter_charges/2/line_amount`. Distinct per instance, so two
   *  meters' same field carry their own values/geometry. */
  path: string;
  /** The bare output field name — the join key for schema labels + geometry. */
  fieldId: string;
}

/**
 * Flatten an instance tree to one entry per (instance, field) with an
 * instance-path key (§1.4). Depth-first, fields before nested groups, so the
 * order matches the render's visual order.
 */
export function flattenInstanceFields(root: GroupInstance, prefix = ""): InstanceFieldEntry[] {
  const out: InstanceFieldEntry[] = [];
  for (const [fieldId, value] of Object.entries(root.fields)) {
    out.push({ ...value, path: `${prefix}${fieldId}`, fieldId });
  }
  for (const [groupKey, instances] of Object.entries(root.groups)) {
    instances.forEach((instance, idx) => {
      out.push(...flattenInstanceFields(instance, `${prefix}${groupKey}/${idx}/`));
    });
  }
  return out;
}
