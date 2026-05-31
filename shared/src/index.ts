/**
 * @groundx/shared — the single source of truth for contracts that cross the
 * app ↔ middleware boundary. Type-only + Zod schemas (isomorphic: runs in the
 * browser via Vite and in Node via the middleware). NO Node- or browser-only
 * code may live here.
 *
 * Why this exists: the same wire concepts (Citation, scope, the chat
 * envelopes) were declared independently on each side and drifted. Define
 * them ONCE here; both packages import them. The schema is authoritative —
 * types are derived via `z.infer` so a schema change can't desync the type.
 *
 * Wave B1 seeds this with the Citation contract (the highest-leverage:
 * Citation was declared 5× and the citations hydration boundary shipped
 * `unknown[]` to the typed client unvalidated). Increment 3 adds the unified
 * `ContentScope` + composable `ScopeFilter` (was app `ContentScope` vs
 * middleware `RagContentScope`, diverged on discriminant + filter). The chat
 * envelopes follow in later B1 increments.
 */

import { z } from "zod";

/**
 * WF-06b — graduated source-attribution precision.
 *   exact      verified verbatim quote + atom box → word-level highlight
 *   paraphrase verified quote → chunk-region highlight (translucent)
 *   ambient    unverified / retrieved-only → source chip, no inline span
 */
export const citationTierSchema = z.enum(["exact", "paraphrase", "ambient"]);
export type CitationTier = z.infer<typeof citationTierSchema>;

/** Normalized 0-1 page-relative bounding box for a PDF highlight. */
export const normalizedBboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type NormalizedBbox = z.infer<typeof normalizedBboxSchema>;

/**
 * A source citation attached to an answer/field. The single canonical shape
 * across the app, the middleware wire, and the persisted `citations_json`.
 */
export const citationSchema = z.object({
  /** Source document id. */
  documentId: z.string(),
  /** 1-indexed page number. */
  page: z.number(),
  /** Source region on the page (normalized 0-1). */
  bbox: normalizedBboxSchema.optional(),
  /** Snippet text shown in the peek/tooltip. */
  snippet: z.string().optional(),
  /** Confidence [0,1] from the quote-verification gate. */
  confidence: z.number().optional(),
  /** Attribution tier driving highlight precision. */
  tier: citationTierSchema.optional(),
  /** WF-06 Bridge B — the claim in the answer this citation supports. */
  answerSpan: z.string().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

/**
 * Sanitize an untrusted value (e.g. a JSON column read back from the DB, or a
 * wire payload) into a typed `Citation[]`. Each element is validated
 * independently — malformed entries are dropped rather than failing the whole
 * batch, and unknown keys are stripped. Replaces the unvalidated
 * `as unknown[]` hydration projection.
 */
export function parseCitations(input: unknown): Citation[] {
  if (!Array.isArray(input)) return [];
  const out: Citation[] = [];
  for (const item of input) {
    const parsed = citationSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// ContentScope — what set of documents an extraction / chat / report call
// applies to. One shape across the app↔middleware boundary.
// ──────────────────────────────────────────────────────────────────────

/**
 * A composable metadata filter over GroundX document **filter-fields**
 * (project / portfolio / fund / folder / …). Each entry is `fieldName →
 * value(s)`. Optional on EVERY `ContentScope` shape — there is no mandatory
 * filter and no forbidden shape.
 *
 * Vocabulary lock (WF-07): `bucket == workspace`; a product project / portfolio
 * / fund / folder is a **filter-field on documents within a bucket**, NOT a
 * GroundX group. (A group is reserved for cross-bucket search.) The demos all
 * live in one bucket and are distinguished by a `projectId` filter — never a
 * bucket query with no filter.
 *
 * Compilation (see `compileScopeFilter`): a single value → `{field: v}`,
 * multiple → `{field: {$in: [...]}}`, multiple fields → `$and` of each.
 */
export const scopeFilterSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);
export type ScopeFilter = z.infer<typeof scopeFilterSchema>;

/**
 * The set of documents a call targets. Discriminated on `type`:
 *   bucket    — a single bucket (== one workspace), optionally `filter`ed.
 *   group     — a pre-created group of buckets (cross-bucket search).
 *   documents — an explicit list of documentIds.
 * Every shape carries an optional composable `filter`.
 */
export const contentScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bucket"),
    bucketId: z.number(),
    filter: scopeFilterSchema.optional(),
  }),
  z.object({
    type: z.literal("group"),
    groupId: z.number(),
    filter: scopeFilterSchema.optional(),
  }),
  z.object({
    type: z.literal("documents"),
    documentIds: z.array(z.string()),
    filter: scopeFilterSchema.optional(),
  }),
]);
export type ContentScope = z.infer<typeof contentScopeSchema>;

