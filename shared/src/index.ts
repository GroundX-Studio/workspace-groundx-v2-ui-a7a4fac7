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
 * 2026-05-31-core-data-followups §2 — the single error contract that crosses
 * (and is shared across) the app ↔ middleware boundary.
 *
 * Before this, ~7 hand-rolled `*Error` classes each re-declared their own
 * `status` (or `statusCode`) + `detail` fields, drifting on field name and
 * shape. `ApiError` is the one base they all extend: it owns `status` +
 * `detail`, so a subclass never declares those fields itself. Subclasses add
 * only error-specific extras (e.g. `upstreamStatus`, `mode`) and set `name`.
 *
 * It is a plain isomorphic class — `extends Error`, no Node- or browser-only
 * API — so it is allowed to live here alongside the type-only + Zod contracts.
 *
 * `Object.setPrototypeOf` restores the prototype chain after `super()` so that
 * `instanceof ApiError` (and `instanceof <Subclass>`) survives the TS→ES5/ES
 * `extends Error` transpilation pitfall regardless of compile target.
 */
export class ApiError extends Error {
  /** HTTP-ish status code the error maps to (route/global handler reads it). */
  readonly status: number;
  /** Optional structured detail (e.g. the parsed upstream error body). */
  readonly detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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
// Source — 2026-05-31-chat-wire-types-shared. The four-value source enum
// `["user","agent","tour","system"]` was duplicated 7× across the boundary:
// the middleware `viewerEventSourceSchema` + `intentLogSourceSchema` (+ their
// `*_FALLBACK` consts) + two `app.ts` allow-sets, and the app
// `ChatStoreContext` ViewerEvent source / `intentLog` / `viewerEvents`. It is
// single-sourced here. The canvas-orchestrator `IntentSource`
// (`"user"|"agent"|"tour"`) is the same vocabulary MINUS `"system"` (an intent
// is always attributable to a user action, an agent tool call, or the tour
// state machine — never the implicit system), so it is DERIVED as
// `Exclude<Source,"system">` rather than re-declared.
// ──────────────────────────────────────────────────────────────────────

/** The origin of a viewer event / intent-log entry / dispatched intent. */
export const sourceSchema = z.enum(["user", "agent", "tour", "system"]);
export type Source = z.infer<typeof sourceSchema>;

/**
 * The canvas-orchestrator intent sources — `Source` minus the implicit
 * `"system"`. An intent is always attributable to a concrete actor (a user UI
 * event, an agent tool call, or the tour state machine). Derived from
 * `sourceSchema` so the vocabulary cannot drift between the event-source and
 * intent-source halves.
 */
export const intentSourceSchema = sourceSchema.exclude(["system"]);
export type IntentSource = Exclude<Source, "system">;

// ──────────────────────────────────────────────────────────────────────
// AppUserMetadata — 2026-05-31-chat-wire-types-shared. The app-owned session
// metadata persisted by the middleware (`app_user_metadata`) and surfaced to
// the app on `/api/auth/me` (`appMetadata`) + `PATCH /api/me/metadata`. It was
// declared TWICE: the middleware persisted-record shape (7 fields,
// `groundxUsername` required) and the app's documented SUBSET
// (`groundxUsername?` / `onboardingState?`). Single-sourced here with every
// session-metadata field OPTIONAL except `groundxUsername`, so the middleware
// sees the full set and the app narrows to the two fields it reads — from ONE
// source. `acceptedTermsAt` accepts a `Date` (middleware record) OR an ISO
// string (the JSON wire form `res.json` serializes it to) so both halves of the
// boundary satisfy the one type without a runtime change.
// ──────────────────────────────────────────────────────────────────────

export const appUserMetadataSchema = z.object({
  groundxUsername: z.string(),
  onboardingState: z.string().nullish(),
  uiPreferencesJson: z.string().nullish(),
  featureFlagsJson: z.string().nullish(),
  lastActiveProjectId: z.string().nullish(),
  acceptedTermsAt: z.union([z.date(), z.string()]).nullish(),
  appRole: z.string().nullish(),
});
export type AppUserMetadata = z.infer<typeof appUserMetadataSchema>;

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
// ExtractFieldResult — 2026-05-31-core-data-followups §4 #13. The
// `/api/extract-field` response body. It was declared byte-identically on BOTH
// sides of the wire (app `api/extractField.ts` + middleware
// `services/fieldExtractor.ts`); both now import this one shape so the twin
// cannot drift. The `citation` slot is a deliberate STRUCTURAL SUBSET of the
// full `Citation` (just `{documentId, page, snippet?}`) — the field-extract
// path never carries bbox/tier/confidence on the citation — so it is typed
// narrowly here rather than reusing `citationSchema` (which would widen the
// wire contract). Single best-match citation, or `null`.
// ──────────────────────────────────────────────────────────────────────

/** The single best-match citation on an extract-field result. */
export const extractFieldCitationSchema = z.object({
  documentId: z.string(),
  page: z.number(),
  snippet: z.string().optional(),
});
export type ExtractFieldCitation = z.infer<typeof extractFieldCitationSchema>;

/** The `/api/extract-field` response body — one shape, both sides of the wire. */
export const extractFieldResultSchema = z.object({
  /** The extracted value coerced to the field's declared type, or `null`
   * when the snippets don't contain enough information to extract one. */
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** The LLM's self-reported confidence on the 0–1 scale. */
  confidence: z.number(),
  /** A single best-match citation, or `null`. */
  citation: extractFieldCitationSchema.nullish(),
});
export type ExtractFieldResult = z.infer<typeof extractFieldResultSchema>;

// ──────────────────────────────────────────────────────────────────────
// SchemaFieldExtractionResult — 2026-05-31-chat-wire-types-shared. UI-01
// Phase 2c: the per-field extraction result the chat propose-card fires for
// after `addSchemaField` lands a field addition. Declared only on the app
// (`ChatStoreContext/types.ts`) and consumed by `ChatStoreContext.tsx` +
// `SchemaView.tsx`. Single-sourced here so a future middleware producer of the
// same shape shares ONE source. The `citation` reuses `extractFieldCitationSchema`
// (the same `{documentId, page, snippet?}` best-match shape).
// ──────────────────────────────────────────────────────────────────────
// 2026-05-31-session-auth-subshapes — discriminated union on `status`. The
// success-only fields (`value`/`confidence`/`previousConfidence`/`citation`)
// live ONLY on the `"done"` arm, so a `"pending"` result with a value, or an
// `"error"` result carrying a confidence, is unrepresentable (and rejected at
// the Zod boundary — each arm is `.strict()`). Behavior-preserving: an existing
// `"done"` record keeps its exact field set.
export const schemaFieldExtractionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z
    .object({
      status: z.literal("done"),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      confidence: z.number().optional(),
      /** The previous extraction's confidence when this result is a re-run. */
      previousConfidence: z.number().optional(),
      citation: extractFieldCitationSchema.nullish(),
    })
    .strict(),
  z.object({ status: z.literal("error"), message: z.string().optional() }).strict(),
]);
export type SchemaFieldExtractionResult = z.infer<typeof schemaFieldExtractionResultSchema>;

