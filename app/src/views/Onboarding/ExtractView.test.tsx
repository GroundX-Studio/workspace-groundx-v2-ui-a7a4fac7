import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { utilityTestScenario } from "@/test/scenarioFixtures";
import type { ScenarioConfig } from "@/types/scenarios";

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
    // the user lands already inspecting their picked slice. WF-01 C9
    // (2026-05-28): when ?focus= picks a category, the first field in
    // that category becomes the active selection AND the provenance
    // panel surfaces; the user lands on F4-shape provenance, not the
    // fields list. (If we want a fields-list-default behavior with
    // ?focus= just biasing the visible category, that's a follow-up.)
    renderWithOnboardingProviders(<ExtractView />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialUrl: "/onboarding/28454/utility?focus=meters",
    });
    await waitFor(() => expect(screen.getByTestId("field-provenance-panel")).toBeInTheDocument());
    expect(screen.getByTestId("extract-breadcrumb").textContent ?? "").toMatch(/meter_kwh/);
  });

  it("renders schema categories for the Utility sample", async () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/utility/);
    // "Statement" + "Meters" appear in both the category-tab row and
    // the field-card eyebrow; assert by the aria-labeled category Card.
    expect(document.querySelector('[aria-label="Statement"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Meters"]')).not.toBeNull();
  });

  // WF-01 C7 (2026-05-28). Category tabs let the user filter the
  // fields panel by category; the wireframe pins them above the field
  // cards. The unlock banner below the panes flags locked features and
  // funnels signed-out users to F6.
  it("WF-01 C7: F3 renders one category tab per schema category", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    const tabs = screen.getByTestId("extract-category-tabs");
    // Utility schema has two categories (statement + meters).
    expect(within(tabs).getByTestId("extract-category-tab-statement")).toBeInTheDocument();
    expect(within(tabs).getByTestId("extract-category-tab-meters")).toBeInTheDocument();
  });

  it("WF-01 C7: F3 renders a sign-in unlock banner for anonymous users", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    const banner = screen.getByTestId("extract-unlock-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent ?? "").toMatch(/sign in/i);
  });

  // WF-01 C8 (2026-05-28). Per canonical (`spec-flow.jsx` line ~589),
  // F3 field rows show the snake_case field key in monospace as the
  // primary identifier, and the citation chip uses coral instead of
  // the default cyan.
  it("WF-01 C8: F3 field row renders the snake_case key", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    const row = screen.getByTestId("field-row-account_number");
    // Snake_case key visible in the row (in addition to or instead of
    // the human label — implementation chooses).
    expect(row.textContent ?? "").toMatch(/account_number/);
  });

  it("WF-01 C8: F3 field row renders a citation chip", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    // Utility schema's account_number field has one citation → cite-chip-1
    // inside that field row. (2026-05-29: dropped the harsh coral background
    // — field citations use the default neutral chip now.)
    const row = screen.getByTestId("field-row-account_number");
    const chip = within(row).getByTestId("cite-chip-1");
    expect(chip).toHaveAttribute("data-color", "cyan");
  });

  // WF-01 C9 (2026-05-28). Clicking a field card in F3 SHALL swap the
  // fields panel into a provenance panel with FIELD / SOURCE / WHY
  // MATCHED / CONFIDENCE / NEIGHBORS sections + a breadcrumb above
  // the panes. The "▴ collapse" control returns to the fields list.
  it("WF-01 C9: clicking a field card swaps the panel to a provenance view", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    await user.click(screen.getByTestId("field-row-account_number"));
    expect(screen.getByTestId("field-provenance-panel")).toBeInTheDocument();
    expect(screen.getByTestId("extract-breadcrumb")).toBeInTheDocument();
    // Required sections.
    const panel = screen.getByTestId("field-provenance-panel");
    expect(panel.textContent ?? "").toMatch(/FIELD/);
    expect(panel.textContent ?? "").toMatch(/SOURCE/);
    expect(panel.textContent ?? "").toMatch(/WHY MATCHED/);
    expect(panel.textContent ?? "").toMatch(/CONFIDENCE/);
    expect(panel.textContent ?? "").toMatch(/NEIGHBORS/);
  });

  it("WF-01 C9: clicking ▴ collapse returns to the fields list", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    await user.click(screen.getByTestId("field-row-account_number"));
    expect(screen.getByTestId("field-provenance-panel")).toBeInTheDocument();
    await user.click(screen.getByTestId("extract-breadcrumb-collapse"));
    expect(screen.queryByTestId("field-provenance-panel")).not.toBeInTheDocument();
    // Back to fields panel.
    expect(screen.getByTestId("field-row-account_number")).toBeInTheDocument();
  });

  // WF-01b C (2026-05-28). When a field is selected, the left-pane
  // PdfViewerWidget receives the selected field's first-citation page
  // as `targetPage` (and bbox as `highlightBbox` when the citation
  // carries one). We assert via the data-attrs the widget surfaces on
  // its root so the test doesn't depend on the xray fetch (which
  // doesn't resolve in jsdom without an API mock).
  it("WF-01b C: selecting a field threads the citation's page to the left-pane viewer", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    const viewer = screen.getByTestId("pdf-viewer-widget");
    expect(viewer.getAttribute("data-target-page")).toBeNull();
    await user.click(screen.getByTestId("field-row-amount_due"));
    // The Utility fixture's `amount_due` citation has page 1 (no bbox
    // in this fixture, so the highlight overlay stays off — that's
    // production-realistic: bbox is sometimes missing upstream).
    expect(viewer.getAttribute("data-target-page")).toBe("1");
  });

  // WF-01 C6 (2026-05-28). F3 layout is PDF viewer LEFT, fields panel
  // RIGHT — matching `spec-flow.jsx Flow_Peek`. Before this change the
  // panes were inverted: fields LEFT and an empty PREVIEW placeholder
  // RIGHT. The fix flips the panes and replaces the PREVIEW placeholder
  // with the actual PdfViewerWidget so the user can see the source
  // alongside the extracted data.
  it("WF-01 C6: F3 puts PdfViewerWidget in the left pane, fields in the right", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    const viewer = screen.getByTestId("pdf-viewer-widget");
    const fields = screen.getByTestId("extract-fields-panel");
    // Both panes present, and the PDF viewer precedes the fields panel
    // in document order (which is grid column order for a 2-column grid
    // with default `grid-auto-flow: row`).
    expect(viewer).toBeInTheDocument();
    expect(fields).toBeInTheDocument();
    // eslint-disable-next-line no-bitwise
    const beforeFields = viewer.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(beforeFields).toBeTruthy();
  });

  it("supports the Loan table-to-JSON handoff render mode", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "loan" });

    expect(screen.getByTestId("render-mode-tabs")).toBeInTheDocument();
    // WF-01 C8 (2026-05-28): field rows now show snake_case key as
    // primary label; the human label lives in the description.
    expect(screen.getByTestId("field-row-gross_monthly_income")).toBeInTheDocument();

    await user.click(screen.getByTestId("render-mode-json"));

    const json = screen.getByTestId("extract-json");
    expect(json).toHaveTextContent('"schemaId": "loan-schema-v1"');
    expect(json).toHaveTextContent('"gross_monthly_income"');
    expect(screen.queryByTestId("field-row-gross_monthly_income")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("render-mode-table"));
    expect(screen.getByTestId("field-row-gross_monthly_income")).toBeInTheDocument();
  });

  it("skips extract for the Solar Interact and Report scenario", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "solar" });

    expect(screen.getByText(/This sample skips extract/)).toBeInTheDocument();
    expect(screen.queryByTestId("advance-to-f5")).not.toBeInTheDocument();
  });

  it("shows a loading beat (NOT the skips-extract copy) when an extract scenario's schema hasn't resolved yet", () => {
    // A scenario whose `chapters.extract` is "live" but with no manifest
    // extractionSchema mirrors the production Utility sample mid-load, where
    // the schema arrives from the async GroundX workflow fetch. The
    // skips-extract message must NOT flash here.
    const loadingScenario: ScenarioConfig = {
      ...utilityTestScenario,
      manifest: {
        ...utilityTestScenario.manifest,
        extractionSchema: undefined,
      },
    };
    renderWithOnboardingProviders(<ExtractView />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialScenarios: [loadingScenario],
    });

    expect(screen.getByTestId("extract-loading")).toBeInTheDocument();
    expect(screen.queryByText(/This sample skips extract/)).not.toBeInTheDocument();
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

  it("renders the workbench shell topbar on F3 with Designing… · v draft · export · rerun · save (no ← back, no edit-schema toggle)", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    expect(screen.getByTestId("extract-workbench")).toBeInTheDocument();
    expect(screen.getByTestId("extract-topbar")).toBeInTheDocument();
    // `← back` is hidden on F3 — it only returns from F3a to F3, so on the
    // initial Extract surface it would be a dead no-op control.
    expect(screen.queryByTestId("extract-topbar-back")).not.toBeInTheDocument();
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
    // Save schema is sign-in-gated in onboarding (anon) — present but
    // disabled, mirroring the topbar Save button's lock.
    const saveItem = screen.getByTestId("extract-fields-panel-menu-save-schema");
    expect(saveItem).toBeInTheDocument();
    expect(saveItem).toHaveAttribute("aria-disabled", "true");
    // Clicking Edit schema advances the frame to F3a.
    await user.click(screen.getByTestId("extract-fields-panel-menu-edit-schema"));
    await waitFor(() => expect(frame).toBe("f3a"));
  });
});
