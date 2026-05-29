/**
 * DebugOverlay — DBG-01 (2026-05-28).
 *
 * A dev-only floating bar pinned along the bottom of the viewport, gated
 * on `?debug=true`. Modeled on `NavDebugOverlay` (`?navdebug=1`): it is
 * intentionally OFF-BRAND (debug-vibrant hex, monospace) so it can never
 * be mistaken for product UI, and renders `null` when the param is
 * absent (zero production cost).
 *
 * Router-independent: it reads `window.location.search` directly (not
 * `useLocation`) so it can be mounted ONCE at the app root, beside the
 * RouterProvider, and cover every route.
 *
 * First control: **Reset** → `resetExperience()` returns the app to an
 * unauthenticated, first-time onboarding visitor. The bar is laid out to
 * accept future debug controls (force-compact, frame jump, …) — Reset is
 * the only one today.
 *
 * Styling uses inline `style={}` with hardcoded hex by design (same as
 * NavDebugOverlay); the file is on the `no-hardcoded-styles` allowlist
 * because debug colors are not brand tokens.
 */

import { useEffect, useState, type FC } from "react";

import { resetExperience } from "@/lib/resetExperience";

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "true";
}

export const DebugOverlay: FC = () => {
  const [enabled, setEnabled] = useState<boolean>(debugEnabled);
  const [resetting, setResetting] = useState(false);

  // Re-check on history navigation so a client-side route change that
  // adds/removes `?debug=true` is honored without a reload.
  useEffect(() => {
    const sync = () => setEnabled(debugEnabled());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (!enabled) return null;

  const handleReset = () => {
    if (resetting) return;
    setResetting(true);
    // resetExperience hard-navigates on completion; no need to clear the
    // flag (the page remounts).
    void resetExperience();
  };

  return (
    <div
      data-testid="debug-overlay"
      role="region"
      aria-label="Debug overlay"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483000, // above all app chrome
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 12px",
        backgroundColor: "#1b1b1b",
        borderTop: "2px solid #ffd700",
        color: "#ffd700",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: "0.06em" }}>DEBUG</span>
      <span style={{ color: "#90ee90", opacity: 0.85 }}>?debug=true</span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        data-testid="debug-overlay-reset"
        onClick={handleReset}
        disabled={resetting}
        style={{
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          color: "#1b1b1b",
          backgroundColor: "#ffd700",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: resetting ? "default" : "pointer",
          opacity: resetting ? 0.6 : 1,
        }}
        title="Sign out, clear all session state, and return to first-time onboarding"
      >
        {resetting ? "Resetting…" : "Reset experience"}
      </button>
    </div>
  );
};
