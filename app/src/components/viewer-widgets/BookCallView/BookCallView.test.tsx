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

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { BookCallView } from "./BookCallView";

const UTILITY = "utility" as const;

/** BookCallView is not a ScopedViewerWidget — its scope is explicit "none". */
const NONE_SCOPE: WidgetScope = { type: "none" };

/** The two roles BookCallView is available to today (matrix: all roles). */
const ROLES: WidgetRole[] = ["anonymous", "member"];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BookCallView (viewer)", () => {
  describe.each(ROLES)("role=%s", (role) => {
    it("renders the Calendly iframe with the configured URL", () => {
      // VITE_CALENDLY_URL is read at module load; the vite-defined value
      // for the test env is `https://calendly.com/benjamin-fletcher-ey`
      // (see app/.env.local) which vitest exposes via import.meta.env.
      // We accept any URL that starts with "https://calendly.com/" so a
      // future per-deploy override doesn't break this contract test.
      renderWithOnboardingProviders(<BookCallView role={role} scope={NONE_SCOPE} />, {
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
      renderWithOnboardingProviders(<BookCallView role={role} scope={NONE_SCOPE} />, {
        initialFrame: "f2",
        initialScenario: UTILITY,
      });
      expect(screen.queryByTestId("book-call-calendly")).not.toBeInTheDocument();
      expect(screen.getByTestId("book-call-calendly-unset")).toBeInTheDocument();
      vi.unstubAllEnvs();
    });

    it("iframe has an accessible title (WCAG 2.4.1)", () => {
      renderWithOnboardingProviders(<BookCallView role={role} scope={NONE_SCOPE} />, {
        initialFrame: "f2",
        initialScenario: UTILITY,
      });
      const iframe = screen.getByTestId("book-call-calendly");
      expect(iframe.getAttribute("title")).toMatch(/calendly|book.*call|schedule/i);
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
      <BookCallView role="anonymous" scope={NONE_SCOPE} />,
      { initialFrame: "f2", initialScenario: UTILITY },
    );
    const anonHasIframe = screen.queryByTestId("book-call-calendly") != null;
    unmount();

    renderWithOnboardingProviders(<BookCallView role="member" scope={NONE_SCOPE} />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const memberHasIframe = screen.queryByTestId("book-call-calendly") != null;

    expect(memberHasIframe).toBe(anonHasIframe);
    expect(memberHasIframe).toBe(true);
  });

  it("reflects the required role prop on data-role", () => {
    renderWithOnboardingProviders(<BookCallView role="anonymous" scope={NONE_SCOPE} />, {
      initialFrame: "f2",
      initialScenario: UTILITY,
    });
    const root = document.querySelector('[data-widget="book-call-view"]');
    expect(root?.getAttribute("data-role")).toBe("anonymous");
  });
});
