import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Spec W5 — chat-pane width is draggable; the split "snaps" when the user
 * drags past one of two thresholds:
 *
 *   chat < 200px   → "workspace-focus" (canvas-dominant; chat collapses to puck)
 *   chat 280–640px → live split (default 280–720 on ultrawide screens)
 *   chat > 720px   → "chat-focus" (chat-dominant; canvas collapses)
 *
 * Between 200–280 the user is "snapping back"; we keep the value live so
 * Framer Motion can animate the transition. The hook reports both the raw
 * width and the derived snap zone so the parent can react (e.g. dispatch a
 * focus-mode change via [[useFocusMode]]).
 */

export type SplitSnapZone = "workspace-focus" | "split-live" | "chat-focus";

const WORKSPACE_FOCUS_THRESHOLD = 200;
const SPLIT_LIVE_MIN = 280;
const SPLIT_LIVE_MAX_DEFAULT = 640;
const SPLIT_LIVE_MAX_ULTRAWIDE = 720;
const CHAT_FOCUS_THRESHOLD = 720;

export interface UseResizableSplitOptions {
  initial?: number;
  /** Minimum chat-pane width the user can drag to. */
  min?: number;
  /** Maximum chat-pane width the user can drag to. */
  max?: number;
  /** Toggle ultrawide live-band ceiling (720 vs 640). Default false. */
  ultrawide?: boolean;
  /**
   * If set, the chat-pane width is persisted to `localStorage` under this
   * key so a page reload restores the user's preferred split. Closure scope
   * of UR-02 — without this, drag-to-resize works for the session but the
   * shell snaps back to `initial` after every refresh.
   */
  storageKey?: string;
}

function readStoredWidth(storageKey: string | undefined, fallback: number, min: number, max: number): number {
  if (!storageKey) return fallback;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return fallback;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  } catch {
    // localStorage can throw (Safari private mode, quota, etc.). Treat any
    // failure as "no stored value" — better to lose persistence than crash.
    return fallback;
  }
}

function writeStoredWidth(storageKey: string | undefined, value: number): void {
  if (!storageKey) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Swallow — see readStoredWidth comment above.
  }
}

export function snapZoneFor(width: number): SplitSnapZone {
  // Spec W5: the chat-focus threshold is 720 for both default + ultrawide
  // screens. Only the live-band ceiling differs (640 vs 720) — that lives in
  // `clampToLiveBand`. Keeping `snapZoneFor` viewport-independent so the
  // dispatcher can decide focus mode without a re-render-on-resize hook.
  if (width < WORKSPACE_FOCUS_THRESHOLD) return "workspace-focus";
  if (width > CHAT_FOCUS_THRESHOLD) return "chat-focus";
  return "split-live";
}

export function clampToLiveBand(width: number, ultrawide = false): number {
  const max = ultrawide ? SPLIT_LIVE_MAX_ULTRAWIDE : SPLIT_LIVE_MAX_DEFAULT;
  return Math.max(SPLIT_LIVE_MIN, Math.min(max, width));
}

export function useResizableSplit(options: UseResizableSplitOptions = {}): {
  width: number;
  setWidth: (next: number) => void;
  zone: SplitSnapZone;
  startDrag: (pointerX: number) => void;
  /** Aria-friendly arrow-key resize (returns the new width). */
  bump: (deltaPx: number) => number;
} {
  const { initial = 360, min = 0, max = 1200, storageKey } = options;
  // `ultrawide` is destructured below only as part of the surface the W5
  // spec calls out; the current zone classifier is viewport-independent.
  // Stored-width hydration runs lazily inside useState's initializer so it
  // happens exactly once per mount, before the first paint.
  const [width, setWidthState] = useState<number>(() =>
    readStoredWidth(storageKey, initial, min, max)
  );
  const dragOriginRef = useRef<{ pointerX: number; widthAtStart: number } | null>(null);

  const setWidth = useCallback(
    (next: number) => {
      const clamped = Math.max(min, Math.min(max, next));
      setWidthState(clamped);
      writeStoredWidth(storageKey, clamped);
    },
    [min, max, storageKey]
  );

  const startDrag = useCallback(
    (pointerX: number) => {
      dragOriginRef.current = { pointerX, widthAtStart: width };
    },
    [width]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMove = (event: PointerEvent) => {
      if (!dragOriginRef.current) return;
      const dx = event.clientX - dragOriginRef.current.pointerX;
      setWidth(dragOriginRef.current.widthAtStart + dx);
    };
    const handleUp = () => {
      dragOriginRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [setWidth]);

  const bump = useCallback(
    (deltaPx: number) => {
      const next = Math.max(min, Math.min(max, width + deltaPx));
      setWidthState(next);
      writeStoredWidth(storageKey, next);
      return next;
    },
    [width, min, max, storageKey]
  );

  return { width, setWidth, zone: snapZoneFor(width), startDrag, bump };
}
