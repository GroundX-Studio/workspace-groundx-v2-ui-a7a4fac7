import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

/**
 * CORNERSTONE (standardized-viewer-control, T1).
 *
 * The onboarding "Pick a view" pills (one per extraction-schema category) must
 * open the Extract workbench focused on the clicked category — and, critically,
 * RE-FOCUS the live Extract view when it is already shown. Today they steer
 * focus through a non-reactive `?focus=` URL param read once at Extract mount,
 * so re-clicking a different pill does nothing. This test asserts the
 * user-visible canvas state and is expected to FAIL until the pills dispatch
 * `showExtract` with `focusedCategoryId` through the orchestrator (T9).
 */
describe("OnboardingShell — pick-a-view pills focus the Extract category (cornerstone)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicking a category pill re-focuses the already-shown Extract workbench live", () => {
    renderWithOnboardingProviders(<OnboardingShell />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });

    // Complete the Understand "reading" thinking-stream → auto-advance to
    // Extract (Option A) and reveal the Pick-a-view pills.
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }

    // The canvas is ALREADY the Extract workbench (auto-advance), focused on
    // the first category — NOT yet on Meters.
    const canvas = screen.getByTestId("scoped-canvas");
    expect(canvas).toHaveAttribute("data-canvas-kind", "extract-workbench");
    const focusedCategory = () => screen.getByTestId("extract-topbar-title").textContent ?? "";
    expect(focusedCategory()).not.toContain("meters");

    // Clicking "Meters" must re-focus the live (already-mounted) Extract to the
    // Meters category. The bug this fixes: the pill did nothing because focus
    // was steered by a non-reactive `?focus=` URL read once at mount.
    act(() => {
      screen.getByTestId("onboarding-chat-pick-view-meters").click();
    });
    expect(focusedCategory()).toContain("meters");
  });
});
