import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ExtractView } from "./ExtractView";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const FrameProbe = ({ onFrame }: { onFrame: (frame: string) => void }) => {
  const session = useOnboardingSession();
  onFrame(session.state.currentFrame);
  return null;
};

describe("ExtractView (F3/F4)", () => {
  it("pre-selects the first field in the focus category on mount when ?focus= is set", async () => {
    // F2 Pick-a-view pills navigate to F3 with ?focus=<categoryId>;
    // the user lands already inspecting their picked slice instead of
    // staring at the blank preview placeholder.
    renderWithOnboardingProviders(<ExtractView />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialUrl: "/onboarding/28454/utility?focus=meters",
    });
    const preview = screen.getByTestId("extract-preview");
    // The first Meters field opens in the preview. Use waitFor since
    // the useEffect that reads ?focus runs after mount.
    await waitFor(() => expect(within(preview).getByText("Source pages")).toBeInTheDocument());
  });

  it("renders schema categories and citation preview for the Utility sample", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });

    expect(screen.getByText("Utility Bill")).toBeInTheDocument();
    expect(screen.getByText("Statement")).toBeInTheDocument();
    expect(screen.getByText("Meters")).toBeInTheDocument();
    expect(screen.getByText("Click a field on the left to see its source pages and snippets.")).toBeInTheDocument();

    await user.click(screen.getByTestId("field-row-amount_due"));

    const preview = screen.getByTestId("extract-preview");
    expect(within(preview).getByText("Amount due")).toBeInTheDocument();
    expect(within(preview).getByText("Source pages")).toBeInTheDocument();
    expect(within(preview).getByText(/utility-bill-2026-04/)).toBeInTheDocument();
  });

  it("supports the Loan table-to-JSON handoff render mode", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "loan" });

    expect(screen.getByTestId("render-mode-tabs")).toBeInTheDocument();
    expect(screen.getByText("Gross monthly income")).toBeInTheDocument();

    await user.click(screen.getByTestId("render-mode-json"));

    const json = screen.getByTestId("extract-json");
    expect(json).toHaveTextContent('"schemaId": "loan-schema-v1"');
    expect(json).toHaveTextContent('"gross_monthly_income"');
    expect(screen.queryByText("Gross monthly income")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("render-mode-table"));
    expect(screen.getByText("Gross monthly income")).toBeInTheDocument();
  });

  it("skips extract for the Solar Interact and Report scenario", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "solar" });

    expect(screen.getByText(/This sample skips extract/)).toBeInTheDocument();
    expect(screen.queryByTestId("advance-to-f5")).not.toBeInTheDocument();
  });

  it("advances from Extract to Interact", async () => {
    const user = userEvent.setup();
    let frame = "";

    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <FrameProbe onFrame={(next) => (frame = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    await user.click(screen.getByTestId("advance-to-f5"));

    await waitFor(() => expect(frame).toBe("f5"));
  });
});
