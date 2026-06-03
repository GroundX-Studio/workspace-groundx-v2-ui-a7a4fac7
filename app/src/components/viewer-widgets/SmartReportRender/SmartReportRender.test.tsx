import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type FC, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import type { RenderReportInput, RenderReportResult } from "@/api/smartReport";
import type { RenderedReport } from "@/types/report";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useChatStore } from "@/contexts/ChatStoreContext";

import { SmartReportRender } from "./SmartReportRender";

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

const renderReport = vi.fn<[RenderReportInput], Promise<RenderReportResult>>();

type RenderOptions = NonNullable<Parameters<typeof renderWithOnboardingProviders>[1]>;
const renderWithReportApi = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithOnboardingProviders(ui, {
    ...options,
    api: {
      ...options.api,
      report: {
        ...options.api?.report,
        renderReport,
      },
    },
  });

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
  vi.mocked(renderReport).mockReset();
  // Default: the endpoint returns the Utility IC-brief report. Individual
  // tests override (empty, error, in-flight) as needed.
  vi.mocked(renderReport).mockResolvedValue(utilityResult);
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
  vi.mocked(renderReport).mockReset();
});

describe("SmartReportRender — first-paint round-trip (2026-05-31-smart-report-followups)", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    async (role) => {
      renderWithReportApi(<SmartReportRender role={role} scope={UTILITY_SCOPE} />);
      const root = screen.getByTestId("smart-report-render");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
      // Let the first-paint fetch settle so no act() warning leaks.
      await waitFor(() => expect(renderReport).toHaveBeenCalled());
    },
  );

  it("FIRST paint calls the render endpoint client (not a synchronous fixture read)", async () => {
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderReport).mock.calls[0][0]).toMatchObject({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
    });
  });

  it("renders the endpoint response's four IC-brief sections over a bucket+project scope", async () => {
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    const surface = within(await screen.findByTestId("report-section-billing_summary"));
    expect(surface.getByText(/billing summary/i)).toBeInTheDocument();
    const root = within(screen.getByTestId("smart-report-render"));
    expect(root.getByText(/charge breakdown/i)).toBeInTheDocument();
    expect(root.getByText(/anomalies/i)).toBeInTheDocument();
    expect(root.getByText(/recommendation/i)).toBeInTheDocument();
  });

  it("renders a CiteChip in a section footer (reuses the shipped clickable-citation path)", async () => {
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    const chip = await screen.findByTestId("cite-chip-1");
    expect(chip).toHaveAttribute("data-citation-doc", "utility-bill-2026-04");
  });

  it("locks export/Save for an anonymous viewer (preview-only sample)", async () => {
    renderWithReportApi(<SmartReportRender role="anonymous" scope={UTILITY_SCOPE} />);
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
    // `show_smart_report_edit` tool emits — which routes to
    // `advanceFrame("f4a", { selectedReportSectionId })`. We assert the
    // user-visible result of that routing via a session probe.
    const user = userEvent.setup();
    let snapshot: { frame: string; selectedSectionId: string | null } = {
      frame: "",
      selectedSectionId: null,
    };
    const SessionProbe: FC = () => {
      const { state } = useOnboardingSession();
      snapshot = { frame: state.currentFrame, selectedSectionId: state.selectedReportSectionId };
      return null;
    };
    renderWithReportApi(
      <>
        <SmartReportRender role="member" scope={UTILITY_SCOPE} />
        <SessionProbe />
      </>,
      { initialFrame: "f4", initialScenario: "utility" },
    );
    await user.click(await screen.findByTestId("report-section-edit-billing_summary"));
    await waitFor(() => {
      expect(snapshot.frame).toBe("f4a");
      expect(snapshot.selectedSectionId).toBe("billing_summary");
    });
  });

  it("DL-4: empty state surfaces a reachable 'open builder' affordance ONLY when a pinned draft exists", async () => {
    // A no-fixture scope → reportTemplateIdForScope === null → the empty state
    // (no endpoint round-trip), the scenario where a pinned draft would
    // otherwise be orphaned (reachable only via an LLM tool-call).
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
    vi.mocked(renderReport).mockImplementation(async (input) => {
      const isUtility =
        input.scope.type === "bucket" && input.scope.filter?.project === "utility";
      return isUtility
        ? utilityResult
        : { gated: false, report: { ...UTILITY_REPORT, sections: [] } };
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
    renderWithReportApi(<Harness />);
    // First paint resolves to the empty state for the no-fixture scope. The
    // no-template scope short-circuits synchronously (no endpoint call), so
    // this empty MUST belong to the current mount — assert no call has fired.
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();
    expect(renderReport).not.toHaveBeenCalled();

    // Re-scope to the Utility bucket+project — the adapter must re-render
    // (a NEW endpoint call) and show the Utility sections. The re-scope walks
    // empty → loading → ready, so we must AWAIT the endpoint response (the
    // Utility sections) rather than reading synchronously the moment the empty
    // state clears — at that instant the render call is still in flight.
    await user.click(screen.getByTestId("flip-scope"));
    const surface = within(screen.getByTestId("smart-report-render"));
    expect(await surface.findByText(/billing summary/i)).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-empty")).not.toBeInTheDocument();
    // The adapter drove the re-scope through the endpoint (not a fixture read):
    // the no-template scope short-circuited without a call, and only the
    // Utility scope re-ran the endpoint — with the NEW scope.
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderReport).mock.calls[0][0]).toMatchObject({ scope: UTILITY_SCOPE });
  });

  // ── first-paint lifecycle: loading / empty / error ──────────────────
  it("shows a loading affordance while the FIRST render call is in flight", async () => {
    const d = deferred<RenderReportResult>();
    vi.mocked(renderReport).mockReturnValueOnce(d.promise);
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
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
    vi.mocked(renderReport).mockResolvedValueOnce({
      gated: false,
      report: { ...UTILITY_REPORT, sections: [] },
    });
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    expect(await screen.findByTestId("smart-report-empty")).toBeInTheDocument();
  });

  it("shows a retryable error banner when the FIRST render call rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(renderReport).mockRejectedValueOnce(new Error("boom"));
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // First paint failed → a retryable error affordance, not a blank surface
    // and not a thrown render.
    expect(await screen.findByTestId("smart-report-error")).toBeInTheDocument();
    expect(screen.getByTestId("smart-report-retry")).toBeInTheDocument();

    // Retry re-issues the call; the next response paints the report.
    vi.mocked(renderReport).mockResolvedValueOnce(utilityResult);
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
    vi.mocked(renderReport)
      .mockResolvedValueOnce(utilityResult)
      .mockResolvedValueOnce(responseReport);

    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    // First paint is the endpoint response (the four IC-brief sections).
    expect(await screen.findByText(/billing summary/i)).toBeInTheDocument();
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId("smart-report-rerender"));
    // Re-render shares the same fetch path: a second call to the SAME client.
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(2));
    expect(vi.mocked(renderReport).mock.calls[1][0]).toMatchObject({
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
    vi.mocked(renderReport)
      .mockResolvedValueOnce(utilityResult)
      .mockRejectedValueOnce(new Error("boom"));
    renderWithReportApi(<SmartReportRender role="member" scope={UTILITY_SCOPE} />);
    await screen.findByText(/billing summary/i);
    await user.click(screen.getByTestId("smart-report-rerender"));
    await waitFor(() =>
      expect(screen.getByTestId("smart-report-rerender-error")).toBeInTheDocument(),
    );
  });
});
