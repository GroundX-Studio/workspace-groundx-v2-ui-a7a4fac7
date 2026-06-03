import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModeProvider } from "@/contexts/AppModeContext";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { withApiProvider } from "@/test/withApiProvider";
import { GxThemeProvider } from "@/ThemeProvider";

// clickable-citations Phase 5 — mock PdfViewerWidget so the e2e test
// can assert what props the shell passes to it without standing up
// the full DocumentsProvider + api mock chain. The Phase 4 unit
// tests in PdfViewerWidget.test.tsx separately prove the widget
// itself responds to those props.
vi.mock("@/components/viewer-widgets/PdfViewer/PdfViewerWidget", () => ({
  PdfViewerWidget: (props: {
    scope: { type: string; documentIds?: string[] };
    role: string;
    targetPage?: number | null;
    highlightBbox?: { x: number; y: number; w: number; h: number } | null;
  }) => (
    <div
      data-testid="pdf-viewer-widget-stub"
      data-document-id={props.scope.type === "documents" ? props.scope.documentIds?.[0] ?? "" : ""}
      data-role={props.role}
      data-target-page={props.targetPage ?? ""}
      data-highlight-bbox={props.highlightBbox ? JSON.stringify(props.highlightBbox) : ""}
    />
  ),
}));

import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";

import { SteadyShell } from "./SteadyShell";

function Harness({ initialUrl, children }: { initialUrl: string; children: React.ReactNode }) {
  return withApiProvider(
    <GxThemeProvider>
      <AppModeProvider initialAuthState="signed-in">
        <ChatStoreProvider initialOwnerKey="anon-test" autoSeedDefaultSession>
          <CanvasOrchestratorProvider>
            <MemoryRouter initialEntries={[initialUrl]}>
              <Routes>
                <Route path={ROUTER_PATHS.STEADY_SESSION} element={children} />
              </Routes>
            </MemoryRouter>
          </CanvasOrchestratorProvider>
        </ChatStoreProvider>
      </AppModeProvider>
    </GxThemeProvider>,
  );
}

function Seeder({ onReady }: { onReady: (api: ReturnType<typeof useChatStore>) => void }) {
  const api = useChatStore();
  onReady(api);
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  window.localStorage.clear();
});

