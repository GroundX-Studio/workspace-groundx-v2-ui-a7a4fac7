/**
 * 2026-05-31-onboarding-experiences — the Workspace / Project scoped
 * conversation surfaces. Each mounts the SHARED `ConversationFlow` composed
 * with the looked-up `ChatExperience` (NO new flow component, NO flow `mode`),
 * against a per-scope chat session.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the conversation engine off the network on mount (mirrors the
// SteadyShell/ChatColumn test pattern).
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    listChatMessages: vi.fn(async () => []),
    sendChatMessage: vi.fn(),
    ensureServerChatSession: vi.fn(async () => undefined),
  };
});

import { AppModeProvider } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import { GxThemeProvider } from "@/ThemeProvider";

import { WorkspacesView, ProjectsView } from "./ScopedConversationShell";

// A resolved (UUID) GroundX document id — the seeded utility sample.
const SAMPLE_DOC_ID = "c3bfff49-6640-4213-822b-e81c3a771e45";

function Harness({ children }: { children: React.ReactNode }) {
  // DocumentsProvider (+ Loading/MessageBar deps) is required so the shared
  // production PdfViewerWidget can mount via <ScopedCanvas> — mirrors
  // renderWithOnboardingProviders, which is how the onboarding shell test
  // exercises the same viewer mount path.
  return (
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AppModeProvider initialAuthState="signed-in">
            <ScenarioRegistryProvider
              initialScenarios={[
                { id: "utility", manifest: { hero: { title: "Utility" } }, documents: [] } as never,
              ]}
            >
              <DocumentsProvider>
                <ChatStoreProvider initialOwnerKey="anon-test">
                  <CanvasOrchestratorProvider>
                    <MemoryRouter>{children}</MemoryRouter>
                  </CanvasOrchestratorProvider>
                </ChatStoreProvider>
              </DocumentsProvider>
            </ScenarioRegistryProvider>
          </AppModeProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("WorkspacesView (/workspaces)", () => {
  it("mounts the shared ConversationFlow composed with the WORKSPACE experience", () => {
    render(
      <Harness>
        <WorkspacesView />
      </Harness>,
    );
    // The single ConversationFlow (no new flow component).
    expect(screen.getByTestId("conversation-flow")).toBeInTheDocument();
    // The workspace experience's Intro is what proves composition with the
    // looked-up `workspace` ChatExperience.
    expect(screen.getByTestId("scoped-chat-intro-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("scoped-shell")).toHaveAttribute("data-experience", "workspace");
  });

  it("ensure-creates a per-scope chat session and makes it active", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    function Probe() {
      api = useChatStore();
      return null;
    }
    render(
      <Harness>
        <Probe />
        <WorkspacesView />
      </Harness>,
    );
    expect(api!.state.activeSessionId).toBeTruthy();
    const active = api!.state.sessions.get(api!.state.activeSessionId!);
    expect(active?.scopeKey).toContain("bucket");
  });
});

describe("steady canvas mounts viewer widgets via ScopedCanvas (DL-5, P1)", () => {
  it("a doc-viewer viewer step mounts the production PdfViewer in the steady canvas pane", async () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    function Probe() {
      api = useChatStore();
      return null;
    }
    render(
      <Harness>
        <Probe />
        <WorkspacesView />
      </Harness>,
    );
    // The shell ensure-creates the per-scope chat session on mount.
    await waitFor(() => expect(api!.state.activeSessionId).toBeTruthy());
    // Simulate what a CiteChip / "Show source" dispatch lands in the store:
    // a doc-viewer ViewerStep on the active session.
    act(() => {
      api!.pushStep({ kind: "doc-viewer", documentId: SAMPLE_DOC_ID });
    });
    // The steady canvas pane MUST mount the shared PdfViewerWidget (via
    // ScopedCanvas) — not stay an empty stub Box.
    const pane = screen.getByTestId("scoped-shell-canvas-pane");
    expect(await within(pane).findByTestId("pdf-viewer-widget")).toBeInTheDocument();
  });
});

describe("ProjectsView (/projects)", () => {
  it("mounts the shared ConversationFlow composed with the PROJECT experience", () => {
    render(
      <Harness>
        <ProjectsView />
      </Harness>,
    );
    expect(screen.getByTestId("conversation-flow")).toBeInTheDocument();
    expect(screen.getByTestId("scoped-chat-intro-project")).toBeInTheDocument();
    expect(screen.getByTestId("scoped-shell")).toHaveAttribute("data-experience", "project");
  });

  it("the project surface's scope carries the project filter (distinct session from workspace)", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    function Probe() {
      api = useChatStore();
      return null;
    }
    render(
      <Harness>
        <Probe />
        <ProjectsView />
      </Harness>,
    );
    const active = api!.state.sessions.get(api!.state.activeSessionId!);
    // The project filter is part of the scope key.
    expect(active?.scopeKey).toContain("project");
  });
});
