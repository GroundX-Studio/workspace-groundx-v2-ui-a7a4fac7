/**
 * BookCallView (viewer-widget) — F6a viewer surface.
 *
 * Split from the combined BookCallView.test.tsx in ARCH-03 (2026-05-26)
 * when widgets moved into slot-scoped directories. The chat-side
 * (BookingStatusCard) tests live alongside that widget at
 * `chat-widgets/BookingStatusCard/BookingStatusCard.test.tsx`.
 *
 * Migrated to the role+scope widget contract in 2026-05-30-widget-role-access
 * Phase 2b. BookCallView's matrix row (docs/agents/widget-access-matrix.md):
 *   • availability: anonymous ✅ / member ✅ (all roles)
 *   • affordance lock: none — identical render under both roles
 *   • scope: { type: "none" } (not a ScopedViewerWidget)
 * The retired `mode` prop encoded surrounding-chrome (close button /
 * breadcrumbs), which is the host's concern — re-sourced to layout/flow,
 * NOT renamed to `role`.
 */

import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { BookCallView } from "./BookCallView";

const UTILITY = "utility" as const;

/** BookCallView is not a ScopedViewerWidget — its scope is explicit "none". */
const NONE_SCOPE: WidgetScope = { type: "none" };

/** The two roles BookCallView is available to today (matrix: all roles). */
const ROLES: WidgetRole[] = ["anonymous", "member"];
const GROUNDX_ENGINEER_CALENDLY_URL =
  "https://calendly.com/d/d3wn-ryv-rmr/30-minutes-with-a-groundx-engineer";

const initInlineWidget = vi.fn();
let originalMatchMedia: typeof window.matchMedia;

function installCalendlyMock() {
  (window as unknown as { Calendly?: { initInlineWidget: typeof initInlineWidget } }).Calendly = {
    initInlineWidget,
  };
}

function mockPhoneViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("max-width") || query.includes("prefers-reduced-motion") || query.includes("reduce"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  });
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  initInlineWidget.mockReset();
  installCalendlyMock();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: originalMatchMedia,
  });
  delete (window as unknown as { Calendly?: unknown }).Calendly;
  document
    .querySelectorAll('[data-calendly-embed-asset="true"]')
    .forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("BookCallView (viewer)", () => {
  describe.each(ROLES)("role=%s", (role) => {
    it("initializes Calendly's inline widget inside the owned viewer parent", async () => {
      renderWithOnboardingProviders(
        <BookCallView role={role} scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
        {
          initialFrame: "f2",
          initialScenario: UTILITY,
        },
      );
      const parent = screen.getByTestId("book-call-calendly");
      expect(parent).toBeInTheDocument();
      expect(parent.tagName).not.toBe("IFRAME");
      expect(parent).not.toHaveClass("calendly-inline-widget");
      await waitFor(() => {
        expect(initInlineWidget).toHaveBeenCalledWith(
          expect.objectContaining({
            url: GROUNDX_ENGINEER_CALENDLY_URL,
            parentElement: parent,
          }),
        );
      });
    });

    it("falls back to an inline empty-state when VITE_CALENDLY_URL is unset", () => {
      renderWithOnboardingProviders(
        <BookCallView role={role} scope={NONE_SCOPE} calendlyUrl="" />,
        {
          initialFrame: "f2",
          initialScenario: UTILITY,
        },
      );
      expect(screen.queryByTestId("book-call-calendly")).not.toBeInTheDocument();
      expect(screen.getByTestId("book-call-calendly-unset")).toBeInTheDocument();
      expect(initInlineWidget).not.toHaveBeenCalled();
    });

    it("embed parent has an accessible label before Calendly injects its iframe", () => {
      renderWithOnboardingProviders(
        <BookCallView role={role} scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
        {
          initialFrame: "f2",
          initialScenario: UTILITY,
        },
      );
      expect(screen.getByLabelText("Book a call · Calendly embed")).toBeInTheDocument();
    });

    it("shows a visible loading status outside the blank Calendly embed area", async () => {
      renderWithOnboardingProviders(
        <BookCallView role={role} scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
        {
          initialFrame: "f2",
          initialScenario: UTILITY,
        },
      );
      await waitFor(() => expect(initInlineWidget).toHaveBeenCalled());
      const loading = screen.getByTestId("book-call-calendly-loading");
      const embed = screen.getByTestId("book-call-calendly");
      expect(loading).toHaveTextContent(/loading booking calendar/i);
      expect(embed).not.toContainElement(loading);
    });

    it("emits the widget-contract data attributes (slot + role)", () => {
      renderWithOnboardingProviders(<BookCallView role={role} scope={NONE_SCOPE} />, {
        initialFrame: "f2",
        initialScenario: UTILITY,
      });
      const root = document.querySelector('[data-widget="book-call-view"]');
      expect(root).not.toBeNull();
      expect(root?.getAttribute("data-role")).toBe(role);
    });
  });

  // Matrix row assertion: BookCallView is available to ALL roles with NO
  // affordance lock — the rendered surface is identical under both roles.
  it("renders identically under anonymous and member (no affordance lock)", () => {
    const { unmount } = renderWithOnboardingProviders(
      <BookCallView role="anonymous" scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
      { initialFrame: "f2", initialScenario: UTILITY },
    );
    const anonHasEmbedParent = screen.queryByTestId("book-call-calendly") != null;
    unmount();

    renderWithOnboardingProviders(
      <BookCallView role="member" scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
      {
        initialFrame: "f2",
        initialScenario: UTILITY,
      },
    );
    const memberHasEmbedParent = screen.queryByTestId("book-call-calendly") != null;

    expect(memberHasEmbedParent).toBe(anonHasEmbedParent);
    expect(memberHasEmbedParent).toBe(true);
  });

  it("clears the app-owned loading status after Calendly's iframe loads", async () => {
    initInlineWidget.mockImplementation(({ parentElement }: { parentElement: HTMLElement }) => {
      const iframe = document.createElement("iframe");
      parentElement.appendChild(iframe);
      setTimeout(() => iframe.dispatchEvent(new Event("load")), 0);
    });

    renderWithOnboardingProviders(
      <BookCallView role="anonymous" scope={NONE_SCOPE} calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL} />,
      { initialFrame: "f2", initialScenario: UTILITY },
    );

    expect(screen.getByTestId("book-call-calendly-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("book-call-calendly-loading")).not.toBeInTheDocument();
    });
  });

  it("reflects the required role prop on data-role", () => {
    renderWithOnboardingProviders(<BookCallView role="anonymous" scope={NONE_SCOPE} />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="book-call-view"]');
    expect(root?.getAttribute("data-role")).toBe("anonymous");
  });

  it("uses an external calendar action on phone widths instead of forcing the inline iframe", () => {
    mockPhoneViewport();
    renderWithOnboardingProviders(
      <BookCallView
        role="anonymous"
        scope={NONE_SCOPE}
        calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL}
      />,
      { initialFrame: "f2", initialScenario: UTILITY },
    );

    expect(screen.getByTestId("book-call-calendly-mobile")).toBeInTheDocument();
    expect(screen.queryByTestId("book-call-calendly")).not.toBeInTheDocument();
    expect(screen.getByTestId("book-call-mobile-open")).toHaveAttribute(
      "href",
      GROUNDX_ENGINEER_CALENDLY_URL,
    );
    expect(initInlineWidget).not.toHaveBeenCalled();
  });

  it("fires onScheduled only for trusted Calendly event_scheduled messages", async () => {
    const onScheduled = vi.fn();
    renderWithOnboardingProviders(
      <BookCallView
        role="anonymous"
        scope={NONE_SCOPE}
        calendlyUrl={GROUNDX_ENGINEER_CALENDLY_URL}
        onScheduled={onScheduled}
      />,
      { initialFrame: "f2", initialScenario: UTILITY },
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "calendly.event_scheduled", payload: { event: { uri: "x" } } },
        origin: "https://evil.example.com",
      }),
    );
    expect(onScheduled).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "calendly.event_scheduled", payload: { event: { uri: "x" } } },
        origin: "https://calendly.com",
      }),
    );
    await waitFor(() => expect(onScheduled).toHaveBeenCalledTimes(1));
  });
});