/**
 * Compile a `ScopeFilter` into a GroundX search `filter` object. Returns
 * `null` when there is nothing to filter on (undefined / empty / all-empty
 * arrays). Empty-array entries are skipped. A single (or single-element)
 * value compiles to `{field: v}`; a multi-element array to `{field: {$in:
 * [...]}}`; multiple fields compose under `$and`. This is the single place
 * the filter-field mechanism is materialized (callers then compose it with
 * any server-derived RBAC filter, also via `$and`).
 */
export function compileScopeFilter(
  filter: ScopeFilter | undefined,
): Record<string, unknown> | null {
  if (!filter) return null;
  const clauses: Record<string, unknown>[] = [];
  for (const [field, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      clauses.push(value.length === 1 ? { [field]: value[0] } : { [field]: { $in: value } });
    } else {
      clauses.push({ [field]: value });
    }
  }
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

// ──────────────────────────────────────────────────────────────────────
// WidgetRole — widget access is an AUTHORIZATION role, not a chat phase.
// Replaces the old binary widget `mode: "onboarding" | "steady"`. Today's
// mapping from the retired binary: "onboarding" → "anonymous", "steady" →
// "member". Reserved future roles (viewer/editor/admin/owner) extend the enum
// HERE only — every consumer derives from this one source of truth.
// ──────────────────────────────────────────────────────────────────────

/** The widget access roles. Extend this enum (only here) to add a role. */
export const widgetRoleSchema = z.enum(["anonymous", "member"]);
export type WidgetRole = z.infer<typeof widgetRoleSchema>;

/**
 * The roles permitted to mutate/commit (the editable affordances a widget
 * shows, and which persistence a role may trigger). Centralized so a widget
 * never hardcodes `role === "anonymous"` — it asks the policy. Grows as roles
 * are added (e.g. an "editor" would join this set). Coarse by design today
 * (lock-all vs edit-all); if per-action granularity is ever needed this
 * becomes `widgetRoleCan(role, action)` (deferred, see the change tasks).
 */
const EDIT_ROLES = new Set<WidgetRole>(["member"]);

/** True iff the role may edit/commit. */
export function widgetRoleCanEdit(role: WidgetRole): boolean {
  return EDIT_ROLES.has(role);
}

/** True iff the role is read-only — the exact negation of `widgetRoleCanEdit`. */
export function isWidgetReadOnly(role: WidgetRole): boolean {
  return !widgetRoleCanEdit(role);
}

// ──────────────────────────────────────────────────────────────────────
// WidgetScope — every widget declares a required scope. The four
// ScopedViewerWidgets (PdfViewer/Extract/SmartReport/Integrate) take a real
// `ContentScope`; every other widget takes `{ type: "none" }`. The `none`
// variant lives ONLY in this union — it is deliberately NOT a member of
// `contentScopeSchema`, which is the wire/data contract for a real document
// set (a "none" scope is never sent to a search/extract/report call).
// ──────────────────────────────────────────────────────────────────────

/** A widget's scope: a real document set, or an explicit "none" (no scope). */
export const widgetScopeSchema = z.union([
  contentScopeSchema,
  z.object({ type: z.literal("none") }),
]);
export type WidgetScope = z.infer<typeof widgetScopeSchema>;

// ──────────────────────────────────────────────────────────────────────
// Template — the one shared question/field artifact underlying BOTH the
// Extract schema and the Report template (Template + Scope + Results). The
// Extract schema and the Report template are two `kind` instances of this one
// concept; they share types, persistence, and lifecycle (no fork).
// ──────────────────────────────────────────────────────────────────────

/** The two template kinds. Extend the union (+ a body arm) to add a kind. */
export const templateKindSchema = z.enum(["extract", "report"]);
export type TemplateKind = z.infer<typeof templateKindSchema>;

/** A field's data type (extract). Real domain enum — kept strict. */
export const templateFieldTypeSchema = z.enum(["STRING", "NUMBER", "DATE", "BOOLEAN"]);
export type TemplateFieldType = z.infer<typeof templateFieldTypeSchema>;

/**
 * One extract field. Known props validated. Default (strip) key handling:
 * an unknown prop does NOT fail validation (it's dropped) — so a frontend
 * field-shape ADDITION never *rejects* at the boundary; a removal/retype of a
 * core prop is correctly rejected. (NOT `.passthrough()` — passthrough's
 * inferred type carries a `{[k:string]:unknown}` index signature, which the
 * legacy `SchemaFieldDef`/`SchemaCategoryDef` interfaces can't satisfy. The
 * shared schema is co-developed with the app, so it always knows the current
 * field shape; there are no genuinely-unknown props to preserve.)
 */
export const templateFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: templateFieldTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
  instructions: z.array(z.string()).optional(),
  format: z.string().optional(),
  identifiers: z.array(z.string()).optional(),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;

/**
 * A category groups fields. `type` is a free string (scenario-agnostic —
 * deliberately NOT the utility-specific enum the legacy `SchemaCategoryDef`
 * carried, so loan/solar categories validate too).
 */
export const templateCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  fields: z.array(templateFieldSchema),
});
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

