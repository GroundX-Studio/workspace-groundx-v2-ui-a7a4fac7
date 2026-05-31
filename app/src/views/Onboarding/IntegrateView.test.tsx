import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, type FC } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { Integrate } from "@/components/viewer-widgets/Integrate/Integrate";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

/**
 * 2026-05-31-shared-canvas-affordance-restoration — the production
 * `views/Onboarding/IntegrateView.tsx` thin wrapper was retired (the live canvas
 * mounts `Integrate` via `<ScopedCanvas>`). This shim reproduces the deleted
 * wrapper verbatim so the connector/snippet coverage (not in `Integrate.test.tsx`)
 * is preserved without the view file.
 */
const IntegrateView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();
  const widgetRole = useWidgetRole();
  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const scenario = byId(scenarioId);
  const docId = scenario?.documents?.[0]?.documentId ?? null;
  const scope: ContentScope = useMemo(
    () => ({ type: "documents", documentIds: docId ? [docId] : [] }),
    [docId],
  );
  return <Integrate scope={scope} role={widgetRole} />;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("IntegrateView (F7)", () => {
  it("renders the post-gate integration surface for the selected scenario", () => {
    renderWithOnboardingProviders(<IntegrateView />, {
      initialAuthState: "signed-in",
      initialFrame: "f7",
      initialScenario: "loan",
    });

    expect(screen.getByText("Ship the same answer into your stack.")).toBeInTheDocument();
    expect(screen.getByText(/The Loan sample becomes a live GroundX project/)).toBeInTheDocument();
    expect(screen.getByTestId("integrate-snippet")).toHaveTextContent("curl -X POST");
    expect(screen.getByTestId("plugin-claude")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-openai")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-gemini")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-cursor")).toBeInTheDocument();
  });

  it("switches API snippets without introducing parked steady-mode surfaces", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<IntegrateView />, {
      initialAuthState: "signed-in",
      initialFrame: "f7",
      initialScenario: "utility",
    });

    await user.click(screen.getByRole("tab", { name: "Python" }));
    expect(screen.getByTestId("integrate-snippet")).toHaveTextContent("from groundx import GroundX");

    await user.click(screen.getByRole("tab", { name: "TypeScript" }));
    expect(screen.getByTestId("integrate-snippet")).toHaveTextContent('import { GroundX } from "groundx"');

    expect(screen.queryByText(/Saved Artifacts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Set up Workspaces/)).not.toBeInTheDocument();
    expect(screen.getByText(/Connect this sample to your workflow/)).toBeInTheDocument();
  });
});
