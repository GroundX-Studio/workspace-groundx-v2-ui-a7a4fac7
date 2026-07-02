import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState, type FC, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import type { RenderReportInput, RenderReportResult, RenderReportStreamHandlers } from "@/api/smartReport";
import type { RenderedReport } from "@/types/report";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { useActiveStepDiagnostic } from "@/test/activeStepDiagnostic";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useChatStore } from "@/contexts/ChatStoreContext";

import { SmartReportRender } from "./SmartReportRender";

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { projectId: "proj_c7701da7-0e08-482a-a496-df9dfe991613" },
};

// progressive-report-render B3 — the surface now consumes the STREAMING client
// (`renderReportStream`), driving `onMeta` → `onSection` → `onDone` handlers.
const renderReportStream =
  vi.fn<[RenderReportInput, RenderReportStreamHandlers], Promise<void>>();

type RenderOptions = NonNullable<Parameters<typeof renderWithOnboardingProviders>[1]>;
const renderWithReportApi = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithOnboardingProviders(ui, {
    ...options,
    api: {
      ...options.api,
      report: {
        ...options.api?.report,
        renderReportStream,
      },
    },
  });

/**
 * Drive the streaming handlers from a `RenderReportResult`, faithfully to the
 * server: `onMeta` fires only when there are sections (the backend skips it for
 * a gate / empty / no-template render); one `onSection` per section; then
 * `onDone`. `failedIds` marks section ids to deliver with `failed: true`.
 */
function streamInto(
  handlers: RenderReportStreamHandlers,
  result: RenderReportResult,
  failedIds: ReadonlySet<string> = new Set(),
): void {
  if (result.gated) {
    handlers.onDone?.(result);
    return;
  }
  const r = result.report;
  if (r.sections.length > 0) {
    handlers.onMeta?.(r.sections.map((s) => s.sectionId));
    r.sections.forEach((s, i) => handlers.onSection?.(s, i, failedIds.has(s.sectionId)));
  }
  handlers.onDone?.(result);
}

/** A mock implementation that streams a fixed result. */
function streamFrom(result: RenderReportResult, failedIds?: ReadonlySet<string>) {
  return async (_input: RenderReportInput, handlers: RenderReportStreamHandlers): Promise<void> => {
    streamInto(handlers, result, failedIds);
  };
}

const SEEDED_TEMPLATE_ID = "rt-utility-ic-brief";

/**
 * Sets `reportOverlay.templateId` on the active session via the pin path (its
 * writer), so the render reads a REAL template id — the post-fixture stand-in
 * for a saved/default template being present. The render's templateId-change
 * re-render effect then drives first paint. (`report-default-template` provides
 * this via the seeded onboarding default; here the pin path is the writer.)
 */
function TemplateSeeder({ templateId = SEEDED_TEMPLATE_ID }: { templateId?: string }) {
  const { state, pinToReport } = useChatStore();
  const done = useRef(false);
  useEffect(() => {
    if (state.activeSessionId && !done.current) {
      done.current = true;
      pinToReport({ turnId: "seed-turn", text: "seed", templateId });
    }
  }, [state.activeSessionId, pinToReport, templateId]);
  return null;
}

/** Render with a report template id already targeted on the active session. */
const renderWithTemplate = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithReportApi(
    <>
      <TemplateSeeder />
      {ui}
    </>,
    options,
  );

/**
 * The Utility IC-brief report the endpoint returns — the four sections + the
 * leading CiteChip into the bill. The tests drive the surface through this
 * injected endpoint response (NOT a synchronous fixture read).
 */
