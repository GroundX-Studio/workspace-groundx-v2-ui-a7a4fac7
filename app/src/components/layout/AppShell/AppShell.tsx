import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import {
  BORDER,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";

/**
 * Floating-panels look (2026-05-29): the shell sits on a warm "desk"; the
 * chat + canvas render as elevated white cards with a gutter between them,
 * instead of two flat beige panels abutting. Shared card styling here.
 */
const FLOATING_CARD_SX = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  m: 1,
  borderRadius: BORDER_RADIUS_CARD,
  backgroundColor: WHITE,
  border: `1px solid ${BORDER}`,
  // Lifted enough to read against the cool-gray desk below.
  boxShadow: `0 6px 20px ${alpha(NAVY, 0.12)}`,
} as const;

/**
 * The "desk" the cards float on — a soft cool-gray (navy doesn't work as a
 * full background). Distinct enough from the cards' white/warm to read.
 */
const FLOATING_DESK_BG = alpha(NAVY, 0.08);

/** Canvas card: like the chat card but borderless so the PDF viewer fills it
 *  edge-to-edge (just the rounded corners, no gray frame). */
const FLOATING_CANVAS_CARD_SX = { ...FLOATING_CARD_SX, border: "none" } as const;
import { useFocusMode } from "@/shared/hooks/useFocusMode";
import { useResizableSplit } from "@/shared/hooks/useResizableSplit";

import { ResizeHandle } from "./ResizeHandle";

export interface AppShellProps {
  /** Left sidebar — primary nav. Hidden in F1 by passing `hideNav`. */
  nav: ReactNode;
  /**
   * Optional header content rendered ABOVE the chat | canvas split,
   * to the right of the nav. Use this for things that conceptually
   * span both panes — e.g. the F2+ onboarding StepStrip, which lives
   * here so it can use the full chat+canvas row instead of being
   * crammed inside just the canvas pane. In compact (drawer) mode the
   * header still renders, above whichever single pane is active.
   */
  header?: ReactNode;
  /** Chat pane (middle column). */
  chat: ReactNode;
  /** Canvas pane (right column). */
  canvas: ReactNode;
  /** When true, the nav column collapses to width 0 (F1 / focus modes). */
  hideNav?: boolean;
  /**
   * When true, the chat column is omitted entirely (no motion.section,
   * no drag handle). Canvas fills the full right-of-nav width.
   * Symmetric to `hideNav`. Used by the onboarding F1 picker, which
   * has no chat column at all. Distinct from `initialFocus="focus-canvas"`
   * which leaves a 48px chat puck rail — for F1 we want the chat slot
   * GONE, not collapsed.
   *
   * ARCH-06A (2026-05-26). Pairs with `hideNav` so the same AppShell
   * instance can represent every onboarding + steady surface, with the
   * chat-vs-no-chat distinction expressed via this prop rather than a
   * parallel shell mount.
   */
  hideChat?: boolean;
  /** Initial chat pane width in px (defaults to 360). */
  initialChatWidth?: number;
  /** Mount in `focus-canvas` mode (BYO upload heavy work) — defaults to split. */
  initialFocus?: "split" | "focus-chat" | "focus-canvas";
  /**
   * Width of the nav column in px. Defaults to 180 (the design width).
   * Pass 48 when the consumer's nav component is in its collapsed-rail
   * mode so the `<aside>` doesn't leave a phantom 132px gap between
   * the nav and the chat pane. The aside still animates between
   * widths via framer-motion when this prop changes.
   */
  navWidth?: number;
  /**
   * Force the compact (mobile/tablet) layout. When unset, the shell
   * auto-detects via `theme.breakpoints.down("md")` (i.e. < 900px).
   *
   * Compact mode:
   *   - The three-pane flex row collapses to a single visible pane.
   *   - The nav slot is hidden from the flex row entirely.
   *   - A sticky top bar appears with a hamburger (reveals the nav as
   *     a drawer overlay) and a chat/canvas swap button.
   *   - Initial focus is `focus-chat` so chat fills the viewport.
   *
   * Tests pass an explicit boolean because jsdom's matchMedia stub
   * always reports `false`.
   */
  compact?: boolean;
}