// ──────────────────────────────────────────────────────────────────────
// SuggestedAction — 2026-05-31-core-data-followups §4 #13. The clickable chip
// the grounded LLM proposes (e.g. "Show source", "Open samples"). It was
// declared byte-identically in THREE places: the `SuggestedActionChips` widget,
// `api/chatSessions`'s `ChatSuggestedAction`, and the middleware
// `chatRouterTypes.SuggestedAction`. All three now import this ONE shape.
// `detail` is an opaque payload the host translates into a canvas intent.
// ──────────────────────────────────────────────────────────────────────

/** A clickable suggested-action chip — one shape, app widget + wire twins. */
export const suggestedActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  detail: z.record(z.unknown()).optional(),
});
export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

// ──────────────────────────────────────────────────────────────────────
// ProposedSchemaField — 2026-05-31-core-data-followups §4 #18. The
// `proposal-envelope` wire shape the grounded LLM emits ("add a field for total
// tax"). Declared on BOTH sides of the app↔middleware wire (app
// `api/chatSessions` + middleware `chatRouterTypes`) and had silently DRIFTED:
// the app declared `provenance?` optional, the middleware declared it required.
// Single-sourced here with `provenance` OPTIONAL — the middleware only ever
// WRITES a present provenance (so required-vs-optional is runtime-identical for
// it) and the app's readers already guard `provenance?.verified === true`, so
// the permissive shape unifies both with zero behavior change.
// ──────────────────────────────────────────────────────────────────────

