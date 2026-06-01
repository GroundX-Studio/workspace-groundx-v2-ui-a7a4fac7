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
 *  3. `renderReport(request, deps)` — MOCK_MODE returns the Utility fixture; a
 *     `section_ids` subset scopes a re-render; the sample renders
 *     `preview_only`; a BYO scope returns the gate envelope (#10); the edge
 *     cases degrade visibly.
 *
 * The live multi-doc render (fan each section's question through
 * `search_groundx` + grounded generation + WF-06b verification) is Phase 7,
 * hard-blocked on WF-10 source assets — explicitly out of scope here. This
 * module is fixture-backed; a multi-doc scope SHAPE resolves and renders, but
 * the bodies come from the fixture, not a live search.
 */

import {
  parseTemplate,
  type Citation,
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
 * `project` filter-field value (`"*"` = every doc in the bucket, used when a
 * scope carries no filter), plus the group → doc-set memberships for
 * cross-bucket scopes. This is the doc-org map a real deployment derives from
 * GroundX; the fixture index hardcodes the demo content.
 */
export interface ScopeDocIndex {
  /** bucketId → (project filter value → doc ids). `"*"` lists the whole bucket. */
  buckets: Record<number, Record<string, string[]>>;
  /** groupId → doc ids (cross-bucket membership). */
  groups: Record<number, string[]>;
}

/**
 * The MOCK_MODE doc-org index for the report demos. The Utility bill lives in
 * the shared samples bucket under the `project: "utility"` filter value; the
 * Solar group is a multi-doc stub proving the cross-bucket scope SHAPE resolves
 * (live Solar content is WF-10 / Phase 7).
 */
export const UTILITY_REPORT_DOC_INDEX: ScopeDocIndex = {
  buckets: {
    28454: {
      "*": ["utility-bill-2026-04"],
      utility: ["utility-bill-2026-04"],
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
 * shape (per the locked ContentScope contract): a `bucket` with a `project`
 * filter resolves to that project's docs; a bare `bucket` resolves to the whole
 * bucket (`"*"`).
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
  const projects = filterValues(scope.filter?.project);
  if (projects.length === 0) {
    // No project filter → whole workspace.
    return bucket["*"] ?? null;
  }
  const docs = new Set<string>();
  for (const project of projects) {
    for (const id of bucket[project] ?? []) docs.add(id);
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
  mockMode: boolean;
  /** The samples bucket id — a scope on this bucket is a sample (preview), not BYO. */
  samplesBucketId: number | null;
  /**
   * The doc-org index `resolveScopeDocSet` resolves the scope against. Defaults
   * to the MOCK_MODE `UTILITY_REPORT_DOC_INDEX`; the live path passes a
   * GroundX-derived index.
   */
  docIndex?: ScopeDocIndex;
  /**
   * Load the report Template by id (the SERVER source of truth). The live path
   * reads each section's `question` from THIS template, never the client
   * request (one source of truth). When it resolves `null` (the new-customer
   * norm — `Pin→template = NO auto`), `renderReport` returns the graceful
   * no-template state. Required outside MOCK_MODE.
   */
  getTemplate?: (templateId: string) => Promise<ReportTemplate | null>;
  /**
   * Live-generation deps (mirrors `ExtractFieldDeps` / the chat router). Outside
   * MOCK_MODE these are REQUIRED — `renderReport` throws a clear error when a
   * non-empty sample scope reaches the live fan-out without them (the Extract /
   * RAG required-deps guard), never a "not yet wired" placeholder.
   */
  groundxClient?: GroundXClient;
  groundxApiKey?: string;
  llmClient?: LlmClient;
  llmModelId?: string;
  /** Server-derived RBAC / tenant filter (NEVER client-supplied). */
  rbacFilter?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────
// Fixture model — the section TEMPLATES the MOCK_MODE renderer runs. Keyed by
// templateId so the edge-case fixtures (unbound variable, no source) are
// distinct templates, not flags. Each fixture section carries the rendered
// body + cites the live path would produce. The renderer applies variable
// substitution + the no-source / unresolved-variable degradations on top.
// ──────────────────────────────────────────────────────────────────────

const UTILITY_DOC = "utility-bill-2026-04";

interface FixtureSection {
  id: string;
  name: string;
  renderAs: ReportSectionRenderAs;
  /** The body the live render would produce (pre-substitution). May carry {var} tokens. */
  body: string;
  cites: Citation[];
  confidence?: number;
  warnings?: string[];
  /** Literal variables referenced by the section (drives unresolved-variable degradation). */
  variables?: string[];
}

interface ReportFixture {
  /** Sections in template order. */
  sections: FixtureSection[];
}

const UTILITY_SECTIONS: FixtureSection[] = [
  {
    id: "billing_summary",
    name: "billing_summary",
    renderAs: "PARAGRAPH",
    body:
      "The April 2026 statement totals **$18,742.16** across 8 meters and 56 line-item " +
      "charges. The billing period runs March 1 – March 31, 2026 on account 1023456.",
    cites: [{ documentId: UTILITY_DOC, page: 1, snippet: "Total Amount Due — $18,742.16", tier: "exact" }],
    confidence: 0.96,
  },
  {
    id: "charge_breakdown",
    name: "charge_breakdown",
    renderAs: "TABLE",
    body:
      "| Category | Amount |\n| --- | --- |\n| Demand charges | $9,418.00 |\n" +
      "| Energy charges | $6,902.40 |\n| Taxes & fees | $2,421.76 |",
    cites: [{ documentId: UTILITY_DOC, page: 3, snippet: "Demand Charges — $9,418", tier: "exact" }],
    confidence: 0.93,
  },
  {
    id: "anomalies",
    name: "anomalies",
    renderAs: "BULLETS",
    body:
      "- Demand charges are 36% higher than the trailing 3-month average.\n" +
      "- Meter 4 shows a 12% kWh jump versus March 2026.",
    cites: [{ documentId: UTILITY_DOC, page: 2, snippet: "Meter 4 — 4,128 kWh", tier: "paraphrase" }],
    confidence: 0.81,
    warnings: ["low-coverage: trend baseline is a single prior statement"],
  },
  {
    id: "recommendation",
    name: "recommendation",
    renderAs: "PARAGRAPH",
    body:
      "Review the demand-charge spike before approving payment — a load-shift on Meter 4 " +
      "could recover an estimated $1,100/month.",
    cites: [{ documentId: UTILITY_DOC, page: 3, snippet: "Demand Charges — $9,418", tier: "ambient" }],
    confidence: 0.74,
  },
];

const SOLAR_STUB_SECTIONS: FixtureSection[] = [
  {
    id: "portfolio_overview",
    name: "portfolio_overview",
    renderAs: "PARAGRAPH",
    body:
      "_(stub)_ Portfolio-wide report across the Solar fund's documents — live multi-doc " +
      "render lands with WF-10.",
    cites: [{ documentId: "solar-doc-1", page: 1, tier: "ambient" }],
  },
];

/**
 * Keyed report fixtures. The base Utility template + the two edge-case
 * templates (unbound variable, no source). Solar resolves by scope shape
 * (group) rather than template id.
 */
const REPORT_FIXTURES: Record<string, ReportFixture> = {
  "rt-utility-ic-brief": { sections: UTILITY_SECTIONS },
  "rt-utility-unbound-variable": {
    sections: [
      {
        id: "billing_summary",
        name: "billing_summary",
        renderAs: "PARAGRAPH",
        body: "The billing period under review is {billing_period} on account 1023456.",
        cites: [{ documentId: UTILITY_DOC, page: 1, tier: "exact" }],
        confidence: 0.9,
        variables: ["billing_period"],
      },
    ],
  },
  "rt-utility-no-source": {
    sections: [
      {
        id: "unsupported_claim",
        name: "unsupported_claim",
        renderAs: "PARAGRAPH",
        body: "The customer has three open disputes with the utility.",
        cites: [],
      },
    ],
  },
};

/** Resolve the fixture for a render request: edge-case templates by id; else by scope shape. */
function resolveFixture(request: RenderReportRequest): ReportFixture | null {
  const byId = REPORT_FIXTURES[request.templateId];
  if (byId) return byId;
  if (request.scope.type === "group") return { sections: SOLAR_STUB_SECTIONS };
  return null;
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

/** Adapt a MOCK_MODE `FixtureSection` to the shared `SectionRender` shape, then
 * route it through the unified `degradeSection`. */
function renderFixtureSection(
  section: FixtureSection,
  variables: Record<string, string>,
  resolved: Record<string, string>,
): RenderedSectionWire {
  return degradeSection(
    {
      name: section.name,
      renderAs: section.renderAs,
      body: section.body,
      citations: section.cites,
      ...(section.confidence !== undefined ? { confidence: section.confidence } : {}),
      ...(section.warnings !== undefined ? { warnings: section.warnings } : {}),
    },
    variables,
    resolved,
  );
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
 *   4. fan-out — MOCK_MODE renders the fixture bodies; the LIVE path searches
 *      each section's `question` (read from the persisted Template, never the
 *      request) over the resolved scope, grounds the LLM, and verifies each
 *      citation (WF-06b) via the shared `groundedAnswerOverScope` seam.
 *
 * The live + fixture paths share the SAME `RenderReportResponse` shape and the
 * SAME section degradation path (`degradeSection`), so the render surface and
 * `CiteChip` are unchanged regardless of which path produced the report.
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

  // 2. No-template state — the legitimate new-customer starting point. When a
  // `getTemplate` callback is supplied (the live route always supplies it) and
  // it resolves `null`, there is no report template yet → the graceful
  // no-template empty render, BEFORE any search/LLM. No sample template is
  // seeded; the absence never errors. (MOCK_MODE callers omit `getTemplate` —
  // the fixture path drives the section bodies there.)
  let template: ReportTemplate | null = null;
  if (deps.getTemplate) {
    template = await deps.getTemplate(request.templateId);
    if (!template) {
      return emptyRender(request.templateId, "no_template");
    }
  }

  // Resolve the scope → doc set. This is what the live render fans each
  // section's question over; in MOCK_MODE it confirms the scope places real
  // documents (a scope the index can't place → empty render).
  const docIndex = deps.docIndex ?? UTILITY_REPORT_DOC_INDEX;
  const docSet = resolveScopeDocSet(request.scope, docIndex);

  // 3. No documents in scope → an empty render (the surface shows its idle
  // state). Distinct from no-template via the `reason` discriminator.
  if (docSet === null || docSet.length === 0) {
    return emptyRender(request.templateId, "empty_scope");
  }

  // 4a. LIVE path — a real user-created Template exists; fan each section's
  // `question` (from THAT template) through the shared seam. Outside MOCK_MODE
  // the live deps are required (the Extract / RAG required-deps guard).
  if (!deps.mockMode) {
    if (!template) {
      // Without a `getTemplate` callback we have no section questions to run;
      // this is a misconfiguration, not the no-template user state (which is
      // handled above when the callback resolves null).
      throw new Error(
        "live report render requires a getTemplate callback to resolve the template",
      );
    }
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

  // 4b. MOCK_MODE path — the fixture bodies (unchanged).
  const fixture = resolveFixture(request);
  if (!fixture) {
    return emptyRender(request.templateId, "empty_scope");
  }

  // section_ids subset: render only those sections, IN TEMPLATE ORDER. `null` =
  // whole template; `[]` = explicit empty subset (no sections).
  const subset = request.sectionIds;
  const sectionsToRender =
    subset === null
      ? fixture.sections
      : fixture.sections.filter((s) => subset.includes(s.name) || subset.includes(s.id));

  const resolved: Record<string, string> = {};
  const sections = sectionsToRender.map((s) => renderFixtureSection(s, request.variables, resolved));

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
