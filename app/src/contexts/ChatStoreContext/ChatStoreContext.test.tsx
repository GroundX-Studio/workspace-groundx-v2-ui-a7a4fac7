import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withApiProvider } from "@/test/withApiProvider";

import {
  ChatStoreProvider,
  useChatStore,
  useChatStoreActions,
  useChatStoreState,
} from "./ChatStoreContext";

const ensureAnonSession = vi.fn();
const ensureServerChatSession = vi.fn();

const withChatStoreApi = (children: React.ReactNode) =>
  withApiProvider(children, {
    session: { ensureAnonSession },
    chat: { ensureServerChatSession },
  });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  withChatStoreApi(<ChatStoreProvider>{children}</ChatStoreProvider>)
);

beforeEach(() => {
  window.localStorage.clear();
  ensureAnonSession.mockReset();
  ensureAnonSession.mockResolvedValue({ sessionId: "anon-session-1", anonymous: true });
  ensureServerChatSession.mockReset();
  ensureServerChatSession.mockResolvedValue(undefined);
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

  // report-default-template T6 — the standalone setter the onboarding experience
  // uses to load the seeded default template; `undefined` clears it.
  it("setReportTemplateId() sets the active session's reportOverlay.templateId; undefined clears it", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    const overlay = () =>
      result.current.state.sessions.get(result.current.state.activeSessionId!)!.reportOverlay;
    expect(overlay().templateId).toBeUndefined();
    act(() => {
      result.current.setReportTemplateId("rt-sample-utility-bill");
    });
    expect(overlay().templateId).toBe("rt-sample-utility-bill");
    act(() => {
      result.current.setReportTemplateId(undefined);
    });
    expect(overlay().templateId).toBeUndefined();
  });

  it("appendMessage is a no-op when no session is active", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.appendMessage({ role: "user", content: "lost" });
    });
    expect(result.current.state.sessions.size).toBe(0);
  });

  // Phase B — entity actions live on ChatStore. EntitySessionStore's
  // legacy API stays available via a derived hook; the storage is
  // here.
  it("upsertEntityAndActivate adds an entity to the active session and activates it", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.upsertEntityAndActivate("sample", "utility", {
        lastStep: { kind: "extract-workbench", scenarioId: "utility" },
        reachedStages: new Set(["ingest", "understand"]),
      });
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.entities.size).toBe(1);
    expect(session.activeEntityKey).toBe("sample:utility");
    const entity = session.entities.get("sample:utility" as never)!;
    expect(entity.lastStep).toEqual({ kind: "extract-workbench", scenarioId: "utility" });
  });

  it("activateEntity flips the active key on the active session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastStep: { kind: "doc-viewer", documentId: "scenario:utility" } });
      result.current.upsertEntityAndActivate("sample", "loan", { lastStep: { kind: "doc-viewer", documentId: "scenario:loan" } });
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
      result.current.upsertEntityAndActivate("sample", "utility", { lastStep: { kind: "doc-viewer", documentId: "scenario:utility" } });
    });
    act(() => {
      result.current.updateActiveEntity((entity) => ({ ...entity, lastStep: { kind: "interact-chat" } }));
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    const entity = session.entities.get("sample:utility" as never)!;
    expect(entity.lastStep).toEqual({ kind: "interact-chat" });
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
        result.current.appendViewerEvent({ action: "journey-advanced", entityKey: null, source: "user" });
        result.current.appendViewerEvent({ action: "left", entityKey: null, source: "user" });
      });
      const sessA = result.current.state.sessions.get(idA)!;
      const sessB = result.current.state.sessions.get(idB)!;
      expect(sessA.viewerHistory.map((e) => e.action)).toEqual(["opened"]);
      expect(sessB.viewerHistory.map((e) => e.action)).toEqual(["journey-advanced", "left"]);
    });
  });

  // -----------------------------------------------------------------
  // Phase D — onboarding bootstrap
  // -----------------------------------------------------------------

  describe("onboarding bootstrap (Phase D)", () => {
    it("autoSeedDefaultSession creates exactly one session flagged isOnboardingSession=true", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
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
        version: 2,
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
                  lastStep: { kind: "extract-workbench", scenarioId: "utility" },
                  reachedStages: ["ingest", "understand"],
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
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      // Should have ONE session (the pre-existing one), not two.
      expect(result.current.state.sessions.size).toBe(1);
      expect(result.current.state.activeSessionId).toBe(persistedSessionId);
      const active = result.current.state.sessions.get(persistedSessionId)!;
      expect(active.activeEntityKey).toBe("sample:utility");
      expect(active.entities.get("sample:utility" as never)?.lastStep).toEqual({
        kind: "extract-workbench",
        scenarioId: "utility",
      });
    });

    it("rehydrates lastStep VERBATIM — a step visited after a later stage must resume, not the reached-set watermark", () => {
      // standardized-viewer-control D13/R5 repro of the stale-resume bug
      // (2026-06-11): the user reached Integrate hours ago (so `integrate` ∈
      // reachedStages), then moved the canvas back to Interact. Reload must
      // resume the Interact step — the step the user was actually on — NOT the
      // highest stage ever reached. The reached-set is for checkmarks only and
      // must never be the resume anchor.
      const persistedSessionId = "c-resume-verbatim";
      const snapshot = {
        version: 2,
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
                  lastStep: { kind: "interact-chat" },
                  reachedStages: ["ingest", "understand", "analyze", "integrate"],
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
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      const entity = result.current.state.sessions.get(persistedSessionId)!.entities.get("sample:utility" as never)!;
      // Resume anchor = the step the user was last on (Interact), NOT Integrate.
      expect(entity.lastStep).toEqual({ kind: "interact-chat" });
      // The reached-set is restored independently (drives checkmarks only) and
      // is genuinely non-contiguous — it still carries `integrate`.
      expect([...entity.reachedStages].sort()).toEqual(["analyze", "ingest", "integrate", "understand"]);
    });

    it("rehydrates a report-builder step verbatim (the surface survives reload)", () => {
      // R4/B2 — the persisted `report` step carries `surface` so render vs
      // builder (old f4 vs f4a) survives a reload without a frame.
      const persistedSessionId = "c-resume-report";
      const snapshot = {
        version: 2,
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
                  lastStep: { kind: "report", surface: "builder", selectedSectionId: "sec-3" },
                  reachedStages: ["ingest", "understand", "analyze"],
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
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      expect(result.current.state.sessions.get(persistedSessionId)!.entities.get("sample:utility" as never)?.lastStep).toEqual({
        kind: "report",
        surface: "builder",
        selectedSectionId: "sec-3",
      });
    });

    it("does NOT migrate the doubly-obsolete legacy entity-registry.v1 payload (frame-retirement / pre-launch)", () => {
      // standardized-viewer-control (D2) — the frame machine is gone and so is the
      // one-shot frame→step migration that read the legacy `entity-registry.v1`
      // (`lastFrame`/`completedFrames`) format. Pre-launch there is no real user
      // data to preserve, so a legacy payload is simply ignored: bootstrap seeds a
      // FRESH empty onboarding session, and the legacy key is left untouched (no
      // migration code reads or deletes it).
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
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });

      // A fresh empty onboarding session — nothing migrated from the legacy key.
      expect(result.current.state.sessions.size).toBe(1);
      const active = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(active.isOnboardingSession).toBe(true);
      expect(active.activeEntityKey).toBeNull();
      expect(active.entities.size).toBe(0);
    });
  });

  describe("split state/actions contexts", () => {
    it("useChatStoreActions returns a reference-stable object across state changes", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ actions: useChatStoreActions(), state: useChatStoreState() }),
        { wrapper: wrap },
      );
      const initialActions = result.current.actions;
      act(() => {
        result.current.actions.newSession({ isOnboardingSession: true });
      });
      // State has changed (a session was created), but the actions
      // object identity is the same — this is the property that lets
      // perf-sensitive consumers subscribe to actions alone.
      expect(result.current.state.sessions.size).toBe(1);
      expect(result.current.actions).toBe(initialActions);
    });

    it("useChatStoreState exposes the same state object as useChatStore().state", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(
        () => ({ legacy: useChatStore(), state: useChatStoreState() }),
        { wrapper: wrap },
      );
      expect(result.current.state).toBe(result.current.legacy.state);
    });

    it("throws a clear error when used outside the provider", () => {
      // Calling renderHook without a wrapper triggers the throw paths.
      // React logs the render-time throw to console.error; the global
      // setup.ts spy normally rethrows on console.error (to catch
      // accidental React warnings). For this test the console.error
      // IS expected — silence the spy locally so React's log doesn't
      // surface as an unhandled exception in vitest.
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(() => renderHook(() => useChatStoreActions())).toThrow(/ChatStoreProvider/);
        expect(() => renderHook(() => useChatStoreState())).toThrow(/ChatStoreProvider/);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("growth caps", () => {
    it("caps viewerHistory at 50 entries per session (oldest drop off)", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });
      act(() => {
        for (let i = 0; i < 75; i++) {
          result.current.appendViewerEvent({
            entityKey: null,
            action: "journey-advanced",
            source: "user",
            detail: { i },
          });
        }
      });
      const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(session.viewerHistory).toHaveLength(50);
      // Oldest 25 dropped — the first remaining entry should be #25.
      expect((session.viewerHistory[0].detail as { i: number }).i).toBe(25);
      // Most recent entry is still #74.
      expect((session.viewerHistory[49].detail as { i: number }).i).toBe(74);
    });

    it("persists only the most-recent 500 messages even when in-memory has more", () => {
      const wrap = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider autoSeedDefaultSession>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: wrap });
      act(() => {
        for (let i = 0; i < 650; i++) {
          result.current.appendMessage({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` });
        }
      });
      // In-memory keeps the full set (semantic continuity for the
      // active chat). Persist-side cap only kicks in on the next
      // serialize.
      const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      expect(session.messages).toHaveLength(650);
      // Now check the serialized payload trimmed to 500.
      const persisted = JSON.parse(window.localStorage.getItem("groundx-onboarding.chat-store.v1")!);
      expect(persisted.sessions[0].messages).toHaveLength(500);
      // Trim drops the OLDEST (front), keeps the newest — verify last
      // message is m649.
      expect(persisted.sessions[0].messages[499].content).toBe("m649");
      expect(persisted.sessions[0].messages[0].content).toBe("m150");
    });
  });

  it("entities are independent per session", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let idA = "";
    let idB = "";
    act(() => {
      idA = result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastStep: { kind: "extract-workbench", scenarioId: "utility" } });
      idB = result.current.newSession();
      result.current.upsertEntityAndActivate("sample", "utility", { lastStep: { kind: "doc-viewer", documentId: "scenario:utility" } });
    });
    const sessA = result.current.state.sessions.get(idA)!;
    const sessB = result.current.state.sessions.get(idB)!;
    expect(sessA.entities.get("sample:utility" as never)!.lastStep).toEqual({ kind: "extract-workbench", scenarioId: "utility" });
    expect(sessB.entities.get("sample:utility" as never)!.lastStep).toEqual({ kind: "doc-viewer", documentId: "scenario:utility" });
  });

  describe("persistence failure modes (TS-03)", () => {
    /**
     * Three contracts:
     *   1. localStorage.setItem throwing QuotaExceededError does NOT
     *      crash the provider; in-memory state still mutates normally.
     *   2. A malformed snapshot in localStorage (garbage JSON or
     *      wrong-version payload) is treated as "no snapshot" — the
     *      provider boots clean rather than crashing on rehydrate.
     *   3. A cross-tab StorageEvent (another tab writes the same key)
     *      does NOT silently mutate this tab's state. The contract
     *      today is "no listener; tab B keeps its own state, next
     *      persist from tab B wins." A future cross-tab sync feature
     *      would tighten this — when it lands, update this test.
     */

    it("a QuotaExceededError on setItem does not crash; in-memory state still mutates", () => {
      const setItemSpy = vi
        .spyOn(window.localStorage.__proto__, "setItem")
        .mockImplementation(() => {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        });
      try {
        const { result } = renderHook(() => useChatStore(), { wrapper });
        let createdId = "";
        act(() => {
          createdId = result.current.newSession();
          result.current.appendMessage({ role: "user", content: "hello under quota pressure" });
        });
        // In-memory state did the work even though every persist
        // attempt threw under us.
        const sess = result.current.state.sessions.get(createdId)!;
        expect(sess.messages).toHaveLength(1);
        expect(sess.messages[0]?.content).toBe("hello under quota pressure");
        // setItem really was being called (proves the persist path
        // ran and the catch swallowed the throw).
        expect(setItemSpy).toHaveBeenCalled();
      } finally {
        setItemSpy.mockRestore();
      }
    });

    it("a malformed snapshot in localStorage rehydrates as an empty store (no crash)", () => {
      // Stuff the storage key with garbage before the provider mounts.
      window.localStorage.setItem("groundx-onboarding.chat-store.v1", "{not even json,,,");
      const { result } = renderHook(() => useChatStore(), { wrapper });
      // Boots clean — no sessions, no active id — instead of throwing.
      expect(result.current.state.sessions.size).toBe(0);
      expect(result.current.state.activeSessionId).toBeNull();
    });

    it("a wrong-version snapshot is treated as no snapshot", () => {
      window.localStorage.setItem(
        "groundx-onboarding.chat-store.v1",
        JSON.stringify({ version: 999, ownerKey: "anon-stale", activeSessionId: null, sessions: [] }),
      );
      const { result } = renderHook(() => useChatStore(), { wrapper });
      expect(result.current.state.sessions.size).toBe(0);
      expect(result.current.state.activeSessionId).toBeNull();
    });

    it("a cross-tab StorageEvent does not silently mutate this tab's state", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let idA = "";
      act(() => {
        idA = result.current.newSession();
        result.current.appendMessage({ role: "user", content: "this tab's message" });
      });
      const beforeMessages = result.current.state.sessions.get(idA)!.messages.length;

      // Simulate another tab writing a completely different snapshot.
      const otherTabPayload = JSON.stringify({
        version: 2,
        ownerKey: "anon-other",
        activeSessionId: "c-other",
        sessions: [],
      });
      window.localStorage.setItem("groundx-onboarding.chat-store.v1", otherTabPayload);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "groundx-onboarding.chat-store.v1",
            newValue: otherTabPayload,
            storageArea: window.localStorage,
          }),
        );
      });

      // Contract today: no listener wired, so the in-memory state is
      // unchanged. (When/if a cross-tab sync feature lands, update
      // this to assert the new contract.)
      const sess = result.current.state.sessions.get(idA);
      expect(sess).toBeDefined();
      expect(sess!.messages).toHaveLength(beforeMessages);
      expect(sess!.messages[0]?.content).toBe("this tab's message");
    });
  });

  // Lived-order regression: before this fix, RT-02..05 endpoints
  // (POST viewer-events, PUT entity, PATCH chat-session, GET messages)
  // all 404'd in the window between client-side session mint and the
  // first chat send — `sendChatMessage` had its own lazy ensure-create
  // cache, but those telemetry/state-sync endpoints fired well before
  // any chat. The RT-* unit tests modeled the happy path (explicit
  // POST /api/chat-sessions before the dependent endpoint) so the
  // production order — writes BEFORE ensure — was an untested gap.
  // ChatStoreProvider's mount effect now fires ensureServerChatSession
  // for every active session so the row exists before RT endpoints
  // are called.
  describe("eager server-side chat_sessions ensure (lived-order fix)", () => {
    it("calls ensureServerChatSession when a session is minted via newSession", async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let newId = "";
      act(() => {
        newId = result.current.newSession({ title: "Test session" });
      });
      await waitFor(() => {
        const calls = ensureServerChatSession.mock.calls;
        const matched = calls.find((c) => c[0]?.id === newId);
        expect(matched).toBeDefined();
      });
    });

    it("includes the session's title + isOnboarding flag in the ensure payload", async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let onboardingId = "";
      act(() => {
        onboardingId = result.current.newSession({
          title: "Onboarding",
          isOnboardingSession: true,
        });
      });
      await waitFor(() => {
        const matched = ensureServerChatSession.mock.calls.find((c) => c[0]?.id === onboardingId);
        expect(matched).toBeDefined();
        expect(matched![0]).toMatchObject({
          id: onboardingId,
          title: "Onboarding",
          isOnboarding: true,
        });
      });
    });

    it("ensures scoped product sessions as non-onboarding even when they start from the shared store", async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let workspaceId = "";
      act(() => {
        workspaceId = result.current.newSession({
          title: "Workspace",
          scopeKey: "scope:bucket:28454",
        });
      });

      await waitFor(() => {
        const matched = ensureServerChatSession.mock.calls.find((c) => c[0]?.id === workspaceId);
        expect(matched).toBeDefined();
        expect(matched![0]).toMatchObject({
          id: workspaceId,
          title: "Workspace",
          isOnboarding: false,
        });
      });
      expect(ensureAnonSession).not.toHaveBeenCalled();
    });

    it("does not fire when ChatStoreProvider is mounted in ephemeral mode (tests opt out)", async () => {
      const ephemeralWrapper = ({ children }: { children: React.ReactNode }) => (
        withChatStoreApi(<ChatStoreProvider ephemeral>{children}</ChatStoreProvider>)
      );
      const { result } = renderHook(() => useChatStore(), { wrapper: ephemeralWrapper });
      act(() => {
        result.current.newSession({ title: "Ephemeral" });
      });
      // Let any potentially-firing effects flush.
      await new Promise((r) => setTimeout(r, 20));
      expect(ensureServerChatSession).not.toHaveBeenCalled();
    });
  });

  // 2026-05-31-onboarding-experiences task 3 — per-scope session resolution.
  describe("resolveSessionForScope", () => {
    const WORKSPACE_SCOPE = { type: "bucket" as const, bucketId: 28454 };
    const PROJECT_SCOPE = {
      type: "bucket" as const,
      bucketId: 28454,
      filter: { project: "utility" },
    };

    it("opening Workspace, then Project, then re-opening Workspace resolves DISTINCT, STABLE per-scope sessions", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let workspaceId = "";
      let projectId = "";
      let workspaceIdAgain = "";
      act(() => {
        workspaceId = result.current.resolveSessionForScope(WORKSPACE_SCOPE, { title: "Workspace" });
      });
      act(() => {
        projectId = result.current.resolveSessionForScope(PROJECT_SCOPE, { title: "Project" });
      });
      act(() => {
        workspaceIdAgain = result.current.resolveSessionForScope(WORKSPACE_SCOPE, { title: "Workspace" });
      });
      // Distinct rows per scope; re-opening Workspace returns the SAME row
      // (no collision on one shared session).
      expect(workspaceId).toBeTruthy();
      expect(projectId).toBeTruthy();
      expect(workspaceId).not.toBe(projectId);
      expect(workspaceIdAgain).toBe(workspaceId);
      // Only two sessions were ensure-created across three opens.
      expect(result.current.state.sessions.size).toBe(2);
    });

    it("makes the resolved scope session the active session", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let workspaceId = "";
      act(() => {
        workspaceId = result.current.resolveSessionForScope(WORKSPACE_SCOPE, { title: "Workspace" });
      });
      expect(result.current.state.activeSessionId).toBe(workspaceId);
    });

    it("does not duplicate a scoped session when the same scope is resolved twice in one effect tick", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      let firstId = "";
      let secondId = "";
      act(() => {
        firstId = result.current.resolveSessionForScope(WORKSPACE_SCOPE, { title: "Workspace" });
        secondId = result.current.resolveSessionForScope(WORKSPACE_SCOPE, { title: "Workspace" });
      });

      expect(firstId).toBe(secondId);
      const scopedSessions = [...result.current.state.sessions.values()].filter(
        (session) => session.scopeKey === "scope:bucket:28454",
      );
      expect(scopedSessions).toHaveLength(1);
    });
  });

  // WF-01 C5 — a citation jump is definitionally NOT the F2 "reading" beat.
  // `gotoDocViewer` mutates the active doc-viewer step in place when it
  // targets the same documentId; that mutate must NOT carry a prior
  // `scanning: true` flag forward, or a cite-click on the doc being read
  // would keep the reading sweep running over the highlight.
  describe("gotoDocViewer clears the F2 reading scan on a citation jump", () => {
    it("mutating a scanning doc-viewer step in place drops the scanning flag", () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });
      act(() => {
        result.current.newSession();
      });
      // Seed the F2 reading step (same documentId the cite-click will target).
      act(() => {
        result.current.pushStep({ kind: "doc-viewer", documentId: "doc-xyz", scanning: true });
      });
      act(() => {
        result.current.gotoDocViewer({ documentId: "doc-xyz", page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } });
      });
      const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
      const top = session.viewer.history[session.viewer.currentStep.stepIndex];
      expect(top.kind).toBe("doc-viewer");
      // The highlight landed…
      expect(top).toMatchObject({ documentId: "doc-xyz", highlight: { page: 2 } });
      // …and the reading sweep is gone (a cite-jump is not a reading beat).
      expect(top.kind === "doc-viewer" && top.scanning).toBeFalsy();
    });
  });
});