/** `proposal-envelope-provenance` — set when the server's Zod envelope parse
 * accepted the LLM payload. Renderers gate a `proposal_v<version> · envelope
 * verified` label on `provenance?.verified === true`. */
export const proposalEnvelopeProvenanceSchema = z.object({
  version: z.literal("v1"),
  verified: z.literal(true),
});
export type ProposalEnvelopeProvenance = z.infer<typeof proposalEnvelopeProvenanceSchema>;

/** A schema-field the grounded LLM proposed — one shape, both sides of the wire. */
export const proposedSchemaFieldSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: templateFieldTypeSchema,
  description: z.string(),
  provenance: proposalEnvelopeProvenanceSchema.optional(),
});
export type ProposedSchemaField = z.infer<typeof proposedSchemaFieldSchema>;

// ──────────────────────────────────────────────────────────────────────
// Chat wire envelope — 2026-05-31-chat-wire-types-shared. The `/api/chat/*`
// request/response contract was declared TWICE: the app `api/chatSessions.ts`
// (`ChatReply` / `ChatReplyDebug` / `ChatDispatchedIntent` / `ChatToolFailure`
// / `CreateChatSessionResult` / `scopeHint`) and the middleware
// `services/chatRouterTypes.ts` (`ChatRouterResponse` / `ChatRouterDebug` /
// `DispatchedIntent` / `ToolFailure`). They were hand-mirrored byte-twins that
// nothing forced to agree. Single-sourced here as Zod schemas (z.infer types);
// both sides re-export under a compile-time `Eq<Local, Shared>` guard
// (load-bearing under `npm run build`) plus a runtime `validate` at each parse
// boundary. Reuses the already-shared `Citation` / `SuggestedAction` /
// `ProposedSchemaField` / `ContentScope`.
// ──────────────────────────────────────────────────────────────────────

/** The three chat router modes (deterministic classifier output). */
export const chatModeSchema = z.enum(["rag", "structured", "hybrid"]);
export type ChatMode = z.infer<typeof chatModeSchema>;

/**
 * widget-llm-integration Phase 5 — one successful LLM tool call round-trip
 * from the middleware. The frontend dispatches each `intent` through the
 * canvas orchestrator on receipt.
 */
export const dispatchedIntentSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()),
  intent: z.record(z.unknown()),
});
export type DispatchedIntent = z.infer<typeof dispatchedIntentSchema>;

/** widget-llm-integration Phase 5 — one failed LLM tool call. */
export const toolFailureSchema = z.object({
  name: z.string(),
  reason: z.string(),
});
export type ToolFailure = z.infer<typeof toolFailureSchema>;

/**
 * agentic-tool-loop — one successfully server-executed tool call, surfaced to
 * the user as a muted "what the agent consulted" annotation on the assistant
 * message (`label` from the tool's `activityLabel`). OPTIONAL on the reply
 * envelope (mirrors `_debug?`): the rag producer sets it; structured/hybrid
 * producers — which never run a server tool — omit it. Failed executions land
 * on `toolFailures`, never here.
 */
export const toolActivitySchema = z.object({
  name: z.string(),
  label: z.string(),
});
export type ToolActivity = z.infer<typeof toolActivitySchema>;

/**
 * Dev-only diagnostic payload attached to chat replies in non-prod
 * environments. Present on `ChatReply` when `NODE_ENV !== "production"`. Lets
 * the browser DevTools console show exactly what the chat router asked
 * GroundX and what came back. `scope` is the shared `ContentScope` (NOT a
 * re-declared `{type,bucketId,groupId,documentIds,filter}` literal — that LOW
 * debug-scope twin is closed here).
 */
