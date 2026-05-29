/**
 * WF-12 — turn live GroundX workflow + extract responses into the shapes the
 * F3 Extract UI consumes, replacing the scenario-manifest fixtures.
 *
 *   schema  ← `getGroundXWorkflow(filter.workflow_id)` → `workflowToSchema`
 *   values  ← `getGroundXDocumentExtract(documentId)`  → `extractToValues`
 *
 * Workflow shape (verified live 2026-05-29, workflow 9910308e):
 *   workflow.extract.{statement|meters|charges}.fields.<id>.prompt =
 *     { description, identifiers?, instructions, type, format?, default? }
 * The three group keys map 1:1 to `SchemaCategoryDef.type`.
 */

import type { ExtractionSchemaDef, SchemaCategoryDef, SchemaFieldDef } from "@/types/scenarios";

type Loose = Record<string, unknown>;

const CATEGORY_ORDER: SchemaCategoryDef["type"][] = ["statement", "meters", "charges"];

/** snake_case field id → sentence-case label ("amount_due" → "Amount due"). */
export function humanizeFieldId(id: string): string {
  const spaced = id.replace(/_/g, " ").trim();
  if (!spaced) return id;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Map a workflow field `type` (e.g. "str", ["int","float"]) to the UI's 4 types. */
export function mapFieldType(raw: unknown): SchemaFieldDef["type"] {
  const tokens = (Array.isArray(raw) ? raw : [raw])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());
  if (tokens.some((t) => ["int", "integer", "float", "double", "number", "decimal"].includes(t))) return "NUMBER";
  if (tokens.some((t) => ["date", "datetime", "time"].includes(t))) return "DATE";
  if (tokens.some((t) => ["bool", "boolean"].includes(t))) return "BOOLEAN";
  return "STRING";
}

function fieldFromPrompt(id: string, prompt: Loose): SchemaFieldDef {
  const instructions =
    typeof prompt.instructions === "string"
      ? prompt.instructions
          .split("\n")
          .map((s) => s.trim().replace(/^[-*•]\s+/, "")) // strip leading markdown bullet
          .filter(Boolean)
      : undefined;
  return {
    id,
    name: humanizeFieldId(id),
    type: mapFieldType(prompt.type),
    description: typeof prompt.description === "string" ? prompt.description : "",
    identifiers: Array.isArray(prompt.identifiers)
      ? prompt.identifiers.filter((s): s is string => typeof s === "string")
      : undefined,
    instructions: instructions && instructions.length ? instructions : undefined,
    format: typeof prompt.format === "string" ? prompt.format : undefined,
  };
}

/**
 * Transform a live workflow's `extract` into the UI `ExtractionSchemaDef`.
 * Defensive: tolerates missing groups/fields (the API type is loose `Metadata`).
 */
export function workflowToSchema(workflow: Loose | null | undefined): ExtractionSchemaDef | null {
  if (!workflow || typeof workflow !== "object") return null;
  const extract = (workflow.extract ?? null) as Loose | null;
  if (!extract || typeof extract !== "object") return null;

  const categories: SchemaCategoryDef[] = [];
  for (const type of CATEGORY_ORDER) {
    const group = extract[type] as Loose | undefined;
    if (!group || typeof group !== "object") continue;
    const fieldsObj = (group.fields ?? {}) as Loose;
    const fields: SchemaFieldDef[] = Object.entries(fieldsObj)
      .filter(([, f]) => f && typeof f === "object")
      .map(([id, f]) => fieldFromPrompt(id, ((f as Loose).prompt ?? {}) as Loose));
    if (fields.length) categories.push({ id: type, type, name: humanizeFieldId(type), fields });
  }
  if (!categories.length) return null;

  const workflowId = typeof workflow.workflowId === "string" ? workflow.workflowId : "workflow";
  const name = typeof workflow.name === "string" && workflow.name ? workflow.name : "Extraction";
  return { id: workflowId, name, categories };
}

/**
 * Map a live `getDocumentExtract` response to `{ fieldId → value }`.
 * Statement fields are top-level keys; meters/charges are arrays — for the
 * single-value UI we surface the first element's value (multi-row rendering
 * is a follow-up). Returns a plain object keyed by field id.
 */
export function extractToValues(
  extract: Loose | null | undefined,
  schema: ExtractionSchemaDef | null,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!extract || typeof extract !== "object" || !schema) return out;

  const firstArrObj = (obj: Loose | undefined, key: string): Loose | undefined => {
    if (!obj) return undefined;
    const arr = obj[key];
    return Array.isArray(arr) && arr[0] && typeof arr[0] === "object" ? (arr[0] as Loose) : undefined;
  };
  const meter0 = firstArrObj(extract, "meters");
  const charge0 = firstArrObj(extract, "charges") ?? firstArrObj(meter0, "meter_charges");

  const scalar = (v: unknown): string | number | boolean | null =>
    v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? (v ?? null) : null;

  for (const cat of schema.categories) {
    const source: Loose | undefined =
      cat.type === "statement" ? extract : cat.type === "meters" ? meter0 : charge0;
    if (!source) continue;
    for (const field of cat.fields) {
      if (field.id in source) out[field.id] = scalar(source[field.id]);
    }
  }
  return out;
}
