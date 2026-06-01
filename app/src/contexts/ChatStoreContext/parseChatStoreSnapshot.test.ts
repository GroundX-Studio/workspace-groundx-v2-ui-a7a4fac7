import { describe, expect, it } from "vitest";

import { parseChatStoreSnapshot, STORAGE_VERSION } from "./parseChatStoreSnapshot";

/**
 * 2026-05-31-session-auth-subshapes Task 3 — the ChatStore localStorage
 * rehydration path is a trust boundary. `parseChatStoreSnapshot(unknown)`
 * validates the parsed blob (Zod) and returns `null` on a corrupt /
 * mismatched / wrong-version payload instead of casting it through. A valid
 * current-version snapshot parses to a `SerializedSnapshot`.
 */

const validSnapshot = {
  version: STORAGE_VERSION,
  ownerKey: "anon-1",
  activeSessionId: "c-1",
  sessions: [
    {
      id: "c-1",
      title: "Onboarding",
      createdAt: 1,
      updatedAt: 2,
      messages: [{ id: "m-1", role: "user", content: "hi", timestamp: 3 }],
      entities: [
        [
          "sample:doc-1",
          {
            kind: "sample",
            id: "doc-1",
            lastFrame: "f2",
            completedFrames: ["f1", "f2"],
            createdAt: 4,
            lastVisitedAt: 5,
          },
        ],
      ],
      activeEntityKey: "sample:doc-1",
      isOnboardingSession: true,
      signupOpen: false,
      scopeKey: "scope:bucket:28454",
    },
  ],
};

describe("parseChatStoreSnapshot — localStorage trust boundary", () => {
  it("parses a valid current-version snapshot", () => {
    const result = parseChatStoreSnapshot(validSnapshot);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(STORAGE_VERSION);
    expect(result?.sessions[0]?.id).toBe("c-1");
    expect(result?.sessions[0]?.entities[0]?.[1]?.kind).toBe("sample");
  });

  it("parses a minimal snapshot with no sessions", () => {
    const result = parseChatStoreSnapshot({
      version: STORAGE_VERSION,
      ownerKey: "anon-2",
      activeSessionId: null,
      sessions: [],
    });
    expect(result).not.toBeNull();
    expect(result?.sessions).toHaveLength(0);
  });

  it("returns null on a wrong-version snapshot", () => {
    expect(parseChatStoreSnapshot({ ...validSnapshot, version: 999 })).toBeNull();
  });

  it("returns null when sessions is not an array", () => {
    expect(parseChatStoreSnapshot({ version: STORAGE_VERSION, ownerKey: "a", activeSessionId: null, sessions: "nope" })).toBeNull();
  });

  it("returns null when a session is missing its id", () => {
    const { id: _omit, ...sessionNoId } = validSnapshot.sessions[0];
    expect(
      parseChatStoreSnapshot({ ...validSnapshot, sessions: [sessionNoId] }),
    ).toBeNull();
  });

  it("returns null on a non-object input", () => {
    expect(parseChatStoreSnapshot("not-an-object")).toBeNull();
    expect(parseChatStoreSnapshot(42)).toBeNull();
    expect(parseChatStoreSnapshot(null)).toBeNull();
    expect(parseChatStoreSnapshot([])).toBeNull();
  });

  it("returns null when an entity tuple is malformed", () => {
    const broken = {
      ...validSnapshot,
      sessions: [
        {
          ...validSnapshot.sessions[0],
          entities: [["sample:doc-1", { kind: "sample", id: "doc-1" }]], // missing required fields
        },
      ],
    };
    expect(parseChatStoreSnapshot(broken)).toBeNull();
  });
});
