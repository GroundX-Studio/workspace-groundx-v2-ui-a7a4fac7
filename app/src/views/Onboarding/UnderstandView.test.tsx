import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { UnderstandView } from "./UnderstandView";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

const FrameProbe = ({ onFrame }: { onFrame: (frame: string) => void }) => {
  const session = useOnboardingSession();
  onFrame(session.state.currentFrame);
  return null;
};

describe("UnderstandView (F2)", () => {
  it("renders a BYO sign-in placeholder when no scenario has been picked", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: null });
    // The canvas should not show the per-scenario thinking script (no
    // scenario to thread). Instead, a placeholder that explains why and
    // hints at the sign-in path. The chat column (rendered by the
    // OnboardingShell, not by UnderstandView itself) hosts the gate.
    expect(screen.getByText(/sign in to start uploading/i)).toBeInTheDocument();
    // The scenario-specific copy must NOT appear.
    expect(screen.queryByText(/parsing layout/)).not.toBeInTheDocument();
  });

  it("renders the selected scenario document and streams thinking notes", () => {
    vi.useFakeTimers();

    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });

    expect(screen.getByText("April 2026 Statement.pdf")).toBeInTheDocument();
    expect(screen.getByText(/parsing layout/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1100));
    act(() => vi.advanceTimersByTime(1100));

    expect(screen.getByText(/found header/)).toBeInTheDocument();
    expect(screen.getByText(/extracting meter table/)).toBeInTheDocument();
  });

  it("reveals the extract CTA after the scan beat and advances to F3", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let frame = "";

    renderWithOnboardingProviders(
      <>
        <UnderstandView />
        <FrameProbe onFrame={(next) => (frame = next)} />
      </>,
      { initialFrame: "f2", initialScenario: "loan" },
    );

    expect(screen.queryByTestId("advance-to-f3")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4500));

    await user.click(screen.getByTestId("advance-to-f3"));

    expect(frame).toBe("f3");
  });
});
