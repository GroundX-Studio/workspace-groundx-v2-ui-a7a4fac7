import { act, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/contexts/AuthContext/AuthContext";
import { makeApiWrapper } from "@/test/withApiProvider";

import { ChatStoreProvider, useChatStore } from "./ChatStoreContext";
import { EMPTY_PENDING_REPORT_OVERLAY } from "./types";
import { ChatStoreServerHydrator } from "./ChatStoreServerHydrator";

import type { FC, ReactNode } from "react";

const listChatSessions = vi.fn();
const captureException = vi.fn();

const renderWithHydratorApi = (ui: ReactElement) =>
  render(ui, {
    wrapper: makeApiWrapper({
      chat: { listChatSessions },
      telemetry: { captureException },
    }),
  });

interface AuthShape {
  isLoggedIn: boolean;
}

function StubAuthProvider({ auth, children }: { auth: AuthShape; children: ReactNode }): JSX.Element {
  return (
    <AuthContext.Provider
      value={
        {
          auth: { isLoggedIn: auth.isLoggedIn, userName: "u", token: "t", xJwtToken: "x" },
          // The rest of AuthContextI we don't exercise — cast to any
          // so the type check stays narrow but the runtime is happy.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      }
    >
      {children}
    </AuthContext.Provider>
  );
}

const StoreProbe: FC<{ onSessions: (count: number) => void }> = ({ onSessions }) => {
  const store = useChatStore();
  onSessions(store.state.sessions.size);
  return null;
};

beforeEach(() => {
  listChatSessions.mockReset();
  captureException.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatStoreServerHydrator (RT-05)", () => {
  it("no-op when AuthProvider is not in the tree (test scaffolding stays untouched)", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({ id: "s1", title: "Server-only" }),
    ]);
    renderWithHydratorApi(
      <ChatStoreProvider ephemeral>
        <ChatStoreServerHydrator />
      </ChatStoreProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(listChatSessions).not.toHaveBeenCalled();
  });

  it("no-op when auth.isLoggedIn is false (anon visitor — no remote list)", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({ id: "s1", title: "Server-only" }),
    ]);
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: false }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(listChatSessions).not.toHaveBeenCalled();
  });

  it("hydrates server sessions into ChatStore when auth.isLoggedIn is true", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({ id: "remote-1", title: "Remote 1" }),
      makeRemoteSession({ id: "remote-2", title: "Remote 2" }),
    ]);
    let observedCount = 0;
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <StoreProbe onSessions={(n) => (observedCount = n)} />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(listChatSessions).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(observedCount).toBe(2);
    });
  });

  it("merges with local cache — server wins on title; client-only fields preserved", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({ id: "shared-1", title: "Server-authoritative title" }),
    ]);
    const initialSessions = new Map([
      [
        "shared-1",
        {
          id: "shared-1",
          title: "Stale local title",
          createdAt: 0,
          updatedAt: 0,
          messages: [{ id: "m1", role: "user" as const, content: "kept", timestamp: 0 }],
          summaries: [],
          entities: new Map(),
          activeEntityKey: null,
          viewerHistory: [],
          currentIntent: null,
          pendingSchemaOverlay: {
            addedFields: [],
            removedFieldIds: new Set<string>(),
            editedFields: new Map(),
            pendingFieldProposals: [],
            pinnedSamples: [],
            focusedCategoryId: null,
          },
          reportOverlay: EMPTY_PENDING_REPORT_OVERLAY,
          viewer: {
            history: [],
            currentStep: { stepIndex: -1 },
            overlays: [],
            workspace: {
              schemaOverlay: {
                addedFields: [],
                removedFieldIds: new Set<string>(),
                editedFields: new Map(),
                pendingFieldProposals: [],
                pinnedSamples: [],
                focusedCategoryId: null,
              },
            },
          },
          gate: { status: "idle" as const },
          signupOpen: false,
          isOnboardingSession: false,
        },
      ],
    ]);
    let observedTitle = "";
    let observedMessageCount = -1;
    const Inspector: FC = () => {
      const store = useChatStore();
      const s = store.state.sessions.get("shared-1");
      observedTitle = s?.title ?? "";
      observedMessageCount = s?.messages.length ?? -1;
      return null;
    };
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider initialSessions={initialSessions} initialActiveSessionId="shared-1">
          <ChatStoreServerHydrator />
          <Inspector />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(observedTitle).toBe("Server-authoritative title");
    });
    // Client-only field (messages) survives the merge.
    expect(observedMessageCount).toBe(1);
  });

  it("non-2xx error is non-fatal — captures to Sentry, store state unchanged", async () => {
    listChatSessions.mockRejectedValueOnce(new Error("network down"));
    let observedCount = -1;
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <StoreProbe onSessions={(n) => (observedCount = n)} />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(captureException).toHaveBeenCalledTimes(1);
    });
    expect(observedCount).toBe(0);
  });

  // ── B1 "One CanvasIntent" — currentIntent hydration boundary ──
  // The DB column is arbitrary JSON; `coerceHydratedIntent` is the structural
  // guard so the strict `currentIntent: CanvasIntent | null` state type isn't
  // populated straight from an unchecked cast.
  it("hydrates a well-formed server currentIntent into the session", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({
        id: "ci-1",
        title: "Has intent",
        currentIntent: { kind: "openDocument", documentId: "d-1", page: 2 },
      }),
    ]);
    let observed: unknown = "unset";
    const Inspector: FC = () => {
      observed = useChatStore().state.sessions.get("ci-1")?.currentIntent ?? "missing";
      return null;
    };
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <Inspector />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(observed).toEqual({ kind: "openDocument", documentId: "d-1", page: 2 });
    });
  });

  it("coerces a malformed server currentIntent (no string `kind`) to null", async () => {
    listChatSessions.mockResolvedValue([
      // `{}` has no `kind` — must NOT masquerade as a typed intent.
      makeRemoteSession({ id: "ci-2", title: "Garbage intent", currentIntent: {} }),
    ]);
    let observed: unknown = "unset";
    const Inspector: FC = () => {
      const s = useChatStore().state.sessions.get("ci-2");
      observed = s ? s.currentIntent : "missing";
      return null;
    };
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <Inspector />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(observed).toBeNull();
    });
  });

  it("coerces a STRUCTURALLY-corrupt server currentIntent (real `kind`, missing required field) to null", async () => {
    // `2026-05-31-canvas-intent-schema-shared` §3 — the OLD structural guard
    // accepts this (non-empty string `kind`) and blind-casts it; the shared
    // `parseCanvasIntent` schema rejects it (`openDocument` requires
    // `documentId`) so a corrupt/legacy row coerces to `null` instead of
    // masquerading as a typed intent flowing into the orchestrator.
    listChatSessions.mockResolvedValue([
      makeRemoteSession({
        id: "ci-3",
        title: "Looks-real-but-corrupt intent",
        currentIntent: { kind: "openDocument" },
      }),
    ]);
    let observed: unknown = "unset";
    const Inspector: FC = () => {
      const s = useChatStore().state.sessions.get("ci-3");
      observed = s ? s.currentIntent : "missing";
      return null;
    };
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <Inspector />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(observed).toBeNull();
    });
  });

  // ── 2026-05-31-viewer-history-column-drop — viewer state is client-only ──
  // The Phase-1 viewer_* columns were dropped (write-NULL-only dead plumbing),
  // so the server carries no viewer slots. A server-only session hydrates to
  // the EMPTY viewer session — same result the always-null hydrate produced
  // before the drop. (The former "hydrates ViewerSession.history + overlays +
  // workspace from the server payload" round-trip test was removed: it asserted
  // a persistence capability that no longer exists.)
  it("server-only session hydrates to an empty client-only ViewerSession", async () => {
    listChatSessions.mockResolvedValue([
      makeRemoteSession({ id: "vs-1", title: "Viewer-state" }),
    ]);
    let observedViewer: { history: unknown[]; overlays: unknown[] } | null = null;
    const ViewerProbe: FC = () => {
      const { state } = useChatStore();
      const s = state.sessions.get("vs-1");
      if (s) {
        observedViewer = { history: s.viewer.history, overlays: s.viewer.overlays };
      }
      return null;
    };
    renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
          <ViewerProbe />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(observedViewer).not.toBeNull();
      expect(observedViewer!.history).toEqual([]);
      expect(observedViewer!.overlays).toEqual([]);
    });
  });

  it("only hydrates once per false→true transition (StrictMode-safe)", async () => {
    listChatSessions.mockResolvedValue([]);
    const { rerender } = renderWithHydratorApi(
      <StubAuthProvider auth={{ isLoggedIn: true }}>
        <ChatStoreProvider ephemeral>
          <ChatStoreServerHydrator />
        </ChatStoreProvider>
      </StubAuthProvider>,
    );
    await waitFor(() => {
      expect(listChatSessions).toHaveBeenCalledTimes(1);
    });
    // Rerender with the same auth value — should NOT re-fetch.
    await act(async () => {
      rerender(
        <StubAuthProvider auth={{ isLoggedIn: true }}>
          <ChatStoreProvider ephemeral>
            <ChatStoreServerHydrator />
          </ChatStoreProvider>
        </StubAuthProvider>,
      );
    });
    expect(listChatSessions).toHaveBeenCalledTimes(1);
  });
});

function makeRemoteSession(overrides: {
  id: string;
  title: string;
  currentIntent?: Record<string, unknown> | null;
}) {
  return {
    id: overrides.id,
    onboardingSessionId: overrides.id,
    title: overrides.title,
    isOnboarding: false,
    activeEntityKey: null,
    currentIntent: overrides.currentIntent ?? null,
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    archivedAt: null,
  };
}
