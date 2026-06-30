/**
 * `useJourneyStage` — the frame-free read of "which journey stage is the user
 * on right now", sourced from the ACTIVE VIEWER STEP (not a frame).
 *
 * standardized-viewer-control T6. Several chrome surfaces (the gate's
 * "Continue to Integrate" CTA in `GateChatRail` + `SignUpWidget`, ChatColumn's
 * conversation-journey predicate) used to derive the journey position from a
 * legacy onboarding-session surface field against a hand-maintained set. The
 * journey stage is now derived the SAME way the StepStrip + viewer nav derive
 * it: the active `ViewerStep.kind` mapped through the single-source
 * `VIEWER_STEP_TO_JOURNEY` map (`journeyCatalog.ts`).
 *
 * This is the shared read for ≥2 callers (GateChatRail, SignUpWidget, and
 * ChatColumn's journey predicate), so it lives next to the catalog it consumes
 * rather than being re-implemented inline at each site. It reuses
 * `VIEWER_STEP_TO_JOURNEY` directly — re-declaring that mapping anywhere else is
 * forbidden by the `recurrence-drift-guards` "single source" guard.
 *
 * Returns `null` when no ChatStore is mounted or the active session has no
 * viewer step yet (a freshly created session before any step mounts). Consumers
 * treat `null` as "the journey hasn't started" (pre-Integrate, before Ingest).
 */
import { useChatStoreOptional } from "@/contexts/ChatStoreContext";
import { selectActiveStep } from "@/contexts/ChatStoreContext";

import { VIEWER_STEP_TO_JOURNEY } from "./journeyCatalog";
import type { StepId } from "./types";

/** The active journey stage off the active ViewerStep kind, or `null`. */
export function useJourneyStage(): StepId | null {
  const chatStore = useChatStoreOptional();
  const activeSession = chatStore?.state.activeSessionId
    ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
    : null;
  const step = selectActiveStep(activeSession);
  if (!step) return null;
  return VIEWER_STEP_TO_JOURNEY[step.kind]?.step ?? null;
}

/**
 * True while the journey has NOT yet reached the Integrate stage. The gate's
 * committed-state "Continue to Integrate" CTA shows only here: once the user is
 * already ON Integrate the CTA is redundant. A `null` stage (journey not
 * started / no ChatStore) is treated as pre-Integrate, matching the legacy
 * behavior (every stage except Integrate was pre-Integrate).
 */
export function useIsPreIntegrateStage(): boolean {
  return useJourneyStage() !== "integrate";
}
