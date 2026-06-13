import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FC, ReactElement } from "react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import type {
  GetReportTemplateResult,
  RenderReportInput,
  RenderReportResult,
  SaveReportTemplateInput,
  SaveReportTemplateResult,
} from "@/api/smartReport";

import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { withApiProvider } from "@/test/withApiProvider";
import { GxThemeProvider } from "@/ThemeProvider";

import { SmartReportBuilder } from "./SmartReportBuilder";

// report-empty-state: with the fixture gone, base rows seed to []. The builder
// is pinned-drafts-only, so the edit-flow tests seed their rows through the real
// `addReportSection` overlay mutation (a draft section per id) instead of the
// deleted fixture. Rows arrive via an effect, so row lookups are async.
const SEEDED_SECTIONS = [
  { id: "billing_summary", renderAs: "PARAGRAPH" },
  { id: "charge_breakdown", renderAs: "TABLE" },
  { id: "anomalies", renderAs: "BULLETS" },
] as const;

function SectionSeeder() {
  const { state, addReportSection } = useChatStore();
  const done = useRef(false);
  useEffect(() => {
    if (state.activeSessionId && !done.current) {
      done.current = true;
      for (const s of SEEDED_SECTIONS) {
        addReportSection({
          id: s.id,
          name: s.id,
          renderAs: s.renderAs,
          question: `Answer the ${s.id} section.`,
          instructions: [],
          variables: [],
        });
      }
    }
  }, [state.activeSessionId, addReportSection]);
  return null;
}

/** Probe that surfaces the gate status so the anon-Save test can assert it. */
const GateProbe: FC = () => {
  const { state } = useOnboardingSession();
  return <span data-testid="gate-status">{state.gate.status}</span>;
};

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { projectId: "proj_c7701da7-0e08-482a-a496-df9dfe991613" },
};

const saveReportTemplate =
  vi.fn<[SaveReportTemplateInput], Promise<SaveReportTemplateResult>>();
const renderReport = vi.fn<[RenderReportInput], Promise<RenderReportResult>>();
const getReportTemplate = vi.fn<[string], Promise<GetReportTemplateResult | null>>();

type RenderOptions = NonNullable<Parameters<typeof renderWithOnboardingProviders>[1]>;
const renderWithReportApi = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithOnboardingProviders(ui, {
    ...options,
    api: {
      ...options.api,
      report: {
        ...options.api?.report,
        renderReport,
        saveReportTemplate,
        getReportTemplate,
      },
    },
  });

const renderProductBuilder = (ui: ReactElement) =>
  render(
    withApiProvider(
      <GxThemeProvider>
        <LoadingProvider>
          <MessageBarProvider>
            <ChatStoreProvider autoSeedDefaultSession>{ui}</ChatStoreProvider>
          </MessageBarProvider>
        </LoadingProvider>
      </GxThemeProvider>,
      {
        report: {
          renderReport,
          saveReportTemplate,
          getReportTemplate,
        },
      },
    ),
  );

/**
 * Sets `reportOverlay.templateId` on the active session via the pin path (its
 * change-1 writer), so the builder's template-load effect fires. The pin adds an
 * incidental draft row (harmless to these assertions). report-default-template
 * T6 adds a cleaner `setReportTemplateId`; here the pin path is the writer.
 */
function TemplateIdSeeder({ templateId }: { templateId: string }) {
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

/** Render the builder with the three demo rows seeded via the overlay. */
const renderWithSeededRows = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithReportApi(
    <>
      <SectionSeeder />
      {ui}
    </>,
    options,
  );

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
  saveReportTemplate.mockReset();
  saveReportTemplate.mockResolvedValue({
    id: "rt-utility-ic-brief",
    name: "Utility IC Brief (report)",
    updatedAt: "2026-05-31T00:00:00Z",
  });
  renderReport.mockReset();
  renderReport.mockResolvedValue({
    gated: false,
    report: {
      reportId: "rr-rt-utility-ic-brief",
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
      status: "complete",
      resolvedVariables: {},
      exportFormats: ["pdf", "md", "link"],
      previewOnly: true,
      sections: [],
    },
  });
  getReportTemplate.mockReset();
  // Default: no template loads (matches a builder with no templateId set). Tests
  // that exercise the template-load path override this.
  getReportTemplate.mockResolvedValue(null);
});

