import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FC, ReactElement } from "react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import type {
  RenderReportInput,
  RenderReportResult,
  SaveReportTemplateInput,
  SaveReportTemplateResult,
} from "@/api/smartReport";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { SmartReportBuilder } from "./SmartReportBuilder";

/** Probe that surfaces the gate status so the anon-Save test can assert it. */
const GateProbe: FC = () => {
  const { state } = useOnboardingSession();
  return <span data-testid="gate-status">{state.gate.status}</span>;
};

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

const saveReportTemplate =
  vi.fn<[SaveReportTemplateInput], Promise<SaveReportTemplateResult>>();
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
        saveReportTemplate,
      },
    },
  });

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

  it("renders a row list of the fixture sections and opens the inline section editor on Edit", async () => {
    const user = userEvent.setup();
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    // The four Utility IC-brief sections appear as rows.
    expect(screen.getByTestId("report-builder-row-billing_summary")).toBeInTheDocument();
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
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });

    await user.click(screen.getByTestId("report-builder-edit-billing_summary"));
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

  it("pre-opens the inline editor for `selectedSectionId` (the render→builder + show_smart_report_edit hand-off)", () => {
    renderWithReportApi(
      <SmartReportBuilder role="member" scope={UTILITY_SCOPE} selectedSectionId="charge_breakdown" />,
      {
        initialScenario: "utility",
        initialFrame: "f4a",
        initialAuthState: "signed-in",
      },
    );
    // The named section's editor is open WITHOUT a click (the hand-off carried the id).
    expect(screen.getByTestId("report-builder-editor-charge_breakdown")).toBeInTheDocument();
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
    renderWithReportApi(
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
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(screen.getByTestId("report-builder-edit-billing_summary"));
    expect(screen.getByTestId("report-builder-make-variable-billing_summary")).toBeInTheDocument();
    // No version-history surface anywhere on the builder.
    expect(screen.queryByTestId("report-builder-version-history")).not.toBeInTheDocument();
  });

  it("make variable records the USER-CHOSEN token (step-16 follow-up), not a hardcoded literal", async () => {
    const user = userEvent.setup();
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(screen.getByTestId("report-builder-edit-billing_summary"));
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
    expect(vi.mocked(renderReport).mock.calls[0][0]).toMatchObject({
      templateId: "rt-utility-ic-brief",
      scope: UTILITY_SCOPE,
    });
  });

  it("FIX #1: a member Save PERSISTS the report-kind template (not a no-op)", async () => {
    const user = userEvent.setup();
    renderWithReportApi(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    await user.click(screen.getByTestId("report-builder-save"));
    // The member Save lands the report template through the report-kind persist
    // path — NOT the anon gate, NOT a silent return.
    await waitFor(() => expect(saveReportTemplate).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(saveReportTemplate).mock.calls[0][0];
    // The persisted template carries the builder's effective sections (the four
    // Utility IC-brief sections seeded from the fixture).
    expect(arg.sections.map((s) => s.name)).toEqual([
      "billing_summary",
      "charge_breakdown",
      "anomalies",
      "recommendation",
    ]);
    expect(arg.sections[0].renderAs).toBe("PARAGRAPH");
    // A persisted save reflects a success status the user can see.
    await waitFor(() =>
      expect(screen.getByTestId("report-builder-save-status")).toHaveTextContent(/saved/i),
    );
  });
});
