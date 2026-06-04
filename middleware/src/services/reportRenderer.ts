/**
 * Smart Report render service (2026-05-29-smart-report-screen Phase 6 /
 * design.md D3-D5).
 *
 * Runs a report `Template` over a `ContentScope` and returns ordered, cited
 * sections. The `POST /api/widgets/smart-report/reports/render` endpoint is the
 * real caller; this module owns the render contract, the scope → doc-set
 * resolver, and the report-kind save bridge.
 *
 * THREE pieces are RE-ADDED here (deferred out of Phase 2 as test-only / no
 * caller per the locked "no code with no caller" rule — they now have the
 * render + Save endpoints as their real consumers):
 *
 *  1. `resolveScopeDocSet(scope, index)` + `ScopeDocIndex` + the
 *     `UTILITY_REPORT_DOC_INDEX` — scope → doc set. The render service uses it
 *     to know which documents a `ContentScope` targets (the live multi-doc
 *     search over that doc set is Phase 7 / WF-10; this resolves the SHAPE).
 *  2. `reportTemplateToSaveInput(template)` — maps the app-owned
 *     `ReportTemplate` to the shared report-kind `TemplateSaveInput` consumed by
 *     the `saveTemplate` repo API (the template stays scope-independent — no
 *     scope is persisted).
 *  3. `renderReport(request, deps)` — runs the persisted Template over a
 *     `ContentScope`: a `section_ids` subset scopes a re-render; the sample
 *     renders `preview_only`; a BYO scope returns the gate envelope (#10); the
 *     no-template / empty-scope states render gracefully; the edge cases
 *     degrade visibly.
 *
 * The render is fully live — each section's question fans through
 * `groundedAnswerOverScope` (search + grounded generation + WF-06b
 * verification). There is no mock/fixture path; tests inject fake GroundX / LLM
 * clients at the dependency seam.
 */

import {
  parseTemplate,
  type ContentScope,
  type GeneratedResult,
  type RenderedSection,
  type TemplateSaveInput,
} from "@groundx/shared";

import { groundedAnswerOverScope, type GroundedAnswerDeps } from "./groundedAnswer.js";
import type { GroundXClient, LlmClient } from "../types.js";

// ──────────────────────────────────────────────────────────────────────
// App-owned report template shapes (the durable, scope-independent artifact).
// Mirrors app `types/report.ts` D3; the template is the question list, scope is
// a render-time input recorded on the RESULT, never stored on the template.
// ──────────────────────────────────────────────────────────────────────

/** How a section's generated body renders (¶ / • / ▦). */
export type ReportSectionRenderAs = "PARAGRAPH" | "BULLETS" | "TABLE";

/** One report section — a pinned question + display metadata. Scope-independent. */
export interface ReportSection {
  id: string;
  /** snake_case, e.g. "charge_breakdown". */
  name: string;
  renderAs: ReportSectionRenderAs;
  /** The prompt run at render time. */
  question: string;
  /** Literal variables only in v1 (#12). */
  variables: string[];
  /** One rule per line. */
  instructions?: string;
  pinnedFromTurnId?: string;
}

/** A report template — an ordered list of sections. No scope, no version (#13). */
export interface ReportTemplate {
  id: string;
  name: string;
  format: string;
  sections: ReportSection[];
}

// ──────────────────────────────────────────────────────────────────────
// Scope → doc-set resolver. ScopeDocIndex is a per-bucket map of
// filter-field-value → doc ids, plus the group memberships. resolveScopeDocSet
// turns ANY ContentScope shape into the concrete doc id set it targets.
// ──────────────────────────────────────────────────────────────────────

/**
 * A doc-organization index: for each bucket, the docs it holds keyed by their
 * `projectId` filter-field value (`"*"` = every doc in the bucket, used when a
 * scope carries no filter), plus the group → doc-set memberships for
 * cross-bucket scopes. This is the doc-org map a real deployment derives from
 * GroundX; the fixture index hardcodes the demo content.
 */
export interface ScopeDocIndex {
  /** bucketId → (projectId filter value → doc ids). `"*"` lists the whole bucket. */
  buckets: Record<number, Record<string, string[]>>;
  /** groupId → doc ids (cross-bucket membership). */
  groups: Record<number, string[]>;
}

/**
 * The default doc-org index for the report demos. The Utility bill lives in
 * the shared samples bucket under the real seeded `projectId` filter value; the
 * Solar group is a multi-doc stub proving the cross-bucket scope SHAPE resolves.
 * A real deployment derives this index from GroundX rather than hardcoding it.
 */
