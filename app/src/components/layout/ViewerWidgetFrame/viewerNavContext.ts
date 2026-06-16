/**
 * ViewerNavContext — the typed surface context the nav resolves from.
 *
 * 2026-06-16 viewer-nav-redesign. The top axis is onboarding-vs-steady (the only
 * distinction the nav needs today: show journey words, or none). This is NOT the
 * `chatExperienceRegistry` (which composes chat experiences) — it is the nav's
 * journey-words toggle. `ScopedCanvas` builds one of these from its
 * `experience` prop + the active `ViewerStep`, then hands it to
 * `resolveViewerNav`. A new surface = a new arm (the resolver's `switch` has a
 * `never` default, so an unhandled arm fails to compile).
 */
import type { CanvasKind } from "@groundx/shared";

import type { AnalyzeSubstep, StepId } from "@/components/layout/StepStrip/types";

// Only the CANVAS surfaces resolve through the nav context — `ScopedCanvas`
// builds one of these from its `experience` prop + the active ViewerStep.
// Overlays (sign-up / book-call) render their own static descriptor directly,
// so there is deliberately NO "overlay" arm here (it would be dormant).
export type ViewerNavContext =
  | {
      readonly kind: "onboarding-step";
      readonly step: StepId;
      readonly substep?: AnalyzeSubstep;
      /** Resolved document name (doc-viewer title); placeholder while unresolved. */
      readonly documentName?: string;
    }
  | {
      readonly kind: "steady-canvas";
      readonly widget: CanvasKind;
      readonly documentName?: string;
      // Eyebrow is intentionally EMPTY in steady for now (the real workspace name
      // is deferred — task_3c2aace6). No scopeLabel field until that lands.
    };