describe("SteadyShell (/c/:sessionId)", () => {
  it("renders the steady shell chrome with the sessionId from the URL", () => {
    render(
      <Harness initialUrl="/c/c-abc123">
        <SteadyShell />
      </Harness>,
    );
    expect(screen.getByTestId("steady-shell")).toBeInTheDocument();
    expect(screen.getByTestId("steady-shell-session-id")).toHaveTextContent("c-abc123");
  });

  // ARCH-07 (2026-05-26): SteadyShell mounts the canonical AppShell
  // (same component OnboardingShell uses), not a parallel custom
  // layout. This pins the unification — if someone refactors back to
  // a bespoke flex-row shell, the appshell-root testid disappears and
  // this test fails.
  it("ARCH-07: mounts the canonical AppShell, not a parallel custom layout", () => {
    render(
      <Harness initialUrl="/c/c-abc123">
        <SteadyShell />
      </Harness>,
    );
    const appShellRoot = screen.getByTestId("appshell-root");
    expect(appShellRoot).toBeInTheDocument();
    // data-shell-instance is the AppShell's stable id (per ARCH-06A).
    // Its mere presence proves we're rendering the canonical shell.
    expect(appShellRoot.getAttribute("data-shell-instance")).toBeTruthy();
    // The canvas placeholder is a child of AppShell's canvas slot.
    expect(screen.getByTestId("steady-shell-canvas-placeholder")).toBeInTheDocument();
  });

  it("switches ChatStore.activeSessionId to the URL session if it exists locally", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    let createdId = "";
    function SeedAndRender() {
      api = useChatStore();
      return null;
    }

    function Inner() {
      return (
        <>
          <SeedAndRender />
          <SteadyShell />
        </>
      );
    }
    // First mount a no-route Harness just to get an api handle for
    // seeding, then re-render with the URL pointed at the new session.
    const { rerender } = render(
      <Harness initialUrl="/c/placeholder">
        <Inner />
      </Harness>,
    );
    expect(api).not.toBeNull();
    act(() => {
      createdId = api!.newSession({ title: "Alpha" });
    });

    // Re-render at the URL for the just-created session. The
    // SteadyShell's useEffect calls switchTo(id) since the session
    // exists in the local store.
    rerender(
      <Harness initialUrl={`/c/${createdId}`}>
        <Inner />
      </Harness>,
    );
    expect(api!.state.activeSessionId).toBe(createdId);
    // Title from the seeded session shows in the shell heading.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  // ── clickable-citations Phase 5 — end-to-end: clicking a citation
  //    chip routes the viewer pane to the cited document with the
  //    correct page + highlight bbox surfaced. Closes the Rule 9
  //    round-trip on the full chip→orchestrator→ChatStore→shell→
  //    PdfViewerWidget chain.
  describe("clickable-citations: click chip → PdfViewerWidget surfaces document + page + highlight (Phase 5 e2e)", () => {
    function E2EHarness({ initialUrl, children }: { initialUrl: string; children: React.ReactNode }) {
      return withApiProvider(
        <GxThemeProvider>
          <AppModeProvider initialAuthState="signed-in">
            <ChatStoreProvider initialOwnerKey="anon-cite-e2e" autoSeedDefaultSession>
              <CanvasOrchestratorProvider>
                <MemoryRouter initialEntries={[initialUrl]}>
                  <Routes>
                    <Route path={ROUTER_PATHS.STEADY_SESSION} element={children} />
                  </Routes>
                </MemoryRouter>
              </CanvasOrchestratorProvider>
            </ChatStoreProvider>
          </AppModeProvider>
        </GxThemeProvider>,
      );
    }

    it("clicking a CiteChip mounts PdfViewerWidget in the canvas pane with the citation's documentId, page, and bbox", async () => {
      // Mount once. Inside the same router instance, seed a session
      // with `newSession`, then `useNavigate` to its `/c/{id}` URL.
      // The rerender-with-new-Harness pattern doesn't work here:
      // MemoryRouter's initialEntries only apply at mount, so a
      // remount would reset ChatStoreProvider too and lose the seed.
      let api: ReturnType<typeof useChatStore> | null = null;
      let createdId = "";
      let navigateFn: ReturnType<typeof useNavigate> | null = null;
      function SeedAndRender() {
        api = useChatStore();
        navigateFn = useNavigate();
        return null;
      }
      render(
        <E2EHarness initialUrl="/c/seed-placeholder">
          <SeedAndRender />
          <CiteChip
            citation={{
              documentId: "doc-citing",
              page: 4,
              snippet: "the total is $214.07",
              bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
            }}
            index={1}
          />
          <SteadyShell />
        </E2EHarness>,
      );
      expect(api).not.toBeNull();
      expect(navigateFn).not.toBeNull();
      // Seed the session AND navigate to it inside one act so the
      // router URL update + store mutation commit together.
      act(() => {
        createdId = api!.newSession({ title: "Citation e2e" });
        navigateFn!(`/c/${createdId}`);
      });

      // Pre-click: placeholder visible, no PdfViewer.
      await waitFor(() => {
        expect(screen.getByTestId("steady-shell-canvas-placeholder")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("pdf-viewer-widget-stub")).not.toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByTestId("cite-chip-1"));

      // After the click, PdfViewerWidget is mounted with the citation
      // documentId + page + bbox; placeholder gone.
      await waitFor(() => {
        expect(screen.getByTestId("pdf-viewer-widget-stub")).toBeInTheDocument();
      });
      const stub = screen.getByTestId("pdf-viewer-widget-stub");
      expect(stub.getAttribute("data-document-id")).toBe("doc-citing");
      expect(stub.getAttribute("data-target-page")).toBe("4");
      expect(stub.getAttribute("data-role")).toBe("member");
      const bbox = JSON.parse(stub.getAttribute("data-highlight-bbox") ?? "{}");
      expect(bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.05 });
      expect(screen.queryByTestId("steady-shell-canvas-placeholder")).not.toBeInTheDocument();

      // Phase 4 (2026-05-30-onboarding-shell-shared-view): the PdfViewer
      // is mounted THROUGH the shared <ScopedCanvas> selector (the same
      // component OnboardingShell mounts) — not a bespoke doc-viewer pane.
      // The registry-mounted widget sits inside the scoped-canvas wrapper,
      // which declares the resolved CanvasKind. This proves the canvas goes
      // through componentForKind (the production registry), not a direct
      // PdfViewerWidget import.
      const scopedCanvas = screen.getByTestId("scoped-canvas");
      expect(scopedCanvas).toHaveAttribute("data-canvas-kind", "doc-viewer");
      expect(scopedCanvas).toContainElement(stub);
    });
  });

  // ── Phase 4 (2026-05-30-onboarding-shell-shared-view): SteadyShell shares
  //    the SAME <ScopedCanvas> selector OnboardingShell uses. Both shells
  //    resolve the canvas widget THROUGH the production registry
  //    (componentForKind), not a direct viewer-widget import.
  describe("Phase 4: SteadyShell canvas is the shared <ScopedCanvas>", () => {
    it("doc-less steady shell shows ITS OWN pick-a-document placeholder (NOT ScopedCanvas's generic unavailable placeholder)", () => {
      render(
        <Harness initialUrl="/c/c-empty">
          <SteadyShell />
        </Harness>,
      );
      // Steady starts doc-less → the bespoke steady empty state, preserved.
      expect(screen.getByTestId("steady-shell-canvas-placeholder")).toBeInTheDocument();
      expect(screen.getByText("Pick a document to view")).toBeInTheDocument();
      // NOT the generic ScopedCanvas "not yet available" placeholder, and
      // no scoped-canvas wrapper at all when there's no active step.
      expect(screen.queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
      expect(screen.queryByTestId("scoped-canvas")).not.toBeInTheDocument();
    });

    it("an active doc-viewer step mounts <ScopedCanvas> (registry-mounted PdfViewer), not a directly-imported widget", async () => {
      // Seed + navigate inside ONE mount (the rerender-with-new-Harness
      // pattern would reset ChatStoreProvider and lose the seeded step) —
      // same pattern the RT-05 e2e above uses.
      let api: ReturnType<typeof useChatStore> | null = null;
      let createdId = "";
      let navigateFn: ReturnType<typeof useNavigate> | null = null;
      function SeedAndRender() {
        api = useChatStore();
        navigateFn = useNavigate();
        return null;
      }
      render(
        <Harness initialUrl="/c/seed-doc-viewer">
          <SeedAndRender />
          <SteadyShell />
        </Harness>,
      );
      expect(api).not.toBeNull();
      expect(navigateFn).not.toBeNull();
      act(() => {
        createdId = api!.newSession({ title: "Doc viewer" });
        navigateFn!(`/c/${createdId}`);
        // Push a doc-viewer step (the citation-click sink) so the canvas
        // has an active doc-viewer step to render.
        api!.gotoDocViewer({
          documentId: "doc-active",
          page: 2,
          bbox: { x: 0.2, y: 0.3, w: 0.4, h: 0.06 },
        });
      });

      // The canvas resolves THROUGH <ScopedCanvas> → the registry-mounted
      // PdfViewer. The scoped-canvas wrapper declares the doc-viewer kind;
      // the steady bespoke doc-viewer pane testid is gone.
      await waitFor(() => {
        expect(screen.getByTestId("scoped-canvas")).toHaveAttribute("data-canvas-kind", "doc-viewer");
      });
      expect(screen.getByTestId("pdf-viewer-widget-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("steady-shell-canvas-doc-viewer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("steady-shell-canvas-placeholder")).not.toBeInTheDocument();
      // The scope + highlight reach the registry-mounted widget intact.
      const stub = screen.getByTestId("pdf-viewer-widget-stub");
      expect(stub.getAttribute("data-document-id")).toBe("doc-active");
      expect(stub.getAttribute("data-target-page")).toBe("2");
    });
  });

  it("surfaces an unknown-session hint when the URL points at a session not in the store", () => {
    render(
      <Harness initialUrl="/c/c-not-in-store">
        <SteadyShell />
      </Harness>,
    );
    expect(screen.getByTestId("steady-shell-unknown-session")).toBeInTheDocument();
  });
});
