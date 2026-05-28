/**
 * BookingStatusCard (chat-widget) — F6a chat surface.
 *
 * Split from the combined BookCallView.test.tsx in ARCH-03 (2026-05-26)
 * when widgets moved into slot-scoped directories. The viewer-side
 * (BookCallView) tests live at
 * `viewer-widgets/BookCallView/BookCallView.test.tsx`.
 *
 * Tests the compact "BOOKING IN PROGRESS" chat surface that appears
 * while the BookCallView iframe is mounted in the viewer pane.
 */

import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { BookingStatusCard } from "./BookingStatusCard";

const UTILITY = "utility" as const;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BookingStatusCard (chat)", () => {
  it("renders the BOOKING IN PROGRESS status card per wireframe", () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const card = screen.getByTestId("book-call-chat-status");
    expect(card).toBeInTheDocument();
    expect(card.textContent ?? "").toMatch(/booking in progress/i);
  });

  it("offers a back-to-sign-in affordance that clears ?bookCall=1", async () => {
    const user = userEvent.setup();
    let urlSearch = "";
    const LocationProbe = () => {
      const loc = useLocation();
      urlSearch = loc.search;
      return null;
    };
    renderWithOnboardingProviders(
      <>
        <BookingStatusCard mode="onboarding" />
        <LocationProbe />
      </>,
      {
        initialFrame: "f2",
        initialScenario: UTILITY,
        initialUrl: "/onboarding/28454/utility?bookCall=1",
      },
    );
    // Sanity: probe sees the seeded param before the click
    expect(urlSearch.includes("bookCall=1")).toBe(true);
    const back = screen.getByTestId("book-call-back");
    expect(back).toBeInTheDocument();
    await user.click(back);
    await waitFor(() => {
      expect(urlSearch.includes("bookCall=1")).toBe(false);
    });
  });

  it("includes the wireframe's What we'll cover bullets", () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const panel = screen.getByLabelText("Book a call · status");
    const text = panel.textContent ?? "";
    expect(text).toMatch(/document type|volume|accuracy/i);
    expect(text).toMatch(/your current stack|where groundx fits/i);
    expect(text).toMatch(/pilot|eval/i);
  });

  it("clarifies that booking does not sign the user in", () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const panel = screen.getByLabelText("Book a call · status");
    expect(panel.textContent ?? "").toMatch(/doesn[''′]?t sign you in|still send a magic link|booking.*not.*sign/i);
  });

  // Widget contract — slot/mode attribute introspection.
  it("emits the widget-contract data attributes (slot + mode)", () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="booking-status-card"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-mode")).toBe("onboarding");
  });

  it("respects an explicit mode prop", () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="steady" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="booking-status-card"]');
    expect(root?.getAttribute("data-mode")).toBe("steady");
  });
});

describe("BookingStatusCard — postMessage from Calendly", () => {
  it("commits the gate when Calendly fires calendly.event_scheduled", async () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    expect(screen.queryByTestId("book-call-confirmed")).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event: "calendly.event_scheduled", payload: { event: { uri: "x" } } },
          origin: "https://calendly.com",
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("book-call-confirmed")).toBeInTheDocument();
    });
  });

  it("ignores postMessage from non-Calendly origins (security guard)", async () => {
    renderWithOnboardingProviders(<BookingStatusCard mode="onboarding" />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event: "calendly.event_scheduled" },
          origin: "https://evil.example.com",
        }),
      );
    });
    expect(screen.queryByTestId("book-call-confirmed")).not.toBeInTheDocument();
  });
});