const UTILITY_REPORT: RenderedReport = {
  reportId: "rr-utility-ic-brief",
  templateId: "rt-utility-ic-brief",
  scope: UTILITY_SCOPE,
  status: "complete",
  resolvedVariables: {},
  exportFormats: ["pdf", "md", "link"],
  previewOnly: true,
  sections: [
    {
      sectionId: "billing_summary",
      name: "billing_summary",
      renderAs: "PARAGRAPH",
      result: {
        sectionId: "billing_summary",
        body: "The April 2026 statement totals **$18,742.16**.",
        citations: [
          { documentId: "utility-bill-2026-04", page: 1, snippet: "Total Amount Due", tier: "exact" },
        ],
      },
    },
    {
      sectionId: "charge_breakdown",
      name: "charge_breakdown",
      renderAs: "TABLE",
      result: {
        sectionId: "charge_breakdown",
        body: "| Category | Amount |\n| --- | --- |\n| Demand | $9,418 |",
        citations: [{ documentId: "utility-bill-2026-04", page: 3, tier: "exact" }],
      },
    },
    {
      sectionId: "anomalies",
      name: "anomalies",
      renderAs: "BULLETS",
      result: {
        sectionId: "anomalies",
        body: "- Demand charges are 36% higher than the trailing average.",
        citations: [{ documentId: "utility-bill-2026-04", page: 2, tier: "paraphrase" }],
      },
    },
    {
      sectionId: "recommendation",
      name: "recommendation",
      renderAs: "PARAGRAPH",
      result: {
        sectionId: "recommendation",
        body: "Review the demand-charge spike before approving payment.",
        citations: [{ documentId: "utility-bill-2026-04", page: 3, tier: "ambient" }],
      },
    },
  ],
};

const utilityResult: RenderReportResult = { gated: false, report: UTILITY_REPORT };

