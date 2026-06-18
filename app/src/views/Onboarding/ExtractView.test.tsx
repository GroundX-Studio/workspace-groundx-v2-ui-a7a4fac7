import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useRef, type FC } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { Extract } from "@/components/viewer-widgets/Extract/Extract";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { useResumeAnchorDiagnostic } from "@/test/activeStepDiagnostic";
import { utilityTestScenario } from "@/test/scenarioFixtures";
import type { ScenarioConfig } from "@/types/scenarios";

/**
 * 2026-05-31-shared-canvas-affordance-restoration — the production
 * `views/Onboarding/ExtractView.tsx` thin wrapper was retired (the live canvas
 * mounts `Extract` via `<ScopedCanvas>`). These tests cover the Extract
 * extraction-WORKBENCH behavior (topbar / tabs / field cards / provenance /
 * F3a pinning) that is owned by the `Extract` widget — NOT by `Extract.test.tsx`
 * (which covers only scope adaptation). To preserve that coverage without the
 * retired view file, this local shim reproduces the deleted wrapper verbatim
 * (derive the scenario's documents scope + auth role, mount `Extract`). The
 * tests below are unchanged.
 */
const ExtractView: FC<{ focusedCategoryId?: string; openDesign?: boolean }> = ({
  focusedCategoryId,
  openDesign = false,
}) => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { state: chatState } = useChatStore();
  const { byId } = useScenarioRegistry();
  const widgetRole = useWidgetRole();
  const orchestrator = useCanvasOrchestrator();
  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const scenario = byId(scenarioId);
  const docId = scenario?.documents?.[0]?.documentId ?? null;
  const scope: ContentScope = useMemo(
    () => ({ type: "documents", documentIds: docId ? [docId] : [] }),
    [docId],
  );
  // standardized-viewer-control T5 (R7) — the schema DESIGN surface is now a
  // STEP sub-position (`surface:"design"`), entered via the `editSchema` intent
  // (production path: the fields-panel hamburger → "Edit schema…"). Tests that
  // previously mounted at `initialFrame:"f3a"` to land on the design surface set
  // `openDesign` instead; this dispatches `editSchema` once on mount, flipping
  // the active step to design — the frame-free, experience-agnostic path.
  const designOpenedRef = useRef(false);
  useEffect(() => {
    if (openDesign && !designOpenedRef.current) {
      designOpenedRef.current = true;
      orchestrator.dispatch({ kind: "editSchema", schemaId: scenarioId }, "user");
    }
  }, [openDesign, orchestrator, scenarioId]);
  // standardized-viewer-control — the live canvas (ScopedCanvas) forwards the
  // ACTIVE extract-workbench step's `focusedCategoryId` to the widget. This shim
  // mirrors that contract so a `showExtract` dispatch that mutates the step's
  // focus re-renders the widget (the retired `?focus=` URL carrier is gone). An
  // explicit prop (the "entered already focused" case) wins over the step.
  const activeSession = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)
    : null;
  const stepIdx = activeSession?.viewer.currentStep.stepIndex ?? -1;
  const top = stepIdx >= 0 ? activeSession?.viewer.history[stepIdx] : null;
  const stepFocus = top?.kind === "extract-workbench" ? top.focusedCategoryId : undefined;
  // standardized-viewer-control T5 (R7) — the live canvas (ScopedCanvas) also
  // forwards the active step's `surface` sub-position; mirror it so an
  // `editSchema` dispatch (which flips the step to `surface:"design"`) opens the
  // schema design surface — the production-correct, frame-free path.
  const stepSurface = top?.kind === "extract-workbench" ? top.surface : undefined;
  return (
    <Extract
      scope={scope}
      role={widgetRole}
      focusedCategoryId={focusedCategoryId ?? stepFocus}
      surface={stepSurface}
    />
  );
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// standardized-viewer-control (D2) — the FRAME-FREE successor to the retired
// `currentFrame`: the journey position = the active entity's resume anchor
// (`lastStep`). A design-surface mutation (`editSchema`) does NOT move the anchor,
// so it stays at the extract-workbench step — proving the journey didn't advance.
const StepProbe = ({ onStep }: { onStep: (step: string | null) => void }) => {
  onStep(useResumeAnchorDiagnostic());
  return null;
};

