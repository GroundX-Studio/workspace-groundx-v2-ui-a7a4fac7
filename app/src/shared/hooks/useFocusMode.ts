import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * Focus modes (spec W5):
 *   • split     — default 3-column layout (nav + chat + canvas)
 *   • focus-chat    — chat takes the visible area, canvas collapses
 *   • focus-canvas  — canvas takes the visible area, chat collapses to a puck
 *
 * Keyboard:
 *   • ⌥-1 (Alt+1) — focus chat
 *   • ⌥-2 (Alt+2) — focus canvas
 *   • ⌥-3 (Alt+3) — return to split
 *
 * The hook also exposes setMode for click / drag-snap triggers.
 */
export type FocusMode = "split" | "focus-chat" | "focus-canvas";

export interface UseFocusModeOptions {
  initial?: FocusMode;
  /** Disable global hotkeys (useful when the shell is unmounted or hidden). */
  enabled?: boolean;
}

export function useFocusMode(options: UseFocusModeOptions = {}): {
  mode: FocusMode;
  setMode: (mode: FocusMode) => void;
  toggleChat: () => void;
  toggleCanvas: () => void;
} {
  const { initial = "split", enabled = true } = options;
  const [mode, setMode] = useState<FocusMode>(initial);

  const toggleChat = useCallback(() => setMode((current) => (current === "focus-chat" ? "split" : "focus-chat")), []);
  const toggleCanvas = useCallback(() => setMode((current) => (current === "focus-canvas" ? "split" : "focus-canvas")), []);

  useHotkeys("alt+1", () => setMode("focus-chat"), { enabled, preventDefault: true });
  useHotkeys("alt+2", () => setMode("focus-canvas"), { enabled, preventDefault: true });
  useHotkeys("alt+3", () => setMode("split"), { enabled, preventDefault: true });

  return { mode, setMode, toggleChat, toggleCanvas };
}
