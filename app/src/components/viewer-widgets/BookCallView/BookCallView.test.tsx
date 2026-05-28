/**
 * BookCallView (viewer-widget) — F6a viewer surface.
 *
 * Split from the combined BookCallView.test.tsx in ARCH-03 (2026-05-26)
 * when widgets moved into slot-scoped directories. The chat-side
 * (BookingStatusCard) tests live alongside that widget at
 * `chat-widgets/BookingStatusCard/BookingStatusCard.test.tsx`.
 */

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { BookCallView } from "./BookCallView";

const UTILITY = "utility" as const;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BookCallView (viewer)", () => {
  it("renders the Calendly iframe with the configured URL", () => {
    // VITE_CALENDLY_URL is read at module load; the vite-defined value
    // for the test env is `https://calendly.com/benjamin-fletcher-ey`
    // (see app/.env.local) which vitest exposes via import.meta.env.
    // We accept any URL that starts with "https://calendly.com/" so a
    // future per-deploy override doesn't break this contract test.
    renderWithOnboardingProviders(<BookCallView mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const iframe = screen.getByTestId("book-call-calendly");
    expect(iframe).toBeInTheDocument();
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.getAttribute("src")).toMatch(/^https:\/\/calendly\.com\//);
  });

  it("falls back to an inline empty-state when VITE_CALENDLY_URL is unset", () => {
    vi.stubEnv("VITE_CALENDLY_URL", "");
    renderWithOnboardingProviders(<BookCallView mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    expect(screen.queryByTestId("book-call-calendly")).not.toBeInTheDocument();
    expect(screen.getByTestId("book-call-calendly-unset")).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("iframe has an accessible title (WCAG 2.4.1)", () => {
    renderWithOnboardingProviders(<BookCallView mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const iframe = screen.getByTestId("book-call-calendly");
    expect(iframe.getAttribute("title")).toMatch(/calendly|book.*call|schedule/i);
  });

  // Widget contract — slot/mode attribute introspection.
  it("emits the widget-contract data attributes (slot + mode)", () => {
    renderWithOnboardingProviders(<BookCallView mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="book-call-view"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-mode")).toBe("onboarding");
  });

  it("respects an explicit mode prop", () => {
    renderWithOnboardingProviders(<BookCallView mode="steady" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="book-call-view"]');
    expect(root?.getAttribute("data-mode")).toBe("steady");
  });
});