export const chatReplyDebugSchema = z.object({
  mode: chatModeSchema,
  scope: contentScopeSchema,
  groundx: z
    .object({
      path: z.string(),
      query: z.string(),
      n: z.number(),
      filter: z.unknown(),
      resultCount: z.number(),
      topSnippets: z.array(
        z.object({
          documentId: z.string(),
          fileName: z.string().optional(),
          score: z.number().optional(),
          text: z.string().optional(),
        }),
      ),
    })
    .nullable(),
  llm: z
    .object({
      model: z.string(),
      snippetBlockChars: z.number(),
      userContentChars: z.number(),
      systemChars: z.number(),
      answerChars: z.number(),
    })
    .nullable(),
  // harden-citation-emission U4 — the per-turn citation funnel. Lives HERE
  // (not in middleware types): `ChatRouterDebug` is an alias of this schema's
  // inference and the closed z.object strips unknown keys on parse, so any
  // branch added elsewhere never reaches the wire. Optional: report + hybrid
  // turns carry no debug accumulator.
  citations: z
    .object({
      emitted: z.number(),
      validSnippetForm: z.number(),
      validExtractionForm: z.number(),
      shipped: z.number(),
      dropReasons: z.object({
        parse: z.number(),
        docId: z.number(),
        page: z.number(),
        path: z.number(),
        value: z.number(),
        branchNode: z.number(),
        geometry: z.number(),
      }),
    })
    .nullable()
    .optional(),
});
export type ChatReplyDebug = z.infer<typeof chatReplyDebugSchema>;

/** The `/api/chat/messages` reply envelope — one shape, both sides of the wire. */
export const chatReplySchema = z.object({
  mode: chatModeSchema,
  answer: z.string(),
  citations: z.array(citationSchema),
  suggestedActions: z.array(suggestedActionSchema),
  intents: z.array(dispatchedIntentSchema),
  toolFailures: z.array(toolFailureSchema),
  // agentic-tool-loop — OPTIONAL (mirrors `_debug?`): the rag producer sets it
  // (possibly `[]`); structured/hybrid producers omit it. App reads `?? []`.
  toolActivity: z.array(toolActivitySchema).optional(),
  proposedSchemaField: proposedSchemaFieldSchema.nullable(),
  _debug: chatReplyDebugSchema.optional(),
});
export type ChatReply = z.infer<typeof chatReplySchema>;

/** The `POST /api/chat-sessions` result — one shape, both sides of the wire. */
export const createChatSessionResultSchema = z.object({
  chatSessionId: z.string(),
  ownerUserId: z.string().nullable(),
  ownerAnonId: z.string().nullable(),
});
export type CreateChatSessionResult = z.infer<typeof createChatSessionResultSchema>;

/**
 * Optional friendly hint about what the user is currently looking at, threaded
 * into the grounded LLM prompt (app `SendChatMessageInput.scopeHint` ↔
 * middleware `ChatRouterRequest.scopeHint`). Both fields nullable+optional —
 * the frontend has the scenario manifest in hand; the server does not.
 */
export const chatScopeHintSchema = z.object({
  fileName: z.string().nullish(),
  scenarioTitle: z.string().nullish(),
});
export type ChatScopeHint = z.infer<typeof chatScopeHintSchema>;

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
// CanvasKind — the CLOSED set of canvas surfaces that have a built
// `ScopedViewerWidget` today. This is deliberately NARROWER than
// `ViewerStepKind`: a ViewerStep can carry a kind (`extract-workbench`,
// `integrate`, `ingest-picker`) for which no production widget exists yet,
// so `<ScopedCanvas>` resolves those to a labelled "not yet available"
// placeholder rather than a widget mount. CanvasKind lists ONLY the kinds
// the production registry can resolve, so:
//
//   • the production registry asserts exactly one descriptor per CanvasKind
//     at construction (totality over the declared set), and
//   • `<ScopedCanvas>`'s `switch` over CanvasKind gets a `never` default —
//     adding a CanvasKind value WITHOUT a registered widget fails to compile.
//
// `extract-workbench` joined the set in 2026-05-30-onboarding-shell-shared-view
// Phase 3a (the packaged Extract workbench widget). `integrate` joined in
// Phase 3b (the packaged Integrate connectors widget) — it now has a registered
// widget so it can be a declared CanvasKind without breaking the total-registry
// construction or the exhaustive switch. `report` and `report-builder` are
// SEPARATE kinds (render surface vs builder surface), each backed by its own
// widget (SmartReportRender / SmartReportBuilder). The ONLY remaining
// ViewerStepKind with no CanvasKind is `ingest-picker` — the F1 overlay, NOT a
// canvas widget — which resolves to the labelled placeholder.
// ──────────────────────────────────────────────────────────────────────
export const canvasKindSchema = z.enum([
  "doc-viewer",
  "extract-workbench",
  "report",
  "report-builder",
  "integrate",
]);
export type CanvasKind = z.infer<typeof canvasKindSchema>;

