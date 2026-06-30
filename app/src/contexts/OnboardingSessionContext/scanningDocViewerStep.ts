import type { ViewerStep } from "@/contexts/ChatStoreContext";
import type { Scenario } from "@/types/onboarding";

/**
 * The "GroundX is reading the doc" beat for a freshly-opened sample — the
 * doc-viewer step that is active exactly while the chat ThinkingStream plays
 * (its onDone auto-advances to Extract). `scanning: true` makes <ScopedCanvas>
 * mount the PdfViewer with the reading scan-line. Citation-jump doc-viewer
 * steps are pushed by the cite-click sink, NOT this seed, so they never scan.
 *
 * standardized-viewer-control — the SINGLE SOURCE for the Understand reading
 * beat's step. `pickScenario` (OnboardingSessionContext) is the entity-open
 * caller; the orchestrator's `understand-scanning` experience-beat handler is
 * the scripted-choreography caller. Both build the SAME step here so the
 * `scenario:<id>` documentId convention (and the `scenario:unknown` fallback
 * when no scenario is active) can't drift between the two sites.
 */
export function scanningDocViewerStep(scenario: Scenario | null): ViewerStep {
  return {
    kind: "doc-viewer",
    documentId: scenario ? `scenario:${scenario}` : "scenario:unknown",
    scanning: true,
  };
}