describe("SmartReportBuilder — 2026-05-29-smart-report-screen Phase 4", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithReportApi(<SmartReportBuilder role={role} scope={UTILITY_SCOPE} />, {
        initialScenario: "utility",
        initialFrame: "f4a",
        initialAuthState: role === "member" ? "signed-in" : "anonymous",
      });
      const root = screen.getByTestId("smart-report-builder");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
    },
  );

  it("renders the F3a-style chrome: pinned-samples row, Sections/Render sub-tabs, control row", () => {
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    const root = within(screen.getByTestId("smart-report-builder"));
    expect(root.getByTestId("report-builder-pinned-samples")).toBeInTheDocument();
    expect(root.getByTestId("report-builder-tab-sections")).toBeInTheDocument();
    expect(root.getByTestId("report-builder-tab-render")).toBeInTheDocument();
    expect(root.getByTestId("report-builder-controls")).toBeInTheDocument();
  });

  it("mounts in a product viewer tree without OnboardingSessionProvider when selectedSectionId is explicit", async () => {
    renderProductBuilder(
      <>
        <SectionSeeder />
        <SmartReportBuilder role="member" scope={UTILITY_SCOPE} selectedSectionId="anomalies" />
      </>,
    );

    expect(await screen.findByTestId("smart-report-builder")).toBeInTheDocument();
    expect(await screen.findByTestId("report-builder-editor-anomalies")).toBeInTheDocument();
  });

  it("renders the seeded section rows and opens the inline section editor on Edit", async () => {
    const user = userEvent.setup();
    renderWithSeededRows(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    // The seeded section rows appear (via the overlay, not a fixture seed).
    expect(await screen.findByTestId("report-builder-row-billing_summary")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-row-charge_breakdown")).toBeInTheDocument();

    // Click Edit on a row → the inline editor expands with name + renderAs +
    // question + instructions (NO per-section scope field).
    await user.click(screen.getByTestId("report-builder-edit-billing_summary"));
    const editor = within(screen.getByTestId("report-builder-editor-billing_summary"));
    expect(editor.getByLabelText(/section name/i)).toBeInTheDocument();
    expect(editor.getByLabelText(/render as/i)).toBeInTheDocument();
    expect(editor.getByLabelText(/question/i)).toBeInTheDocument();
    expect(editor.getByLabelText(/instructions/i)).toBeInTheDocument();
    // No per-section scope control — the template is scope-independent.
    expect(editor.queryByLabelText(/scope/i)).not.toBeInTheDocument();
  });

  it("gives the inline editor form controls stable labels and submit names", async () => {
    const user = userEvent.setup();
    renderWithSeededRows(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });

    await user.click(await screen.findByTestId("report-builder-edit-billing_summary"));
    const editor = screen.getByTestId("report-builder-editor-billing_summary");
    const controls = Array.from(editor.querySelectorAll("input, textarea, select"));

    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control).toHaveAttribute("id");
      expect(control).toHaveAttribute("name");
      expect(control.getAttribute("id")).not.toBe("");
      expect(control.getAttribute("name")).not.toBe("");
    }
    expect(within(editor).getByLabelText(/variable name/i)).toHaveAttribute(
      "name",
      "reportBuilderVariableName-billing_summary",
    );
  });

  it("pre-opens the inline editor for `selectedSectionId` (the render→builder + show_smart_report_edit hand-off)", async () => {
    renderWithSeededRows(
      <SmartReportBuilder role="member" scope={UTILITY_SCOPE} selectedSectionId="charge_breakdown" />,
      {
        initialScenario: "utility",
        initialFrame: "f4a",
        initialAuthState: "signed-in",
      },
    );
    // The named section's editor is open WITHOUT a click (the hand-off carried the id).
    expect(await screen.findByTestId("report-builder-editor-charge_breakdown")).toBeInTheDocument();
    // Sibling rows stay collapsed (one editor at a time — the F3a invariant).
    expect(screen.queryByTestId("report-builder-editor-billing_summary")).not.toBeInTheDocument();
  });

  it("pre-opens the inline editor from `session.selectedReportSectionId` when no prop is supplied (live ScopedCanvas path)", async () => {
    // 2026-05-31-shared-canvas-affordance-restoration: <ScopedCanvas> mounts the
    // builder with only `{ scope, role }`, so the render→builder hand-off can't
    // thread `selectedSectionId` as a prop. The builder must fall back to
    // `session.selectedReportSectionId` (set by the orchestrator's editTemplate
    // routing → advanceFrame("f4a", { selectedReportSectionId })).
    const SelectProbe: FC = () => {
      const { advanceFrame } = useOnboardingSession();
      const fired = useRef(false);
      useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        advanceFrame("f4a", { selectedReportSectionId: "anomalies" });
      }, [advanceFrame]);
      return null;
    };
    renderWithSeededRows(
      <>
        <SmartReportBuilder role="member" scope={UTILITY_SCOPE} />
        <SelectProbe />
      </>,
      { initialScenario: "utility", initialFrame: "f4a", initialAuthState: "signed-in" },
    );
    expect(await screen.findByTestId("report-builder-editor-anomalies")).toBeInTheDocument();
    expect(screen.queryByTestId("report-builder-editor-billing_summary")).not.toBeInTheDocument();
  });

  it("offers a manual `make variable` affordance (no auto-inference, #12) and no version-history UI (#13)", async () => {
    const user = userEvent.setup();
    renderWithSeededRows(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(await screen.findByTestId("report-builder-edit-billing_summary"));
    expect(screen.getByTestId("report-builder-make-variable-billing_summary")).toBeInTheDocument();
    // No version-history surface anywhere on the builder.
    expect(screen.queryByTestId("report-builder-version-history")).not.toBeInTheDocument();
  });

  it("make variable records the USER-CHOSEN token (step-16 follow-up), not a hardcoded literal", async () => {
    const user = userEvent.setup();
    renderWithSeededRows(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(await screen.findByTestId("report-builder-edit-billing_summary"));
    // The user names the variable (not a hardcoded "project").
    const tokenInput = screen.getByTestId("report-builder-variable-name-billing_summary");
    await user.clear(tokenInput);
    await user.type(tokenInput, "billing_period");
    await user.click(screen.getByTestId("report-builder-make-variable-billing_summary"));
    // The chosen token is recorded as a chip with its exact value.
    expect(
      screen.getByTestId("report-builder-variable-billing_summary-billing_period"),
    ).toHaveTextContent("{billing_period}");
    // A blank token is NOT recordable — no empty-name chip appears.
    expect(
      screen.queryByTestId("report-builder-variable-billing_summary-"),
    ).not.toBeInTheDocument();
  });

  it("locks Save for an anonymous viewer (sign-in gate) — clicking opens the gate, does not persist", async () => {
    const user = userEvent.setup();
    renderWithReportApi(
      <>
        <GateProbe />
        <SmartReportBuilder role="anonymous" scope={UTILITY_SCOPE} />
      </>,
      { initialScenario: "utility", initialFrame: "f4a", initialAuthState: "anonymous" },
    );
    expect(screen.getByTestId("gate-status")).toHaveTextContent("idle");
    const save = screen.getByTestId("report-builder-save");
    expect(save).toHaveTextContent("🔒");
    await user.click(save);
    // Anonymous Save routes through the sign-in gate (commitGate), not a silent
    // persist — the gate flips to "open" AND nothing is persisted.
    expect(screen.getByTestId("gate-status")).toHaveTextContent("open");
    expect(saveReportTemplate).not.toHaveBeenCalled();
  });

  it("does not lock Save for a member (no padlock)", () => {
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    const save = screen.getByTestId("report-builder-save");
    expect(save).not.toHaveTextContent("🔒");
  });

  it("FIX #2: the ↻ render control calls the render endpoint client", async () => {
    const user = userEvent.setup();
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(screen.getByTestId("report-builder-render"));
    await waitFor(() => expect(renderReport).toHaveBeenCalledTimes(1));
    const call = vi.mocked(renderReport).mock.calls[0][0];
    // The render uses the builder's MINTED template identity (no fixture id) and
    // the surface's scope.
    expect(call.scope).toEqual(UTILITY_SCOPE);
    expect(call.templateId).toMatch(/^rt-/);
  });

  // ── report-empty-state T1(a) — RED until baseRowsForScope → [] ──────
  //
  // The fake `UTILITY_REPORT` fixture seeded four base rows for the Utility
  // scope. The locked no-seed decision (`project_prelaunch_correctness`) means a
  // builder with NOTHING pinned must seed ZERO base rows — the fixture rows
  // (`billing_summary` / `charge_breakdown`) must NOT appear. Pinned drafts (the
  // overlay) are the only rows; with no overlay the row list is empty.
  it("report-empty-state: with nothing pinned, the builder seeds ZERO base rows (no client fixture)", () => {
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    // No fixture-seeded rows for the Utility scope.
    expect(screen.queryByTestId("report-builder-row-billing_summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-builder-row-charge_breakdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-builder-row-anomalies")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-builder-row-recommendation")).not.toBeInTheDocument();
  });

  it("FIX #1: a member Save PERSISTS the report-kind template (not a no-op)", async () => {
    const user = userEvent.setup();
    renderWithSeededRows(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    // Wait for the seeded overlay rows to land before saving.
    await screen.findByTestId("report-builder-row-billing_summary");
    await user.click(screen.getByTestId("report-builder-save"));
    // The member Save lands the report template through the report-kind persist
    // path — NOT the anon gate, NOT a silent return.
    await waitFor(() => expect(saveReportTemplate).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(saveReportTemplate).mock.calls[0][0];
    // The persisted template carries the builder's effective sections (the
    // seeded overlay drafts — there is no client fixture seed anymore).
    expect(arg.sections.map((s) => s.name)).toEqual([
      "billing_summary",
      "charge_breakdown",
      "anomalies",
    ]);
    expect(arg.sections[0].renderAs).toBe("PARAGRAPH");
    // A persisted save reflects a success status the user can see.
    await waitFor(() =>
      expect(screen.getByTestId("report-builder-save-status")).toHaveTextContent(/saved/i),
    );
  });

  // ── report-default-template T5 — load the real template + fork-on-edit ──
  const SAMPLE_ID = "rt-sample-utility-bill";
  function sampleTemplateResult(owned: boolean): GetReportTemplateResult {
    return {
      template: {
        id: SAMPLE_ID,
        name: "Utility Bill Summary",
        sections: [
          { id: "billing_summary", name: "billing_summary", renderAs: "PARAGRAPH", question: "Summarize the bill.", variables: [] },
          { id: "charges_by_service", name: "charges_by_service", renderAs: "TABLE", question: "Charges per service.", variables: [] },
        ],
      },
      owned,
    };
  }

  it("T5: loads base rows from the REAL template via getReportTemplate when templateId is set", async () => {
    getReportTemplate.mockResolvedValue(sampleTemplateResult(false));
    renderWithReportApi(
      <>
        <TemplateIdSeeder templateId={SAMPLE_ID} />
        <SmartReportBuilder role="member" scope={UTILITY_SCOPE} />
      </>,
      { initialScenario: "utility", initialFrame: "f4a", initialAuthState: "signed-in" },
    );
    // Rows are sourced from the loaded template (not the deleted client fixture).
    expect(await screen.findByTestId("report-builder-row-billing_summary")).toBeInTheDocument();
    expect(screen.getByTestId("report-builder-row-charges_by_service")).toBeInTheDocument();
    await waitFor(() => expect(getReportTemplate).toHaveBeenCalledWith(SAMPLE_ID));
  });

  it("T5: FORK-ON-EDIT — editing a NOT-owned (sample) template Saves under a NEW id, never the sample id", async () => {
    const user = userEvent.setup();
    getReportTemplate.mockResolvedValue(sampleTemplateResult(false)); // owned:false → fork
    renderWithReportApi(
      <>
        <TemplateIdSeeder templateId={SAMPLE_ID} />
        <SmartReportBuilder role="member" scope={UTILITY_SCOPE} />
      </>,
      { initialScenario: "utility", initialFrame: "f4a", initialAuthState: "signed-in" },
    );
    await screen.findByTestId("report-builder-row-billing_summary");
    await user.click(screen.getByTestId("report-builder-save"));
    await waitFor(() => expect(saveReportTemplate).toHaveBeenCalledTimes(1));
    const savedId = vi.mocked(saveReportTemplate).mock.calls[0][0].id;
    // Copy-on-write: the member's save targets a NEW id, never the sample row.
    expect(savedId).not.toBe(SAMPLE_ID);
    expect(savedId).toMatch(/^rt-/);
  });

  it("T5: editing an OWNED template Saves under its OWN id (no fork)", async () => {
    const user = userEvent.setup();
    getReportTemplate.mockResolvedValue({ ...sampleTemplateResult(true), template: { ...sampleTemplateResult(true).template, id: "rt-mine" } });
    renderWithReportApi(
      <>
        <TemplateIdSeeder templateId="rt-mine" />
        <SmartReportBuilder role="member" scope={UTILITY_SCOPE} />
      </>,
      { initialScenario: "utility", initialFrame: "f4a", initialAuthState: "signed-in" },
    );
    await screen.findByTestId("report-builder-row-billing_summary");
    await user.click(screen.getByTestId("report-builder-save"));
    await waitFor(() => expect(saveReportTemplate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveReportTemplate).mock.calls[0][0].id).toBe("rt-mine");
  });
});