/**
 * Extract body. The LEGACY persisted blob carried redundant `{id,name}` at the
 * body level (`{...manifestSchema, categories}`); strip drops those extra keys
 * on parse without failing, so the verbatim `schema_json → body_json`
 * copy-migration is sound (no transform) — new saves persist just `{categories}`.
 */
export const extractBodySchema = z.object({ categories: z.array(templateCategorySchema) });
export type ExtractBody = z.infer<typeof extractBodySchema>;

/**
 * Report body. Sections are owned by the `smart-report` change; reserved here
 * loosely (an array of objects) so a `report`-kind Template round-trips
 * through this contract before smart-report tightens the section shape.
 */
export const reportBodySchema = z.object({ sections: z.array(z.object({}).passthrough()) });
export type ReportBody = z.infer<typeof reportBodySchema>;

const templateBaseShape = {
  id: z.string(),
  name: z.string(),
  /** SERVER-ASSIGNED from the session — never on the save wire. */
  ownerUsername: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

/**
 * The full, server-returned Template (read shape). Discriminated on `kind`.
 */
export const templateSchema = z.discriminatedUnion("kind", [
  z.object({ ...templateBaseShape, kind: z.literal("extract"), body: extractBodySchema }),
  z.object({ ...templateBaseShape, kind: z.literal("report"), body: reportBodySchema }),
]);
export type Template = z.infer<typeof templateSchema>;

/**
 * 🔒 The CLIENT save wire shape — deliberately NOT a `Template`: no
 * `ownerUsername`, no timestamps. The server assigns the owner from the
 * authenticated session and stamps timestamps. Default (strip) key handling
 * means an injected `ownerUsername`/`createdAt` in the request body is dropped
 * on parse, so ownership can never be client-supplied (no IDOR / spoofing).
 */
export const templateSaveInputSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("extract"), name: z.string(), body: extractBodySchema }),
  z.object({ id: z.string(), kind: z.literal("report"), name: z.string(), body: reportBodySchema }),
]);
export type TemplateSaveInput = z.infer<typeof templateSaveInputSchema>;

/**
 * Sanitize an untrusted value (DB-read or wire) into a typed `Template`, or
 * `null` if it doesn't validate. The single boundary sanitizer (parallels
 * `parseCitations`); the repo row-mapper and any wire boundary route through it
 * instead of an `as` cast.
 */
