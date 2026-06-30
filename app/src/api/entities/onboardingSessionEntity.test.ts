import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import axios from "@/api/axios";

import { issueOnboardingSession } from "./onboardingSessionEntity";

describe("onboardingSessionEntity", () => {
  beforeEach(() => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { sessionId: "sess_x", anonymous: true } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to /api/onboarding/session and returns the session shape", async () => {
    const response = await issueOnboardingSession();
    expect(response).toEqual({ sessionId: "sess_x", anonymous: true });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.post).mock.calls[0]?.[0]).toContain("/onboarding/session");
  });
});
