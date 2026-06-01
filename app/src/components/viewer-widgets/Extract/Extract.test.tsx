import { screen, waitFor, within } from "@testing-library/react";
import { useState, type FC } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { loanTestScenario, utilityTestScenario } from "@/test/scenarioFixtures";
import type { ScenarioConfig } from "@/types/scenarios";

import { Extract } from "./Extract";

const UTILITY_DOC_SCOPE: ContentScope = {
  type: "documents",
  documentIds: ["utility-bill-2026-04"],
};
const LOAN_DOC_SCOPE: ContentScope = {
  type: "documents",
  documentIds: ["loan-doc-1"],
};
const EMPTY_SCOPE: ContentScope = { type: "documents", documentIds: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Extract — extraction-workbench ScopedViewerWidget (Phase 3a)", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithOnboardingProviders(<Extract role={role} scope={UTILITY_DOC_SCOPE} />, {
        initialFrame: "f3",
        initialScenario: "utility",
      });
      const root = screen.getByTestId("extract-workbench");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
    },
  );

  it("renders the Utility schema categories over a documents scope (manifest fallback)", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/utility/);
    expect(document.querySelector('[aria-label="Statement"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Meters"]')).not.toBeNull();
  });

  it("gates the table→JSON render toggle on the scenario's supportsJsonRender capability flag, not the id", () => {
    // §4f: the JSON-render affordance must read a ScenarioConfig capability
    // flag (data), NOT a `scenarioId === "loan"` literal. Prove it data-driven:
    // (1) a scenario whose id IS "loan" but with the flag false → NO toggle;
    // (2) a scenario whose id is NOT "loan" but with the flag true → toggle.
    const loanIdNoFlag: ScenarioConfig = {
      ...loanTestScenario,
      supportsJsonRender: false,
    };
    const { unmount } = renderWithOnboardingProviders(
      <Extract role="member" scope={LOAN_DOC_SCOPE} />,
      { initialFrame: "f3", initialScenario: "loan", initialScenarios: [loanIdNoFlag] },
    );
    expect(screen.queryByTestId("render-mode-json")).not.toBeInTheDocument();
    unmount();

    const utilityIdWithFlag: ScenarioConfig = {
      ...utilityTestScenario,
      supportsJsonRender: true,
    };
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialScenarios: [utilityIdWithFlag],
    });
    expect(screen.getByTestId("render-mode-json")).toBeInTheDocument();
  });

  it("shows the anon unlock banner for an anonymous role, not a member", () => {
    const { unmount } = renderWithOnboardingProviders(
      <Extract role="anonymous" scope={UTILITY_DOC_SCOPE} />,
      { initialFrame: "f3", initialScenario: "utility", initialAuthState: "anonymous" },
    );
    expect(screen.getByTestId("extract-unlock-banner")).toBeInTheDocument();
    unmount();

    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialAuthState: "signed-in",
    });
    expect(screen.queryByTestId("extract-unlock-banner")).not.toBeInTheDocument();
  });

  it("derives the source doc-pane from the scope, not scenario context", () => {
    // A documents scope holding the doc surfaces the PdfViewer source pane.
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
  });

  it("holds the no-source state when the scope carries no document", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={EMPTY_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    // The schema still resolves (manifest), but the doc pane shows the
    // no-source affordance (no documentId derived from the scope).
    expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer-widget")).not.toBeInTheDocument();
  });

  it("re-runs its load when the scope IDENTITY changes (useScopeAdapter is load-bearing)", async () => {
    // Flip from an empty scope (no doc pane) to a documents scope (doc pane
    // present) WITHOUT remounting the providers. The adapter must re-resolve.
    const Harness: FC = () => {
      const [scope, setScope] = useState<ContentScope>(EMPTY_SCOPE);
      return (
        <>
          <button data-testid="flip-scope" onClick={() => setScope(UTILITY_DOC_SCOPE)}>
            flip
          </button>
          <Extract role="member" scope={scope} />
        </>
      );
    };
    renderWithOnboardingProviders(<Harness />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.queryByTestId("pdf-viewer-widget")).not.toBeInTheDocument();

    const flip = screen.getByTestId("flip-scope");
    flip.click();
    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
  });
});
