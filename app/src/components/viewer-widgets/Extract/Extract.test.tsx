import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState, type FC } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { loanTestScenario, utilityTestScenario } from "@/test/scenarioFixtures";
import { useChatStore } from "@/contexts/ChatStoreContext";
import type { ScenarioConfig } from "@/types/scenarios";

import { Extract } from "./Extract";

const UTILITY_DOC_SCOPE: ContentScope = {
  type: "documents",
  documentIds: ["utility-bill-2026-04"],
};
const LOAN_DOC_SCOPE: ContentScope = {
  type: "documents",
  documentIds: ["loan-doc-1"],
};
const EMPTY_SCOPE: ContentScope = { type: "documents", documentIds: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Extract — extraction-workbench ScopedViewerWidget (Phase 3a)", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithOnboardingProviders(<Extract role={role} scope={UTILITY_DOC_SCOPE} />, {
        initialFrame: "f3",
        initialScenario: "utility",
      });
      const root = screen.getByTestId("extract-workbench");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
    },
  );

  it("renders the Utility schema categories over a documents scope (manifest fallback)", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/utility/);
    expect(document.querySelector('[aria-label="Statement"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Meters"]')).not.toBeNull();
  });

  it("gates the table→JSON render toggle on the scenario's supportsJsonRender capability flag, not the id", () => {
    // §4f: the JSON-render affordance must read a ScenarioConfig capability
    // flag (data), NOT a `scenarioId === "loan"` literal. Prove it data-driven:
    // (1) a scenario whose id IS "loan" but with the flag false → NO toggle;
    // (2) a scenario whose id is NOT "loan" but with the flag true → toggle.
    const loanIdNoFlag: ScenarioConfig = {
      ...loanTestScenario,
      supportsJsonRender: false,
    };
    const { unmount } = renderWithOnboardingProviders(
      <Extract role="member" scope={LOAN_DOC_SCOPE} />,
      { initialFrame: "f3", initialScenario: "loan", initialScenarios: [loanIdNoFlag] },
    );
    expect(screen.queryByTestId("render-mode-json")).not.toBeInTheDocument();
    unmount();

    const utilityIdWithFlag: ScenarioConfig = {
      ...utilityTestScenario,
      supportsJsonRender: true,
    };
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialScenarios: [utilityIdWithFlag],
    });
    expect(screen.getByTestId("render-mode-json")).toBeInTheDocument();
  });

  it("shows the anon unlock banner for an anonymous role, not a member", () => {
    const { unmount } = renderWithOnboardingProviders(
      <Extract role="anonymous" scope={UTILITY_DOC_SCOPE} />,
      { initialFrame: "f3", initialScenario: "utility", initialAuthState: "anonymous" },
    );
    expect(screen.getByTestId("extract-unlock-banner")).toBeInTheDocument();
    unmount();

    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialAuthState: "signed-in",
    });
    expect(screen.queryByTestId("extract-unlock-banner")).not.toBeInTheDocument();
  });

  it("derives the source doc-pane from the scope, not scenario context", () => {
    // A documents scope holding the doc surfaces the PdfViewer source pane.
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
  });

  it("keeps field citation clicks inside the embedded Extract PDF pane", async () => {
    const storeRef: { current: ReturnType<typeof useChatStore> | null } = { current: null };
    const StoreProbe: FC = () => {
      storeRef.current = useChatStore();
      return null;
    };
    renderWithOnboardingProviders(
      <>
        <Extract role="member" scope={UTILITY_DOC_SCOPE} />
        <StoreProbe />
      </>,
      {
        initialFrame: "f3",
        initialScenario: "utility",
      },
    );

    const meterRow = screen.getByTestId("field-row-meter_kwh");
    fireEvent.click(within(meterRow).getByTestId("cite-chip-1"));

    await waitFor(() => {
      expect(screen.getByTestId("field-provenance-panel")).toBeInTheDocument();
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-target-page", "2");
    });
    const store = storeRef.current;
    expect(store?.state.activeSessionId).toBeTruthy();
    if (!store?.state.activeSessionId) throw new Error("ChatStore probe did not mount");
    const session = store.state.sessions.get(store.state.activeSessionId);
    const pushedDocViewer = session?.viewer.history.some((step) => step.kind === "doc-viewer");
    expect(pushedDocViewer).toBe(false);
  });

  it("holds the no-source state when the scope carries no document", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={EMPTY_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    // The schema still resolves (manifest), but the doc pane shows the
    // no-source affordance (no documentId derived from the scope).
    expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer-widget")).not.toBeInTheDocument();
  });

  it("re-runs its load when the scope IDENTITY changes (useScopeAdapter is load-bearing)", async () => {
    // Flip from an empty scope (no doc pane) to a documents scope (doc pane
    // present) WITHOUT remounting the providers. The adapter must re-resolve.
    const Harness: FC = () => {
      const [scope, setScope] = useState<ContentScope>(EMPTY_SCOPE);
      return (
        <>
          <button data-testid="flip-scope" onClick={() => setScope(UTILITY_DOC_SCOPE)}>
            flip
          </button>
          <Extract role="member" scope={scope} />
        </>
      );
    };
    renderWithOnboardingProviders(<Harness />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.queryByTestId("pdf-viewer-widget")).not.toBeInTheDocument();

    const flip = screen.getByTestId("flip-scope");
    flip.click();
    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
  });
});

