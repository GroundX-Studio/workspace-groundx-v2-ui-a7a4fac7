import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DBG-01 (2026-05-28). Debug overlay gated on `?debug=true`. Router-
// independent (reads window.location.search) so it can mount app-wide.
vi.mock("@/lib/resetExperience", () => ({
  resetExperience: vi.fn().mockResolvedValue(undefined),
}));
import { resetExperience } from "@/lib/resetExperience";

import { DebugOverlay } from "./DebugOverlay";

function setSearch(search: string) {
  window.history.pushState({}, "", search ? `/?${search}` : "/");
}

beforeEach(() => {
  vi.mocked(resetExperience).mockClear();
});

afterEach(() => {
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
});
