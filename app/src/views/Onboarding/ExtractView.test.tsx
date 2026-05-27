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

    // Topbar title carries the scenario id; category labels render in body.
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/utility/);
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

  // ── Workbench-shell topbar (spec: project_dev_contracts.md) ─────────

  it("renders the workbench shell topbar on F3 with ← back · Designing… · v draft · export · rerun · save (no edit-schema toggle)", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    expect(screen.getByTestId("extract-workbench")).toBeInTheDocument();
    expect(screen.getByTestId("extract-topbar")).toBeInTheDocument();
    // Per realign-f3a-topbar-chrome: ← back leads the bar.
    expect(screen.getByTestId("extract-topbar-back")).toBeInTheDocument();
    // Title block: `Designing <sample-id> · <category-id>` — for the
    // utility scenario the sample id is `utility` and the default
    // category id is the schema's first category (`statement`).
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(
      /Designing\s+utility\s*·\s*statement/,
    );
    // Version chip
    expect(screen.getByTestId("extract-topbar-version")).toHaveTextContent(/v1\s*·\s*draft/);
    // Standard chrome buttons
    expect(screen.getByTestId("extract-topbar-export")).toBeInTheDocument();
    expect(screen.getByTestId("extract-topbar-rerun")).toBeInTheDocument();
    expect(screen.getByTestId("extract-topbar-save")).toBeInTheDocument();
    // The ✎ edit schema toggle SHALL be gone.
    expect(screen.queryByTestId("extract-topbar-edit-schema")).not.toBeInTheDocument();
  });

  // ── add-pinned-samples-row (openspec change) ───────────────────────

  it("F3a auto-pins the active sample and renders the pinned-samples row above the body", async () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    // Row exists with PINNED count + a chip for the active scenario's primary doc.
    await waitFor(() => expect(screen.getByTestId("extract-pinned-samples-row")).toBeInTheDocument());
    expect(screen.getByTestId("extract-pinned-count")).toHaveTextContent(/PINNED\s+1\s*\/\s*3/);
    // Match only the outer chip wrapper, not the inner `-remove-` button.
    const chips = screen.getAllByTestId(/^extract-pinned-chip-(?!remove-)/);
    expect(chips).toHaveLength(1);
    // category badge surfaces the focused category id
    expect(screen.getByTestId("extract-pinned-category-badge")).toHaveTextContent(/category:\s*\w+/);
  });

  it("clicking × on a pinned chip removes it and decrements the count", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    const chips = await screen.findAllByTestId(/^extract-pinned-chip-(?!remove-)/);
    const remove = chips[0].querySelector('[data-testid^="extract-pinned-chip-remove-"]') as HTMLElement;
    expect(remove).not.toBeNull();
    await user.click(remove);
    await waitFor(() => expect(screen.queryAllByTestId(/^extract-pinned-chip-(?!remove-)/)).toHaveLength(0));
    expect(screen.getByTestId("extract-pinned-count")).toHaveTextContent(/PINNED\s+0\s*\/\s*3/);
  });

  it("clicking ← back on F3a returns the user to F3", async () => {
    const user = userEvent.setup();
    let frame = "";
    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <FrameProbe onFrame={(next) => (frame = next)} />
      </>,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    await user.click(screen.getByTestId("extract-topbar-back"));
    await waitFor(() => expect(frame).toBe("f3"));
  });

  it("topbar export and save are 🔒-locked for anonymous users (visual indicator only)", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    expect(screen.getByTestId("extract-topbar-export").getAttribute("data-locked")).toBe("true");
    expect(screen.getByTestId("extract-topbar-save").getAttribute("data-locked")).toBe("true");
    // rerun is not lock-gated.
    expect(screen.getByTestId("extract-topbar-rerun").getAttribute("data-locked")).toBeNull();
  });

  it("topbar Save loses its 🔒 lock + the export button drops its 🔒 for signed-in users", () => {
    renderWithOnboardingProviders(<ExtractView />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialAuthState: "signed-in",
    });
    expect(screen.getByTestId("extract-topbar-save").getAttribute("data-locked")).toBeNull();
    expect(screen.getByTestId("extract-topbar-export").getAttribute("data-locked")).toBeNull();
  });

  it("F3a's Design surface mounts inside the shared workbench shell", async () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    // Design surface (SchemaView body) is rendered.
    await waitFor(() => expect(screen.getByTestId("schema-view")).toBeInTheDocument());
    // Topbar is still present (shared shell across F3 / F3a / F4).
    expect(screen.getByTestId("extract-topbar")).toBeInTheDocument();
  });

  // ── realign-f3a-entry-point (openspec change) ───────────────────────

  it("opens F3a from the fields-panel hamburger menu", async () => {
    const user = userEvent.setup();
    let frame = "";
    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <FrameProbe onFrame={(next) => (frame = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    // On F3 the fields-panel hamburger is visible.
    const hamburger = screen.getByTestId("extract-fields-panel-hamburger");
    expect(hamburger).toBeInTheDocument();
    // Click → menu opens with Save schema… and Edit schema…
    await user.click(hamburger);
    await waitFor(() =>
      expect(screen.getByTestId("extract-fields-panel-menu-edit-schema")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("extract-fields-panel-menu-save-schema")).toBeInTheDocument();
    // Clicking Edit schema advances the frame to F3a.
    await user.click(screen.getByTestId("extract-fields-panel-menu-edit-schema"));
    await waitFor(() => expect(frame).toBe("f3a"));
  });
});
