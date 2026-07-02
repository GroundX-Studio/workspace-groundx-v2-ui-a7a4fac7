import { vi } from "vitest";

import type { ContentScope } from "@groundx/shared";
import { SAMPLE_REPORT_TEMPLATE_ID } from "@groundx/shared";
import { realApi, type Api } from "@/api/client";

/**
 * report-default-template — the seeded default report template's three sections
 * (the T1-verified names: billing summary / charges by service / service
 * accounts). ONE source for both the `renderReport` seam (rendered bodies +
 * citations) and the `getReportTemplate` seam (the builder's editable section
 * definitions), so the section ids the OnboardingShell content tests + the
 * edit-§N hand-off assert stay consistent across both fakes. This is test infra
 * (a deterministic test double), NOT a client fixture — the report-empty-state
 * no-fixture guard stays green.
 */
const SAMPLE_REPORT_SECTIONS = [
  {
    id: "billing_summary",
    renderAs: "PARAGRAPH" as const,
    question: "Summarize the billing statement.",
    body: "KWIK TRIP (1147) — City of Windom, statement 2025-07-08, total due **$7,613.20**, due 2025-07-30.",
  },
  {
    id: "charges_by_service",
    renderAs: "TABLE" as const,
    question: "Break down the charges by service.",
    body: "| Service | Amount |\n| --- | --- |\n| Electric | $5,193.30 |",
  },
  {
    id: "service_accounts",
    // Leaf-citable fields only — mirrors the reframed seed (the per-meter total
    // is a derived sum with no extracted leaf, so it's omitted; per-service
    // totals live in charges_by_service).
    renderAs: "TABLE" as const,
    question: "List each metered service account: meter id, utility type, rate plan, and usage.",
    body: "| Meter ID | Utility type | Rate plan | Usage |\n| --- | --- | --- | --- |\n| 70182657 | electric | Industrial Electric | 60,960 kWh |",
  },
];

const SAMPLE_REPORT_CITE = [{ documentId: "c3bfff49", page: 1, tier: "exact" as const }];

/**
 * A `RenderedReport` over the seeded default template, scoped to `scope` —
 * the shape the live render endpoint returns for the utility onboarding path.
 * Exported so a test that records the render `scope` (Extract→Report scope-carry)
 * can return real content without duplicating the section bodies.
 */
export const sampleSeededReport = (scope: ContentScope) => ({
  reportId: "rr-sample-utility-bill",
  templateId: SAMPLE_REPORT_TEMPLATE_ID,
  scope,
  status: "complete" as const,
  previewOnly: true,
  resolvedVariables: {},
  exportFormats: ["pdf", "md", "link"],
  sections: SAMPLE_REPORT_SECTIONS.map((s) => ({
    sectionId: s.id,
    name: s.id,
    renderAs: s.renderAs,
    result: { sectionId: s.id, body: s.body, citations: SAMPLE_REPORT_CITE },
  })),
});

/**
 * One injected test fake for the whole `Api` surface.
 *
 * Instead of per-file `vi.mock("@/api/...")`, tests render inside an
 * `ApiProvider value={makeFakeApi(...)}` (the render harnesses do this by
 * default) and override only the methods they assert.
 *
 * The base is derived by introspecting the REAL client (`realApi`) and
 * replacing every leaf function with a resolved `vi.fn`. Deriving from
 * `realApi` (rather than a hand-written literal) means the fake CANNOT drift
 * from the real surface — add a method to the client and the fake grows with
 * it automatically. The boundary is type-checked: overrides are
 * `DeepPartial<Api>` and the return is `Api`.
 */
type AnyFn = (...args: unknown[]) => unknown;

type DeepApiPartial<T> = {
  [K in keyof T]?: T[K] extends AnyFn ? T[K] : T[K] extends object ? DeepApiPartial<T[K]> : T[K];
};

