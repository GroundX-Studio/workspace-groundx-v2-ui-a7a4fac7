import { selectActiveStep, useChatStore } from "@/contexts/ChatStoreContext";
import { useEntitySessionStore } from "@/contexts/EntitySessionStoreContext";
import { viewerStepDiagnosticId } from "@/components/layout/StepStrip/journeyCatalog";

/**
 * standardized-viewer-control (D2) — the FRAME-FREE successor to the test probes
 * that read `session.state.currentFrame`. `currentFrame` (and its reverse
 * projection) are gone; the journey position now lives entirely on the active
 * viewer step. This hook returns the same diagnostic string the production
 * `onboarding-step-*` data-testid carries (`viewerStepDiagnosticId` of the active
 * step), so test probes assert on the active viewer step kind + sub-position
 * instead of an F-series frame. Returns `null` when no viewer step is active yet
 * (the freshly-bootstrapped, pre-mount state — what `currentFrame` defaulted to
 * "f1"/ingest; assert `null` or `"ingest-picker"` accordingly).
 */
export function useActiveStepDiagnostic(): string | null {
  const { state } = useChatStore();
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  const step = selectActiveStep(active);
  return step ? viewerStepDiagnosticId(step) : null;
}

/**
 * standardized-viewer-control (D2) — the diagnostic of the active entity's RESUME
 * ANCHOR (`lastStep`), which is what the retired `currentFrame` getter actually
 * read. Differs from `useActiveStepDiagnostic` only for sub-position mutations
 * that update the persisted anchor WITHOUT pushing a new active viewer step
 * (e.g. `markStageReached` called on its own). Returns `null` when no entity is
 * active. Use the active-step variant for canvas/UI assertions; use this for
 * journey-progress (resume-anchor) assertions.
 */
export function useResumeAnchorDiagnostic(): string | null {
  const { state } = useEntitySessionStore();
  const lastStep = state.activeKey ? state.entities.get(state.activeKey)?.lastStep : undefined;
  return lastStep ? viewerStepDiagnosticId(lastStep) : null;
}
