/**
 * DL-2 (e2e-experience-audit): React Router logged ~24× "v7 Future Flag"
 * console warnings across the audit. Opting into the future flags silences
 * them and pre-adopts the v7 behavior. This guards that the shared
 * `ROUTER_FUTURE_FLAGS` actually suppresses the warnings (and that the flags
 * aren't silently dropped).
 */
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROUTER_FUTURE_FLAGS } from "./router";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("router future flags (DL-2)", () => {
  it("suppress the React Router v7 future-flag console warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createMemoryRouter([{ path: "/", element: <div data-testid="ok" /> }]);
    // `v7_startTransition` is a RouterProvider future flag (NOT a data-router
    // `future` arg) — apply it exactly as App.tsx does.
    render(<RouterProvider router={r} future={ROUTER_FUTURE_FLAGS} />);
    const futureWarnings = warn.mock.calls
      .flat()
      .filter((a) => typeof a === "string" && /Future Flag/.test(a));
    expect(futureWarnings).toHaveLength(0);
  });

  it("opts into v7_startTransition (the flag the audit observed warning)", () => {
    expect(ROUTER_FUTURE_FLAGS.v7_startTransition).toBe(true);
  });
});
