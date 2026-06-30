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

import { IntentDebugPanel } from "./IntentDebugPanel";

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "true";
}

/**
 * The intent-firing panel is only meaningful on the canvas-bearing onboarding
 * screens (where the CanvasOrchestrator + ChatStore drive a visible canvas).
 * On other screens (marketing, auth) the toggle is hidden.
 */
function onCanvasScreen(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/onboarding");
}

export const DebugOverlay: FC = () => {
  const [enabled, setEnabled] = useState<boolean>(debugEnabled);
  const [canvasScreen, setCanvasScreen] = useState<boolean>(onCanvasScreen);
  const [showIntents, setShowIntents] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Re-check on back/forward (`popstate`) — unconditional + cheap, like the
  // original DBG-01 behavior.
  useEffect(() => {
    const sync = () => {
      setEnabled(debugEnabled());
      setCanvasScreen(onCanvasScreen());
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // While the dev menu is active, ALSO re-sync on client-side navigations
  // (`pushState`/`replaceState`) — react-router uses those and does NOT fire
  // `popstate`, so the "Fire intent" toggle's screen-gating would otherwise go
  // stale when navigating between canvas and non-canvas screens. Patched only
  // while enabled and fully restored on cleanup, so production users (no
  // `?debug=true`) never touch the wrapped `history` methods.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const sync = () => {
      setEnabled(debugEnabled());
      setCanvasScreen(onCanvasScreen());
    };
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
      const result = origPush(...args);
      sync();
      return result;
    }) as History["pushState"];
    window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
      const result = origReplace(...args);
      sync();
      return result;
    }) as History["replaceState"];
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, [enabled]);

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
      {canvasScreen && (
        <button
          type="button"
          data-testid="debug-overlay-intents-toggle"
          aria-expanded={showIntents}
          onClick={() => setShowIntents((v) => !v)}
          style={{
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            color: showIntents ? "#1b1b1b" : "#ffd700",
            backgroundColor: showIntents ? "#ffd700" : "transparent",
            border: "1px solid #ffd700",
            borderRadius: 4,
            padding: "4px 12px",
            cursor: "pointer",
          }}
          title="Fire any chat intent at the live canvas (no LLM call)"
        >
          {showIntents ? "Hide intents ▾" : "Fire intent ▸"}
        </button>
      )}
      {canvasScreen && showIntents && (
        <div
          data-testid="debug-overlay-intents-panel"
          style={{ position: "absolute", right: 12, bottom: "100%", marginBottom: 6 }}
        >
          <IntentDebugPanel />
        </div>
      )}
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
