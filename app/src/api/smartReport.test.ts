import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));

import type { ContentScope, RenderedSection } from "@groundx/shared";
import { ApiError } from "@groundx/shared";

import { SmartReportApiError, renderReport, saveReportTemplate, type RenderedSectionWire } from "./smartReport";

/**
 * generated-result drift guard (Report side, app) —
 * 2026-05-31-generated-result-shared.
 *
 * The app's `RenderedSectionWire` derives its generated-result core (`body` +
 * citations + `confidence?` + `warnings?`) from the shared `RenderedSection`
 * (the Report specialization of the shared generated-result shape); only the
 * snake_case display layer (`name`, `render_as`) + the `cites` alias for
 * `citations` are layered on top. This compile-time assert is load-bearing under
 * `npm run build` (tsc — the app tsconfig includes the src tree): if the wire is
 * re-forked to a free-standing interface that diverges from the shared core, the
 * bidirectional `Eq` evaluates `false` and `Assert<false>` fails the build. The
 * `Eq<>` precedent is `app/src/api/chatSessions.test.ts:58`.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type WireGeneratedCore = Pick<RenderedSectionWire, "body" | "confidence" | "warnings"> & {
  citations: RenderedSectionWire["cites"];
};
type SharedGeneratedCore = Pick<RenderedSection, "body" | "citations" | "confidence" | "warnings">;
type _assertRenderedSectionWire = Assert<Eq<WireGeneratedCore, SharedGeneratedCore>>;

const originalFetch = global.fetch;
const ensureServerChatSession = vi.fn(async () => undefined);
let apiResponses: Response[] = [];

const renderReportForTest = (input: Parameters<typeof renderReport>[0]) =>
  renderReport(input, { ensureServerChatSession });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function queueApiResponse(body: unknown, status = 200): void {
  apiResponses.push(jsonResponse(body, status));
}

function apiFetchCalls() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path !== "/api/csrf/token");
}

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

const RENDER_WIRE = {
  report_id: "rr-rt-utility-ic-brief",
  template_id: "rt-utility-ic-brief",
  status: "complete",
  sections: [
    {
      name: "billing_summary",
      render_as: "PARAGRAPH",
      body: "The April 2026 statement totals **$18,742.16**.",
      cites: [{ documentId: "utility-bill-2026-04", page: 1, tier: "exact" }],
      confidence: 0.96,
    },
    {
      name: "charge_breakdown",
      render_as: "TABLE",
      body: "| Category | Amount |\n| --- | --- |\n| Demand | $9,418.00 |",
      cites: [{ documentId: "utility-bill-2026-04", page: 3, tier: "exact" }],
    },
  ],
  resolved_variables: {},
  export_formats: ["pdf", "md", "link"],
  preview_only: true,
};

beforeEach(() => {
  apiResponses = [];
  global.fetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async (input) => {
    if (input === "/api/csrf/token") {
      return jsonResponse({ token: "csrf-fixture" });
    }
    const next = apiResponses.shift();
    if (!next) throw new Error(`unexpected fetch in smart-report test: ${String(input)}`);
    return next;
  });
  ensureServerChatSession.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe("renderReport (smart-report Phase 6 client caller)", () => {
  it("POSTs the snake_case render request to the render endpoint", async () => {
    queueApiResponse(RENDER_WIRE);
    await renderReportForTest({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
      chatSessionId: "chat-1",
    });
    const calls = apiFetchCalls();
    expect(calls).toHaveLength(1);
    const [path, init] = calls[0];
    expect(path).toBe("/api/widgets/smart-report/reports/render");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.template_id).toBe("rt-utility-ic-brief");
    expect(body.chat_session_id).toBe("chat-1");
    expect(body.scope).toEqual(UTILITY_SCOPE);
    expect(body.section_ids).toBeNull();
  });

  it("maps the snake_case wire response to a RenderedReport (sectionId, renderAs, result)", async () => {
    queueApiResponse(RENDER_WIRE);
    const result = await renderReportForTest({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
      chatSessionId: "chat-1",
    });
    expect(result.gated).toBe(false);
    if (result.gated) throw new Error("expected a rendered report");
    const report = result.report;
    expect(report.reportId).toBe("rr-rt-utility-ic-brief");
    expect(report.templateId).toBe("rt-utility-ic-brief");
    expect(report.previewOnly).toBe(true);
    expect(report.scope).toEqual(UTILITY_SCOPE);
    expect(report.sections.map((s) => s.sectionId)).toEqual(["billing_summary", "charge_breakdown"]);
    expect(report.sections[0].renderAs).toBe("PARAGRAPH");
    expect(report.sections[0].name).toBe("billing_summary");
    // The shared RenderedSection result carries the markdown body + citations.
    expect(report.sections[0].result.body).toContain("18,742.16");
    expect(report.sections[0].result.sectionId).toBe("billing_summary");
    expect(report.sections[0].result.citations[0].documentId).toBe("utility-bill-2026-04");
    expect(report.sections[0].result.confidence).toBe(0.96);
  });

  it("passes a section-id subset for a re-render", async () => {
    queueApiResponse({ ...RENDER_WIRE, sections: [RENDER_WIRE.sections[0]] });
    await renderReportForTest({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
      chatSessionId: "chat-1",
      sectionIds: ["billing_summary"],
    });
    const [, init] = apiFetchCalls()[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.section_ids).toEqual(["billing_summary"]);
  });

  it("surfaces the gate envelope (#10) as a gated result instead of a report", async () => {
    queueApiResponse({ gated: true, gate: "byo", reason: "Sign in." });
    const result = await renderReportForTest({
      templateId: "rt-utility-ic-brief",
      scope: { type: "bucket", bucketId: 99999 },
      chatSessionId: "chat-1",
    });
    expect(result.gated).toBe(true);
    if (!result.gated) throw new Error("expected a gate envelope");
    expect(result.gate).toBe("byo");
  });

  it("SmartReportApiError extends the shared ApiError base (status + detail, no own fields)", () => {
    const err = new SmartReportApiError("boom", 403, { error: "not_session_owner" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SmartReportApiError");
    expect(err.status).toBe(403);
    expect(err.detail).toEqual({ error: "not_session_owner" });
  });

  it("throws SmartReportApiError with status on a non-2xx response", async () => {
    queueApiResponse({ error: "not_session_owner" }, 403);
    await expect(
      renderReportForTest({ templateId: "t", scope: UTILITY_SCOPE, chatSessionId: "chat-1" }),
    ).rejects.toMatchObject({ name: "SmartReportApiError", status: 403 });
  });
});

describe("saveReportTemplate (smart-report Phase 6 member persist)", () => {
  it("POSTs the report template under a `template` envelope to the Save endpoint", async () => {
    queueApiResponse({ id: "rt-utility-ic-brief", name: "Utility IC Brief", updatedAt: "2026-05-31T00:00:00Z" });
    const result = await saveReportTemplate({
      id: "rt-utility-ic-brief",
      name: "Utility IC Brief",
      format: "ic-brief",
      sections: [
        {
          id: "billing_summary",
          name: "billing_summary",
          renderAs: "PARAGRAPH",
          question: "Summarize the billing period and total.",
          variables: [],
        },
      ],
    });
    const calls = apiFetchCalls();
    expect(calls).toHaveLength(1);
    const [path, init] = calls[0];
    expect(path).toBe("/api/widgets/smart-report/reports");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    // The server's parseReportTemplate reads `{ template: {...} }`.
    expect(body.template.id).toBe("rt-utility-ic-brief");
    expect(body.template.sections[0].renderAs).toBe("PARAGRAPH");
    expect(result.id).toBe("rt-utility-ic-brief");
  });

  it("throws SmartReportApiError with status 401 for an anonymous caller", async () => {
    queueApiResponse({ error: "no_signed_in_user" }, 401);
    await expect(
      saveReportTemplate({ id: "x", name: "X", format: "f", sections: [] }),
    ).rejects.toMatchObject({ name: "SmartReportApiError", status: 401 });
  });
});