// ──────────────────────────────────────────────────────────────────────
// CanvasIntent — 2026-05-31-canvas-intent-schema-shared. The ONE shared,
// runtime-validated discriminated union of every command the canvas can
// receive, discriminated on `kind`. It is the single source of truth that
//   • the app `CanvasIntent` TYPE derives from (`contexts/Canvas-
//     OrchestratorContext/types.ts` re-exports `z.infer<typeof
//     canvasIntentSchema>` instead of hand-declaring the union), and whose
//     `kind` discriminator the orchestrator `dispatch()` switch +
//     `assertNeverIntent` drive exhaustiveness off of, and
//   • BOTH `current_intent_json` read boundaries validate against — the app
//     hydration `coerceHydratedIntent` and the middleware `rowToChatSession`
//     mapper — so a corrupt/legacy persisted intent coerces to `null` rather
//     than masquerading as a typed intent.
//
// This is DISTINCT from `canvasKindSchema` (the canvas SURFACE kind enum
// above): that discriminates which widget mounts; this discriminates which
// command the orchestrator applies. They share no values and BOTH remain.
//
// `frame` / `scenario` are the app `FFrame` / `Scenario` string-literal
// unions inlined here as the wire contract (they are the persisted intent
// payload). Shared field shapes reuse the existing schemas
// (`normalizedBboxSchema`, `citationTierSchema`, `contentScopeSchema`,
// `templateFieldTypeSchema`).
//
// Default (strip) key handling on each variant: an unknown prop does NOT
// fail validation (it is dropped), mirroring `templateFieldSchema` — a valid
// intent with a future field added by one end still parses at the other end;
// a missing required field or a non-discriminant `kind` IS rejected.
// ──────────────────────────────────────────────────────────────────────

/** The frame the canvas/shell can switch to (== app `FFrame`). */
const canvasFrameSchema = z.enum(["f1", "f2", "f3", "f3a", "f4", "f4a", "f5", "f6", "f7"]);
/** The demo scenario (== app `Scenario`). */
const canvasScenarioSchema = z.enum(["utility", "loan", "solar"]);
/** Report-section render mode (shared by propose/edit report-section intents). */
const reportRenderAsSchema = z.enum(["PARAGRAPH", "BULLETS", "TABLE"]);

/**
 * A single citation region drawn on the page (the "show all sources" surface).
 * 0–1 page-relative coords + a palette key matching the `[N]` chip colors.
 */
export const citationRegionSchema = z.object({
  page: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: z.enum(["green", "cyan", "coral"]),
});
export type CitationRegion = z.infer<typeof citationRegionSchema>;

