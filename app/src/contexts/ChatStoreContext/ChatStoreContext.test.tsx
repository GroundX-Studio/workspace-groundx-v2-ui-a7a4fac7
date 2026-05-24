import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatStoreProvider, useChatStore } from "./ChatStoreContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ChatStoreProvider>{children}</ChatStoreProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("ChatStoreContext", () => {
  it("starts with no sessions and no active session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    expect(result.current.state.sessions.size).toBe(0);
    expect(result.current.state.activeSessionId).toBeNull();
  });

  it("newSession() creates a session with empty messages + empty entities and activates it", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let createdId: string | null = null;
    act(() => {
      createdId = result.current.newSession();
    });
    expect(createdId).toBeTruthy();
    const session = result.current.state.sessions.get(createdId!);
    expect(session).toBeDefined();
    expect(session!.messages).toEqual([]);
    expect(session!.entities.size).toBe(0);
    expect(session!.activeEntityKey).toBeNull();
    expect(result.current.state.activeSessionId).toBe(createdId);
  });

  it("appendMessage() pushes to the active session and bumps updatedAt", async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    const before = result.current.state.sessions.get(result.current.state.activeSessionId!)!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    act(() => {
      result.current.appendMessage({ role: "user", content: "hello" });
    });
    const after = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0].role).toBe("user");
    expect(after.messages[0].content).toBe("hello");
    expect(after.updatedAt).toBeGreaterThan(before);
  });

  it("two sessions hold independent message state", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let idA = "";
    let idB = "";
    act(() => {
      idA = result.current.newSession();
      result.current.appendMessage({ role: "user", content: "in A" });
      idB = result.current.newSession();
      result.current.appendMessage({ role: "user", content: "in B" });
    });
    const sessionA = result.current.state.sessions.get(idA)!;
    const sessionB = result.current.state.sessions.get(idB)!;
    expect(sessionA.messages.map((m) => m.content)).toEqual(["in A"]);
    expect(sessionB.messages.map((m) => m.content)).toEqual(["in B"]);
    // Most recent newSession is the active one.
    expect(result.current.state.activeSessionId).toBe(idB);
  });

  it("switchTo() swaps which session is active without mutating either", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let idA = "";
    let idB = "";
    act(() => {
      idA = result.current.newSession();
      result.current.appendMessage({ role: "user", content: "in A" });
      idB = result.current.newSession();
    });
    act(() => {
      result.current.switchTo(idA);
    });
    expect(result.current.state.activeSessionId).toBe(idA);
    // Switching does NOT clear B's state.
    const sessionB = result.current.state.sessions.get(idB)!;
    expect(sessionB).toBeDefined();
  });

  it("appendMessage is a no-op when no session is active", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.appendMessage({ role: "user", content: "lost" });
    });
    expect(result.current.state.sessions.size).toBe(0);
  });

  // Phase B — entity actions live on ChatStore. EntityRegistry's
  // legacy API stays available via a derived hook; the storage is
  // here.
  it("upsertEntityAndActivate adds an entity to the active session and activates it", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.upsertEntityAndActivate("sample", "utility", {
        lastFrame: "f3",
        completedFrames: new Set(["f1", "f2"]),
      });
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.entities.size).toBe(1);
    expect(session.activeEntityKey).toBe("sample:utility");
    const entity = session.entities.get("sample:utility" as never)!;
    expect(entity.lastFrame).toBe("f3");
  });

  it("activateEntity flips the active key on the active session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastFrame: "f2" });
      result.current.upsertEntityAndActivate("sample", "loan", { lastFrame: "f2" });
    });
    expect(
      result.current.state.sessions.get(result.current.state.activeSessionId!)!.activeEntityKey,
    ).toBe("sample:loan");
    act(() => {
      result.current.activateEntity(null);
    });
    expect(
      result.current.state.sessions.get(result.current.state.activeSessionId!)!.activeEntityKey,
    ).toBeNull();
  });

  it("updateActiveEntity mutates the active entity inside the active session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastFrame: "f2" });
    });
    act(() => {
      result.current.updateActiveEntity((entity) => ({ ...entity, lastFrame: "f5" }));
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    const entity = session.entities.get("sample:utility" as never)!;
    expect(entity.lastFrame).toBe("f5");
  });

  // -----------------------------------------------------------------
  // Phase E — ViewerEvent recording
  // -----------------------------------------------------------------

  describe("ViewerEvent recording (Phase E)", () => {
    it("appendViewerEvent pushes an entry onto the active session's viewerHistory", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      act(() => {
        result.current.newSession();
      });
      act(() => {
        result.current.appendViewerEvent({
          action: "opened",
          entityKey: "sample:utility" as never,
          source: "user",
        });
      });
      const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(session.viewerHistory).toHaveLength(1);
      expect(session.viewerHistory[0].action).toBe("opened");
      expect(session.viewerHistory[0].entityKey).toBe("sample:utility");
      expect(session.viewerHistory[0].source).toBe("user");
      expect(typeof session.viewerHistory[0].id).toBe("string");
      expect(typeof session.viewerHistory[0].timestamp).toBe("number");
    });

    it("appendViewerEvent is a no-op when no session is active", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      act(() => {
        result.current.appendViewerEvent({ action: "opened", entityKey: null, source: "user" });
      });
      expect(result.current.state.sessions.size).toBe(0);
    });

    it("viewerHistory is independent per session", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let idA = "";
      let idB = "";
      act(() => {
        idA = result.current.newSession();
        result.current.appendViewerEvent({ action: "opened", entityKey: null, source: "user" });
        idB = result.current.newSession();
        result.current.appendViewerEvent({ action: "frame-advanced", entityKey: null, source: "user" });
        result.current.appendViewerEvent({ action: "left", entityKey: null, source: "user" });
      });
      const sessA = result.current.state.sessions.get(idA)!;
      const sessB = result.current.state.sessions.get(idB)!;
      expect(sessA.viewerHistory.map((e) => e.action)).toEqual(["opened"]);
      expect(sessB.viewerHistory.map((e) => e.action)).toEqual(["frame-advanced", "left"]);
    });
  });

  // -----------------------------------------------------------------
  // Phase D — onboarding bootstrap
  // -----------------------------------------------------------------

  describe("onboarding bootstrap (Phase D)", () => {
    it("autoSeedDefaultSession creates exactly one session flagged isOnboardingSession=true", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        <ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });
      expect(result.current.state.sessions.size).toBe(1);
      const active = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(active.isOnboardingSession).toBe(true);
      expect(active.title).toBe("Onboarding");
    });

    it("autoSeedDefaultSession does NOT add a session when one is already persisted", () => {
      // Pre-seed localStorage with a ChatStore snapshot containing one
      // existing onboarding session at sample:utility/f3. The provider
      // should rehydrate it instead of auto-seeding a fresh one.
      const persistedSessionId = "c-existing-onboarding";
      const snapshot = {
        version: 1,
        ownerKey: "anon-test",
        activeSessionId: persistedSessionId,
        sessions: [
          {
            id: persistedSessionId,
            title: "Onboarding",
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
            entities: [
              [
                "sample:utility",
                {
                  kind: "sample",
                  id: "utility",
                  lastFrame: "f3",
                  completedFrames: ["f1", "f2"],
                  createdAt: 1000,
                  lastVisitedAt: 1500,
                },
              ],
            ],
            activeEntityKey: "sample:utility",
            isOnboardingSession: true,
            signupOpen: false,
          },
        ],
      };
      window.localStorage.setItem("groundx-onboarding.chat-store.v1", JSON.stringify(snapshot));

      const wrap = ({ children }: { children: React.ReactNode }) => (
        <ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      // Should have ONE session (the pre-existing one), not two.
      expect(result.current.state.sessions.size).toBe(1);
      expect(result.current.state.activeSessionId).toBe(persistedSessionId);
      const active = result.current.state.sessions.get(persistedSessionId)!;
      expect(active.activeEntityKey).toBe("sample:utility");
      expect(active.entities.get("sample:utility" as never)?.lastFrame).toBe("f3");
    });

    it("migrates the legacy entity-registry.v1 payload into a new onboarding session", () => {
      window.localStorage.setItem(
        "groundx-onboarding.entity-registry.v1",
        JSON.stringify({
          version: 1,
          activeKey: "sample:loan",
          entities: [
            [
              "sample:loan",
              {
                kind: "sample",
                id: "loan",
                lastFrame: "f4",
                completedFrames: ["f1", "f2", "f3"],
                createdAt: 1000,
                lastVisitedAt: 2000,
              },
            ],
          ],
        }),
      );

      const wrap = ({ children }: { children: React.ReactNode }) => (
        <ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      expect(result.current.state.sessions.size).toBe(1);
      const active = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(active.isOnboardingSession).toBe(true);
      expect(active.activeEntityKey).toBe("sample:loan");
      expect(active.entities.get("sample:loan" as never)?.lastFrame).toBe("f4");
      // Legacy key is removed post-migration.
      expect(window.localStorage.getItem("groundx-onboarding.entity-registry.v1")).toBeNull();
    });
  });

  it("entities are independent per session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let idA = "";
    let idB = "";
    act(() => {
      idA = result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastFrame: "f3" });
      idB = result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastFrame: "f2" });
    });
    const sessA = result.current.state.sessions.get(idA)!;
    const sessB = result.current.state.sessions.get(idB)!;
    expect(sessA.entities.get("sample:utility" as never)!.lastFrame).toBe("f3");
    expect(sessB.entities.get("sample:utility" as never)!.lastFrame).toBe("f2");
  });
});