const DEFAULT_NAV_WIDTH = 180;
const RAIL_HEIGHT = "100vh";
const MOTION = { type: "tween", duration: 0.2, ease: "easeOut" } as const;
// When the OS reports `prefers-reduced-motion: reduce`, swap MOTION for
// a zero-duration transition so the layout still settles into its new
// dimensions without animating.
const MOTION_REDUCED = { type: "tween", duration: 0, ease: "easeOut" } as const;
/**
 * localStorage key for the drag-resize width. Versioned so we can
 * invalidate stored values cleanly if the layout band ever changes.
 */
// Bumped from v1 → v2 on 2026-05-25 to invalidate any stored value
// from before the drag-clamp fix. Old v1 values could be anywhere in
// 0..1200 (including focus-mode zones); v2 values are guaranteed to
// be inside MIN_CHAT_PANE_PX..MIN_CHAT_PANE_PX+1000 so they always
// keep both panes visible.
const CHAT_WIDTH_STORAGE_KEY = "appshell.chatWidth.v2";

/**
 * Minimum width the chat pane must keep when the user drags the
 * divider. Picked at 280 to keep a usable chat column at the spec's
 * split-live lower bound. The canvas is implicitly protected by the
 * "max chat = 50% of split area" rule below, so we don't need a
 * separate canvas minimum on desktop.
 */
