/**
 * WF-12 — turn live GroundX workflow responses into the label dictionary the
 * Extract UI consumes (analyze-and-chat-ux: the render is OUTPUT-FIRST — see
 * `extractInstances.ts` for the structural walk; this module owns the schema
 * label join + the flat first-instance sample projection for the design
 * surface).
 *
 *   schema  ← `getGroundXWorkflow(filter.workflow_id)` → `workflowToSchema`
 *   samples ← instance entries (§1.4) → `entriesToFieldValues`
 *
 * Workflow shape (verified live 2026-05-29, workflow 9910308e):
 *   workflow.extract.<group>.fields.<id>.prompt =
 *     { description, identifiers?, instructions, type, format?, default? }
 * Groups are open-ended (§1.2) — every group yields a category, no allow-list.
 */

import { citationRegions, type Citation, type ExtractedFieldValue } from "@groundx/shared";

import type { InstanceFieldEntry } from "@/api/extractInstances";
import type { FieldRegion } from "@/api/fieldGeometry";
import type { ExtractionSchemaDef, SchemaCategoryDef, SchemaFieldDef } from "@/types/scenarios";

type Loose = Record<string, unknown>;

/**
 * The minimal, NAMED GroundX-workflow shape `workflowToSchema` reads — the
 * typed boundary that replaces the old `wf.workflow as unknown as
 * Record<string, unknown>` double-cast at the Extract widget's call site.
 *
 * The GroundX SDK `Workflow` (`api/entities/sdkTypes.ts`) is assignable to this
 * (a compile-time guard in `extractLiveData.test.ts` pins that), so
 * `getGroundXWorkflow(...).workflow` flows in with no cast. The `extract` group
 * map stays the loose `Metadata` leaf the API actually returns, so the runtime
 * `typeof` / `Array.isArray` defensive branches below are still load-bearing.
 */
export interface GroundXWorkflowDefinition {
  workflowId?: string;
  name?: string;
  extract?: Record<string, unknown>;
}

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
export function workflowToSchema(
  workflow: GroundXWorkflowDefinition | null | undefined,
): ExtractionSchemaDef | null {
  if (!workflow || typeof workflow !== "object") return null;
  const extract = (workflow.extract ?? null) as Loose | null;
  if (!extract || typeof extract !== "object") return null;

  // analyze-and-chat-ux §1.2 — iterate EVERY group in the workflow's extract
  // (not a fixed statement/meters/charges allow-list). The schema is a label
  // dictionary joined to the output BY NAME, so an arbitrary-named group must
  // yield its field defs too. Object key order preserves the workflow's own
  // group order (statement → meters → charges for the demo).
  const categories: SchemaCategoryDef[] = [];
  for (const [groupId, groupRaw] of Object.entries(extract)) {
    const group = groupRaw as Loose | undefined;
    if (!group || typeof group !== "object") continue;
    const fieldsObj = (group.fields ?? {}) as Loose;
    const fields: SchemaFieldDef[] = Object.entries(fieldsObj)
      .filter(([, f]) => f && typeof f === "object")
      .map(([id, f]) => fieldFromPrompt(id, ((f as Loose).prompt ?? {}) as Loose));
    if (fields.length) categories.push({ id: groupId, type: groupId, name: humanizeFieldId(groupId), fields });
  }
  if (!categories.length) return null;

  const workflowId = typeof workflow.workflowId === "string" ? workflow.workflowId : "workflow";
  const name = typeof workflow.name === "string" && workflow.name ? workflow.name : "Extraction";
  return { id: workflowId, name, categories };
}

export type ConfidenceBucket = "Low" | "Medium" | "High";

/** Bucket a 0–1 confidence into a Low/Medium/High band for display. */
export function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

/**
 * Project a field's citations to the `{ documentId, page }` shape the Extract
 * workbench's JSON render mode emits. Lifted out of the widget for the same
 * reason as {@link liveValuesToFieldValues}: the widget contract bans a raw
 * `documentId:` prop and a regex can't tell that from an object-literal key.
 */
export function citationsForJson(
  citations: ReadonlyArray<Citation> | undefined,
): Array<{ documentId: string; page: number | null }> {
  // multi-region: project to the citation's primary page (first region, or the
  // legacy alias); a regionless "location unknown" citation emits `page: null`.
  return (citations ?? []).map((c) => ({
    documentId: c.documentId,
    page: c.page ?? citationRegions(c)[0]?.page ?? null,
  }));
}

/**
 * Project instance-path entries (§1.4) to a flat FIRST-INSTANCE
 * `ExtractedFieldValue[]` for the schema-design surface — the label editor
 * shows one sample value per field def, so the first instance is its
 * semantic. Each sample carries its instance's X-Ray regions as one
 * multi-region `Citation` (chunk-level → `paraphrase`; legacy page/bbox alias
 * = region[0]). Lives in this `.ts` helper (not the widget `.tsx`) because the
 * widget contract bans raw `documentId:` literals in widget files.
 */
export function entriesToFieldValues(
  documentId: string,
  entries: ReadonlyArray<InstanceFieldEntry>,
  geometry: ReadonlyMap<string, FieldRegion[]>,
): ExtractedFieldValue[] {
  const seen = new Map<string, ExtractedFieldValue>();
  for (const entry of entries) {
    if (seen.has(entry.fieldId)) continue;
    const regions = geometry.get(entry.path) ?? [];
    const citations: Citation[] = regions.length
      ? [
          {
            documentId,
            page: regions[0].page,
            bbox: regions[0].bbox,
            tier: "paraphrase",
            regions: regions.map((r) => ({ page: r.page, bbox: r.bbox, tier: "paraphrase" as const })),
          },
        ]
      : [];
    seen.set(entry.fieldId, {
      fieldId: entry.fieldId,
      value: entry.value,
      citations,
      ...(entry.confidence != null ? { confidence: entry.confidence } : {}),
    });
  }
  return Array.from(seen.values());
}