export const canvasIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("showSample"), scenario: canvasScenarioSchema }),
  z.object({ kind: z.literal("openDocument"), documentId: z.string(), page: z.number().optional() }),
  z.object({
    kind: z.literal("highlightCitation"),
    documentId: z.string(),
    page: z.number(),
    bbox: normalizedBboxSchema.optional(),
    tier: citationTierSchema.optional(),
  }),
  // "Show all sources" — light up every citation region of an answer at once
  // (color-coded), on the cited document. Distinct from highlightCitation,
  // which opens a single region.
  z.object({
    kind: z.literal("showCitations"),
    documentId: z.string(),
    page: z.number(),
    regions: z.array(citationRegionSchema),
  }),
  z.object({ kind: z.literal("jumpToPage"), documentId: z.string(), page: z.number() }),
  z.object({ kind: z.literal("showExtract"), scope: contentScopeSchema, schemaId: z.string() }),
  z.object({ kind: z.literal("editSchema"), schemaId: z.string() }),
  z.object({ kind: z.literal("showIntegrate"), scope: contentScopeSchema }),
  z.object({ kind: z.literal("showReport"), templateId: z.string(), scope: contentScopeSchema }),
  z.object({ kind: z.literal("editTemplate"), templateId: z.string(), selectedSectionId: z.string().optional() }),
  z.object({ kind: z.literal("openGate"), trigger: z.enum(["save", "export", "byo", "threshold"]) }),
  z.object({ kind: z.literal("switchFrame"), frame: canvasFrameSchema }),
  z.object({
    kind: z.literal("proposeSchemaField"),
    categoryId: z.string(),
    name: z.string(),
    type: templateFieldTypeSchema,
    description: z.string(),
  }),
  z.object({ kind: z.literal("acceptSchemaField"), proposalId: z.string() }),
  z.object({ kind: z.literal("rejectSchemaField"), proposalId: z.string() }),
  z.object({ kind: z.literal("commitGate"), method: z.enum(["register", "sso", "engineer-call"]) }),
  z.object({ kind: z.literal("dismissGate") }),
  z.object({ kind: z.literal("openBookCall") }),
  z.object({ kind: z.literal("pinToReport"), turnId: z.string(), text: z.string(), templateId: z.string().optional() }),
  z.object({
    kind: z.literal("proposeReportSection"),
    name: z.string(),
    renderAs: reportRenderAsSchema,
    question: z.string(),
  }),
  z.object({ kind: z.literal("acceptReportSection"), proposalId: z.string() }),
  z.object({ kind: z.literal("rejectReportSection"), proposalId: z.string() }),
  z.object({
    kind: z.literal("editReportSection"),
    sectionId: z.string(),
    name: z.string().optional(),
    renderAs: reportRenderAsSchema.optional(),
    question: z.string().optional(),
    instructions: z.array(z.string()).optional(),
    variables: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal("deleteReportSection"), sectionId: z.string() }),
  z.object({
    kind: z.literal("submitSignup"),
    first: z.string(),
    last: z.string(),
    email: z.string(),
    password: z.string(),
    confirmPassword: z.string(),
  }),
  z.object({ kind: z.literal("wizardNext") }),
  z.object({ kind: z.literal("wizardBack") }),
  z.object({ kind: z.literal("wizardFinish") }),
  z.object({ kind: z.literal("dismissWizard") }),
  z.object({ kind: z.literal("closeDialog") }),
]);

/**
 * The ONE CanvasIntent type — derived from the schema (single source of
 * truth). The app re-exports this; `StampedIntent` / `CanvasAdapter` /
 * `IntentSource` stay app-side (orchestrator-runtime concerns, not wire
 * contracts).
 */
export type CanvasIntent = z.infer<typeof canvasIntentSchema>;

/**
 * Sanitize an untrusted value (a `current_intent_json` DB-read or wire
 * payload) into a typed `CanvasIntent`, or `null` if it doesn't validate.
 * The single boundary sanitizer (parallels `parseCitations` / `parseTemplate`)
 * — both read boundaries route through it instead of an `as` cast, so a
 * corrupt/legacy persisted intent degrades to `null`.
 */
export function parseCanvasIntent(input: unknown): CanvasIntent | null {
  const parsed = canvasIntentSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

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
 * `chatExperienceRegistry`, scoped viewer widgets): enumerate the set, or look
 * one up by its id.
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

// ──────────────────────────────────────────────────────────────────────
// Scenario fixture contract — 2026-06-01-data-model-tail item 3. The sample
// scenario shapes (`ScenarioConfig` / `ScenarioManifest` / `ScenarioDocument` /
// `SampleDocFilter`, plus their constituents) were HAND-MIRRORED between app
// `app/src/types/scenarios.ts` and middleware `middleware/src/scenarios/types.ts`
// with NO drift test — and had already diverged (`SampleDocFilter` was
// middleware-only; the prose headers only WARNed). They ARE a cross-boundary
// contract: the middleware seed writes the `manifest` blob into each sample
// doc's bucket `filter`, and the app reads it back to build the consumer
// `ScenarioConfig`. So the contract is single-sourced here; both files
// re-export these types and pin the re-export with a compile-time `Eq<>` assert
// (the `_assertExtractGeneratedResult` precedent), closing the silent-drift gap.
//
// These are the STRICT legacy fixture shapes (e.g. `SchemaCategoryDef.type` is
// the utility-specific `"statement" | "charges" | "meters"` enum, distinct from
// the scenario-agnostic free-string `templateCategorySchema.type` above). They
// are kept distinct from the Template family on purpose — the scenario fixtures
// pre-date the Template contract and round-trip through the bucket filter as-is.
// ──────────────────────────────────────────────────────────────────────

