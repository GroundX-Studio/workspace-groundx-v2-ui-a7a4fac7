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
 * Role + scope contract (2026-05-30-widget-role-access):
 *   • `role: WidgetRole` — required by the widget contract. ThinkingStream
 *     is an all-roles display widget (matrix §1: anonymous ✅ / member ✅)
 *     and locks NO affordance by role. The prop is forward-looking +
 *     satisfies the contract; it does NOT drive behavior here.
 *   • `scope: WidgetScope` — required; always `{ type: "none" }` (matrix
 *     §1b). The widget renders notes, not a document set.
 *
 * Replay semantics (`persistReplay`):
 *   The old `mode` prop conflated a chat phase with a replay concern.
 *   The replay/remount guard is RE-SOURCED to its own `persistReplay`
 *   flag, driven by the host's replay concern — NOT by role:
 *   • `persistReplay` true: persists doneness in sessionStorage so a
 *     remount (compact-mode toggle on viewport resize, etc.) skips the
 *     reveal. The onboarding experience sets this for its scripted,
 *     play-once-per-scenario notes.
 *   • `persistReplay` false (default): does NOT persist doneness — each
 *     real upload is a unique event with its own progress stream.
 *   Cadence is identical either way: 1500-2800ms per note + 1200ms done
 *   delay. Future: push real progress events in as `notes` updates.
 */

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type FC } from "react";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

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
   * Widget-contract role (2026-05-30-widget-role-access). ThinkingStream
   * is all-roles and locks no affordance by role — this prop satisfies
   * the contract and is forward-looking; it does NOT drive behavior.
   */
  role: WidgetRole;
  /**
   * Widget-contract scope. Always `{ type: "none" }` for ThinkingStream
   * (a display widget — matrix §1b). Required by the contract.
   */
  scope: WidgetScope;
  /**
   * Replay/remount guard — RE-SOURCED from the retired `mode` prop. When
   * true, persists doneness in sessionStorage so a remount skips the
   * reveal (the onboarding experience's scripted, play-once notes). When
   * false/omitted, persists nothing (each real upload is unique). NOT
   * derived from role.
   */
  persistReplay?: boolean;
  /** Fires once when the stream finishes (after DONE_REVEAL_DELAY_MS). */
  onDone?: () => void;
}

export const ThinkingStream: FC<ThinkingStreamProps> = ({
  notes,
  scenarioKey,
  role: _role,
  scope: _scope,
  persistReplay = false,
  onDone,
}) => {
  const persist = persistReplay;
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
    <Stack spacing={0.75} sx={{ pl: 0.5 }} data-widget="thinking-stream">
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
