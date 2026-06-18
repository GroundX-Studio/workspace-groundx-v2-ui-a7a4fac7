import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { makeFakeApi } from "@/test/makeFakeApi";

import { EntitySessionStoreProvider, useEntitySessionStore } from "./EntitySessionStoreContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ApiProvider value={makeFakeApi()}>
    <EntitySessionStoreProvider>{children}</EntitySessionStoreProvider>
  </ApiProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

/**
 * EntitySessionStore (formerly "EntityRegistry") is a derived facade
 * over ChatStore (see /memory/project_chat_session_model.md).
 * Persistence + storage live in ChatStoreContext now; the tests that
 * pinned the OLD localStorage key (`groundx-onboarding.entity-registry.v1`)
 * have moved into ChatStoreContext.test.tsx. The tests here exercise
 * the **facade contract**: useEntitySessionStore returns the
 * EntitySessionStore API shape, mutations land in the active chat
 * session's entities map, and a doubly-obsolete legacy payload is
 * ignored (the frame→step migration was retired in standardized-viewer-control).
 */

describe("EntitySessionStoreContext (facade over ChatStore)", () => {
  it("exposes the EntitySessionStore API shape (same behavior as the former useEntityRegistry)", () => {
    const { result } = renderHook(() => useEntitySessionStore(), { wrapper });
    expect(result.current.state).toBeDefined();
    expect(result.current.state.entities instanceof Map).toBe(true);
    expect(typeof result.current.activate).toBe("function");
    expect(typeof result.current.upsertAndActivate).toBe("function");
    expect(typeof result.current.updateActive).toBe("function");
  });

  it("the old useEntityRegistry name no longer resolves from the contexts barrel", async () => {
    const mod = (await import("@/contexts/EntitySessionStoreContext")) as Record<string, unknown>;
    expect(mod.useEntityRegistry).toBeUndefined();
    expect(mod.EntityRegistryProvider).toBeUndefined();
    expect(mod.useEntitySessionStore).toBeTypeOf("function");
    expect(mod.EntitySessionStoreProvider).toBeTypeOf("function");
  });

  it("does NOT migrate the doubly-obsolete legacy registry key (frame-retirement / pre-launch)", () => {
    // standardized-viewer-control (D2) — the one-shot frame→step migration that
    // read the legacy `entity-registry.v1` (`lastFrame`/`completedFrames`) format
    // is gone (the frame machine is retired and there is no real user data to
    // preserve pre-launch). A legacy payload is now ignored: bootstrap seeds a
    // FRESH empty session, with no entity migrated from the old key.
    const previousSession = {
      version: 1,
      activeKey: "sample:utility",
      entities: [
        [
          "sample:utility",
          {
            kind: "sample",
            id: "utility",
            lastFrame: "f3",
            completedFrames: ["f1", "f2"],
            createdAt: 1000,
            lastVisitedAt: 2000,
          },
        ],
      ],
    };
    window.localStorage.setItem(
      "groundx-onboarding.entity-registry.v1",
      JSON.stringify(previousSession),
    );

    const { result } = renderHook(() => useEntitySessionStore(), { wrapper });

    // Nothing migrated — the store starts empty (the legacy key is not read).
    expect(result.current.state.activeKey).toBeNull();
    expect(result.current.state.entities.size).toBe(0);
  });

  it("upsertAndActivate adds an entity to the active session", () => {
    const { result } = renderHook(() => useEntitySessionStore(), { wrapper });
    act(() => {
      result.current.upsertAndActivate("sample", "loan", { lastStep: { kind: "doc-viewer", documentId: "scenario:loan" } });
    });
    expect(result.current.state.activeKey).toBe("sample:loan");
    expect(result.current.state.entities.get("sample:loan" as never)?.lastStep).toEqual({ kind: "doc-viewer", documentId: "scenario:loan" });
  });

  it("ignores corrupt legacy localStorage payloads without throwing", () => {
    window.localStorage.setItem("groundx-onboarding.entity-registry.v1", "not json");
    const { result } = renderHook(() => useEntitySessionStore(), { wrapper });
    expect(result.current.state.entities.size).toBe(0);
    expect(result.current.state.activeKey).toBeNull();
  });

  it("ignores any localStorage payload when explicit initialEntities are provided", () => {
    window.localStorage.setItem(
      "groundx-onboarding.entity-registry.v1",
      JSON.stringify({
        version: 1,
        activeKey: "sample:utility",
        entities: [
          [
            "sample:utility",
            {
              kind: "sample",
              id: "utility",
              lastFrame: "f6",
              completedFrames: ["f1", "f2", "f3"],
              createdAt: 1,
              lastVisitedAt: 1,
            },
          ],
        ],
      }),
    );
    const seedMap = new Map();
    seedMap.set("sample:loan", {
      kind: "sample",
      id: "loan",
      lastStep: { kind: "doc-viewer", documentId: "scenario:loan" },
      reachedStages: new Set(["ingest"]),
      createdAt: 1,
      lastVisitedAt: 1,
    });
    const wrap = ({ children }: { children: ReactNode }) => (
      <ApiProvider value={makeFakeApi()}>
        <EntitySessionStoreProvider initialEntities={seedMap as never} initialActiveKey={"sample:loan" as never}>
          {children}
        </EntitySessionStoreProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => useEntitySessionStore(), { wrapper: wrap });
    expect(result.current.state.activeKey).toBe("sample:loan");
    expect(result.current.state.entities.has("sample:utility" as never)).toBe(false);
  });
});
