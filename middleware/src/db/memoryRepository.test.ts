import { describe, expect, it } from "vitest";

import type {
  ChatMessageRecord,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  ConversationSummaryRecord,
  ViewerEventRecord,
} from "../types.js";

import { MemoryAppRepository } from "./memoryRepository.js";

const baseSession: ChatSessionRecord = {
  id: "chat-1",
  onboardingSessionId: "onb-1",
  ownerUserId: null,
  ownerAnonId: "anon-1",
  title: "Onboarding",
  isOnboarding: true,
  activeEntityKey: "sample:utility",
  currentIntent: null,
  createdAt: new Date("2026-05-24T12:00:00Z"),
  updatedAt: new Date("2026-05-24T12:00:00Z"),
  archivedAt: null,
};

function makeMessage(id: string, sessionId: string, turn: number, role: ChatMessageRecord["role"], content: string): ChatMessageRecord {
  return {
    id,
    chatSessionId: sessionId,
    turnIndex: turn,
    role,
    content,
    citationsJson: null,
    toolCallsJson: null,
    attachmentsJson: null,
    compressedIntoSummaryId: null,
    llmProvider: null,
    llmModelId: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: new Date(),
  };
}

describe("MemoryAppRepository — chat-session methods", () => {
  it("upserts and reads chat sessions, listing in updated-at-desc order per user", async () => {
    const repo = new MemoryAppRepository();
    const a: ChatSessionRecord = { ...baseSession, id: "a", ownerUserId: "u1", ownerAnonId: null, updatedAt: new Date("2026-05-24T10:00:00Z") };
    const b: ChatSessionRecord = { ...baseSession, id: "b", ownerUserId: "u1", ownerAnonId: null, updatedAt: new Date("2026-05-24T12:00:00Z") };
    const c: ChatSessionRecord = { ...baseSession, id: "c", ownerUserId: "u2", ownerAnonId: null };
    await repo.upsertChatSession(a);
    await repo.upsertChatSession(b);
    await repo.upsertChatSession(c);
    expect(await repo.getChatSession("b")).toEqual(b);
    const list = await repo.listChatSessionsForUser("u1");
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("appends and lists messages in turn order regardless of insertion order", async () => {
    const repo = new MemoryAppRepository();
    await repo.appendChatMessage(makeMessage("m2", "chat-1", 2, "assistant", "hi"));
    await repo.appendChatMessage(makeMessage("m1", "chat-1", 1, "user", "hello"));
    await repo.appendChatMessage(makeMessage("m3", "chat-1", 3, "user", "ok"));
    const list = await repo.listChatMessages("chat-1");
    expect(list.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("marks chat messages as compressed into a summary id (compression chain Phase J)", async () => {
    // When the compression runner writes a new ConversationSummary it
    // must also update the absorbed messages' compressedIntoSummaryId
    // field so subsequent live-tail reads skip them. The repo exposes
    // a batch update keyed by message ids.
    const repo = new MemoryAppRepository();
    await repo.appendChatMessage(makeMessage("m1", "chat-1", 1, "user", "hello"));
    await repo.appendChatMessage(makeMessage("m2", "chat-1", 2, "assistant", "hi"));
    await repo.appendChatMessage(makeMessage("m3", "chat-1", 3, "user", "follow-up"));

    await repo.markChatMessagesCompressed(["m1", "m2"], "summary-1");

    const all = await repo.listChatMessages("chat-1");
    const byId = new Map(all.map((m) => [m.id, m]));
    expect(byId.get("m1")?.compressedIntoSummaryId).toBe("summary-1");
    expect(byId.get("m2")?.compressedIntoSummaryId).toBe("summary-1");
    // m3 must remain in the live tail (compressedIntoSummaryId stays null).
    expect(byId.get("m3")?.compressedIntoSummaryId).toBeNull();
  });

  it("appends conversation summaries and lists newest first", async () => {
    const repo = new MemoryAppRepository();
    const older: ConversationSummaryRecord = {
      id: "s1",
      chatSessionId: "chat-1",
      fromMessageId: "m1",
      toMessageId: "m5",
      generation: 0,
      absorbedSummaryIdsJson: "[]",
      content: "older",
      model: "test",
      tokensIn: 100,
      tokensOut: 50,
      createdAt: new Date("2026-05-24T10:00:00Z"),
    };
    const newer: ConversationSummaryRecord = { ...older, id: "s2", content: "newer", createdAt: new Date("2026-05-24T12:00:00Z") };
    await repo.appendConversationSummary(older);
    await repo.appendConversationSummary(newer);
    const list = await repo.listConversationSummaries("chat-1");
    expect(list.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("upserts session entities keyed by (sessionId, entityKey) and lists per session", async () => {
    const repo = new MemoryAppRepository();
    const make = (sessionId: string, entityKey: string): ChatSessionEntityRecord => ({
      chatSessionId: sessionId,
      entityKey,
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    });
    await repo.upsertChatSessionEntity(make("chat-1", "sample:utility"));
    await repo.upsertChatSessionEntity(make("chat-1", "sample:loan"));
    await repo.upsertChatSessionEntity(make("chat-2", "sample:utility"));
    // Upsert with same composite key replaces the row.
    await repo.upsertChatSessionEntity({ ...make("chat-1", "sample:utility"), lastFrame: "f3" });
    const list = await repo.listChatSessionEntities("chat-1");
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.entityKey === "sample:utility")?.lastFrame).toBe("f3");
  });

  it("appends viewer events, filters by sinceTimestamp, and lists newest first", async () => {
    const repo = new MemoryAppRepository();
    const make = (id: string, ts: number, action: ViewerEventRecord["action"]): ViewerEventRecord => ({
      id,
      chatSessionId: "chat-1",
      timestamp: ts,
      entityKey: "sample:utility",
      action,
      source: "user",
      detailJson: null,
    });
    await repo.appendViewerEvent(make("e1", 1000, "opened"));
    await repo.appendViewerEvent(make("e2", 2000, "frame-advanced"));
    await repo.appendViewerEvent(make("e3", 3000, "citation-clicked"));
    const all = await repo.listViewerEvents("chat-1");
    expect(all.map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
    const recent = await repo.listViewerEvents("chat-1", 2000);
    expect(recent.map((e) => e.id)).toEqual(["e3", "e2"]);
  });

  it("rekeyAnonymousChatSessions transfers ownership from an anon id to a user id (in-place)", async () => {
    const repo = new MemoryAppRepository();
    // Pre-seed two chat_sessions for the same anon id — POST /api/chat-sessions
    // would have created these on the fly when the anon user first hit F5.
    await repo.upsertChatSession({ ...baseSession, id: "chat-A", ownerUserId: null, ownerAnonId: "anon-1" });
    await repo.upsertChatSession({ ...baseSession, id: "chat-B", ownerUserId: null, ownerAnonId: "anon-1" });
    // Plus an unrelated row owned by a different anon — must not be touched.
    await repo.upsertChatSession({ ...baseSession, id: "chat-C", ownerUserId: null, ownerAnonId: "anon-other" });
    // Existing message + entity + viewer event rows on chat-A — must
    // survive the re-key untouched (the re-key only flips ownership on
    // the parent chat_sessions row).
    await repo.appendChatMessage(makeMessage("m1", "chat-A", 1, "user", "hi"));
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-A",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    });
    await repo.appendViewerEvent({
      id: "e1",
      chatSessionId: "chat-A",
      timestamp: 1000,
      entityKey: "sample:utility",
      action: "opened",
      source: "user",
      detailJson: null,
    });

    const result = await repo.rekeyAnonymousChatSessions("anon-1", "u-claimed");

    expect(result.rekeyedSessions).toBe(2);
    const a = await repo.getChatSession("chat-A");
    const b = await repo.getChatSession("chat-B");
    const c = await repo.getChatSession("chat-C");
    expect(a?.ownerUserId).toBe("u-claimed");
    expect(a?.ownerAnonId).toBeNull();
    expect(b?.ownerUserId).toBe("u-claimed");
    expect(b?.ownerAnonId).toBeNull();
    // Unrelated row untouched.
    expect(c?.ownerUserId).toBeNull();
    expect(c?.ownerAnonId).toBe("anon-other");
    // Child rows untouched.
    expect((await repo.listChatMessages("chat-A")).map((m) => m.id)).toEqual(["m1"]);
    expect((await repo.listChatSessionEntities("chat-A"))).toHaveLength(1);
    expect((await repo.listViewerEvents("chat-A"))).toHaveLength(1);
  });

  it("rekeyAnonymousChatSessions returns 0 when the anon id matches nothing", async () => {
    const repo = new MemoryAppRepository();
    const result = await repo.rekeyAnonymousChatSessions("anon-nothing", "u-claimed");
    expect(result.rekeyedSessions).toBe(0);
  });
});