const MIN_CHAT_PANE_PX = 280;

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
 * Compact mode (mobile/tablet portrait, < md / 900px):
 *   • The split layout breaks below md: chat is pinned to its design
 *     width and canvas is squeezed to 0. Compact mode renders one pane
 *     at a time, drops the nav into a drawer, and gives the user
 *     hamburger + chat/canvas swap controls in a top bar.
 *
 * Reduced-motion respect: we read `prefers-reduced-motion: reduce`
 * directly via `useMediaQuery` and swap the per-element `transition`
 * prop for a zero-duration variant when the user has the OS preference
 * set. Framer Motion does NOT automatically respect the OS pref when
 * an explicit `transition` is provided, so the gate lives here, not in
 * a `<MotionConfig>` wrapper (which would also conflict with the test
 * harness's `<MotionConfig reducedMotion="always">` outer wrapper).
 */
export function AppShell({
  nav,
  header,
  chat,
  canvas,
  hideNav = false,
  hideChat = false,
  initialChatWidth = 360,
  initialFocus = "split",
  navWidth: navWidthProp = DEFAULT_NAV_WIDTH,
  compact: compactProp,
}: AppShellProps) {
  // ARCH-06A: stable per-mount id surfaced as `data-shell-instance` on
  // the root. Consumers (ARCH-06B's OnboardingShell test) assert this
  // is stable across re-renders to prove the same AppShell survives a
  // surface transition without remounting. `useId` is React's
  // built-in stable-across-renders unique id; suitable for this attr.
  const shellInstanceId = useId();
  const theme = useTheme();
  // `noSsr: true` so the first render under useMediaQuery returns the
  // real value (instead of a hydration-friendly false). We don't have
  // an SSR path; the false-first-render only confuses tests.
  const autoCompact = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const compact = compactProp ?? autoCompact;
  // UR-02 reduced-motion gate. We can't rely on `<MotionConfig
  // reducedMotion="user">` because the test harness already wraps the
  // tree in `<MotionConfig reducedMotion="always">` to keep transitions
  // instant under jsdom; nesting MotionConfig would silently override
  // that. Instead we read the OS preference here and gate the
  // `transition` prop on each motion element. The flag is surfaced as a
  // data attribute on the root so the contract is testable without
  // depending on framer-motion internals.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const motionTransition = reducedMotion ? MOTION_REDUCED : MOTION;

  // Compact mode forces focus-chat as the initial mode so the chat
  // pane fills the viewport. Desktop mode honors whatever the consumer
  // asked for.
  const effectiveInitialFocus = compact ? "focus-chat" : initialFocus;
  const { mode, setMode } = useFocusMode({ initial: effectiveInitialFocus });

  // Drag bounds: keep BOTH panes visible at minimum widths. Max is
  // computed dynamically from the viewport so larger windows allow
  // the chat to grow without crowding the canvas. The user's prior
  // behavior — drag past 200 to flip to focus-canvas, drag past 720
  // to flip to focus-chat — was removed 2026-05-25 because it
  // produced a state with no visible affordance to recover (no
  // resize handle once in focus mode, no toggle to restore split).
  // Focus modes are still selectable via the useFocusMode API; just
  // not via drag.
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const navWidthForBounds = hideNav ? 0 : navWidthProp;
  // Chat pane is capped at 50% of the split area (viewport minus nav).
  // This is a hard half-and-half rule — the user explicitly asked that
  // the chat never exceed half the available horizontal space, so the
  // canvas always has at least the other half to render document
  // content. The MIN_CHAT_PANE_PX floor still wins on very narrow
  // viewports so the chat doesn't collapse.
  const splitAreaWidth = Math.max(0, viewportWidth - navWidthForBounds);
  const maxChatWidth = Math.max(
    MIN_CHAT_PANE_PX,
    Math.floor(splitAreaWidth / 2),
  );

  const { width, startDrag, bump, setWidth } = useResizableSplit({
    initial: initialChatWidth,
    min: MIN_CHAT_PANE_PX,
    max: maxChatWidth,
    storageKey: CHAT_WIDTH_STORAGE_KEY,
  });

  // When the viewport shrinks below what the persisted width allows,
  // clamp the in-memory value so the canvas never gets squeezed
  // below its minimum. This catches "I dragged wide on a 27" monitor
  // then opened the laptop lid" cases.
  useEffect(() => {
    if (width > maxChatWidth) {
      setWidth(maxChatWidth);
    }
  }, [width, maxChatWidth, setWidth]);

  // When the viewport crosses the compact <-> desktop boundary, reset
  // the focus mode so the user doesn't get stuck. Without this, a user
  // who toggled to focus-canvas at mobile would still see only the
  // canvas (chat hidden) when they rotate to landscape or resize their
  // window past md — and the drag-resize handle would be their only
  // way back. We skip the very first render so the initial mode comes
  // from `effectiveInitialFocus` (which already accounts for compact).
  const lastCompactRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastCompactRef.current === null) {
      lastCompactRef.current = compact;
      return;
    }
    if (lastCompactRef.current === compact) return;
    lastCompactRef.current = compact;
    setMode(compact ? "focus-chat" : initialFocus);
  }, [compact, initialFocus, setMode]);

  // Compact-mode nav drawer state. Starts closed; the hamburger opens it.
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  useEffect(() => {
    if (!navDrawerOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setNavDrawerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navDrawerOpen]);

  // ────────────────────────────────────────────────────────────────────
  // Compact layout (mobile + tablet portrait)
  // ────────────────────────────────────────────────────────────────────
  if (compact) {
    // hideChat in compact mode pins to the canvas pane. The chat/canvas
    // swap toggle is omitted (there's only one pane).
    const showCanvas = hideChat ? true : mode === "focus-canvas";
    return (
      <Box
        data-testid="appshell-root"
        data-shell-instance={shellInstanceId}
        data-app-shell-reduced-motion={String(reducedMotion)}
        sx={{
          display: "flex",
          flexDirection: "column",
          height: RAIL_HEIGHT,
          width: "100%",
          overflow: "hidden",
          backgroundColor: WHITE,
        }}
      >
        <Box
          data-testid="appshell-compact-topbar"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            py: 0.5,
            borderBottom: `1px solid ${BORDER}`,
            backgroundColor: WHITE,
            flexShrink: 0,
          }}
        >
          <IconButton
            data-testid="appshell-compact-nav-toggle"
            aria-label="Open navigation"
            aria-expanded={navDrawerOpen}
            onClick={() => setNavDrawerOpen(true)}
            size="small"
            sx={{ color: NAVY }}
          >
            {/* Inline hamburger glyph — three horizontal bars. Using a
                styled Box rather than an icon font so we don't pull in
                @mui/icons-material just for this. */}
            <Box
              aria-hidden
              sx={{
                width: 20,
                height: 14,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ height: 2, width: "100%", backgroundColor: NAVY, borderRadius: BORDER_RADIUS_SM }} />
              <Box sx={{ height: 2, width: "100%", backgroundColor: NAVY, borderRadius: BORDER_RADIUS_SM }} />
              <Box sx={{ height: 2, width: "100%", backgroundColor: NAVY, borderRadius: BORDER_RADIUS_SM }} />
            </Box>
          </IconButton>
          {hideChat ? null : <Box
            component="button"
            type="button"
            data-testid="appshell-compact-view-toggle"
            onClick={() => setMode(showCanvas ? "focus-chat" : "focus-canvas")}
            aria-label={showCanvas ? "View chat" : "View canvas"}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_PILL,
              backgroundColor: WHITE,
              color: NAVY,
              px: 1.5,
              py: 0.5,
              fontSize: FONT_SIZE_CAPTION,
              fontWeight: FONT_WEIGHT_LABEL,
              cursor: "pointer",
              fontFamily: "inherit",
              "&:hover": { backgroundColor: WARM_OFFWHITE },
            }}
          >
            {/* Tiny panel-swap glyph: two stacked rectangles to hint the
                action is "switch which pane is foregrounded". Inline SVG
                so we don't pull in @mui/icons-material for one icon. */}
            <Box
              component="svg"
              aria-hidden
              viewBox="0 0 14 14"
              sx={{ width: 12, height: 12, display: "block" }}
            >
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="none" stroke={NAVY} strokeWidth="1.5" />
              <rect x="5" y="5" width="8" height="8" rx="1.5" fill={WHITE} stroke={NAVY} strokeWidth="1.5" />
            </Box>
            {showCanvas ? "View chat" : "View canvas"}
          </Box>}
        </Box>

        {navDrawerOpen ? (
          <Box data-testid="appshell-compact-nav-drawer-container">
            <Box
              data-testid="appshell-compact-nav-backdrop"
              role="presentation"
              onClick={() => setNavDrawerOpen(false)}
              sx={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(11, 19, 43, 0.45)",
                zIndex: 99,
              }}
            />
            <Box
              data-testid="appshell-compact-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Primary navigation"
              sx={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: navWidthProp,
                backgroundColor: WARM_OFFWHITE,
                borderRight: `1px solid ${BORDER}`,
                zIndex: 100,
                overflowY: "auto",
              }}
            >
              {nav}
            </Box>
          </Box>
        ) : null}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            // Warm-offwhite surface tone matches the nav rail's
            // background and gives the inner chat/canvas card visual
            // context — without it the card floats in a sea of flat
            // white and the empty space below it reads as "page broken"
            // rather than "intentional padding".
            backgroundColor: WARM_OFFWHITE,
          }}
        >
          {header ? (
            <Box
              data-testid="appshell-header"
              sx={{ flexShrink: 0, width: "100%", backgroundColor: WHITE }}
              aria-label="Workspace header"
            >
              {header}
            </Box>
          ) : null}
          {showCanvas ? (
            <Box
              data-testid="appshell-canvas"
              aria-label="Canvas"
              sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}
            >
              {canvas}
            </Box>
          ) : (
            <Box
              data-testid="appshell-chat"
              aria-label="Chat pane"
              sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}
            >
              {chat}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Desktop layout (md and up)
  // ────────────────────────────────────────────────────────────────────
  const chatVisible = mode !== "focus-canvas";
  const canvasVisible = mode !== "focus-chat";
  const chatWidth = mode === "focus-chat" ? "100%" : mode === "focus-canvas" ? 48 : width;
  const navWidth = hideNav ? 0 : navWidthProp;

  return (
    <LayoutGroup>
      <Box
        data-testid="appshell-root"
        data-shell-instance={shellInstanceId}
        data-app-shell-reduced-motion={String(reducedMotion)}
        sx={{
          display: "flex",
          flexDirection: "row",
          height: RAIL_HEIGHT,
          width: "100%",
          overflow: "hidden",
          // Floating-panels: cool-gray "desk" behind the nav + the chat/canvas
          // cards (warm-offwhite was too close to the cards' white to read).
          backgroundColor: FLOATING_DESK_BG,
        }}
      >
        <AnimatePresence initial={false}>
          {!hideNav ? (
            <motion.aside
              key="nav"
              initial={{ width: 0 }}
              animate={{ width: navWidth }}
              exit={{ width: 0 }}
              transition={motionTransition}
              style={{ flexShrink: 0, height: "100%", overflow: "hidden" }}
              aria-label="Primary navigation"
              // Test-only contract: framer-motion under jsdom doesn't
              // write the animate target into inline `style.width`, so
              // we surface the chosen width as a data attribute so the
              // AppShell.test.tsx regression spec can sniff it without
              // depending on real layout.
              data-app-shell-nav-width={navWidth}
            >
              {nav}
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* Right-of-nav column: optional header above the chat | canvas
            split. The column flexes to fill remaining horizontal space
            and the body flex-rows below it owns the resizable split.
            The header lives here (not inside canvas) so it can span
            both panes — used by OnboardingShell to host the StepStrip
            across chat + canvas at F2+. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {header ? (
            <Box
              data-testid="appshell-header"
              sx={{ flexShrink: 0, width: "100%" }}
              aria-label="Workspace header"
            >
              {header}
            </Box>
          ) : null}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            <AnimatePresence initial={false}>
              {chatVisible && !hideChat ? (
                <motion.section
                  key="chat"
                  layout
                  initial={{ width: typeof chatWidth === "number" ? chatWidth : "100%" }}
                  animate={{ width: chatWidth }}
                  exit={{ width: 0 }}
                  transition={motionTransition}
                  style={{ flexShrink: 0, height: "100%", overflow: "hidden", display: "flex" }}
                  aria-label="Chat pane"
                  data-testid="appshell-chat"
                >
                  {/* Chat card is WARM (not white) so the white assistant
                      bubbles keep their contrast; the canvas card stays white.
                      Both float distinctly on the cool-gray desk. */}
                  <Box sx={{ ...FLOATING_CARD_SX, backgroundColor: WARM_OFFWHITE }}>{chat}</Box>
                </motion.section>
              ) : null}
            </AnimatePresence>

            {mode === "split" && !hideChat ? (
              <ResizeHandle
                value={width}
                min={MIN_CHAT_PANE_PX}
                max={maxChatWidth}
                onPointerDown={startDrag}
                onBump={(delta) => bump(delta)}
              />
            ) : null}

            <AnimatePresence initial={false}>
              {canvasVisible ? (
                <motion.section
                  key="canvas"
                  layout
                  initial={{ flex: 0 }}
                  animate={{ flex: 1 }}
                  exit={{ flex: 0 }}
                  transition={motionTransition}
                  style={{ height: "100%", overflow: "hidden", display: "flex" }}
                  aria-label="Canvas"
                  data-testid="appshell-canvas"
                >
                  <Box sx={FLOATING_CANVAS_CARD_SX}>{canvas}</Box>
                </motion.section>
              ) : null}
            </AnimatePresence>
          </Box>
        </Box>
      </Box>
    </LayoutGroup>
  );
}