/** A controllable deferred so a test can hold the call in flight (loading). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(renderReportStream).mockReset();
  // Default: the endpoint streams the Utility IC-brief report. Individual tests
  // override (empty, error, in-flight, failed section) as needed.
  vi.mocked(renderReportStream).mockImplementation(streamFrom(utilityResult));
});

afterEach(() => {
  // Explicitly unmount the prior render BEFORE the next test mounts. RTL's
  // auto-cleanup normally handles this, but SmartReportRender now paints
  // ASYNCHRONOUSLY (the first paint awaits `renderReport`), so a test that
  // returns while a render call is still in flight can flush a late state
  // update — and, without a deterministic unmount, leak a stale node
  // (notably `smart-report-empty`) into the next test's `document.body`,
  // where a sibling's `findByTestId` would resolve against it. Tearing the
  // tree down here makes each test start from an empty DOM.
  cleanup();
  // Drop any queued `*Once` responses / implementation so the next test's
  // `beforeEach` default (or its own override) is the only source of truth
  // for what the render endpoint returns.
  vi.mocked(renderReportStream).mockReset();
});

describe("SmartReportRender — first-paint round-trip (2026-05-31-smart-report-followups)", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    async (role) => {
      renderWithTemplate(<SmartReportRender role={role} scope={UTILITY_SCOPE} />);
      const root = screen.getByTestId("smart-report-render");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
      // Let the first-paint fetch settle so no act() warning leaks (the
      // templateId-change re-render effect drives the call after the seeder).
      await waitFor(() => expect(renderReportStream).toHaveBeenCalled());
    },
  );

  it("FIRST paint calls the render endpoint client (not a synchronous fixture read)", async () => {
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    await waitFor(() => expect(renderReportStream).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderReportStream).mock.calls[0][0]).toMatchObject({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
    });
  });

  it("renders the endpoint response's four IC-brief sections over a bucket+project scope", async () => {
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    const surface = within(await screen.findByTestId("report-section-billing_summary"));
    expect(surface.getByText(/billing summary/i)).toBeInTheDocument();
    const root = within(screen.getByTestId("smart-report-render"));
    expect(root.getByText(/charge breakdown/i)).toBeInTheDocument();
    expect(root.getByText(/anomalies/i)).toBeInTheDocument();
    expect(root.getByText(/recommendation/i)).toBeInTheDocument();
  });

  it("renders a CiteChip in a section footer (reuses the shipped clickable-citation path)", async () => {
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // inline-footnote-citations — each section's SourceList numbers per-section, so
    // every single-citation section renders its own `cite-chip-1`; the first section's
    // chip carries the source document id and routes via the shipped click path.
    const chips = await screen.findAllByTestId("cite-chip-1");
    expect(chips[0]).toHaveAttribute("data-citation-doc", "utility-bill-2026-04");
  });

  it("renders an inline [N] footnote marker inside a section body that carries one (report inline-marker render path)", async () => {
    // inline-footnote-citations — a report section body routes through
    // `groundedAnswerOverScope`, which applies the `[N]` citation contract, so a
    // LIVE section body can contain inline markers. The fixtures above are all
    // marker-free, so this is the one test that proves the SmartReportRender →
    // `<Markdown citations>` wiring turns a `[N]` in a section body into a
    // clickable footnote-variant CiteChip (not just a SourceList pill).
    const reportWithMarker: RenderedReport = {
      ...UTILITY_REPORT,
      sections: [
        {
          sectionId: "billing_summary",
          name: "billing_summary",
          renderAs: "PARAGRAPH",
          result: {
            sectionId: "billing_summary",
            body: "The April 2026 statement totals **$18,742.16**[1].",
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, snippet: "Total Amount Due", tier: "exact" },
            ],
          },
        },
      ],
    };
    vi.mocked(renderReportStream).mockImplementation(streamFrom({ gated: false, report: reportWithMarker }));

    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);

    // A single-citation section renders BOTH the inline footnote marker (from the
    // `[1]` in the body) and a SourceList pill, so disambiguate by `data-variant`.
    const chips = await screen.findAllByTestId("cite-chip-1");
    const marker = chips.find((c) => c.getAttribute("data-variant") === "footnote");
    expect(marker, "section body [1] should render a footnote-variant CiteChip").toBeTruthy();
    expect(marker).toHaveAttribute("data-citation-doc", "utility-bill-2026-04");
  });

  it("locks export/Save for an anonymous viewer (preview-only sample)", async () => {
    renderWithTemplate(<SmartReportRender role="anonymous" scope={UTILITY_SCOPE} />);
    expect(await screen.findByTestId("smart-report-preview-badge")).toBeInTheDocument();
    const exportControl = screen.getByTestId("smart-report-export");
    expect(exportControl).toHaveAttribute("aria-disabled", "true");
    expect(exportControl).toHaveTextContent("🔒");
  });

  it("dispatches editTemplate (render→builder hand-off) when the per-heading edit affordance is clicked", async () => {
    // 2026-05-31-shared-canvas-affordance-restoration: the `✎ edit §N` control
    // no longer relies on a host `onEditSection` callback (the `{ scope, role }`
    // ScopedCanvas contract can't supply it). It dispatches the `editTemplate`
    // CanvasIntent through the orchestrator — the SAME intent the
    // `show_smart_report_edit` tool emits — which pushes the report builder step
    // + pre-selects the section. We assert the user-visible result via a probe.
    const user = userEvent.setup();
    let snapshot: { step: string | null; selectedSectionId: string | null } = {
      step: null,
      selectedSectionId: null,
    };
    const SessionProbe: FC = () => {
      const { state } = useOnboardingSession();
      const step = useActiveStepDiagnostic();
      snapshot = { step, selectedSectionId: state.selectedReportSectionId };
      return null;
    };
    renderWithTemplate(
      <>
        <SmartReportRender role="member" scope={UTILITY_SCOPE} />
        <SessionProbe />
      </>,
      { initialFrame: "f4", initialScenario: "utility" },
    );
    await user.click(await screen.findByTestId("report-section-edit-billing_summary"));
    await waitFor(() => {
      expect(snapshot.step).toBe("report-builder");
      expect(snapshot.selectedSectionId).toBe("billing_summary");
    });
  });

  // ── report-empty-state T1(b) — the render reads the template id from real ──
  // ── report state (reportOverlay.templateId), not the scope ──────────────
  //
  // The template id comes from real report state (`reportOverlay.templateId`),
  // never a client-side scope→fixture map. With no template id set (the
  // new-customer norm), even the Utility scope shows the empty state with NO
  // `renderReport` network call.
  it("report-empty-state: with no reportOverlay.templateId, the Utility scope shows the empty state and never calls renderReport", async () => {
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />, {
      initialFrame: "f4",
      initialScenario: "utility",
    });
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();
    expect(renderReportStream).not.toHaveBeenCalled();
  });

  it("DL-4: empty state surfaces a reachable 'open builder' affordance ONLY when a pinned draft exists", async () => {
    // No template id on the overlay → the empty state (no endpoint round-trip),
    // the scenario where a pinned draft would otherwise be orphaned (reachable
    // only via an LLM tool-call).
    const NO_FIXTURE_SCOPE: ContentScope = { type: "documents", documentIds: ["draft-only-doc"] };
    let pinOnce = false;
    // Seed a pinned draft into the active session's reportOverlay — exactly
    // what the 📌 pin-to-report action does (Pin→template = NO auto: no saved
    // template, no auto-open of the builder).
    const DraftSeeder: FC = () => {
      const { state, resolveSessionForScope, pinToReport } = useChatStore();
      useEffect(() => {
        resolveSessionForScope(NO_FIXTURE_SCOPE, { title: "draft test" });
      }, [resolveSessionForScope]);
      useEffect(() => {
        if (state.activeSessionId && !pinOnce) {
          pinOnce = true;
          pinToReport({ turnId: "turn-1", text: "What is the total amount due on this bill?" });
        }
      }, [state.activeSessionId, pinToReport]);
      return null;
    };
    renderWithReportApi(
      <>
        <DraftSeeder />
        <SmartReportRender role="member" scope={NO_FIXTURE_SCOPE} />
      </>,
      { initialFrame: "f4", initialScenario: "utility" },
    );
    // The empty state surfaces the reachable draft entry point — a real
    // <button> wired to the editTemplate render→builder hand-off (the SAME
    // intent the proven per-section ✎ edit affordance and `show_smart_report_edit`
    // tool emit).
    const openBuilder = await screen.findByTestId("smart-report-open-draft-builder");
    expect(screen.getByTestId("smart-report-empty")).toBeInTheDocument();
    expect(openBuilder.tagName).toBe("BUTTON");
    expect(openBuilder).toHaveTextContent(/open builder/i);
    expect(screen.getByTestId("smart-report-empty")).toHaveTextContent(/draft in progress/i);
  });

  it("DL-4: empty state shows NO draft affordance when there is no pinned draft", async () => {
    // Same no-fixture empty scope, but no draft seeded → the affordance must
    // be absent (the conditional is load-bearing, not always-on).
    renderWithReportApi(
      <SmartReportRender role="member" scope={{ type: "documents", documentIds: ["no-draft-doc"] }} />,
      { initialFrame: "f4", initialScenario: "utility" },
    );
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-open-draft-builder")).not.toBeInTheDocument();
  });

  it("re-resolves the report when the scope IDENTITY changes (useScopeAdapter is load-bearing)", async () => {
    const user = userEvent.setup();
    const noFixture: ContentScope = { type: "documents", documentIds: ["nope"] };
    // The endpoint returns empty (no sections) for the no-fixture scope, then
    // the Utility report after the scope flips.
    vi.mocked(renderReportStream).mockImplementation(async (input, handlers) => {
      const isUtility =
        input.scope.type === "bucket" &&
        input.scope.filter?.projectId === "proj_c7701da7-0e08-482a-a496-df9dfe991613";
      streamInto(handlers, isUtility ? utilityResult : { gated: false, report: { ...UTILITY_REPORT, sections: [] } });
    });
    const Harness: FC = () => {
      const [scope, setScope] = useState<ContentScope>(noFixture);
      return (
        <>
          <button data-testid="flip-scope" onClick={() => setScope(UTILITY_SCOPE)}>
            flip
          </button>
          <SmartReportRender role="member" scope={scope} />
        </>
      );
    };
    // A template id IS present (seeded) — so the load-bearing claim is that
    // changing the scope IDENTITY re-runs the endpoint with the NEW scope (the
    // template id no longer comes from the scope, so this isolates the adapter).
    renderWithTemplate(<Harness />);
    // First paint over the no-fixture scope resolves to the empty state (the
    // endpoint returns no sections for it).
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();

    // Re-scope to the Utility bucket+project — the adapter must re-run the
    // endpoint with the NEW scope and paint the Utility sections. The re-scope
    // walks empty → loading → ready, so AWAIT the endpoint response.
    await user.click(screen.getByTestId("flip-scope"));
    const surface = within(screen.getByTestId("smart-report-render"));
    expect(await surface.findByText(/billing summary/i)).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-empty")).not.toBeInTheDocument();
    // The adapter drove the re-scope through the endpoint with the Utility scope
    // (the LAST call carries the new scope identity).
    await waitFor(() => {
      const calls = vi.mocked(renderReportStream).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ scope: UTILITY_SCOPE });
    });
  });

  // ── first-paint lifecycle: loading / empty / error ──────────────────
  it("shows a loading affordance while the FIRST render call is in flight", async () => {
    const d = deferred<RenderReportResult>();
    // Hold before any frame → the surface stays in its loading state; releasing
    // the deferred streams the report in.
    vi.mocked(renderReportStream).mockImplementationOnce((_input, handlers) =>
      d.promise.then((result) => streamInto(handlers, result)),
    );
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // Before the call resolves the surface shows a loading state, not a blank
    // surface and not the (now-gone) synchronous fixture.
    expect(await screen.findByTestId("smart-report-loading")).toBeInTheDocument();
    expect(screen.queryByText(/billing summary/i)).not.toBeInTheDocument();
    // Resolving the call clears the loading state and paints the report.
    d.resolve(utilityResult);
    expect(await screen.findByText(/billing summary/i)).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-loading")).not.toBeInTheDocument();
  });

  it("shows the empty state when the endpoint returns no sections for the scope", async () => {
    vi.mocked(renderReportStream).mockImplementationOnce(
      streamFrom({ gated: false, report: { ...UTILITY_REPORT, sections: [] } }),
    );
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();
  });

  it("shows a retryable error banner when the FIRST render call rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(renderReportStream).mockImplementationOnce(async (_input, handlers) => {
      handlers.onError?.(new Error("boom"));
    });
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // First paint failed → a retryable error affordance, not a blank surface
    // and not a thrown render.
    expect(await screen.findByTestId("smart-report-error")).toBeInTheDocument();
    expect(screen.getByTestId("smart-report-retry")).toBeInTheDocument();

    // Retry re-issues the call; the next response paints the report.
    vi.mocked(renderReportStream).mockImplementationOnce(streamFrom(utilityResult));
    await user.click(screen.getByTestId("smart-report-retry"));
    expect(await screen.findByText(/billing summary/i)).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-error")).not.toBeInTheDocument();
  });

  // ── ↻ re-render shares the same fetch path (round-trip preserved) ───
  it("the ↻ re-render control calls the render endpoint client and displays the RESPONSE", async () => {
    const user = userEvent.setup();
    const responseReport: RenderReportResult = {
      gated: false,
      report: {
        reportId: "rr-rt-utility-ic-brief",
        templateId: "rt-utility-ic-brief",
        scope: UTILITY_SCOPE,
        status: "complete",
        resolvedVariables: {},
        exportFormats: ["pdf", "md", "link"],
        previewOnly: true,
        sections: [
          {
            sectionId: "fresh_section",
            name: "fresh_section",
            renderAs: "PARAGRAPH",
            result: {
              sectionId: "fresh_section",
              body: "Freshly re-rendered from the endpoint.",
              citations: [{ documentId: "utility-bill-2026-04", page: 1, tier: "exact" }],
            },
          },
        ],
      },
    };
    // First paint → Utility report; the ↻ re-render → the fresh response.
    vi.mocked(renderReportStream)
      .mockImplementationOnce(streamFrom(utilityResult))
      .mockImplementationOnce(streamFrom(responseReport));

    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // First paint is the endpoint response (the four IC-brief sections).
    expect(await screen.findByText(/billing summary/i)).toBeInTheDocument();
    await waitFor(() => expect(renderReportStream).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId("smart-report-rerender"));
    // Re-render shares the same fetch path: a second call to the SAME client.
    await waitFor(() => expect(renderReportStream).toHaveBeenCalledTimes(2));
    expect(vi.mocked(renderReportStream).mock.calls[1][0]).toMatchObject({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
    });
    // The surface now shows the ENDPOINT RESPONSE, not the first-paint report.
    await waitFor(() =>
      expect(screen.getByText(/freshly re-rendered from the endpoint/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/billing summary/i)).not.toBeInTheDocument();
  });

  it("surfaces an error state when the re-render endpoint call rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(renderReportStream)
      .mockImplementationOnce(streamFrom(utilityResult))
      .mockImplementationOnce(async (_input, handlers) => {
        handlers.onError?.(new Error("boom"));
      });
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    await screen.findByText(/billing summary/i);
    await user.click(screen.getByTestId("smart-report-rerender"));
    await waitFor(() =>
      expect(screen.getByTestId("smart-report-rerender-error")).toBeInTheDocument(),
    );
  });
});

// ── progressive-report-render B3 — progressive fill-in, per-section failure ──
// ── retry, and the Save/Export completeness gate. ───────────────────────────
describe("SmartReportRender — progressive streaming (progressive-report-render B3)", () => {
  it("fills template-order slots as sections stream in (pending slot → section)", async () => {
    // Deliver meta + three sections, but HOLD the fourth (recommendation) until
    // a deferred releases — so its slot shows the per-slot loading placeholder.
    const hold = deferred<void>();
    vi.mocked(renderReportStream).mockImplementationOnce(async (_input, handlers) => {
      handlers.onMeta?.(UTILITY_REPORT.sections.map((s) => s.sectionId));
      UTILITY_REPORT.sections.slice(0, 3).forEach((s, i) => handlers.onSection?.(s, i, false));
      await hold.promise;
      const last = UTILITY_REPORT.sections[3];
      handlers.onSection?.(last, 3, false);
      handlers.onDone?.(utilityResult);
    });
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // Three arrived; the fourth slot is still a loading placeholder.
    expect(await screen.findByTestId("report-section-billing_summary")).toBeInTheDocument();
    expect(screen.getByTestId("report-section-loading-recommendation")).toBeInTheDocument();
    expect(screen.queryByTestId("report-section-recommendation")).not.toBeInTheDocument();
    // Release the last section → its slot fills in.
    hold.resolve();
    expect(await screen.findByTestId("report-section-recommendation")).toBeInTheDocument();
    expect(screen.queryByTestId("report-section-loading-recommendation")).not.toBeInTheDocument();
  });

  it("a failed section shows a retry affordance (for every role), and retrying re-renders just it", async () => {
    const user = userEvent.setup();
    // First stream: anomalies fails; retry (subset) succeeds.
    vi.mocked(renderReportStream)
      .mockImplementationOnce(streamFrom(utilityResult, new Set(["anomalies"])))
      .mockImplementationOnce(async (input, handlers) => {
        expect(input.sectionIds).toEqual(["anomalies"]);
        const anomalies = UTILITY_REPORT.sections.find((s) => s.sectionId === "anomalies")!;
        handlers.onSection?.(anomalies, 2, false);
        handlers.onDone?.(utilityResult);
      });
    // Anonymous — retry must still be offered (Q1).
    renderWithTemplate(<SmartReportRender role="anonymous" scope={UTILITY_SCOPE} />);
    expect(await screen.findByTestId("report-section-failed-anomalies")).toBeInTheDocument();
    const retry = screen.getByTestId("report-section-retry-anomalies");
    // Other sections rendered normally.
    expect(screen.getByTestId("report-section-billing_summary")).toBeInTheDocument();
    await user.click(retry);
    // The slot fills with the retried section; the failed marker is gone.
    await waitFor(() =>
      expect(screen.queryByTestId("report-section-failed-anomalies")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("report-section-anomalies")).toBeInTheDocument();
  });

  it("gates Save/Export while a section is failed, then re-enables after a retry-all (Q2)", async () => {
    const user = userEvent.setup();
    // A MEMBER, non-preview report (so only the completeness gate — not preview
    // or role — can lock Save/Export). One section fails.
    const memberReport: RenderReportResult = {
      gated: false,
      report: { ...UTILITY_REPORT, previewOnly: false },
    };
    vi.mocked(renderReportStream)
      .mockImplementationOnce(streamFrom(memberReport, new Set(["anomalies"])))
      .mockImplementationOnce(async (input, handlers) => {
        expect(input.sectionIds).toEqual(["anomalies"]);
        const anomalies = UTILITY_REPORT.sections.find((s) => s.sectionId === "anomalies")!;
        handlers.onSection?.(anomalies, 2, false);
        handlers.onDone?.(memberReport);
      });
    renderWithTemplate(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // While incomplete: Save/Export disabled + the retry-failed reload shows.
    await screen.findByTestId("smart-report-incomplete");
    expect(screen.getByTestId("smart-report-export")).toHaveAttribute("aria-disabled", "true");
    // Retry all failed → the section completes → Save/Export re-enables.
    await user.click(screen.getByTestId("smart-report-retry-failed"));
    await waitFor(() =>
      expect(screen.queryByTestId("smart-report-incomplete")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("smart-report-export")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("smart-report-export")).toHaveTextContent("💾 Save");
  });
});
