import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState, type FC } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { loanTestScenario, utilityTestScenario } from "@/test/scenarioFixtures";
import { useChatStore } from "@/contexts/ChatStoreContext";
import type { ScenarioConfig } from "@/types/scenarios";

import { Extract } from "./Extract";
import { descriptor as extractDescriptor } from "./Extract.tools";

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
  // The widget renders its OWN full-width topbar + internal scroll container, so
  // the frame must NOT add its own padding/scroll on top — that double-chrome
  // was the visible gap between the nav and the topbar buttons. Edge-to-edge
  // lets the topbar hug the nav.
  it("declares an edge-to-edge frame (no redundant padding above its own topbar)", () => {
    expect(extractDescriptor.viewerFrame.contentMode).toBe("edge-to-edge");
  });

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

  it("renders the Utility groups as instance tabs over a documents scope (manifest fallback)", () => {
    // analyze-and-chat-ux §2.1 — the render is a recursive tab bar: the root
    // scalars tab (label joined from the schema) + one tab per group.
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-topbar-title")).toHaveTextContent(/utility/);
    expect(screen.getByTestId("instance-tab-__fields")).toHaveTextContent(/Statement/);
    expect(screen.getByTestId("instance-tab-meters")).toHaveTextContent(/Meters/);
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

  it("pinning a field row drives the EMBEDDED PDF pane to its source page — no viewer navigation (§3.2b)", async () => {
    // Replaces the retired CiteChip-click contract: rows now pin their instance's
    // source on click. Same guarantee — the interaction stays inside the
    // embedded Extract pane (no `doc-viewer` step pushed to the global viewer).
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

    // meter_kwh lives in the meters group (fixture citation: page 2)
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    const meterRow = screen.getByTestId("field-row-meters/0/meter_kwh");
    fireEvent.click(meterRow);

    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-target-page", "2");
    });
    // Pin persists across mouse-leave (stable target for keyboard/touch)…
    fireEvent.mouseLeave(meterRow);
    expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-target-page", "2");
    // …and a second click unpins.
    fireEvent.click(screen.getByTestId("field-row-meters/0/meter_kwh"));

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

// ── standardized-viewer-control T5 (R7) — the schema DESIGN surface is now
//    driven by the active step's `surface` PROP, not `currentFrame === "f3a"`.
//    This makes the design surface reachable for AUTHENTICATED users (steady),
//    not just the onboarding f3a frame (a production bug today).
describe("Extract — hover lights the hovered INSTANCE's own regions (§3.2)", () => {
  // Live-shaped fakes at the SDK seam: a resolved doc id + a workflow with a
  // meters group whose instances nest meter_charges, and geometry derived from
  // the VALUE so each instance resolves distinct regions.
  const LIVE_DOC_ID = "c3bfff49-0000-4000-8000-0000000000aa";
  const LIVE_SCOPE: ContentScope = { type: "documents", documentIds: [LIVE_DOC_ID] };
  const liveWorkflow = {
    workflowId: "wf-live",
    name: "Utility Live",
    extract: {
      statement: { fields: { bill_account_id: { prompt: { description: "acct", type: "str" } } } },
      meters: { fields: { meter_id: { prompt: { description: "id", type: "str" } }, usage_amount: { prompt: { description: "usage", type: ["int", "float"] } } } },
      charges: { fields: { line_amount: { prompt: { description: "amt", type: ["int", "float"] } } } },
    },
  };
  const liveOutput = {
    bill_account_id: "10295809",
    meters: [
      { meter_id: "M-1", usage_amount: 60960, meter_charges: [{ line_amount: 55 }] },
      { meter_id: "M-2", usage_amount: 900, meter_charges: [{ line_amount: 99 }] },
    ],
  };
  const liveApi = () => ({
    groundxDocuments: {
      getGroundXDocument: vi.fn(async () => ({
        document: { documentId: LIVE_DOC_ID, filter: { workflow_id: "wf-live" } },
      })),
      getGroundXDocumentExtract: vi.fn(async () => liveOutput),
    },
    workflow: { getGroundXWorkflow: vi.fn(async () => ({ workflow: liveWorkflow })) },
    extract: {
      fetchFieldGeometry: vi.fn(async (_docId: string, fields: Array<{ value: unknown }>) =>
        fields.map((q) => [
          {
            // page + y derived from the value → meter 1's charge (55) and meter
            // 2's charge (99) get DISTINCT regions.
            page: q.value === 99 ? 3 : 2,
            bbox: { x: 0.1, y: q.value === 99 ? 0.55 : 0.2, w: 0.2, h: 0.02 },
          },
        ]),
      ),
    },
  });

  it("hovering meter 2's charge lights ITS bbox on the embedded PDF; leaving clears it", async () => {
    renderWithOnboardingProviders(<Extract role="member" scope={LIVE_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      api: liveApi(),
    });
    // live tree resolved → meters tab present with 2 instances
    await waitFor(() => expect(screen.getByTestId("instance-tab-meters")).toHaveTextContent("2"));
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    fireEvent.click(screen.getByTestId("instance-pill-meters/1"));
    fireEvent.click(screen.getByTestId("instance-tab-meters/1/meter_charges"));

    const chargeRow = screen.getByTestId("field-row-meters/1/meter_charges/0/line_amount");
    fireEvent.mouseEnter(chargeRow);
    const viewer = screen.getByTestId("pdf-viewer-widget");
    await waitFor(() => expect(viewer).toHaveAttribute("data-target-page", "3"));
    expect(viewer.getAttribute("data-highlight-bbox") ?? "").toContain("0.55");

    fireEvent.mouseLeave(chargeRow);
    await waitFor(() => expect(viewer).not.toHaveAttribute("data-highlight-bbox"));
  });
});

describe("Extract — schema design surface reads the step `surface` prop, not the frame (T5/R7)", () => {
  it("renders the design surface (SchemaView + ← back) when `surface='design'` even with the frame on f3", () => {
    renderWithOnboardingProviders(
      <Extract role="member" scope={UTILITY_DOC_SCOPE} surface="design" />,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    // Design-surface markers: the "← back" control + the SchemaView design pane.
    expect(screen.getByTestId("extract-topbar-back")).toBeInTheDocument();
    expect(screen.getByTestId("schema-view")).toBeInTheDocument();
    // The fields workbench body is NOT mounted on the design surface.
    expect(screen.queryByTestId("extract-fields-panel")).not.toBeInTheDocument();
  });

  it("renders the fields workbench (NOT the design surface) by default — even if the legacy frame is f3a", () => {
    renderWithOnboardingProviders(
      <Extract role="member" scope={UTILITY_DOC_SCOPE} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    // No `surface` prop → fields workbench, regardless of the (legacy) frame:
    // the design-surface ← back + SchemaView are absent; the fields panel shows.
    expect(screen.queryByTestId("extract-topbar-back")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("extract-fields-panel")).toBeInTheDocument();
  });
});

describe("Extract — render-surface layout (extract-screen-audit fixes)", () => {
  // The workbench root must FILL its frame (width:100%), not shrink to its
  // content's intrinsic width. Regression: without this the workbench was a
  // `flex: 0 1 auto` item that sized to content, so a narrow field-detail panel
  // shrank the whole workbench below the side-by-side threshold and spuriously
  // collapsed the PDF for some fields but not others.
  it("fills its frame width (never shrinks to content width)", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("extract-workbench")).toHaveStyle({ width: "100%" });
  });

  // (The "restores the fields-list scroll position after returning from a field
  // detail" contract is RETIRED — analyze-and-chat-ux §3.1 removed the field
  // detail view entirely; the list is the only content, so there is no
  // list↔detail toggle to restore across.)

  // Field ids are unbreakable snake_case tokens; they must be allowed to wrap so
  // they never overflow into / collide with the value beside them.
  it("lets long field ids wrap instead of overflowing into the value", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("field-row-account_number")).toHaveTextContent("account_number");
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
    // The description renders as its own full-width block inside the row...
    expect(row).toHaveTextContent("The account number printed in the statement header.");
    // ...and nothing in the panel clamps/truncates text.
    const css = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("");
    expect(css).not.toContain("line-clamp");
  });

  // The group tabs WRAP when narrow — they must never become a horizontal
  // scrollbar (the band-aid that shipped and was rejected).
  it("wraps the group tabs, never a horizontal scrollbar", () => {
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
    });
    const tabs = screen.getAllByTestId("instance-tabs")[0];
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

describe("Extract — per-field confidence label (shown only when the value carries one)", () => {
  // A utility scenario where ONE field's extracted value carries a confidence
  // and another does NOT — mirrors a workflow that returns `{value, confidence}`
  // for some fields and bare values for others.
  const scenarioWithConfidence: ScenarioConfig = {
    ...utilityTestScenario,
    manifest: {
      ...utilityTestScenario.manifest,
      sampleExtractionValues: [
        {
          fieldId: "account_number",
          value: "1023456",
          citations: [{ documentId: "utility-bill-2026-04", page: 1 }],
          confidence: 0.94,
        },
        {
          fieldId: "amount_due",
          value: 18742.16,
          citations: [{ documentId: "utility-bill-2026-04", page: 1 }],
        },
        {
          fieldId: "meter_kwh",
          value: 4128,
          citations: [{ documentId: "utility-bill-2026-04", page: 2 }],
          confidence: 0.3, // Low
        },
      ],
    },
  };

  const renderIt = () =>
    renderWithOnboardingProviders(<Extract role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f3",
      initialScenario: "utility",
      initialScenarios: [scenarioWithConfidence],
    });

  // §3.3 — the band renders INLINE on the row (the detail card is retired).
  it("shows a High band (0.94) inline on the row, with the exact score on hover", () => {
    renderIt();
    const row = screen.getByTestId("field-row-account_number");
    const pill = within(row).getByTestId("extract-field-confidence");
    expect(pill).toHaveTextContent("High"); // 0.94 → High
    expect(pill).toHaveAttribute("data-band", "High");
    expect(pill).toHaveAttribute("title", "94%"); // exact score on hover
  });

  it("shows a Low band (0.3) so a shaky value stands out", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("instance-tab-meters"));
    const row = screen.getByTestId("field-row-meters/0/meter_kwh");
    const pill = within(row).getByTestId("extract-field-confidence");
    expect(pill).toHaveTextContent("Low");
    expect(pill).toHaveAttribute("data-band", "Low");
    expect(pill).toHaveAttribute("title", "30%");
  });

  it("hides the confidence band entirely for a field with no confidence", () => {
    renderIt();
    const row = screen.getByTestId("field-row-amount_due");
    expect(within(row).queryByTestId("extract-field-confidence")).not.toBeInTheDocument();
    expect(screen.queryByText(/not scored yet/i)).not.toBeInTheDocument();
  });
});