/** A scenario's card/hero metadata (F1 sample picker). */
export const scenarioHeroSchema = z.object({
  title: z.string(),
  shortDesc: z.string(),
  demonstrates: z.string(),
  badges: z.array(z.enum(["E", "I", "R"])),
  chapters: z.object({
    extract: z.enum(["live", "off"]),
    interact: z.enum(["live", "off"]),
    report: z.enum(["live", "off"]),
  }),
  docCount: z.string(),
});
export type ScenarioHero = z.infer<typeof scenarioHeroSchema>;

/**
 * One scenario-fixture schema field. The strict legacy shape (the inline-editor
 * F3a field). Field-level `description` is the extraction prompt; the optional
 * props are the F3a editor extras (required toggle, instructions, format hint,
 * identifiers). Distinct from the scenario-agnostic shared `templateFieldSchema`.
 */
export const schemaFieldDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: templateFieldTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
  instructions: z.array(z.string()).optional(),
  format: z.string().optional(),
  identifiers: z.array(z.string()).optional(),
});
export type SchemaFieldDef = z.infer<typeof schemaFieldDefSchema>;

/**
 * A scenario-fixture schema category. `type` is the utility-specific enum the
 * legacy fixtures carry (NOT the free string the shared `templateCategorySchema`
 * uses) — this is the strict demo-fixture shape both sides must agree on.
 */
export const schemaCategoryDefSchema = z.object({
  id: z.string(),
  type: z.enum(["statement", "charges", "meters"]),
  name: z.string(),
  fields: z.array(schemaFieldDefSchema),
});
export type SchemaCategoryDef = z.infer<typeof schemaCategoryDefSchema>;

/** A scenario-fixture extraction schema (categories of fields). */
export const extractionSchemaDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  categories: z.array(schemaCategoryDefSchema),
});
export type ExtractionSchemaDef = z.infer<typeof extractionSchemaDefSchema>;

/** A pre-canned chat seed prompt offered in the demo flow. */
export const chatSeedSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  rationale: z.string(),
});
export type ChatSeed = z.infer<typeof chatSeedSchema>;

/** A pre-canned chat transcript turn for the demo flow. Citations are the
 * shared `Citation`. */
export const sampleChatTurnSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(citationSchema).optional(),
});
export type SampleChatTurn = z.infer<typeof sampleChatTurnSchema>;

/**
 * The full scenario manifest blob. This is the ONLY blob that survives the
 * bucket round-trip (it's stored in the first sample doc's `filter.manifest`),
 * so capability flags like `supportsJsonRender` live here and are lifted to the
 * `ScenarioConfig` by the registry.
 */
export const scenarioManifestSchema = z.object({
  id: z.string(),
  hero: scenarioHeroSchema,
  thinkingScript: z.array(z.string()),
  /** Absent → scenario skips the Extract frame (e.g. Solar is Interact+Report only). */
  extractionSchema: extractionSchemaDefSchema.optional(),
  chatSeeds: z.array(chatSeedSchema),
  /** Pre-canned extraction results for the demo flow. */
  sampleExtractionValues: z.array(extractedFieldValueSchema).optional(),
  /** Pre-canned chat transcript for the demo flow. */
  sampleChatScript: z.array(sampleChatTurnSchema).optional(),
  /** Capability flag — wire carrier for `ScenarioConfig.supportsJsonRender`. */
  supportsJsonRender: z.boolean().optional(),
});
export type ScenarioManifest = z.infer<typeof scenarioManifestSchema>;

/**
 * What gets stored in every sample doc's bucket `filter`. The first doc per
 * scenarioId also carries the full `manifest`; subsequent docs carry the slim
 * filter (no manifest). This is the middleware seed → app read contract.
 */
export const sampleDocFilterSchema = z.object({
  kind: z.literal("sample-doc"),
  scenarioId: z.string(),
  scenarioOrder: z.number(),
  scenarioRole: z.literal("doc"),
  /** Present only on the first doc per scenarioId. */
  manifest: scenarioManifestSchema.optional(),
  /**
   * 2026-06-01-projects-rbac-scope-filter — the app "project" id this doc
   * belongs to (the GroundX search-`filter` key for data-org + RBAC). The seed
   * stamps the real `proj_<uuid>` (resolved from the scenario). Optional during
   * the transition; becomes the flat DocumentFilter's primary field once the
   * manifest moves app-side (Task 7).
   */
  projectId: z.string().optional(),
  /** The extraction workflow id (Extract widget schema discovery; WF). */
  workflow_id: z.string().optional(),
});
export type SampleDocFilter = z.infer<typeof sampleDocFilterSchema>;

