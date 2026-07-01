import { selectActiveStep, useChatStore, type ViewerStep } from "@/contexts/ChatStoreContext";

/**
 * understand-watch-lock — the SINGLE source of truth for "the onboarding
 * Understand scan beat is playing right now".
 *
 * The signal is the active viewer step being a `doc-viewer` with
 * `scanning: true` — set ONLY by the `understand-scanning` experience beat and
 * dropped the instant the ThinkingStream completes and dispatches `showExtract`
 * ("Done. Ready to analyze."). While it is true the whole onboarding shell is
 * locked: non-interactive (`inert`) AND visually obviously locked (nav + step
 * strip dimmed, chat composer disabled). A SETTLED, non-`scanning` doc-viewer
 * (a later citation jump) is a deliberate interactive surface and is NOT locked.
 *
 * In steady mode there is no scanning beat, so this is always false there.
 *
 * Two consumers share this so they can never drift apart:
 *   • OnboardingShell — shell-wide `inert` + nav/strip dim (uses the pure
 *     predicate against the step it already reads).
 *   • ConversationFlow — disables the chat composer (input + Send).
 */
export function isUnderstandScanningStep(step: ViewerStep | null | undefined): boolean {
  return step?.kind === "doc-viewer" && step.scanning === true;
}

export function useUnderstandScanningActive(): boolean {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  return isUnderstandScanningStep(selectActiveStep(active));
}
