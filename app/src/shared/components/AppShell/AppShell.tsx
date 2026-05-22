import Box from "@mui/material/Box";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

import { useFocusMode } from "@/shared/hooks/useFocusMode";
import { useResizableSplit } from "@/shared/hooks/useResizableSplit";

import { ResizeHandle } from "./ResizeHandle";

export interface AppShellProps {
  /** Left sidebar — primary nav. Hidden in F1 by passing `hideNav`. */
  nav: ReactNode;
  /** Chat pane (middle column). */
  chat: ReactNode;
  /** Canvas pane (right column). */
  canvas: ReactNode;
  /** When true, the nav column collapses to width 0 (F1 / focus modes). */
  hideNav?: boolean;
  /** Initial chat pane width in px (defaults to 360). */
  initialChatWidth?: number;
  /** Mount in `focus-canvas` mode (BYO upload heavy work) — defaults to split. */
  initialFocus?: "split" | "focus-chat" | "focus-canvas";
}

const NAV_WIDTH = 180;
const RAIL_HEIGHT = "100vh";
const MOTION = { type: "tween", duration: 0.2, ease: "easeOut" } as const;

/**
 * AppShell — the three-column shell for the onboarding + steady experience.
 *
 *   [ nav 180px ][ chat (resizable) ][ ResizeHandle ][ canvas (flex) ]
 *
 * Focus modes (driven by [[useFocusMode]]):
 *   • split          — all three columns
 *   • focus-chat     — canvas hidden (motion: width 0)
 *   • focus-canvas   — chat collapsed to a 48px puck rail
 *
 * Reduced-motion respect: Framer Motion reads
 * `prefers-reduced-motion: reduce` from the OS and skips transitions
 * automatically. We keep the same `layout` prop so structure animates when
 * allowed; the only non-motion thing we set is the `MOTION.duration` which
 * the user agent already overrides.
 */
export function AppShell({ nav, chat, canvas, hideNav = false, initialChatWidth = 360, initialFocus = "split" }: AppShellProps) {
  const { mode, setMode } = useFocusMode({ initial: initialFocus });
  const { width, zone, startDrag, bump, setWidth } = useResizableSplit({ initial: initialChatWidth, min: 0, max: 1200 });

  // Mirror the drag-snap zone into the focus mode (per spec W5: dragging to
  // either extreme is itself a request to enter the corresponding focus mode).
  // We skip the first render so `initialFocus` isn't immediately clobbered by
  // the default zone derived from `initialChatWidth`.
  const lastZoneRef = useRef(zone);
  useEffect(() => {
    if (lastZoneRef.current === zone) return;
    lastZoneRef.current = zone;
    if (zone === "workspace-focus" && mode !== "focus-canvas") setMode("focus-canvas");
    else if (zone === "chat-focus" && mode !== "focus-chat") setMode("focus-chat");
    else if (zone === "split-live" && mode !== "split") setMode("split");
  }, [zone, mode, setMode]);

  const chatVisible = mode !== "focus-canvas";
  const canvasVisible = mode !== "focus-chat";
  const chatWidth = mode === "focus-chat" ? "100%" : mode === "focus-canvas" ? 48 : width;
  const navWidth = hideNav ? 0 : NAV_WIDTH;

  return (
    <LayoutGroup>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          height: RAIL_HEIGHT,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <AnimatePresence initial={false}>
          {!hideNav ? (
            <motion.aside
              key="nav"
              initial={{ width: 0 }}
              animate={{ width: navWidth }}
              exit={{ width: 0 }}
              transition={MOTION}
              style={{ flexShrink: 0, height: "100%", overflow: "hidden" }}
              aria-label="Primary navigation"
            >
              {nav}
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {chatVisible ? (
            <motion.section
              key="chat"
              layout
              initial={{ width: typeof chatWidth === "number" ? chatWidth : "100%" }}
              animate={{ width: chatWidth }}
              exit={{ width: 0 }}
              transition={MOTION}
              style={{ flexShrink: 0, height: "100%", overflow: "hidden", display: "flex" }}
              aria-label="Chat pane"
              data-testid="appshell-chat"
            >
              {chat}
            </motion.section>
          ) : null}
        </AnimatePresence>

        {mode === "split" ? (
          <ResizeHandle value={width} min={0} max={1200} onPointerDown={startDrag} onBump={(delta) => bump(delta)} />
        ) : null}

        <AnimatePresence initial={false}>
          {canvasVisible ? (
            <motion.section
              key="canvas"
              layout
              initial={{ flex: 0 }}
              animate={{ flex: 1 }}
              exit={{ flex: 0 }}
              transition={MOTION}
              style={{ height: "100%", overflow: "hidden", display: "flex" }}
              aria-label="Canvas"
              data-testid="appshell-canvas"
            >
              {canvas}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </Box>
      {/* Hidden hook into setWidth so parents can imperatively restore. */}
      <span data-testid="appshell-width" data-width={width} hidden onClick={() => setWidth(360)} />
    </LayoutGroup>
  );
}
