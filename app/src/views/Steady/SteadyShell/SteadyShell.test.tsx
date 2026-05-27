import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { GxThemeProvider } from "@/ThemeProvider";

// clickable-citations Phase 5 — mock PdfViewerWidget so the e2e test
// can assert what props the shell passes to it without standing up
// the full DocumentsProvider + api mock chain. The Phase 4 unit
// tests in PdfViewerWidget.test.tsx separately prove the widget
// itself responds to those props.
vi.mock("@/components/viewer-widgets/PdfViewer/PdfViewerWidget", () => ({
  PdfViewerWidget: (props: {
    documentId: string;
    mode: string;
    targetPage?: number | null;
    highlightBbox?: { x: number; y: number; w: number; h: number } | null;
  }) => (
    <div
      data-testid="pdf-viewer-widget-stub"
      data-document-id={props.documentId}
      data-mode={props.mode}
      data-target-page={props.targetPage ?? ""}
      data-highlight-bbox={props.highlightBbox ? JSON.stringify(props.highlightBbox) : ""}
    />
  ),
}));

// Also mock listChatMessages / sendChatMessage so ChatColumn doesn't
// reach out to fetch on mount — same pattern the other ChatColumn
// tests use.
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    listChatMessages: vi.fn(async () => []),
    sendChatMessage: vi.fn(),
    ensureServerChatSession: vi.fn(async () => undefined),
  };
});

import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";

import { SteadyShell } from "./SteadyShell";

function Harness({ initialUrl, children }: { initialUrl: string; children: React.ReactNode }) {
  return (
    <GxThemeProvider>
      <ChatStoreProvider initialOwnerKey="anon-test" autoSeedDefaultSession>
        <MemoryRouter initialEntries={[initialUrl]}>
          <Routes>
            <Route path={ROUTER_PATHS.STEADY_SESSION} element={children} />
          </Routes>
        </MemoryRouter>
      </ChatStoreProvider>
    </GxThemeProvider>
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
      return (
        <GxThemeProvider>
          <ChatStoreProvider initialOwnerKey="anon-cite-e2e" autoSeedDefaultSession>
            <CanvasOrchestratorProvider>
              <MemoryRouter initialEntries={[initialUrl]}>
                <Routes>
                  <Route path={ROUTER_PATHS.STEADY_SESSION} element={children} />
                </Routes>
              </MemoryRouter>
            </CanvasOrchestratorProvider>
          </ChatStoreProvider>
        </GxThemeProvider>
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
      expect(stub.getAttribute("data-mode")).toBe("steady");
      const bbox = JSON.parse(stub.getAttribute("data-highlight-bbox") ?? "{}");
      expect(bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.05 });
      expect(screen.queryByTestId("steady-shell-canvas-placeholder")).not.toBeInTheDocument();
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
