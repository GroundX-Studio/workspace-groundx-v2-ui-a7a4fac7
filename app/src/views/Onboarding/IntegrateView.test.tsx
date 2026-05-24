import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { IntegrateView } from "./IntegrateView";

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
