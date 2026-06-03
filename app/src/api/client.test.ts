import { describe, expect, it, vi } from "vitest";
import { __resetEnsuredChatSessions } from "@/api/chatSessions";

const apiMocks = vi.hoisted(() => ({
  issueOnboardingSession: vi.fn(),
}));

vi.mock("@/api/entities/onboardingSessionEntity", () => ({
  issueOnboardingSession: apiMocks.issueOnboardingSession,
}));

import { realApi } from "@/api/client";

describe("realApi session client", () => {
  it("single-flights concurrent anon-session establishment", async () => {
    apiMocks.issueOnboardingSession.mockResolvedValue({
      sessionId: "anon-session-1",
      anonymous: true,
    });

    const ensureAnonSession = (realApi.session as {
      ensureAnonSession: () => Promise<{ sessionId: string; anonymous: boolean }>;
    }).ensureAnonSession;

    await Promise.all([
      ensureAnonSession(),
      ensureAnonSession(),
      ensureAnonSession(),
    ]);

    expect(apiMocks.issueOnboardingSession).toHaveBeenCalledTimes(1);
  });
});

describe("realApi auth client", () => {
  it("exposes customer auth operations under a grouped auth member", () => {
    expect(realApi.auth).toMatchObject({
      login: expect.any(Function),
      register: expect.any(Function),
      logout: expect.any(Function),
      getUserData: expect.any(Function),
      updateAppMetadata: expect.any(Function),
      resetUserPassword: expect.any(Function),
      confirmUserChangingPassword: expect.any(Function),
    });
  });
});

describe("realApi chat client", () => {
  it("keeps chat-row ensure state on the injected client, not the legacy module cache", async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async (input) => {
      const body =
        input === "/api/csrf/token"
          ? { token: "csrf-fixture" }
          : { chatSessionId: "chat-client-1", ownerUserId: null, ownerAnonId: "anon-1" };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    global.fetch = fetchMock;

    try {
      await realApi.chat.ensureServerChatSession({
        id: "chat-client-1",
        onboardingSessionId: "anon-session-1",
        title: "Onboarding",
        isOnboarding: true,
      });

      __resetEnsuredChatSessions();

      await realApi.chat.patchChatSession({
        chatSessionId: "chat-client-1",
        activeEntityKey: "sample:utility",
      });

      const createCalls = fetchMock.mock.calls.filter(([path, init]) => {
        return path === "/api/chat-sessions" && init?.method === "POST";
      });
      expect(createCalls).toHaveLength(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
