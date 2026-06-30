import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetEnsuredChatSessions } from "@/api/chatSessions";

const apiMocks = vi.hoisted(() => ({
  issueOnboardingSession: vi.fn(),
}));

vi.mock("@/api/entities/onboardingSessionEntity", () => ({
  issueOnboardingSession: apiMocks.issueOnboardingSession,
}));

import { __resetRealApiSessionStateForTests, realApi } from "@/api/client";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetRealApiSessionStateForTests();
  apiMocks.issueOnboardingSession.mockReset();
  apiMocks.issueOnboardingSession.mockResolvedValue({
    sessionId: "anon-session-1",
    anonymous: true,
  });
  global.fetch = originalFetch;
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=; Max-Age=0; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("realApi session client", () => {
  it("single-flights concurrent anon-session establishment", async () => {
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
      resetSession: expect.any(Function),
    });
  });
});

describe("realApi scenario and telemetry clients", () => {
  it("exposes scenario, workflow, template, extract, and telemetry grouped members", () => {
    expect(realApi.scenario).toMatchObject({
      listScenarios: expect.any(Function),
    });
    expect(realApi.workflow).toMatchObject({
      getGroundXWorkflow: expect.any(Function),
    });
    expect(realApi.template).toMatchObject({
      saveTemplate: expect.any(Function),
    });
    expect(realApi.extract).toMatchObject({
      extractField: expect.any(Function),
      fetchFieldGeometry: expect.any(Function),
    });
    expect(realApi.telemetry).toMatchObject({
      captureException: expect.any(Function),
    });
  });
});

describe("realApi chat client", () => {
  it("establishes the anon onboarding session before ensuring an onboarding chat row", async () => {
    const order: string[] = [];
    apiMocks.issueOnboardingSession.mockImplementationOnce(async () => {
      order.push("anon-session");
      return {
        sessionId: "anon-session-order",
        anonymous: true,
      };
    });
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async (input) => {
      if (input === "/api/csrf/token") {
        return Response.json({ token: "csrf-fixture" });
      }
      if (input === "/api/chat-sessions") {
        order.push("chat-session");
        return Response.json({
          chatSessionId: "chat-order-1",
          ownerUserId: null,
          ownerAnonId: "anon-session-order",
        });
      }
      return Response.json({ error: "unexpected route" }, { status: 404 });
    });
    global.fetch = fetchMock;

    await realApi.chat.ensureServerChatSession({
      id: "chat-order-1",
      onboardingSessionId: "chat-order-1",
      title: "Onboarding",
      isOnboarding: true,
    });

    expect(order).toEqual(["anon-session", "chat-session"]);
  });

  it("keeps chat-row ensure state on the injected client, not the legacy module cache", async () => {
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
  });
});