// standardized-viewer-control T5 (R7) — the schema DESIGN surface is now a
// sub-position on the active extract-workbench STEP (`surface: "design"`), not a
// frame. This probe reads the active step's surface so tests assert the real,
// frame-free contract.
const SurfaceProbe = ({ onSurface }: { onSurface: (surface: string | undefined) => void }) => {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  const idx = active?.viewer.currentStep.stepIndex ?? -1;
  const top = idx >= 0 ? active?.viewer.history[idx] : null;
  onSurface(top?.kind === "extract-workbench" ? top.surface : undefined);
  return null;
};

// Open the schema design surface the production way: the fields-panel hamburger →
// "Edit schema…" dispatches `editSchema`, flipping the active step's surface to
// "design" (no frame change). Tests that need the design surface call this first.
async function enterDesignSurface(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("extract-fields-panel-hamburger"));
  await user.click(await screen.findByTestId("extract-fields-panel-menu-edit-schema"));
  await waitFor(() => expect(screen.getByTestId("extract-topbar-back")).toBeInTheDocument());
}

describe("ExtractView (F3/F4)", () => {
  it("pre-selects the first field in the focus category on mount when the step carries a focusedCategoryId", async () => {
    // F2 Pick-a-view pills dispatch `showExtract` with `focusedCategoryId`;
    // the user lands already inspecting their picked slice. WF-01 C9
    // (2026-05-28): when the step focuses a category, the first field in that
    // category becomes the active selection AND the provenance panel surfaces;
    // the user lands on F4-shape provenance, not the fields list.
    // (standardized-viewer-control: the focus arrives via the step's
    // `focusedCategoryId` prop, not the retired `?focus=` URL param.)
    renderWithOnboardingProviders(<ExtractView focusedCategoryId="meters" />, {
      initialFrame: "f3",
      initialScenario: "utility",
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
    expect(screen.queryByTestId("extract-ask-question")).not.toBeInTheDocument();
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
    let step: string | null = null;

    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <StepProbe onStep={(next) => (step = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    await user.click(screen.getByTestId("extract-ask-question"));

    await waitFor(() => expect(step).toBe("interact-chat"));
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

  it("the design surface auto-pins the active sample and renders the pinned-samples row above the body", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    await enterDesignSurface(user);
    // Row exists with PINNED count + a chip for the active scenario's primary doc.
    await waitFor(() => expect(screen.getByTestId("extract-pinned-samples-row")).toBeInTheDocument());
    expect(screen.getByTestId("extract-pinned-count")).toHaveTextContent(/PINNED\s+1\s*\/\s*3/);
    // Match only the outer chip wrapper, not the inner `-remove-` button.
    const chips = screen.getAllByTestId(/^extract-pinned-chip-(?!remove-)/);
    expect(chips).toHaveLength(1);
    // category badge surfaces the focused category id
    expect(screen.getByTestId("extract-pinned-category-badge")).toHaveTextContent(/category:\s*\w+/);
  });

  // standardized-viewer-control T5 (R7) — the design-surface category focus
  // dropdown routes through the orchestrator (`showExtract` → mutate the active
  // step in place), so picking a category re-scopes the LIVE workbench (no
  // remount): the badge, the topbar title, and the scoped SchemaView all follow.
  // Enter the design surface the production way (hamburger → Edit schema →
  // `editSchema` → step `surface:"design"`) so the active ChatStore step is a
  // real extract-workbench step the dispatch can mutate. The schema design
  // surface is now a STEP sub-position, not the f3a frame — `currentFrame` stays f3.
  it("picking a category in the design-surface focus dropdown re-scopes the workbench live (via the dispatch seam)", async () => {
    const user = userEvent.setup();
    let step: string | null = null;
    let surface: string | undefined;
    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <StepProbe onStep={(next) => (step = next)} />
        <SurfaceProbe onSurface={(next) => (surface = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    await enterDesignSurface(user);
    await waitFor(() => expect(surface).toBe("design"));
    // The journey frame does NOT advance — design is a sub-position of Extract.
    expect(step).toBe("extract-workbench");
    // Default focus is the first category (statement) — Statement fields show.
    await waitFor(() =>
      expect(screen.getByTestId("extract-pinned-category-badge")).toHaveTextContent(/category:\s*statement/),
    );
    expect(screen.getByTestId("schema-field-account_number")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-meter_kwh")).not.toBeInTheDocument();
    // Open the dropdown and pick Meters.
    await user.click(screen.getByTestId("extract-pinned-category-badge"));
    await user.click(await screen.findByTestId("extract-pinned-category-option-meters"));
    // The workbench re-scopes live (still the design surface — no frame change):
    // badge + topbar title + the scoped SchemaView all reflect the meters category.
    await waitFor(() =>
      expect(screen.getByTestId("extract-pinned-category-badge")).toHaveTextContent(/category:\s*meters/),
    );
    expect(surface).toBe("design");
    expect(step).toBe("extract-workbench");
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/·\s*meters/);
    expect(screen.getByTestId("schema-field-meter_kwh")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-account_number")).not.toBeInTheDocument();
  });

  it("clicking × on a pinned chip removes it and decrements the count", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    await enterDesignSurface(user);
    const chips = await screen.findAllByTestId(/^extract-pinned-chip-(?!remove-)/);
    const remove = chips[0].querySelector('[data-testid^="extract-pinned-chip-remove-"]') as HTMLElement;
    expect(remove).not.toBeNull();
    await user.click(remove);
    await waitFor(() => expect(screen.queryAllByTestId(/^extract-pinned-chip-(?!remove-)/)).toHaveLength(0));
    expect(screen.getByTestId("extract-pinned-count")).toHaveTextContent(/PINNED\s+0\s*\/\s*3/);
  });

  it("clicking ← back on the design surface returns to the fields workbench (step surface → fields)", async () => {
    const user = userEvent.setup();
    let surface: string | undefined;
    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <SurfaceProbe onSurface={(next) => (surface = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    await enterDesignSurface(user);
    await waitFor(() => expect(surface).toBe("design"));
    // "← back" dispatches `showExtract` (no focus) → step surface returns to fields.
    await user.click(screen.getByTestId("extract-topbar-back"));
    await waitFor(() => expect(surface).toBe("fields"));
    // The fields workbench body is back; the design ← back control is gone.
    expect(screen.getByTestId("extract-fields-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("extract-topbar-back")).not.toBeInTheDocument();
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

  it("the Design surface mounts inside the shared workbench shell", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3", initialScenario: "utility" });
    await enterDesignSurface(user);
    // Design surface (SchemaView body) is rendered.
    await waitFor(() => expect(screen.getByTestId("schema-view")).toBeInTheDocument());
    // Topbar is still present (shared shell across the fields + design surfaces).
    expect(screen.getByTestId("extract-topbar")).toBeInTheDocument();
  });

  // ── realign-f3a-entry-point (openspec change) ───────────────────────

  it("opens the schema design surface from the fields-panel hamburger menu (step surface → design)", async () => {
    const user = userEvent.setup();
    let step: string | null = null;
    let surface: string | undefined;
    renderWithOnboardingProviders(
      <>
        <ExtractView />
        <StepProbe onStep={(next) => (step = next)} />
        <SurfaceProbe onSurface={(next) => (surface = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    // On the fields workbench the fields-panel hamburger is visible.
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
    // standardized-viewer-control T5 (R7) — Edit schema dispatches `editSchema`,
    // flipping the active step's surface to "design" (NOT advancing to an f3a
    // frame — the journey stage stays on Extract/f3).
    await user.click(screen.getByTestId("extract-fields-panel-menu-edit-schema"));
    await waitFor(() => expect(surface).toBe("design"));
    expect(step).toBe("extract-workbench");
  });
});
