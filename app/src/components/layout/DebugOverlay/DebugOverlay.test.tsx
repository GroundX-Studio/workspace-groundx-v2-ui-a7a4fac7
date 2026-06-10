import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DBG-01 (2026-05-28). Debug overlay gated on `?debug=true`. Router-
// independent (reads window.location.search) so it can mount app-wide.
vi.mock("@/lib/resetExperience", () => ({
  resetExperience: vi.fn().mockResolvedValue(undefined),
}));
import { resetExperience } from "@/lib/resetExperience";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { DebugOverlay } from "./DebugOverlay";

function setSearch(search: string) {
  window.history.pushState({}, "", search ? `/?${search}` : "/");
}

function setUrl(url: string) {
  window.history.pushState({}, "", url);
}

beforeEach(() => {
  vi.mocked(resetExperience).mockClear();
});

afterEach(() => {
  // Unmount FIRST so the DebugOverlay's `history` patch is restored, THEN reset
  // the URL — otherwise the reset's pushState would fire setState on a still-
  // mounted overlay (outside act).
  cleanup();
  setSearch("");
});

describe("DebugOverlay", () => {
  it("renders the bottom bar + Reset control when ?debug=true", () => {
    setSearch("debug=true");
    render(<DebugOverlay />);
    expect(screen.getByTestId("debug-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("debug-overlay-reset")).toBeInTheDocument();
  });

  it("renders nothing without the param", () => {
    setSearch("");
    render(<DebugOverlay />);
    expect(screen.queryByTestId("debug-overlay")).not.toBeInTheDocument();
  });

  it("renders nothing for ?debug=false", () => {
    setSearch("debug=false");
    render(<DebugOverlay />);
    expect(screen.queryByTestId("debug-overlay")).not.toBeInTheDocument();
  });

  it("clicking Reset invokes resetExperience", async () => {
    setSearch("debug=true");
    // The Reset click flips a `resetting` flag; the post-click re-render
    // trips the global console.error-throws-on-act spy (same situation
    // ChatColumn.test handles). Scope a local suppress for this test.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<DebugOverlay />);
    await user.click(screen.getByTestId("debug-overlay-reset"));
    await waitFor(() => expect(resetExperience).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("debug-overlay-reset")).toBeDisabled());
    errSpy.mockRestore();
  });

  // intent-coverage: the intent-firing panel lives inside this single dev menu,
  // surfaced by a toggle that only appears on canvas (onboarding) screens.
  it("hides the Fire-intent toggle off canvas screens", () => {
    setSearch("debug=true"); // path "/"
    render(<DebugOverlay />);
    expect(screen.getByTestId("debug-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("debug-overlay-intents-toggle")).not.toBeInTheDocument();
  });

  it("shows the Fire-intent toggle on canvas screens", () => {
    setUrl("/onboarding/28454/utility?debug=true");
    render(<DebugOverlay />);
    expect(screen.getByTestId("debug-overlay-intents-toggle")).toBeInTheDocument();
  });

  it("re-gates the toggle on a client-side pushState navigation (no popstate, no reload)", () => {
    setUrl("/onboarding/28454/utility?debug=true");
    render(<DebugOverlay />);
    expect(screen.getByTestId("debug-overlay-intents-toggle")).toBeInTheDocument();
    // SPA navigation to a non-canvas screen (keeps ?debug) — react-router style,
    // no popstate fired. The overlay's pushState patch must re-sync the gating.
    act(() => {
      window.history.pushState({}, "", "/projects?debug=true");
    });
    expect(screen.getByTestId("debug-overlay")).toBeInTheDocument(); // still enabled
    expect(screen.queryByTestId("debug-overlay-intents-toggle")).not.toBeInTheDocument(); // gating updated
  });

  it("toggling Fire-intent reveals the single intent panel", async () => {
    setUrl("/onboarding/28454/utility?debug=true");
    // The onboarding providers seed a session asynchronously after the toggle
    // click; those updates trip the global console.error-throws-on-act spy
    // (same situation the Reset test handles). Scope a local suppress.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithOnboardingProviders(<DebugOverlay />, { initialScenario: "utility" });
    expect(screen.queryByTestId("debug-overlay-intents-panel")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("debug-overlay-intents-toggle"));
    await waitFor(() => expect(screen.getByTestId("debug-overlay-intents-panel")).toBeInTheDocument());
    expect(screen.getByTestId("intent-debug-panel")).toBeInTheDocument();
    errSpy.mockRestore();
  });
});
