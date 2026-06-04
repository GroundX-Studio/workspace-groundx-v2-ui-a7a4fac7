import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const initAnalyticsMock = vi.fn();
const initGaMock = vi.fn();
const gaSetDefaultsMock = vi.fn();

vi.mock("@/lib/analytics", () => ({
  initAnalytics: (...args: unknown[]) => initAnalyticsMock(...args),
}));

vi.mock("@/lib/ga", () => ({
  initGa: (...args: unknown[]) => initGaMock(...args),
  gaSetDefaults: (...args: unknown[]) => gaSetDefaultsMock(...args),
}));

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  AnalyticsConsentProvider,
  type AnalyticsConsentConfig,
} from "./AnalyticsConsentProvider";

const configuredTrackers: AnalyticsConsentConfig = {
  posthogApiKey: "phc_test",
  posthogHost: "https://posthog.example",
  gaMeasurementId: "G-TEST123",
  llmProvider: "openai",
};

function renderProvider(config = configuredTrackers) {
  return render(
    <AnalyticsConsentProvider config={config}>
      <div>app body</div>
    </AnalyticsConsentProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  initAnalyticsMock.mockReset();
  initGaMock.mockReset();
  gaSetDefaultsMock.mockReset();
});

describe("AnalyticsConsentProvider", () => {
  it("shows a cold-load consent banner and does not initialize configured trackers before accept", () => {
    renderProvider();

    expect(screen.getByText("app body")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /analytics consent/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /allow analytics/i })).toBeInTheDocument();
    expect(initAnalyticsMock).not.toHaveBeenCalled();
    expect(initGaMock).not.toHaveBeenCalled();
    expect(gaSetDefaultsMock).not.toHaveBeenCalled();
  });

  it("accept initializes configured trackers, stores consent, and hides the banner", async () => {
    const user = userEvent.setup();
    renderProvider();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /allow analytics/i }));
    });

    await waitFor(() => {
      expect(initAnalyticsMock).toHaveBeenCalledWith("phc_test", "https://posthog.example");
      expect(initGaMock).toHaveBeenCalledWith("G-TEST123");
      expect(gaSetDefaultsMock).toHaveBeenCalledWith({ llmProvider: "openai" });
    });
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("accepted");
    expect(screen.queryByRole("region", { name: /analytics consent/i })).not.toBeInTheDocument();
  });

  it("restores accepted consent and initializes trackers without showing the banner", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "accepted");

    renderProvider();

    expect(screen.queryByRole("region", { name: /analytics consent/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(initAnalyticsMock).toHaveBeenCalledWith("phc_test", "https://posthog.example");
      expect(initGaMock).toHaveBeenCalledWith("G-TEST123");
    });
  });

  it("is a no-op and shows no banner when no frontend analytics provider is configured", () => {
    renderProvider({
      posthogApiKey: undefined,
      posthogHost: undefined,
      gaMeasurementId: undefined,
      llmProvider: undefined,
    });

    expect(screen.getByText("app body")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /analytics consent/i })).not.toBeInTheDocument();
    expect(initAnalyticsMock).not.toHaveBeenCalled();
    expect(initGaMock).not.toHaveBeenCalled();
    expect(gaSetDefaultsMock).not.toHaveBeenCalled();
  });
});
