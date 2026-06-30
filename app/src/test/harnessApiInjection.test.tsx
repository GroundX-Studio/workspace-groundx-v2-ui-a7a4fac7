import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useApi } from "@/contexts/ApiContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

/**
 * Proves the render harness injects the `Api` fake by default — a consumer can
 * call `useApi()` and override a single method WITHOUT any `vi.mock("@/api/...")`.
 */
const Probe = () => {
  const api = useApi();
  return <div data-testid="kind">{typeof api.session.issueOnboardingSession}</div>;
};

describe("render harness injects the Api fake", () => {
  it("mounts a useApi() consumer with no per-test module mock", () => {
    renderWithOnboardingProviders(<Probe />);
    expect(screen.getByTestId("kind").textContent).toBe("function");
  });

  it("honors a targeted override passed via the harness", async () => {
    const issueOnboardingSession = vi.fn().mockResolvedValue({ sessionId: "s_1", anonymous: true });

    const Caller = () => {
      const api = useApi();
      void api.session.issueOnboardingSession();
      return <div>ok</div>;
    };

    renderWithOnboardingProviders(<Caller />, {
      api: { session: { issueOnboardingSession } },
    });

    expect(issueOnboardingSession).toHaveBeenCalledTimes(1);
  });
});
