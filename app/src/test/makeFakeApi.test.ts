import { describe, expect, it, vi } from "vitest";

import { makeFakeApi } from "@/test/makeFakeApi";

describe("makeFakeApi", () => {
  it("fills every leaf method with a resolved mock (auto-covers the whole Api shape)", async () => {
    const api = makeFakeApi();

    // grouped standalone modules
    expect(vi.isMockFunction(api.chat.sendChatMessage)).toBe(true);
    expect(vi.isMockFunction(api.session.issueOnboardingSession)).toBe(true);
    expect(vi.isMockFunction(api.scenario.listScenarios)).toBe(true);
    expect(vi.isMockFunction(api.intent.recordIntent)).toBe(true);
    expect(vi.isMockFunction(api.workflow.getGroundXWorkflow)).toBe(true);
    expect(vi.isMockFunction(api.template.saveTemplate)).toBe(true);
    expect(vi.isMockFunction(api.extract.extractField)).toBe(true);
    expect(vi.isMockFunction(api.extract.fetchFieldGeometry)).toBe(true);
    expect(vi.isMockFunction(api.telemetry.captureException)).toBe(true);
    expect(vi.isMockFunction(api.report.renderReport)).toBe(true);
    // a heavy spread namespace from the @/api aggregate — proves no enumeration
    expect(vi.isMockFunction(api.groundxBuckets.listGroundXBuckets)).toBe(true);
    // grouped auth + legacy top-level auth fn
    expect(vi.isMockFunction(api.auth.login)).toBe(true);
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
    await expect(api.scenario.listScenarios()).resolves.toEqual({ bucketId: null, scenarios: [] });
    await expect(api.auth.resetSession()).resolves.toEqual({ success: true });
    await expect(api.extract.extractField({ chatSessionId: "chat-1", field: { name: "x", type: "STRING", description: "x" } })).resolves.toMatchObject({
      value: null,
      confidence: 0,
    });
    await expect(
      api.template.saveTemplate({
        id: "t-1",
        kind: "extract",
        name: "Extract",
        body: { categories: [] },
      }),
    ).resolves.toMatchObject({
      id: "t-1",
      name: "Extract",
    });
    await expect(
      api.report.renderReport({
        templateId: "rt-utility-ic-brief",
        scope: {
          type: "bucket",
          bucketId: 28454,
          filter: { projectId: "proj_c7701da7-0e08-482a-a496-df9dfe991613" },
        },
        chatSessionId: "chat-1",
      }),
    ).resolves.toMatchObject({
      gated: false,
      // No client-side fixture (the locked no-seed decision): the fake returns
      // the graceful no-template/empty render. `report-default-template` extends
      // the fake to return the seeded default template's sections for utility.
      report: {
        templateId: "rt-utility-ic-brief",
        sections: [],
      },
    });
    await expect(
      api.report.saveReportTemplate({
        id: "rt-1",
        name: "Report",
        format: "ic-brief",
        sections: [],
      }),
    ).resolves.toMatchObject({
      id: "rt-1",
      name: "Report",
    });
    await expect(api.auth.getUserData("acct-1")).resolves.toMatchObject({
      customer: { username: "acct-1" },
    });
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

  it("applies grouped auth overrides while leaving sibling auth methods as fakes", async () => {
    const login = vi.fn().mockResolvedValue({ username: "acct-1", token: "", xJwtToken: "" });
    const api = makeFakeApi({ auth: { login } });

    expect(api.auth.login).toBe(login);
    expect(vi.isMockFunction(api.auth.register)).toBe(true);
    expect(vi.isMockFunction(api.auth.getUserData)).toBe(true);
    await expect(api.auth.getUserData("acct-1")).resolves.toMatchObject({
      customer: { username: "acct-1" },
    });
  });
});
