/**
 * ThinkingStream — chat-widget for the timed "model is thinking" note
 * reveal. The italic, left-bordered notes that stream in one-by-one
 * while a document is being parsed.
 *
 * Extracted from `OnboardingChatColumn`'s F2ConversationFlow in
 * ARCH-11 (2026-05-26). The widget owns:
 *   • Timer-driven reveal of each note (randomized cadence so the
 *     stream reads as "real thinking," not a deterministic script)
 *   • The post-stream "done" delay (1.2s after the last note so the
 *     consumer's Done/CTA reveal doesn't slam in immediately)
 *   • Per-scenarioKey sessionStorage replay guard — once the script
 *     has played to done in this tab, subsequent mounts skip the
 *     reveal and surface all notes + fire `onDone` immediately
 *   • Brand-locked italic + left-border quoted-aside styling
 *
 * The widget does NOT own:
 *   • The "Done. Ready to analyze." bubble or any Pick-a-view CTA
 *     that follows — those are consumer-orchestrated. Subscribe to
 *     `onDone` to reveal them.
 *   • Network progress events — the consumer maps real progress to
 *     a string[] of notes and passes them in. The widget is purely
 *     presentational + state-keeping.
 *
 * Mode semantics:
 *   • `onboarding` (default): persists doneness in sessionStorage so
 *     a remount (compact-mode toggle on viewport resize, etc.) skips
 *     the reveal. Cadence: 1500-2800ms per note + 1200ms done delay.
 *   • `steady`: same visual + cadence, but does NOT persist doneness
 *     since each real upload is a unique event with its own progress
 *     stream. Future: pass real progress events as `notes` updates
 *     and the widget will reveal them as they arrive (push instead of
 *     pull cadence). For now the timer drives both modes.
 */

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type FC } from "react";

import { BODY_TEXT, BORDER } from "@/constants";

/**
 * Per-note pause window. The randomization keeps the stream from
 * reading as a deterministic script. Lower bound prevents stalling;
 * upper keeps a 6-line script under ~17s.
 */
const THINKING_NOTE_MIN_MS = 1500;
const THINKING_NOTE_MAX_MS = 2800;

/** Pause after the last note before onDone fires. */
const DONE_REVEAL_DELAY_MS = 1200;

/** Versioned sessionStorage key — bump the version if the shape changes. */
const STORAGE_KEY_PREFIX = "groundx-onboarding.thinking-stream-done.";

function nextThinkingPause(): number {
  return (
    THINKING_NOTE_MIN_MS + Math.random() * (THINKING_NOTE_MAX_MS - THINKING_NOTE_MIN_MS)
  );
}

export type ThinkingStreamMode = "onboarding" | "steady";

export interface ThinkingStreamProps {
  /** Notes to stream, one bubble per entry, in reveal order. */
  notes: string[];
  /**
   * Stable id used to namespace the sessionStorage replay guard.
   * Typically the scenario id (onboarding) or the upload id (steady).
   * Different scenarios get independent done-state.
   */
  scenarioKey: string;
  /**
   * Locked-affordance gate per the widget contract.
   * - `onboarding` (default): persists doneness in sessionStorage so
   *   remounts don't replay.
   * - `steady`: doesn't persist (each real upload is unique).
   */
  mode?: ThinkingStreamMode;
  /** Fires once when the stream finishes (after DONE_REVEAL_DELAY_MS). */
  onDone?: () => void;
}

export const ThinkingStream: FC<ThinkingStreamProps> = ({
  notes,
  scenarioKey,
  mode = "onboarding",
  onDone,
}) => {
  const persist = mode === "onboarding";
  const storageKey = `${STORAGE_KEY_PREFIX}${scenarioKey}`;

  // On mount: check the persisted flag (onboarding only). If set,
  // jump to fully-revealed + fire onDone next tick.
  const alreadyPlayed =
    persist &&
    typeof window !== "undefined" &&
    (() => {
      try {
        return window.sessionStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    })();

  const [noteCount, setNoteCount] = useState<number>(() =>
    alreadyPlayed ? notes.length : notes.length > 0 ? 1 : 0,
  );
  const [showDone, setShowDone] = useState<boolean>(
    alreadyPlayed || notes.length === 0,
  );

  // Advance reveal one note at a time.
  useEffect(() => {
    if (noteCount >= notes.length) return;
    const id = window.setTimeout(() => {
      setNoteCount((n) => Math.min(n + 1, notes.length));
    }, nextThinkingPause());
    return () => window.clearTimeout(id);
  }, [noteCount, notes.length]);

  // After last note, wait DONE_REVEAL_DELAY_MS then flip showDone.
  useEffect(() => {
    if (noteCount < notes.length) return;
    if (showDone) return;
    const id = window.setTimeout(() => setShowDone(true), DONE_REVEAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [noteCount, notes.length, showDone]);

  // Persist doneness (onboarding only); fire onDone callback.
  useEffect(() => {
    if (!showDone) return;
    if (persist && typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(storageKey, "1");
      } catch {
        // sessionStorage disabled / full — degrade silently; worst
        // case is one replay on next mount, not a crash.
      }
    }
    onDone?.();
    // onDone is intentionally omitted from the dep array — the
    // consumer might pass an inline lambda. Firing once on showDone
    // transition is the intended contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDone]);

  const visibleNotes = notes.slice(0, noteCount);
  if (visibleNotes.length === 0) return null;

  return (
    <Stack spacing={0.75} sx={{ pl: 0.5 }} data-widget="thinking-stream" data-mode={mode}>
      {visibleNotes.map((note, i) => (
        <Typography
          key={i}
          data-testid={`thinking-note-${i}`}
          variant="caption"
          sx={{
            fontStyle: "italic",
            color: BODY_TEXT,
            lineHeight: 1.4,
            paddingLeft: 1,
            borderLeft: `2px solid ${BORDER}`,
          }}
        >
          {note}
        </Typography>
      ))}
    </Stack>
  );
};
