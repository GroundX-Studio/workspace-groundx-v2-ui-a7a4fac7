/**
 * 2026-05-31-onboarding-experiences — the Workspace / Project scoped
 * conversation surfaces. Each mounts the SHARED `ConversationFlow` composed
 * with the looked-up `ChatExperience` (NO new flow component, NO flow `mode`),
 * against a per-scope chat session.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModeProvider } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import type { ScenarioRegistryState } from "@/contexts/ScenarioRegistryContext/types";
import { GxThemeProvider } from "@/ThemeProvider";
import type { ApiOverrides } from "@/test/makeFakeApi";
import { utilityTestScenario } from "@/test/scenarioFixtures";
import { withApiProvider } from "@/test/withApiProvider";
import type { ScenarioConfig } from "@/types/scenarios";

import { WorkspacesView, ProjectsView } from "./ScopedConversationShell";

// A resolved (UUID) GroundX document id — the seeded utility sample.
const SAMPLE_DOC_ID = "c3bfff49-6640-4213-822b-e81c3a771e45";

const utilityScenario = utilityTestScenario;

function Harness({
  children,
  api,
  forcedDemoState,
  initialScenarios,
}: {
  children: React.ReactNode;
  api?: ApiOverrides;
  forcedDemoState?: ScenarioRegistryState | null;
  initialScenarios?: ScenarioConfig[] | null;
}) {
  const resolvedInitialScenarios = initialScenarios === null
    ? undefined
    : initialScenarios ?? [utilityScenario];

  // DocumentsProvider (+ Loading/MessageBar deps) is required so the shared
  // production PdfViewerWidget can mount via <ScopedCanvas> — mirrors
  // renderWithOnboardingProviders, which is how the onboarding shell test
  // exercises the same viewer mount path.
  return withApiProvider(
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AppModeProvider initialAuthState="signed-in">
            <ScenarioRegistryProvider
              initialScenarios={resolvedInitialScenarios}
              forcedDemoState={forcedDemoState}
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
    </GxThemeProvider>,
    api,
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

  it("builds the project scope with filter.projectId from the ready scenario", async () => {
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
    await waitFor(() => expect(api!.state.activeSessionId).toBeTruthy());
    const active = api!.state.sessions.get(api!.state.activeSessionId!);
    expect(active?.scopeKey).toContain("\"projectId\":\"proj_utility\"");
    expect(active?.scopeKey).not.toContain("\"project\":\"utility\"");
  });

  it("does not create a slug-fallback project session before the registry is ready", async () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    function Probe() {
      api = useChatStore();
      return null;
    }
    const listScenarios = vi.fn(async () => ({
      bucketId: 28454,
      scenarios: [utilityScenario],
    }));
    render(
      <Harness api={{ scenario: { listScenarios } }} initialScenarios={null}>
        <Probe />
        <ProjectsView />
      </Harness>,
    );

    expect(screen.getByTestId("scoped-project-loading")).toBeInTheDocument();
    expect(api!.state.activeSessionId).toBeNull();
    const preReadyScopeKeys = [...api!.state.sessions.values()].map((session) => session.scopeKey ?? "");
    expect(preReadyScopeKeys.some((key) => key.includes("\"projectId\":\"utility\""))).toBe(false);
    expect(preReadyScopeKeys.some((key) => key.includes("\"project\":\"utility\""))).toBe(false);

    await waitFor(() => expect(screen.getByTestId("conversation-flow")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("scoped-chat-intro-project")).toBeInTheDocument());
    const projectSessions = [...api!.state.sessions.values()].filter((session) =>
      session.scopeKey?.includes("\"projectId\":\"proj_utility\""),
    );
    expect(projectSessions).toHaveLength(1);
  });
});
