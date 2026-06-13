/**
 * 2026-05-31-onboarding-experiences — the Workspace / Project scoped
 * conversation surfaces. Each mounts the SHARED `ConversationFlow` composed
 * with the looked-up `ChatExperience` (NO new flow component, NO flow `mode`),
 * against a per-scope chat session.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModeProvider } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import {
  ChatStoreProvider,
  EMPTY_PENDING_REPORT_OVERLAY,
  EMPTY_PENDING_SCHEMA_OVERLAY,
  EMPTY_VIEWER_SESSION,
  useChatStore,
  type ChatSession,
} from "@/contexts/ChatStoreContext";
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
  initialSessions,
  initialActiveSessionId,
}: {
  children: React.ReactNode;
  api?: ApiOverrides;
  forcedDemoState?: ScenarioRegistryState | null;
  initialScenarios?: ScenarioConfig[] | null;
  initialSessions?: ReadonlyMap<string, ChatSession>;
  initialActiveSessionId?: string | null;
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
                <ChatStoreProvider
                  initialOwnerKey="anon-test"
                  initialSessions={initialSessions}
                  initialActiveSessionId={initialActiveSessionId}
                >
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

function makeSeedSession(
  id: string,
  input: { title: string; isOnboardingSession: boolean; scopeKey?: string },
): ChatSession {
  const now = Date.now();
  return {
    id,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    summaries: [],
    entities: new Map(),
    activeEntityKey: null,
    viewerHistory: [],
    currentIntent: null,
    pendingSchemaOverlay: EMPTY_PENDING_SCHEMA_OVERLAY,
    reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
    viewer: EMPTY_VIEWER_SESSION,
    gate: { status: "idle" },
    signupOpen: false,
    isOnboardingSession: input.isOnboardingSession,
    ...(input.scopeKey ? { scopeKey: input.scopeKey } : {}),
  };
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
  it("uses product navigation semantics on authenticated product routes", () => {
    render(
      <Harness>
        <WorkspacesView />
      </Harness>,
    );

    expect(screen.getByLabelText("Product navigation")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to product home")).toBeInTheDocument();
    expect(screen.queryByLabelText("Onboarding navigation")).not.toBeInTheDocument();
  });

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

  it("keeps product chat and viewer actions on the resolved scoped session when an onboarding session already exists", async () => {
    const user = userEvent.setup();
    const sendChatMessage = vi.fn().mockResolvedValue({
      userMessageId: "user-message-1",
      assistantMessageId: "assistant-message-1",
      compressionRan: false,
      reply: {
        mode: "hybrid",
        answer: "I opened Extract in the viewer.",
        citations: [],
        suggestedActions: [],
        intents: [
          { name: "show_extraction", arguments: {}, intent: { kind: "showExtract" } },
        ],
        toolFailures: [],
        toolActivity: [],
        proposedSchemaField: null,
      },
    });
    const onboardingId = "c-onboarding-existing";
    const initialSessions = new Map<string, ChatSession>([
      [
        onboardingId,
        makeSeedSession(onboardingId, {
          title: "Onboarding",
          isOnboardingSession: true,
        }),
      ],
    ]);
    let api: ReturnType<typeof useChatStore> | null = null;
    function Probe() {
      api = useChatStore();
      return null;
    }

    render(
      <Harness
        api={{ chat: { sendChatMessage } }}
        initialSessions={initialSessions}
        initialActiveSessionId={onboardingId}
      >
        <Probe />
        <WorkspacesView />
      </Harness>,
    );

    await waitFor(() => {
      expect(api!.state.activeSessionId).toBeTruthy();
      expect(api!.state.activeSessionId).not.toBe(onboardingId);
    });
    const scopedSessionId = api!.state.activeSessionId!;
    expect(api!.state.sessions.get(scopedSessionId)?.isOnboardingSession).toBe(false);

    await user.click(screen.getByTestId("scoped-chat-pick-view-workspace-extract"));

    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
    expect(sendChatMessage.mock.calls[0][0]).toMatchObject({
      chatSessionId: scopedSessionId,
      sessionMeta: { isOnboarding: false, title: "Workspace" },
    });
    await waitFor(() => {
      const scoped = api!.state.sessions.get(scopedSessionId);
      expect(scoped?.viewer.history.at(-1)?.kind).toBe("extract-workbench");
    });
    expect(api!.state.sessions.get(onboardingId)?.viewer.history).toHaveLength(0);
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
    expect(within(pane).getByTestId("scoped-canvas")).toHaveAttribute("data-canvas-kind", "doc-viewer");
    const frame = within(pane).getByTestId("viewer-widget-frame");
    expect(frame).toHaveAttribute("data-viewer-frame-active", "true");
    expect(frame).toHaveAttribute("data-viewer-widget-id", "pdf-viewer");
    expect(frame).toHaveAttribute("data-viewer-content-mode", "edge-to-edge");
    expect(within(pane).queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
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

  it("an active viewer step mounts project-scoped content through the shared frame", async () => {
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
    act(() => {
      api!.pushStep({ kind: "integrate" });
    });

    const pane = screen.getByTestId("scoped-shell-canvas-pane");
    expect(await within(pane).findByTestId("integrate")).toBeInTheDocument();
    expect(within(pane).getByTestId("scoped-canvas")).toHaveAttribute("data-canvas-kind", "integrate");
    const frame = within(pane).getByTestId("viewer-widget-frame");
    expect(frame).toHaveAttribute("data-viewer-frame-active", "true");
    expect(frame).toHaveAttribute("data-viewer-widget-id", "integrate");
    expect(frame).toHaveAttribute("data-viewer-content-mode", "padded-scroll");
    expect(within(pane).queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
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
