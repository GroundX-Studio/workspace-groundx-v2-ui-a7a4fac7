/**
 * Client for the Smart Report endpoints (2026-05-29-smart-report-screen Phase 6).
 *
 * Closes the client↔server round-trip the closeout review found missing:
 *
 *  • `renderReport` — `POST /api/widgets/smart-report/reports/render`. Runs a
 *    report Template over a `ContentScope` and returns the ordered, cited
 *    sections via the live render path; a `sectionIds` subset
 *    scopes a re-render. Maps the snake_case wire response to the app-owned
 *    `RenderedReport` the `SmartReportRender` surface consumes — OR surfaces the
 *    gate envelope (#10) for a BYO scope. Self-triggers `ensureServerChatSession`
 *    so the endpoint doesn't 404 before the chat-session row exists (mirrors
 *    `extractField`).
 *
 *  • `saveReportTemplate` — `POST /api/widgets/smart-report/reports`. Persists a
 *    report Template for a signed-in member via the shared `saveTemplate` repo
 *    API (the server bridges the app-owned `ReportTemplate` → the shared
 *    report-kind `TemplateSaveInput`). Anonymous callers get a 401 the caller
 *    turns into the sign-in gate.
 *
 * The wire shapes mirror the middleware contract in `services/reportRenderer.ts`
 * + the `app.ts` endpoints. `export ▾ 🔒` stays a locked future (no client
 * caller here yet — see the widget README).
 */

import { ensureServerChatSession, type ChatSessionEnsureClient } from "@/api/chatSessions";
import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";
import { ApiError } from "@groundx/shared";
import type { ContentScope, RenderedSection } from "@groundx/shared";
import type { RenderedReport, ReportSectionRenderAs } from "@/types/report";

const RENDER_ROUTE = "/api/widgets/smart-report/reports/render";
const SAVE_ROUTE = "/api/widgets/smart-report/reports";
const TEMPLATE_READ_ROUTE = "/api/widgets/smart-report/reports/template";

export class SmartReportApiError extends ApiError {
  constructor(message: string, status: number, detail: unknown) {
    super(message, status, detail);
    this.name = "SmartReportApiError";
  }
}

// ── Render ────────────────────────────────────────────────────────────────

export interface RenderReportInput {
  templateId: string;
  scope: ContentScope;
  chatSessionId: string;
  /** Variable bindings ({var} → value) resolved into section bodies. */
  variables?: Record<string, string>;
  /** A subset of section ids to re-render; omitted/`null` = the whole template. */
  sectionIds?: string[] | null;
}

/**
 * One rendered section in the snake_case wire response.
 *
 * single-source — 2026-05-31-generated-result-shared. The generated-result core
 * (`body` + citations + `confidence?` + `warnings?`) is DERIVED from the shared
 * `RenderedSection` (the Report specialization of the shared generated-result
 * shape) rather than re-declared, so the report body/citation/confidence/warning
 * contract cannot drift from Extract's. Only the display layer (`name`,
 * `render_as`) and the snake_case wire alias `cites` (= the shared `citations`)
 * are layered on top. `wireSectionToRendered` maps this wire onto a full
 * `RenderedSection` (`cites`→`citations`, `name`→`sectionId`) unchanged.
 */
export type RenderedSectionWire = Pick<RenderedSection, "body" | "confidence" | "warnings"> & {
  name: string;
  render_as: ReportSectionRenderAs;
  /** snake_case wire alias for the shared `RenderedSection.citations`. */
  cites: RenderedSection["citations"];
};

/** The render endpoint's success wire response. */
interface RenderReportResponseWire {
  report_id: string;
  template_id: string;
  status: RenderedReport["status"];
  sections: RenderedSectionWire[];
  resolved_variables: Record<string, string>;
  export_formats: RenderedReport["exportFormats"];
  preview_only: boolean;
}

/** The gate envelope (#10) — a BYO/sign-in-required scope returns this. */
interface RenderGateResponseWire {
  gated: true;
  gate: "byo" | "save" | "export";
  reason: string;
}

/** Discriminated client result: a rendered report, or a sign-in gate envelope. */
export type RenderReportResult =
  | { gated: false; report: RenderedReport }
  | { gated: true; gate: "byo" | "save" | "export"; reason: string };

/** Map one snake_case wire section to the app-owned `RenderedReportSection`. */
function wireSectionToRendered(wire: RenderedSectionWire) {
  // The wire keys sections by `name` (id === name in the fixture); the render
  // surface keys its testids by `sectionId`, so we carry the name through as the
  // section id. The shared `RenderedSection` result holds the markdown body +
  // citations + confidence/warnings.
  const result: RenderedSection = {
    sectionId: wire.name,
    body: wire.body,
    citations: wire.cites ?? [],
    ...(wire.confidence !== undefined ? { confidence: wire.confidence } : {}),
    ...(wire.warnings !== undefined ? { warnings: wire.warnings } : {}),
  };
  return {
    sectionId: wire.name,
    name: wire.name,
    renderAs: wire.render_as,
    result,
  };
}