export type ApiOverrides = DeepApiPartial<Api>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const defaultApiResult = (path: string[], args: unknown[]): unknown => {
  const name = path.at(-1) ?? "";
  if (name === "login") {
    return {
      username: "acct-1",
      token: "",
      xJwtToken: "",
      customer: {
        username: "acct-1",
        email: "pat@example.com",
        first: "Pat",
        last: "Lee",
      },
    };
  }
  if (name === "register") {
    return {
      username: "acct-1",
      token: "",
      xJwtToken: "",
      apiKeys: [],
    };
  }
  if (name === "getUserData") {
    const username = typeof args[0] === "string" && args[0].length > 0 ? args[0] : "acct-1";
    return {
      username,
      customer: {
        username,
        email: "pat@example.com",
        first: "Pat",
        last: "Lee",
        appMetadata: null,
      },
    };
  }
  if (name === "updateAppMetadata") {
    return args[0] ?? {};
  }
  if (name === "issueOnboardingSession" || name === "ensureAnonSession") {
    return { sessionId: "test-anon-session", anonymous: true };
  }
  if (name === "listScenarios") {
    return { bucketId: null, scenarios: [] };
  }
  if (name === "createChatSession") {
    const input = args[0] as { id?: string } | undefined;
    return {
      chatSessionId: input?.id ?? "test-chat-session",
      ownerUserId: null,
      ownerAnonId: "test-anon-owner",
    };
  }
  if (name === "sendChatMessage") {
    return {
      userMessageId: "test-user-message",
      assistantMessageId: "test-assistant-message",
      compressionRan: false,
      reply: {
        mode: "grounded",
        answer: "",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
    };
  }
  if (name === "listChatMessages" || name === "listChatSessions") return [];
  if (name === "getGroundXWorkflow") {
    return { workflow: { workflowId: "test-workflow", name: "Test workflow", extract: {} } };
  }
  if (name === "extractField") {
    return { value: null, confidence: 0, citation: null };
  }
  if (name === "fetchFieldGeometry") {
    // multi-region P1.3b — returns the field's region set ([] = no geometry).
    const fields = Array.isArray(args[1]) ? args[1] : [];
    return fields.map(() => []);
  }
  if (name === "saveTemplate") {
    const input = args[0] as { id?: string; name?: string } | undefined;
    return {
      id: input?.id ?? "template-test",
      name: input?.name ?? "Test template",
      updatedAt: "2026-06-03T00:00:00Z",
    };
  }
  if (name === "renderReport") {
    const input = args[0] as { templateId?: string; scope?: ContentScope } | undefined;
    const scope = input?.scope ?? { type: "documents", documentIds: [] };
    // report-default-template — when the SEEDED default template is rendered
    // (the utility onboarding path), the fake mirrors the live render: the three
    // T1-verified sections, each with a cited body over the sample invoice. This
    // is test infra (not a client fixture), so the no-fixture guard stays green.
    // Any other id → the graceful no-template/empty render (the new-customer norm).
    if (input?.templateId === SAMPLE_REPORT_TEMPLATE_ID) {
      return { gated: false, report: sampleSeededReport(scope) };
    }
    return {
      gated: false,
      report: {
        reportId: "rr-test-empty",
        templateId: input?.templateId ?? "rt-test-empty",
        scope,
        status: "complete",
        sections: [],
        resolvedVariables: {},
        exportFormats: [],
        previewOnly: false,
      },
    };
  }
  if (name === "saveReportTemplate") {
    const input = args[0] as { id?: string; name?: string } | undefined;
    return {
      id: input?.id ?? "rt-test",
      name: input?.name ?? "Test report",
      updatedAt: "2026-06-03T00:00:00Z",
    };
  }
  if (name === "getReportTemplate") {
    // report-default-template — the builder's section-load seam. The seeded
    // default template returns its three editable sections (NOT owned → the
    // builder forks-on-edit); any other id → null (no template / new-customer
    // norm). Section ids mirror `sampleSeededReport` so the edit-§N hand-off's
    // `report-section-edit-billing_summary` → `report-builder-editor-billing_summary`
    // round-trip resolves.
    const id = args[0] as string | undefined;
    if (id === SAMPLE_REPORT_TEMPLATE_ID) {
      return {
        template: {
          id: SAMPLE_REPORT_TEMPLATE_ID,
          name: "Utility Bill Summary",
          sections: SAMPLE_REPORT_SECTIONS.map((s) => ({
            id: s.id,
            name: s.id,
            renderAs: s.renderAs,
            question: s.question,
            variables: [],
          })),
        },
        owned: false,
      };
    }
    return null;
  }
  if (name.startsWith("list") || name.startsWith("search")) {
    if (path.includes("groundxBuckets") || path.includes("partnerBuckets")) return { buckets: [] };
    if (path.includes("groundxDocuments")) return { documents: [] };
    if (path.includes("groundxGroups") || path.includes("partnerGroups")) return { groups: [] };
    if (path.includes("groundxWorkflows")) return { workflows: [] };
    if (path.includes("groundxApiKeys") || path.includes("partnerApiKeys")) return { apiKeys: [] };
    if (path.includes("partnerProjects")) return { projects: [] };
    return [];
  }
  if (name === "resetSession") return { success: true };
  if (name === "captureException") return undefined;
  if (name.startsWith("reset") || name.startsWith("confirm")) return { message: "OK" };
  if (name.startsWith("delete") || name.startsWith("remove") || name === "logout") return { success: true };
  return undefined;
};

/** Recursively clone `shape`, replacing every function with a resolved mock. */
const fakeify = (shape: Record<string, unknown>, path: string[] = []): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    const nextPath = [...path, key];
    if (typeof value === "function") out[key] = vi.fn(async (...args: unknown[]) => defaultApiResult(nextPath, args));
    else if (isPlainObject(value)) out[key] = fakeify(value, nextPath);
    else out[key] = value;
  }
  return out;
};

