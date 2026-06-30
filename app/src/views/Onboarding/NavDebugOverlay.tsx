/**
 * NavDebugOverlay — temporary in-page diagnostic for tracing why the
 * onboarding nav appears collapsed in some browsers when the
 * headless-Chromium dev preview shows it fully expanded.
 *
 * Activation: append `?navdebug=1` to the URL. Renders a fixed pill in
 * the bottom-right corner showing:
 *   • window.innerWidth + screen.width + devicePixelRatio
 *   • matchMedia results for the breakpoints the layout cares about
 *   • whether AppShell compact mode triggered + the actual nav width
 *   • the React-pinned navCollapsed prop value
 *
 * Polls every 250 ms so live-resize feedback is immediate. Take a
 * screenshot when the bug reproduces and the overlay tells us
 * everything we need.
 */

import Box from "@mui/material/Box";
import { useEffect, useState, type FC } from "react";
import { useLocation } from "react-router-dom";

interface DebugSnapshot {
  innerWidth: number;
  outerWidth: number;
  screenWidth: number;
  documentClientWidth: number;
  dpr: number;
  mqDownMd: boolean;
  mqUpMd: boolean;
  hasCompactTopbar: boolean;
  hasNav: boolean;
  navWidth: number;
  appShellReducedMotion: string | null;
  userAgent: string;
}

function readSnapshot(): DebugSnapshot {
  const nav = document.querySelector('[data-testid="onboarding-nav"]') as HTMLElement | null;
  const compactTopbar = document.querySelector('[data-testid="appshell-compact-topbar"]');
  const shellRoot = document.querySelector("[data-app-shell-reduced-motion]");
  return {
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    screenWidth: window.screen?.width ?? 0,
    documentClientWidth: document.documentElement.clientWidth,
    dpr: window.devicePixelRatio,
    mqDownMd: window.matchMedia("(max-width:899.95px)").matches,
    mqUpMd: window.matchMedia("(min-width:900px)").matches,
    hasCompactTopbar: !!compactTopbar,
    hasNav: !!nav,
    navWidth: nav?.getBoundingClientRect().width ?? 0,
    appShellReducedMotion: shellRoot?.getAttribute("data-app-shell-reduced-motion") ?? null,
    userAgent: navigator.userAgent,
  };
}

export const NavDebugOverlay: FC = () => {
  const location = useLocation();
  const enabled = new URLSearchParams(location.search).get("navdebug") === "1";
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const update = () => setSnap(readSnapshot());
    update();
    const id = window.setInterval(update, 250);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  if (!enabled || !snap) return null;

  const wouldCompact = snap.mqDownMd;
  const compactMatches = wouldCompact === snap.hasCompactTopbar;

  return (
    <Box
      data-testid="nav-debug-overlay"
      sx={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        backgroundColor: "rgba(11, 19, 43, 0.92)",
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.5,
        padding: "10px 12px",
        borderRadius: 6,
        maxWidth: 380,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        pointerEvents: "none",
      }}
    >
      <Box sx={{ fontWeight: 700, mb: 0.5, color: "#90ee90" }}>nav-debug</Box>
      <Box>innerWidth: <b>{snap.innerWidth}</b></Box>
      <Box>outerWidth: {snap.outerWidth}</Box>
      <Box>screen.width: {snap.screenWidth}</Box>
      <Box>documentElement.clientWidth: {snap.documentClientWidth}</Box>
      <Box>devicePixelRatio: <b>{snap.dpr}</b></Box>
      <Box sx={{ mt: 0.5, color: "#ffd700" }}>
        mq (max-width:899.95px): <b>{String(snap.mqDownMd)}</b>
      </Box>
      <Box sx={{ color: "#ffd700" }}>
        mq (min-width:900px): <b>{String(snap.mqUpMd)}</b>
      </Box>
      <Box sx={{ mt: 0.5 }}>
        AppShell compact topbar: <b style={{ color: snap.hasCompactTopbar ? "#ff7070" : "#90ee90" }}>{String(snap.hasCompactTopbar)}</b>
      </Box>
      <Box>
        nav mounted: <b>{String(snap.hasNav)}</b>, navWidth: <b>{snap.navWidth}px</b>
      </Box>
      <Box sx={{ mt: 0.5, color: compactMatches ? "#90ee90" : "#ff7070" }}>
        invariant ok: <b>{String(compactMatches)}</b>
      </Box>
      <Box sx={{ mt: 0.5, fontSize: 9, opacity: 0.7, wordBreak: "break-all" }}>
        UA: {snap.userAgent}
      </Box>
    </Box>
  );
};