/** A document within a scenario (PDF preview source for the F2 viewer). */
export const scenarioDocumentSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  pageCount: z.number().optional(),
  order: z.number(),
  /** Optional same-origin URL for the document binary (pdfjs render source). */
  previewUrl: z.string().optional(),
});
export type ScenarioDocument = z.infer<typeof scenarioDocumentSchema>;

/** The frontend-consumed scenario config (manifest + its documents + lifted flags). */
export const scenarioConfigSchema = z.object({
  id: z.string(),
  order: z.number(),
  /** GroundX document filter.projectId value for this scenario. */
  projectId: z.string(),
  manifest: scenarioManifestSchema,
  documents: z.array(scenarioDocumentSchema),
  /** Capability flag lifted from the manifest: Extract offers table→JSON render. */
  supportsJsonRender: z.boolean().optional(),
});
export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>;

/**
 * 2026-06-01-data-model-tail item 4 — the canonical X-Ray response type family.
 *
 * The `/v1/ingest/document/xray/{id}` payload (verified 2026-05-25 against the
 * real endpoint; recorded in `docs/agents/groundx-real-api-shapes.md`) used to
 * be declared independently on the app side (`groundxDocumentsEntity.ts`) and
 * had no relationship to the middleware's loose `XrayDoc` / `XrayChunk`
 * (`citationGeometry.ts`), even though both describe the SAME payload. This is
 * the ONE canonical strict shape; the app re-exports it directly, and the
 * middleware derives its runtime-tolerant loose `XrayDoc` from it (relaxed to
 * all-optional, because it casts a raw `res.json()`), with an assignability
 * drift guard tying the two.
 */

/** A native page-pixel bounding box on an X-Ray chunk (corners, not normalized). */
export const xrayBoundingBoxSchema = z.object({
  pageNumber: z.number(),
  topLeftX: z.number(),
  topLeftY: z.number(),
  bottomRightX: z.number(),
  bottomRightY: z.number(),
  corrected: z.boolean(),
});
export type XrayBoundingBox = z.infer<typeof xrayBoundingBoxSchema>;

/** One X-Ray chunk: its text + suggested text, cited pages, and native boxes. */
export const xrayChunkSchema = z.object({
  chunk: z.string(),
  contentType: z.array(z.string()),
  pageNumbers: z.array(z.number()),
  text: z.string(),
  suggestedText: z.string(),
  boundingBoxes: z.array(xrayBoundingBoxSchema),
  /** Present on structured (table) chunks; opaque to us. */
  json: z.array(z.unknown()).optional(),
});
export type XrayChunk = z.infer<typeof xrayChunkSchema>;

/** One rendered page in the X-Ray: its image URL, native dims, and chunks. */
export const xrayDocumentPageSchema = z.object({
  pageNumber: z.number(),
  pageUrl: z.string(),
  width: z.number(),
  height: z.number(),
  chunks: z.array(xrayChunkSchema),
});
export type XrayDocumentPage = z.infer<typeof xrayDocumentPageSchema>;

/** The top-level X-Ray response for a single document. */
export const documentXrayResponseSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileKeywords: z.string().optional(),
  fileSummary: z.string().optional(),
  language: z.string().optional(),
  sourceUrl: z.string(),
  documentPages: z.array(xrayDocumentPageSchema),
  chunks: z.array(xrayChunkSchema),
});
export type DocumentXrayResponse = z.infer<typeof documentXrayResponseSchema>;

// ──────────────────────────────────────────────────────────────────────
// report-default-template — the seeded default report template id.
//
// SINGLE SOURCE OF TRUTH for both the MIDDLEWARE seed (which upserts the one
// `kind:"report"` row under this id) and the APP onboarding bootstrap (which
// sets `reportOverlay.templateId` to it for the utility scenario so the live
// render fills the real sample invoice). It lives in `@groundx/shared` — not in
// middleware alongside `SAMPLE_PROJECT_ID` — because the app cannot import
// middleware, and both sides must agree on the exact id the render endpoint
// looks up. (The reserved owner sentinel that marks it public is server-only and
// lives in the middleware seed.)
// ──────────────────────────────────────────────────────────────────────
export const SAMPLE_REPORT_TEMPLATE_ID = "rt-sample-utility-bill";
