import { describe, expect, it } from "vitest";

import { buildWorkspaceStateContext } from "./workspaceContext.js";
import type { AppRepository } from "../types.js";

/**
 * chat-unified-tool-loop D2/D2a — the shared workspace-state assembly extracted
 * from the (soon-removed) hybrid handler. Tests the optional-deps degrade (never
 * throws) + the assembled block for a populated session.
 */

// A minimal repository stub with only the four reads the helper makes.
function fakeRepo(over: Partial<AppRepository> = {}): AppRepository {
  return {
    getChatSession: async () => null,
    listChatSessionEntities: async () => [],
    listTemplates: async () => [],
    listViewerEvents: async () => [],
    ...over,
  } as unknown as AppRepository;
}

describe("buildWorkspaceStateContext", () => {
  it("returns null (never throws) when session deps are absent", async () => {
    expect(await buildWorkspaceStateContext({})).toBeNull();
    expect(await buildWorkspaceStateContext({ repository: fakeRepo() })).toBeNull();
    expect(await buildWorkspaceStateContext({ chatSessionId: "c1" })).toBeNull();
  });

  it("summarizes an anonymous session with no active entity", async () => {
    const repo = fakeRepo({
      getChatSession: async () =>
        ({ id: "c1", activeEntityKey: null } as unknown as Awaited<ReturnType<AppRepository["getChatSession"]>>),
    });
    const ctx = await buildWorkspaceStateContext({ repository: repo, chatSessionId: "c1" });
    expect(ctx).toContain("No active entity yet.");
    expect(ctx).toContain("User is anonymous.");
  });

  it("summarizes an active entity, journey stage, saved-schema count, and viewer trail for a signed-in user", async () => {
    const repo = fakeRepo({
      getChatSession: async () =>
        ({ id: "c1", activeEntityKey: "sample:utility" } as unknown as Awaited<ReturnType<AppRepository["getChatSession"]>>),
      listChatSessionEntities: async () =>
        [{ entityKey: "sample:utility" }] as unknown as Awaited<ReturnType<AppRepository["listChatSessionEntities"]>>,
      listTemplates: async () =>
        [{ id: "t1" }, { id: "t2" }] as unknown as Awaited<ReturnType<AppRepository["listTemplates"]>>,
      listViewerEvents: async () =>
        [{ action: "open", entityKey: "sample:utility" }] as unknown as Awaited<ReturnType<AppRepository["listViewerEvents"]>>,
    });
    const ctx = await buildWorkspaceStateContext({
      repository: repo,
      chatSessionId: "c1",
      groundxUsername: "user-1",
      activeStepKind: "extract-workbench",
    });
    expect(ctx).toContain("Active entity: sample:utility");
    expect(ctx).toContain("Journey stage:");
    expect(ctx).toContain("2 saved schemas");
    expect(ctx).toContain("Recent viewer trail: open@sample:utility");
  });
});
