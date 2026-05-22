import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppModeProvider, useAppMode } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { OnboardingSessionProvider, useOnboardingSession } from "@/contexts/OnboardingSessionContext";

import { IngestView } from "./IngestView";

beforeEach(() => {
  // MUI ripple deferred state updates — silence the global "throw on
  // console.error" spy for this spec only.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const wrap = (node: React.ReactNode) => (
  <AppModeProvider>
    <OnboardingSessionProvider>
      <CanvasOrchestratorProvider>{node}</CanvasOrchestratorProvider>
    </OnboardingSessionProvider>
  </AppModeProvider>
);

describe("IngestView (F1)", () => {
  it("renders the three sample cards with capability badges", () => {
    render(wrap(<IngestView />));
    expect(screen.getByTestId("sample-utility")).toBeInTheDocument();
    expect(screen.getByTestId("sample-loan")).toBeInTheDocument();
    expect(screen.getByTestId("sample-solar")).toBeInTheDocument();
    expect(screen.getAllByText("Extract").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Interact").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Report").length).toBeGreaterThan(0);
  });

  it("renders BYO tiles with the wireframe's three doors", () => {
    render(wrap(<IngestView />));
    expect(screen.getByTestId("byo-pdf")).toBeInTheDocument();
    expect(screen.getByTestId("byo-url")).toBeInTheDocument();
    expect(screen.getByTestId("byo-folder")).toBeInTheDocument();
    // Three door titles from spec-nav-v2.jsx Canvas_Ingest.
    expect(screen.getByText("Upload files")).toBeInTheDocument();
    expect(screen.getByText("Connect a source")).toBeInTheDocument();
    expect(screen.getByText("Email it in")).toBeInTheDocument();
    // Behavior pill — confirms Sign up triggers F1→F2 + inline gate.
    expect(screen.getByText(/Sign up triggers F1.{1,3}F2/)).toBeInTheDocument();
    // Privacy footer.
    expect(screen.getByText(/GroundX never trains on uploaded content/)).toBeInTheDocument();
  });

  it("clicking a sample sets scenario + advances to F2", async () => {
    const user = userEvent.setup();
    let snapshot: { scenario: string | null; frame: string } = { scenario: null, frame: "" };
    const Spy = () => {
      const mode = useAppMode();
      const session = useOnboardingSession();
      snapshot = { scenario: mode.state.scenario, frame: session.state.currentFrame };
      return null;
    };
    render(
      wrap(
        <>
          <IngestView />
          <Spy />
        </>
      )
    );
    await user.click(screen.getByTestId("sample-utility"));
    expect(snapshot.scenario).toBe("utility");
    expect(snapshot.frame).toBe("f2");
  });

  it("clicking BYO opens the gate", async () => {
    const user = userEvent.setup();
    let gateStatus = "";
    const Spy = () => {
      const session = useOnboardingSession();
      gateStatus = session.state.gate.status;
      return null;
    };
    render(
      wrap(
        <>
          <IngestView />
          <Spy />
        </>
      )
    );
    await user.click(screen.getByTestId("byo-pdf"));
    expect(gateStatus).toBe("open");
  });
});