describe("Extract — render-surface layout (extract-screen-audit fixes)", () => {
  // Field ids are unbreakable snake_case tokens; they must be allowed to wrap so
  // they never overflow into / collide with the value beside them.
  it("lets long field ids wrap instead of overflowing into the value", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-field-id-account_number")).toBeInTheDocument();
    // jsdom's CSS parser doesn't recognize the `anywhere` value, so assert the
    // rule was emitted into the emotion stylesheet rather than via getComputedStyle.
    const css = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("");
    expect(css).toContain("overflow-wrap:anywhere");
  });

  // Each field is a key-value CARD: id + value in a header row over a
  // full-width description that is NEVER truncated (no line-clamp). The value
  // never shares a column with the description, so the description always has
  // the full width.
  it("renders each field as a key-value card with a full, non-truncated description", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    const row = screen.getByTestId("field-row-account_number");
    expect(row).toHaveStyle({ display: "flex" });
    expect(row).toHaveStyle({ flexDirection: "column" });
    // The description renders as its own full-width block...
    expect(screen.getByTestId("extract-field-desc-account_number")).toBeInTheDocument();
    // ...and nothing in the panel clamps/truncates text.
    const css = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("");
    expect(css).not.toContain("line-clamp");
  });

  // The category tabs WRAP when narrow — they must never become a horizontal
  // scrollbar (the band-aid that shipped and was rejected).
  it("wraps the category tabs, never a horizontal scrollbar", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    const tabs = screen.getByTestId("extract-category-tabs");
    expect(tabs).toHaveStyle({ flexWrap: "wrap" });
    expect(tabs).not.toHaveStyle({ overflowX: "auto" });
    expect(tabs).not.toHaveStyle({ overflowX: "scroll" });
  });
});

// Responsive layout is driven by the MEASURED canvas width via ResizeObserver
// (not a viewport media query — the resizable chat pane changes how much room the
// canvas has). jsdom has no ResizeObserver/layout, so inject one reporting a
// fixed width. These guard BOTH the "side-by-side only when there's room" rule
// and the regression where the observer never fired (container left unmeasured).
describe("Extract — responsive document/schema layout (regression guards)", () => {
  let originalRO: typeof globalThis.ResizeObserver;
  let canvasWidth = 1000;
  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(): void {
        this.cb([{ contentRect: { width: canvasWidth } } as ResizeObserverEntry], this);
      }
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof globalThis.ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
  });

  it("shows PDF and schema side-by-side (no toggle, no slider) when the canvas is wide", async () => {
    canvasWidth = 1000;
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    await waitFor(() => {
      expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
      expect(screen.getByTestId("extract-fields-panel")).toBeInTheDocument();
    });
    // No single-pane toggle and — crucially — no resize slider (that was removed).
    expect(screen.queryByTestId("extract-pane-toggle")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: /resize document pane/i }),
    ).not.toBeInTheDocument();
  });

  it("collapses to a Document/Fields toggle (not a cramped split) when the canvas is narrow", async () => {
    canvasWidth = 500;
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    await waitFor(() => expect(screen.getByTestId("extract-pane-toggle")).toBeInTheDocument());
    // One pane at a time: document by default, schema reachable via the toggle.
    expect(screen.getByTestId("extract-doc-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("extract-fields-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("extract-pane-toggle-fields"));
    await waitFor(() => expect(screen.getByTestId("extract-fields-panel")).toBeInTheDocument());
    expect(screen.queryByTestId("extract-doc-pane")).not.toBeInTheDocument();
  });
});