function isGateWire(body: unknown): body is RenderGateResponseWire {
  return !!body && typeof body === "object" && (body as { gated?: unknown }).gated === true;
}

/**
 * Render a report Template over a `ContentScope`. Returns the mapped
 * `RenderedReport` (or the gate envelope). Throws `SmartReportApiError` on a
 * non-2xx response.
 */
type ChatSessionEnsureDependency = Pick<ChatSessionEnsureClient, "ensureServerChatSession">;

export async function renderReport(
  input: RenderReportInput,
  chatSessionEnsure: ChatSessionEnsureDependency = { ensureServerChatSession },
): Promise<RenderReportResult> {
  // Self-trigger ensure + wait so the endpoint's chat-session ownership check
  // doesn't 404 when the row hasn't been created yet (mirrors extractField).
  await chatSessionEnsure.ensureServerChatSession({
    id: input.chatSessionId,
    onboardingSessionId: input.chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });

  const requestBody = {
    template_id: input.templateId,
    scope: input.scope,
    variables: input.variables ?? {},
    section_ids: input.sectionIds ?? null,
    chat_session_id: input.chatSessionId,
    parent_message_id: null,
  };

  let res: Response;
  try {
    res = await csrfFetch(RENDER_ROUTE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    captureException(err, { route: RENDER_ROUTE });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new SmartReportApiError(`POST ${RENDER_ROUTE} failed: ${res.status}`, res.status, detail);
    if (res.status >= 500) {
      captureException(error, { route: RENDER_ROUTE, status: res.status });
    }
    throw error;
  }

  const body = (await res.json()) as RenderReportResponseWire | RenderGateResponseWire;
  if (isGateWire(body)) {
    return { gated: true, gate: body.gate, reason: body.reason };
  }
  const report: RenderedReport = {
    reportId: body.report_id,
    templateId: body.template_id,
    scope: input.scope,
    status: body.status,
    sections: (body.sections ?? []).map(wireSectionToRendered),
    resolvedVariables: body.resolved_variables ?? {},
    exportFormats: body.export_formats ?? [],
    previewOnly: body.preview_only,
  };
  return { gated: false, report };
}

// ── Save ────────────────────────────────────────────────────────────────

/** The app-owned report template the member-Save persists (scope-independent). */
export interface SaveReportTemplateInput {
  id: string;
  name: string;
  format: string;
  sections: {
    id: string;
    name: string;
    renderAs: ReportSectionRenderAs;
    question: string;
    variables: string[];
    instructions?: string;
    pinnedFromTurnId?: string;
  }[];
}

export interface SaveReportTemplateResult {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * Persist a report Template for a signed-in member. The server bridges the
 * app-owned `ReportTemplate` → the shared report-kind `TemplateSaveInput` and
 * writes it via the same `saveTemplate` repo API Extract uses. A 401 (anonymous)
 * is the caller's cue to open the sign-in gate.
 */
export async function saveReportTemplate(
  input: SaveReportTemplateInput,
): Promise<SaveReportTemplateResult> {
  let res: Response;
  try {
    res = await csrfFetch(SAVE_ROUTE, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // The server's `parseReportTemplate` reads a `{ template: {...} }` envelope.
      body: JSON.stringify({ template: input }),
    });
  } catch (err) {
    captureException(err, { route: SAVE_ROUTE });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new SmartReportApiError(`POST ${SAVE_ROUTE} failed: ${res.status}`, res.status, detail);
    if (res.status >= 500) {
      captureException(error, { route: SAVE_ROUTE, status: res.status });
    }
    throw error;
  }
  return (await res.json()) as SaveReportTemplateResult;
}

// ── Read (template definition, for the builder) ─────────────────────────────

/** A report template's scope-independent definition (questions, no answers). */
export interface ReportTemplateDefinition {
  id: string;
  name: string;
  sections: SaveReportTemplateInput["sections"];
}

export interface GetReportTemplateResult {
  template: ReportTemplateDefinition;
  /** Whether the CALLER owns this template (FALSE for the public sample / anon). */
  owned: boolean;
}

/**
 * Read a report template's section definitions by id — the builder uses this to
 * seed its editable base rows. Access-scoped server-side: anon reads only the
 * public sample, members read the sample or their own. A `404` (not found / not
 * visible) maps to `null`. `owned` drives the builder's fork-on-edit (editing a
 * NOT-owned template saves a new member-owned copy).
 */
export async function getReportTemplate(id: string): Promise<GetReportTemplateResult | null> {
  const route = `${TEMPLATE_READ_ROUTE}/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await csrfFetch(route, { method: "GET", credentials: "include" });
  } catch (err) {
    captureException(err, { route });
    throw err;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new SmartReportApiError(`GET ${route} failed: ${res.status}`, res.status, detail);
    if (res.status >= 500) {
      captureException(error, { route, status: res.status });
    }
    throw error;
  }
  const body = (await res.json()) as {
    template: { id: string; name: string; sections: ReportTemplateDefinition["sections"] };
    owned: boolean;
  };
  return {
    template: { id: body.template.id, name: body.template.name, sections: body.template.sections },
    owned: body.owned === true,
  };
}
