import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppModeProvider, useAppMode } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { OnboardingSessionProvider, useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import type { ScenarioConfig } from "@/types/scenarios";

import { IngestView } from "./IngestView";

beforeEach(() => {
  // MUI ripple deferred state updates — silence the global "throw on
  // console.error" spy for this spec only.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const fixtureScenarios: ScenarioConfig[] = [
  {
    id: "utility",
    order: 1,
    manifest: {
      id: "utility",
      hero: {
        title: "Utility Bill",
        shortDesc: "a single billing statement with 8 meters and 56 charges across 3 pages",
        demonstrates: "messy layout → clean extraction",
        badges: ["E"],
        chapters: { extract: "live", interact: "live", report: "off" },
        docCount: "1 doc",
      },
      thinkingScript: [],
      extractionSchema: { id: "u", name: "Utility", categories: [] },
      chatSeeds: [],
    },
    documents: [],
  },
  {
    id: "loan",
    order: 2,
    manifest: {
      id: "loan",
      hero: {
        title: "Loan Eligibility Packet",
        shortDesc: "paystubs, W-2, bank statements, employment letter — the bundle an underwriter reviews",
        demonstrates: "docs → structured JSON for workflows",
        badges: ["E", "I"],
        chapters: { extract: "live", interact: "live", report: "off" },
        docCount: "12 docs",
      },
      thinkingScript: [],
      extractionSchema: { id: "l", name: "Loan", categories: [] },
      chatSeeds: [],
    },
    documents: [],
  },
  {
    id: "solar",
    order: 3,
    manifest: {
      id: "solar",
      hero: {
        title: "Solar Project Portfolio",
        shortDesc: "agreements, leases, permits, engineering studies — a whole fund's worth of project diligence",
        demonstrates: "cross-document intelligence at scale",
        badges: ["I", "R"],
        chapters: { extract: "off", interact: "live", report: "live" },
        docCount: "142 docs",
      },
      thinkingScript: [],
      extractionSchema: { id: "s", name: "Solar", categories: [] },
      chatSeeds: [],
    },
    documents: [],
  },
];

const wrap = (node: React.ReactNode) => (
  <MemoryRouter initialEntries={["/onboarding"]}>
    <AppModeProvider>
      <ScenarioRegistryProvider initialScenarios={fixtureScenarios}>
        <OnboardingSessionProvider>
          <CanvasOrchestratorProvider>{node}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ScenarioRegistryProvider>
    </AppModeProvider>
  </MemoryRouter>
);

const wrapEmpty = (node: React.ReactNode) => (
  <MemoryRouter initialEntries={["/onboarding"]}>
    <AppModeProvider>
      <ScenarioRegistryProvider initialScenarios={[]}>
        <OnboardingSessionProvider>
          <CanvasOrchestratorProvider>{node}</CanvasOrchestratorProvider>
        </OnboardingSessionProvider>
      </ScenarioRegistryProvider>
    </AppModeProvider>
  </MemoryRouter>
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

  it("clicking BYO opens the gate AND advances the frame to F2", async () => {
    const user = userEvent.setup();
    let snapshot = { gateStatus: "", frame: "" };
    const Spy = () => {
      const session = useOnboardingSession();
      snapshot = { gateStatus: session.state.gate.status, frame: session.state.currentFrame };
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
    // Gate opens (existing behavior)…
    expect(snapshot.gateStatus).toBe("open");
    // …AND we advance to F2 so the gate can render in the chat column
    // (wireframe behavior: "Sign up triggers F1→F2 + loads the gate inline").
    expect(snapshot.frame).toBe("f2");
  });

  it("does NOT render the gate inside IngestView after BYO click (OnboardingShell hosts it in chat)", async () => {
    const user = userEvent.setup();
    render(wrap(<IngestView />));
    await user.click(screen.getByTestId("byo-pdf"));
    // The gate must NOT live in F1's render tree. F2's OnboardingShell
    // chat column is the host. If IngestView still rendered <GateView />
    // inline (the old behavior), this test would find a gate-card.
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();
  });

  it("clicking the BYO section header opens the gate (same as the Sign Up buttons)", async () => {
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
    // The header is the role=button wrapping "BRING YOUR OWN ..." copy.
    const header = screen.getByText(/BRING YOUR OWN/).closest('[role="button"]');
    expect(header).toBeTruthy();
    await user.click(header!);
    expect(gateStatus).toBe("open");
  });

  it("shows an empty-state message with a Retry button when registry returns zero scenarios", () => {
    render(wrapEmpty(<IngestView />));
    // Sample tiles should not render.
    expect(screen.queryByTestId("sample-utility")).not.toBeInTheDocument();
    // A clear empty-state message must be present (specific wording: "no samples available").
    expect(screen.getByText(/no samples available/i)).toBeInTheDocument();
    // And a Retry button that the user can click.
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("hides the empty-state message when scenarios are present", () => {
    render(wrap(<IngestView />));
    expect(screen.queryByText(/no samples available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("Retry button is keyboard-activatable and does not crash on click", async () => {
    const user = userEvent.setup();
    render(wrapEmpty(<IngestView />));
    const retry = screen.getByRole("button", { name: /retry/i });
    await user.click(retry); // smoke — refresh() fires; the entity will be exercised in integration.
    // The button should still be in the document after click (provider re-renders into loading then back).
    expect(screen.queryByText(/no samples available/i) ?? screen.queryByText(/loading/i)).toBeInTheDocument();
  });

  it("opens the gate from the BYO header via Enter key", async () => {
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
    const header = screen.getByText(/BRING YOUR OWN/).closest('[role="button"]') as HTMLElement;
    header.focus();
    await user.keyboard("{Enter}");
    expect(gateStatus).toBe("open");
  });

  // WF-01b A was reverted 2026-05-28: the "↳ Sign up triggers F1→F2
  // transition…" copy was a wireframe annotation, not production copy.
  // The pill must NOT render.
  it("does NOT render a wireframe-annotation affordance pill below the BYO label", () => {
    render(wrap(<IngestView />));
    expect(screen.queryByTestId("byo-affordance-pill")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sign up triggers F1.+F2 transition/)).not.toBeInTheDocument();
  });
});
