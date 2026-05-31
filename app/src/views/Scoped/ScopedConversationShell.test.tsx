/**
 * 2026-05-31-onboarding-experiences — the Workspace / Project scoped
 * conversation surfaces. Each mounts the SHARED `ConversationFlow` composed
 * with the looked-up `ChatExperience` (NO new flow component, NO flow `mode`),
 * against a per-scope chat session.
 */
import { render, screen } from "@testing-library/react";
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
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import { GxThemeProvider } from "@/ThemeProvider";

import { WorkspacesView, ProjectsView } from "./ScopedConversationShell";

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <GxThemeProvider>
      <AppModeProvider initialAuthState="signed-in">
        <ScenarioRegistryProvider
          initialScenarios={[
            { id: "utility", manifest: { hero: { title: "Utility" } }, documents: [] } as never,
          ]}
        >
          <ChatStoreProvider initialOwnerKey="anon-test">
            <CanvasOrchestratorProvider>
              <MemoryRouter>{children}</MemoryRouter>
            </CanvasOrchestratorProvider>
          </ChatStoreProvider>
        </ScenarioRegistryProvider>
      </AppModeProvider>
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
