import type { ViewerSession, ViewerStep } from "./types";

/**
 * 2026-05-31-core-data-followups §4 #16 — the single selector for "the
 * ViewerStep the user is currently on."
 *
 * Replaces the inline idiom
 *   `session.viewer.currentStep.stepIndex >= 0
 *      ? session.viewer.history[session.viewer.currentStep.stepIndex] : null`
 * that was duplicated verbatim across four view sites (SteadyShell,
 * OnboardingShell ×2, IngestView). Co-located with the ChatStore/viewer state
 * it derives from.
 *
 * `currentStep.stepIndex` is `-1` when the viewer has no steps yet (a freshly
 * created session before any frame mounts); in that case there is no active
 * step and the selector returns `null`. Typed against the minimal `{ viewer }`
 * shape (the only slot it reads) so it composes with any session-like value
 * and tolerates a `null`/`undefined` session.
 */
export function selectActiveStep(
  session: { viewer: ViewerSession } | null | undefined,
): ViewerStep | null {
  if (!session) return null;
  const { history, currentStep } = session.viewer;
  return currentStep.stepIndex >= 0 ? history[currentStep.stepIndex] ?? null : null;
}