export function parseTemplate(input: unknown): Template | null {
  const parsed = templateSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

// ──────────────────────────────────────────────────────────────────────
// GeneratedResult — the Result half of Template + Scope + Results. ONE shape
// underlies BOTH the Extract field value and the Report rendered section: a
// generated **body** + the supporting `citations[]` + an optional `confidence`
// + optional `warnings[]`. Extract and Report were independent one-offs
// (`ExtractedFieldValue` = `{fieldId,value,citations}`; the report section had
// no shared type at all); they're two specializations of this one concept and
// must share types + lifecycle, not fork.
// ──────────────────────────────────────────────────────────────────────

/** The generated content of a result — a scalar field value (extract) or a
 * markdown string (report section). The narrower specializations re-type this. */
export const generatedBodySchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type GeneratedBody = z.infer<typeof generatedBodySchema>;

/**
 * The shared fields every generated result carries. Spread into each
 * specialization so the citation/confidence/warning contract can't drift
 * between Extract and Report.
 */
const generatedResultBaseShape = {
  /** The supporting source citations for this result. */
  citations: z.array(citationSchema),
  /** Optional [0,1] confidence in the generated body. */
  confidence: z.number().optional(),
  /** Optional non-fatal warnings surfaced alongside the result (e.g.
   * `low-coverage`, `unit-ambiguous`); empty/absent when clean. */
  warnings: z.array(z.string()).optional(),
};

/**
 * A generated result in its most general form: a `body` + the shared
 * citation/confidence/warning contract. `ExtractedFieldValue` and
 * `RenderedSection` narrow this.
 */
export const generatedResultSchema = z.object({
  body: generatedBodySchema,
  ...generatedResultBaseShape,
});
export type GeneratedResult = z.infer<typeof generatedResultSchema>;

/**
 * Extract specialization: a generated result keyed by `fieldId` whose body is
 * the scalar field value. The persisted/wire alias for the body is `value`
 * (the legacy `{fieldId,value,citations}` fixture shape) — kept so existing
 * scenario fixtures and the `/api/extract-field` path round-trip unchanged.
 */
export const extractedFieldValueSchema = z.object({
  fieldId: z.string(),
  /** The extracted scalar value — the generated `body` of this result. */
  value: generatedBodySchema,
  ...generatedResultBaseShape,
});
export type ExtractedFieldValue = z.infer<typeof extractedFieldValueSchema>;

/**
 * Report specialization: a generated result keyed by `sectionId` whose body is
 * the section's markdown. (Reserved here loosely alongside the report Template
 * body — `smart-report` owns the surrounding section structure; this is just
 * the per-section *generated* result.)
 */
export const renderedSectionSchema = z.object({
  sectionId: z.string(),
  /** The section's generated markdown — the `body` of this result. */
  body: z.string(),
  ...generatedResultBaseShape,
});
export type RenderedSection = z.infer<typeof renderedSectionSchema>;

/**
 * Sanitize an untrusted value (DB-read or wire) into a typed `GeneratedResult`,
 * or `null` if it doesn't validate. The single boundary sanitizer (parallels
 * `parseCitations`/`parseTemplate`); unknown keys are stripped on parse.
 */
export function parseGeneratedResult(input: unknown): GeneratedResult | null {
  const parsed = generatedResultSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

// ──────────────────────────────────────────────────────────────────────
// ViewerStepKind — the discriminant of the app's `ViewerStep` union. Lives
// here so the middleware tool-catalog (`toolsForStep`) shares ONE definition
// instead of hand-mirroring the kind set across the workspace boundary. The
// app's `ViewerStep` is a payload-bearing discriminated union; only the kind
// strings are shared. A compile-time guard (app `ViewerStepKind.contract.test`)
// asserts `ViewerStep["kind"]` stays exactly equal to this.
// ──────────────────────────────────────────────────────────────────────
export const viewerStepKindSchema = z.enum([
  "ingest-picker",
  "doc-viewer",
  "extract-workbench",
  "interact-chat",
  "report",
  "integrate",
]);
export type ViewerStepKind = z.infer<typeof viewerStepKindSchema>;

// ──────────────────────────────────────────────────────────────────────
// Catalog<T> — the shared READ contract every data catalog satisfies. A
// catalog looks up a descriptor by id and enumerates the set; it is NEVER a
// dispatcher (it does not resolve behavior) and NEVER a state store (it is
// not mutable). Intrinsic per-catalog differences are explicitly allowed and
// NOT flattened: remote catalogs layer an async status machine + `refresh()`
// on top and are delivered via a React Context; local (static/glob) catalogs
// are plain singletons that enforce a unique-id invariant at build/boot via
// `assertUniqueIds`. This contract governs the data-access API only, not the
// delivery or sourcing.
//
// Deliberately NOT a base class / runtime framework (anti-overengineering) —
// just a small typed interface + a unique-id helper.
// ──────────────────────────────────────────────────────────────────────

/**
 * The read API shared by every data catalog (`ScenarioRegistry`,
 * `toolRegistry`, `chatExperienceRegistry`): enumerate the set, or look one up
 * by its id.
 */
export interface Catalog<T> {
  /** All entries in the catalog (stable order; read-only). */
  all(): readonly T[];
  /** The entry with the given id, or `undefined` if none. */
  byId(id: string): T | undefined;
}

/**
 * Enforce the unique-id invariant for a local (static/glob) catalog: throws if
 * two items share an id. The throw always names the duplicate id. When
 * `sourceOf` is supplied (returning a source label per item, e.g. a module
 * path), the message ALSO names the colliding sources — preserving the
 * "declared in two modules" diagnostic for glob-sourced catalogs. With no
 * `sourceOf`, only the duplicate id is named. A unique list returns without
 * throwing. This is the ONE mechanism for the invariant — catalogs route their
 * bespoke duplicate-id checks through here rather than reimplementing them.
 */
export function assertUniqueIds<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  sourceOf?: (item: T) => string,
): void {
  const seen = new Map<string, T>();
  for (const item of items) {
    const id = idOf(item);
    const prior = seen.get(id);
    if (prior !== undefined) {
      if (sourceOf) {
        throw new Error(
          `Duplicate catalog id "${id}" — declared in "${sourceOf(prior)}" and "${sourceOf(item)}".`,
        );
      }
      throw new Error(`Duplicate catalog id "${id}".`);
    }
    seen.set(id, item);
  }
}
