import { describe, expect, it, vi } from "vitest";

import { makeFakeApi } from "@/test/makeFakeApi";

describe("makeFakeApi", () => {
  it("fills every leaf method with a resolved mock (auto-covers the whole Api shape)", async () => {
    const api = makeFakeApi();

    // grouped standalone modules
    expect(vi.isMockFunction(api.chat.sendChatMessage)).toBe(true);
    expect(vi.isMockFunction(api.session.issueOnboardingSession)).toBe(true);
    expect(vi.isMockFunction(api.report.renderReport)).toBe(true);
    // a heavy spread namespace from the @/api aggregate — proves no enumeration
    expect(vi.isMockFunction(api.groundxBuckets.listGroundXBuckets)).toBe(true);
    // top-level auth fn
    expect(vi.isMockFunction(api.login)).toBe(true);

    // defaults resolve to useful empty/success shapes so unguarded mount-path calls are safe
    await expect(api.session.issueOnboardingSession()).resolves.toEqual({
      sessionId: "test-anon-session",
      anonymous: true,
    });
    await expect(
      api.chat.createChatSession({
        id: "chat-1",
        title: "Onboarding",
        isOnboarding: true,
      }),
    ).resolves.toEqual({
      chatSessionId: "chat-1",
      ownerUserId: null,
      ownerAnonId: "test-anon-owner",
    });
    await expect(api.chat.listChatMessages("chat-1")).resolves.toEqual([]);
  });

  it("applies overrides while leaving sibling methods as fakes", () => {
    const sendChatMessage = vi.fn().mockResolvedValue({ ok: true });
    const api = makeFakeApi({ chat: { sendChatMessage } });

    expect(api.chat.sendChatMessage).toBe(sendChatMessage);
    // sibling untouched, still a fake
    expect(vi.isMockFunction(api.chat.createChatSession)).toBe(true);
    // unrelated group untouched
    expect(vi.isMockFunction(api.session.issueOnboardingSession)).toBe(true);
  });
});