export const UTILITY_REPORT_DOC_INDEX: ScopeDocIndex = {
  buckets: {
    28454: {
      "*": ["utility-bill-2026-04"],
      "proj_c7701da7-0e08-482a-a496-df9dfe991613": ["utility-bill-2026-04"],
      proj_utility: ["utility-bill-2026-04"],
    },
  },
  groups: {
    9001: ["solar-doc-1", "solar-doc-2", "solar-doc-3"],
  },
};

/** Normalize a filter value (scalar | array) to a string[]. */
function filterValues(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Resolve any `ContentScope` shape to the concrete doc-id set it targets,
 * against a `ScopeDocIndex`. Returns `null` when the index can't place the
 * scope (unknown bucket/group). The composable `filter` is honored on every
 * shape (per the locked ContentScope contract): a `bucket` with a `projectId`
 * filter resolves to that project's docs; a bare `bucket` resolves to the
 * whole bucket (`"*"`).
 */
export function resolveScopeDocSet(
  scope: ContentScope,
  index: ScopeDocIndex,
): string[] | null {
  if (scope.type === "documents") {
    // An explicit doc list IS the doc set (the index doesn't gate it).
    return scope.documentIds;
  }
  if (scope.type === "group") {
    return index.groups[scope.groupId] ?? null;
  }
  // bucket (== workspace), optionally project-filtered.
  const bucket = index.buckets[scope.bucketId];
  if (!bucket) return null;
  const projectIds = filterValues(scope.filter?.projectId);
  const hasFilter = scope.filter != null && Object.keys(scope.filter).length > 0;
  if (projectIds.length === 0) {
    // No filter → whole workspace. A filtered scope without projectId is not
    // understood by this product resolver and must not silently widen.
    if (hasFilter) return null;
    return bucket["*"] ?? null;
  }
  const docs = new Set<string>();
  for (const projectId of projectIds) {
    for (const id of bucket[projectId] ?? []) docs.add(id);
  }
  return docs.size > 0 ? [...docs] : null;
}

// ──────────────────────────────────────────────────────────────────────
// Save bridge — ReportTemplate → the shared report-kind TemplateSaveInput.
// The server-side `saveTemplate` repo API already exists; this maps the
// app-owned template onto its report-kind wire shape (scope-independent).
// ──────────────────────────────────────────────────────────────────────

/**
 * Map a `ReportTemplate` to the shared `report`-kind `TemplateSaveInput` the
 * `saveTemplate` repo API consumes. The template is scope-independent — NO
 * scope is persisted (scope is a render-time input recorded on the result). The
 * section shape is preserved verbatim into the report body; the shared
 * `reportBodySchema` accepts it (`.passthrough()` on the section objects).
 */
export function reportTemplateToSaveInput(template: ReportTemplate): TemplateSaveInput {
  return {
    id: template.id,
    kind: "report",
    name: template.name,
    body: {
      sections: template.sections.map((section) => ({
        id: section.id,
        name: section.name,
        renderAs: section.renderAs,
        question: section.question,
        variables: section.variables,
        ...(section.instructions !== undefined ? { instructions: section.instructions } : {}),
        ...(section.pinnedFromTurnId !== undefined
          ? { pinnedFromTurnId: section.pinnedFromTurnId }
          : {}),
      })),
    },
  };
}

/**
 * Reconstruct an app-owned `ReportTemplate` from a persisted template row — the
 * READ side of the save bridge above (`getTemplate` → this). The persisted
 * `bodyJson` is validated through the shared `parseTemplate` (the single
 * boundary sanitizer) as a full `report`-kind `Template`, then the section list
 * is mapped back into the app `ReportSection` shape the render path reads.
 * Returns `null` for a non-report kind or a body that doesn't validate — the
 * caller treats that as "no usable template" (the graceful no-template state).
 *
 * `format` is NOT persisted (the template is the question list; format is a
 * presentation detail recorded elsewhere), so it reconstructs as an empty
 * string — the render path does not read it.
 */
export function reportTemplateFromRecord(record: {
  id: string;
  kind: string;
  name: string;
  bodyJson: string;
  groundxUsername?: string;
}): ReportTemplate | null {
  if (record.kind !== "report") return null;
  let body: unknown;
  try {
    body = JSON.parse(record.bodyJson);
  } catch {
    return null;
  }
  const parsed = parseTemplate({
    id: record.id,
    kind: "report",
    name: record.name,
    ownerUsername: record.groundxUsername ?? "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    body,
  });
  if (!parsed || parsed.kind !== "report") return null;

  const sections: ReportSection[] = [];
  for (const raw of parsed.body.sections) {
    const s = raw as Record<string, unknown>;
    if (
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      typeof s.renderAs !== "string" ||
      typeof s.question !== "string" ||
      !Array.isArray(s.variables)
    ) {
      return null;
    }
    sections.push({
      id: s.id,
      name: s.name,
      renderAs: s.renderAs as ReportSectionRenderAs,
      question: s.question,
      variables: s.variables.filter((v): v is string => typeof v === "string"),
      ...(typeof s.instructions === "string" ? { instructions: s.instructions } : {}),
      ...(typeof s.pinnedFromTurnId === "string" ? { pinnedFromTurnId: s.pinnedFromTurnId } : {}),
    });
  }
  return { id: parsed.id, name: parsed.name, format: "", sections };
}

// ──────────────────────────────────────────────────────────────────────
// Render contract.
// ──────────────────────────────────────────────────────────────────────

export interface RenderReportRequest {
  templateId: string;
  scope: ContentScope;
  /** Variable bindings ({var} → value) resolved into section questions/bodies. */
  variables: Record<string, string>;
  /** A subset of section ids to (re-)render; `null` = the whole template. */
  sectionIds: string[] | null;
  chatSessionId: string;
  parentMessageId: string | null;
}

/**
 * One rendered section in the wire response (snake_case, per the spec).
 *
 * single-source — 2026-05-31-generated-result-shared. The generated-result core
 * (`body` + citations + `confidence?` + `warnings?`) is DERIVED from the shared
 * `RenderedSection` (the Report specialization of the shared generated-result
 * shape) rather than re-declared, so the report body/citation/confidence/warning
 * contract cannot drift from Extract's. Only the display layer (`name`,
 * `render_as`) and the snake_case wire alias `cites` (= the shared `citations`)
 * are layered on top. The `_assertRenderedSectionWire` below pins it under tsc.
 */
export type RenderedSectionWire = Pick<RenderedSection, "body" | "confidence" | "warnings"> & {
  name: string;
  render_as: ReportSectionRenderAs;
  /** snake_case wire alias for the shared `RenderedSection.citations`. */
  cites: RenderedSection["citations"];
};

// generated-result drift guard (Report side) — confirms the wire's
// generated-result core matches the shared `RenderedSection` core. If the shared
// `RenderedSection` body/citations/confidence/warnings contract drifts (or this
// wire is re-forked back to a free-standing interface that diverges), the
// bidirectional `Eq` evaluates `false` and `Assert<false>` fails tsc. Lives in
// this PRODUCTION file (middleware `tsconfig.json` excludes `*.test.ts`). The
// `Eq<>` precedent is `app/src/api/chatSessions.test.ts:58`.
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type WireGeneratedCore = Pick<RenderedSectionWire, "body" | "confidence" | "warnings"> & {
  citations: RenderedSectionWire["cites"];
};
type SharedGeneratedCore = Pick<RenderedSection, "body" | "citations" | "confidence" | "warnings">;
type _assertRenderedSectionWire = Assert<Eq<WireGeneratedCore, SharedGeneratedCore>>;

/** The render endpoint's success wire response. */
export interface RenderReportResponse {
  report_id: string;
  template_id: string;
  status: "idle" | "streaming" | "complete" | "error";
  sections: RenderedSectionWire[];
  resolved_variables: Record<string, string>;
  export_formats: ("pdf" | "md" | "link")[];
  preview_only: boolean;
  /**
   * Why an EMPTY render (`sections: []`) is empty — so the surface can show the
   * right copy instead of one ambiguous empty state
   * (make-illegal-states-unrepresentable). Two genuinely different user
   * situations:
   *   - `"no_template"` — the new-customer norm: no report template exists for
   *     `template_id` yet → "create or pick a report template".
   *   - `"empty_scope"` — a template exists but the scope resolves to zero docs
   *     → "no documents match this scope".
   * Absent on a NON-empty render (the section list is self-explanatory).
   */
  reason?: "no_template" | "empty_scope";
}

/**
 * The gate envelope (#10) — returned instead of a render when the action
 * requires sign-in (a BYO scope, or Save/Export). The client opens the shared
 * `commitGate` flow (the same gate Extract uses). Distinguishable from a render
 * by the `gated` discriminant.
 */
export interface RenderGateResponse {
  gated: true;
  gate: "byo" | "save" | "export";
  reason: string;
}

export interface RenderReportDeps {
  /** The samples bucket id — a scope on this bucket is a sample (preview), not BYO. */
  samplesBucketId: number | null;
  /**
   * The doc-org index `resolveScopeDocSet` resolves the scope against. Defaults
   * to `UTILITY_REPORT_DOC_INDEX` (the demo doc-org map); a real deployment
   * passes a GroundX-derived index.
   */
  docIndex?: ScopeDocIndex;
  /**
   * Load the report Template by id (the SERVER source of truth). The live path
   * reads each section's `question` from THIS template, never the client
   * request (one source of truth). When it resolves `null` (the new-customer
   * norm — `Pin→template = NO auto`), `renderReport` returns the graceful
   * no-template state. The live route always supplies this.
   */
  getTemplate: (templateId: string) => Promise<ReportTemplate | null>;
  /**
   * Live-generation deps (mirrors `ExtractFieldDeps` / the chat router). These
   * are REQUIRED — `renderReport` throws a clear error when a non-empty sample
   * scope reaches the live fan-out without them (the Extract / RAG required-deps
   * guard), never a "not yet wired" placeholder.
   */
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
  llmClient?: LlmClient;
  llmModelId?: string;
  /** Server-derived RBAC / tenant filter (NEVER client-supplied). */
  rbacFilter?: Record<string, unknown>;
}

/** {var} token regex (literal variables only, #12). */
const VAR_TOKEN = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * The display metadata a section carries on TOP of the shared generated-result
 * core (`body` + `citations` + `confidence?` + `warnings?`). Both the fixture
 * path and the live path produce this same shape, then route through the ONE
 * `degradeSection` below — so the variable-substitution + unresolved-`{var}` +
 * no-support degradations have a single home (§4).
 */
type SectionRender = GeneratedResult & {
  body: string;
  name: string;
  renderAs: ReportSectionRenderAs;
};

/**
 * The ONE section degradation path the FIXTURE and LIVE paths share (§4).
 * Operates on the shared generated-result core:
 *   - no-support — ZERO citations → em-dash + `⚠ no support in docs` +
 *     low-confidence flag (the live trigger replaces the fixture's `.noSource`
 *     boolean: a fixture section with empty `cites` degrades identically);
 *   - variable substitution — bound `{var}` → value (recorded on `resolved`);
 *   - unresolved-variable warning — an unbound `{var}` keeps its placeholder and
 *     adds a "bind it" warning.
 */
function degradeSection(
  section: SectionRender,
  variables: Record<string, string>,
  resolved: Record<string, string>,
): RenderedSectionWire {
  // No supporting source (zero citations) → em-dash + low-confidence flag
  // (overrides body/cites). Derived from the citation count, not a flag — so a
  // live result with no verified citations degrades exactly like the fixture's
  // no-source section.
  if (section.citations.length === 0) {
    return {
      name: section.name,
      render_as: section.renderAs,
      body: "—",
      cites: [],
      confidence: 0.1,
      warnings: ["⚠ no support in docs"],
    };
  }

  const warnings = [...(section.warnings ?? [])];
  let body = section.body;
  // Substitute bound variables; collect unresolved ones.
  const unresolved = new Set<string>();
  body = body.replace(VAR_TOKEN, (match, name: string) => {
    const value = variables[name];
    if (value !== undefined) {
      resolved[name] = value;
      return value;
    }
    unresolved.add(name);
    return match; // keep the {var} placeholder
  });
  if (unresolved.size > 0) {
    warnings.push(
      `bind it: unresolved variable(s) ${[...unresolved].map((v) => `{${v}}`).join(", ")}`,
    );
  }

  return {
    name: section.name,
    render_as: section.renderAs,
    body,
    cites: section.citations,
    ...(section.confidence !== undefined ? { confidence: section.confidence } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** A complete, empty render — the no-template / empty-scope idle shape. The
 * `reason` discriminator tells the surface WHICH empty state to show. */
function emptyRender(
  templateId: string,
  reason: "no_template" | "empty_scope",
): RenderReportResponse {
  return {
    report_id: `rr-${templateId}`,
    template_id: templateId,
    status: "complete",
    sections: [],
    resolved_variables: {},
    export_formats: ["pdf", "md", "link"],
    preview_only: true,
    reason,
  };
}

/**
 * Render a report `Template` over a `ContentScope`. Returns the ordered cited
 * sections, OR the gate envelope (#10) when the scope is BYO, OR a graceful
 * empty render (no template / empty scope).
 *
 * Ordering (all BEFORE any live search/LLM fan-out):
 *   1. BYO gate (#10) — a non-sample scope requires sign-in.
 *   2. no-template state — when `getTemplate(templateId)` resolves `null` (the
 *      new-customer norm), return the no-template empty render (`reason:
 *      "no_template"`). NO sample template is seeded; its absence never errors.
 *   3. empty-scope idle — a scope that resolves to zero docs → empty render
 *      (`reason: "empty_scope"`).
 *   4. fan-out — the live path searches each section's `question` (read from the
 *      persisted Template, never the request) over the resolved scope, grounds
 *      the LLM, and verifies each citation (WF-06b) via the shared
 *      `groundedAnswerOverScope` seam.
 *
 * There is no mock/fixture path — the runtime always runs the live render.
 * Tests inject fake GroundX / LLM clients at the dependency seam.
 */
export async function renderReport(
  request: RenderReportRequest,
  deps: RenderReportDeps,
): Promise<RenderReportResponse | RenderGateResponse> {
  // 1. Sample vs BYO. A scope on the samples bucket (or the demo group) is a
  // sample preview; any other scope is BYO → gate (#10), mirroring Extract.
  const isSample =
    (request.scope.type === "bucket" && request.scope.bucketId === deps.samplesBucketId) ||
    request.scope.type === "group";
  if (!isSample) {
    return {
      gated: true,
      gate: "byo",
      reason: "Rendering a report over your own documents requires sign-in.",
    };
  }

  // 2. No-template state — the legitimate new-customer starting point. When
  // `getTemplate` resolves `null`, there is no report template yet → the
  // graceful no-template empty render, BEFORE any search/LLM. No sample
  // template is seeded; the absence never errors (`Pin→template = NO auto`).
  const template = await deps.getTemplate(request.templateId);
  if (!template) {
    return emptyRender(request.templateId, "no_template");
  }

  // Resolve the scope → doc set. This is what the live render fans each
  // section's question over (a scope the index can't place → empty render).
  const docIndex = deps.docIndex ?? UTILITY_REPORT_DOC_INDEX;
  const docSet = resolveScopeDocSet(request.scope, docIndex);

  // 3. No documents in scope → an empty render (the surface shows its idle
  // state). Distinct from no-template via the `reason` discriminator.
  if (docSet === null || docSet.length === 0) {
    return emptyRender(request.templateId, "empty_scope");
  }

  // 4. LIVE path — a real user-created Template exists; fan each section's
  // `question` (from THAT template) through the shared seam. The live deps are
  // required (the Extract / RAG required-deps guard).
  if (!deps.groundxClient || !deps.groundxApiKey || !deps.llmClient || !deps.llmModelId) {
    throw new Error(
      "live report render requires groundxClient + groundxApiKey + llmClient + llmModelId",
    );
  }
  const groundedDeps: GroundedAnswerDeps = {
    groundxClient: deps.groundxClient,
    groundxApiKey: deps.groundxApiKey,
    llmClient: deps.llmClient,
    llmModelId: deps.llmModelId,
    ...(deps.rbacFilter ? { rbacFilter: deps.rbacFilter } : {}),
  };

  // section_ids subset: render only those sections, IN TEMPLATE ORDER. `null`
  // = whole template; `[]` = explicit empty subset (no sections).
  const subset = request.sectionIds;
  const liveSections =
    subset === null
      ? template.sections
      : template.sections.filter((s) => subset.includes(s.name) || subset.includes(s.id));

  const resolved: Record<string, string> = {};
  const sections: RenderedSectionWire[] = [];
  for (const section of liveSections) {
    // The section question comes from the PERSISTED template — never the
    // client request (one source of truth).
    const grounded = await groundedAnswerOverScope(section.question, request.scope, groundedDeps);
    sections.push(
      degradeSection(
        {
          name: section.name,
          renderAs: section.renderAs,
          body: grounded.body,
          citations: grounded.citations,
          ...(grounded.confidence !== undefined ? { confidence: grounded.confidence } : {}),
          ...(grounded.warnings !== undefined ? { warnings: grounded.warnings } : {}),
        },
        request.variables,
        resolved,
      ),
    );
  }

  return {
    report_id: `rr-${request.templateId}`,
    template_id: request.templateId,
    status: "complete",
    sections,
    resolved_variables: resolved,
    export_formats: ["pdf", "md", "link"],
    preview_only: true,
  };
}