/** Recursively merge `overrides` onto `base`; functions and non-objects replace. */
const deepMerge = (
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

export const makeFakeApi = (overrides: ApiOverrides = {}): Api => {
  const base = fakeify(realApi as unknown as Record<string, unknown>);
  const api = deepMerge(base, overrides as Record<string, unknown>) as Api;
  // chat-response-streaming — unless a test overrides it explicitly, the fake's
  // streaming send DELEGATES to `sendChatMessage` (ignoring the live callbacks):
  // so existing tests that override or assert on `chat.sendChatMessage` keep
  // working when the hook switches to streaming. Read at call time so a per-test
  // `sendChatMessage` override is honored. A test that needs the live callbacks
  // overrides `chat.streamChatMessage` directly.
  if (!("chat" in overrides && (overrides.chat as Record<string, unknown> | undefined)?.streamChatMessage)) {
    api.chat.streamChatMessage = ((input) => api.chat.sendChatMessage(input)) as Api["chat"]["streamChatMessage"];
  }
  // progressive-report-render B3 — unless a test overrides it, the fake's
  // streaming render DELEGATES to `renderReport` (the base dispatch or a per-test
  // override) and drives the `meta`/`section`/`done` handlers from that result,
  // faithfully to the server (no `meta` on a gate/empty render). So tests that
  // override or assert on `report.renderReport` keep working when the surface
  // switched to the streaming client.
  if (!("report" in overrides && (overrides.report as Record<string, unknown> | undefined)?.renderReportStream)) {
    api.report.renderReportStream = (async (input, handlers) => {
      const result = await api.report.renderReport(input);
      if (result.gated) {
        handlers.onDone?.(result);
        return;
      }
      const r = result.report;
      if (r.sections.length > 0) {
        handlers.onMeta?.(r.sections.map((s) => s.sectionId));
        r.sections.forEach((s, i) => handlers.onSection?.(s, i, false));
      }
      handlers.onDone?.(result);
    }) as Api["report"]["renderReportStream"];
  }
  return api;
};
