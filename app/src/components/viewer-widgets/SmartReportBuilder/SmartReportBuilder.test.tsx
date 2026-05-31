import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

// FIX #1: a member Save must PERSIST the report-kind template (not the
// no-op the closeout review found). Mock the persist client so the test can
// assert it is called with the report template, distinct from the anon gate.
vi.mock("@/api/smartReport", () => ({
  saveReportTemplate: vi.fn(async () => ({
    id: "rt-utility-ic-brief",
    name: "Utility IC Brief (report)",
    updatedAt: "2026-05-31T00:00:00Z",
  })),
  // FIX #2: the builder ↻ render control is a real caller of the render
  // endpoint client too.
  renderReport: vi.fn(async () => ({
    gated: false as const,
    report: {
      reportId: "rr-rt-utility-ic-brief",
      templateId: "rt-utility-ic-brief",
      scope: { type: "bucket" as const, bucketId: 28454, filter: { project: "utility" } },
      status: "complete" as const,
      resolvedVariables: {},
      exportFormats: ["pdf" as const, "md" as const, "link" as const],
      previewOnly: true,
      sections: [],
    },
  })),
  SmartReportApiError: class SmartReportApiError extends Error {
    status: number;
    detail: unknown;
    constructor(message: string, status: number, detail: unknown) {
      super(message);
      this.name = "SmartReportApiError";
      this.status = status;
      this.detail = detail;
    }
  },
}));
import { renderReport, saveReportTemplate } from "@/api/smartReport";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { SmartReportBuilder } from "./SmartReportBuilder";

/** Probe that surfaces the gate status so the anon-Save test can assert it. */
const GateProbe: React.FC = () => {
  const { state } = useOnboardingSession();
  return <span data-testid="gate-status">{state.gate.status}</span>;
};

const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
  vi.mocked(saveReportTemplate).mockClear();
  vi.mocked(renderReport).mockClear();
});

describe("SmartReportBuilder — 2026-05-29-smart-report-screen Phase 4", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithOnboardingProviders(<SmartReportBuilder role={role} scope={UTILITY_SCOPE} />, {
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
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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

  it("pre-opens the inline editor for `selectedSectionId` (the render→builder + show_smart_report_edit hand-off)", () => {
    renderWithOnboardingProviders(
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

  it("offers a manual `make variable` affordance (no auto-inference, #12) and no version-history UI (#13)", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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
    renderWithOnboardingProviders(
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
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
      initialScenario: "utility",
      initialFrame: "f4a",
      initialAuthState: "signed-in",
    });
    const save = screen.getByTestId("report-builder-save");
    expect(save).not.toHaveTextContent("🔒");
  });

  it("FIX #2: the ↻ render control calls the render endpoint client", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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
    renderWithOnboardingProviders(<SmartReportBuilder role="member" scope={UTILITY_SCOPE} />, {
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
