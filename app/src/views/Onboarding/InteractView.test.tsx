import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { InteractView } from "./InteractView";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { frame: string; gateStatus: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ frame: session.state.currentFrame, gateStatus: session.state.gate.status });
  return null;
};

describe("InteractView (F5)", () => {
  it("renders scenario chat script with citation chips", () => {
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "loan" });

    expect(screen.getByText("Does this applicant meet our 35% DTI threshold?")).toBeInTheDocument();
    expect(screen.getByText(/Estimated DTI is 22%/)).toBeInTheDocument();
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "loan-doc-1");
  });

  it("adds a user turn and placeholder assistant turn from the input", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await user.type(screen.getByLabelText("Chat input"), "Which page proves this?");
    await user.click(screen.getByLabelText("Send"));

    expect(screen.getByText("Which page proves this?")).toBeInTheDocument();
    expect(screen.getByText(/Live answers light up after sign-in/)).toBeInTheDocument();
    expect(screen.getByLabelText("Chat input")).toHaveValue("");
  });

  it("opens the save gate and advances to F6 from click", async () => {
    const user = userEvent.setup();
    let snapshot = { frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <InteractView />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await user.click(screen.getByTestId("advance-to-f6"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f6");
      expect(snapshot.gateStatus).toBe("open");
    });
  });

  it("opens the save gate from keyboard Space activation", async () => {
    const user = userEvent.setup();
    let snapshot = { frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <InteractView />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    screen.getByTestId("advance-to-f6").focus();
    await user.keyboard(" ");

    await waitFor(() => {
      expect(snapshot.frame).toBe("f6");
      expect(snapshot.gateStatus).toBe("open");
    });
  });
});
