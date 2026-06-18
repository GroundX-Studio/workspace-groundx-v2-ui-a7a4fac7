import type { ViewerStep } from "@/contexts/ChatStoreContext";
import type { Scenario } from "@/types/onboarding";

/**
 * TEST-ONLY frame→ViewerStep translation.
 *
 * standardized-viewer-control (D2 stage 2) — the production frame machine
 * (`advanceFrame`/`currentFrame`/`frameToStepStandalone`/the `FFrame` type) is
 * GONE. The remaining frame vocabulary lives ONLY at the test boundary: ~14
 * suites historically positioned the harness by an F-series frame, and the
 * `renderWithOnboardingProviders` / `OnboardingSessionProvider` seam translated
 * that into a seed `ViewerStep`. This helper carries that legacy translation so
 * those suites keep expressing position as a frame WITHOUT any frame symbol in
 * production code.
 *
 * Do NOT import this from anything under `app/src` that is not a test or a test
 * harness. The structural guard (T10) asserts production carries zero frame
 * vocabulary; this file is the deliberate, isolated test-side exception.
 */
export type TestFrame = "f1" | "f2" | "f3" | "f3a" | "f4" | "f4a" | "f5" | "f6" | "f7";

export function testFrameToStep(
  frame: TestFrame,
  scenario: Scenario | null,
  focusedCategoryId?: string,
): ViewerStep {
  switch (frame) {
    case "f1":
      return { kind: "ingest-picker" };
    case "f2":
      // The F2 "GroundX is reading the doc" beat — the doc-viewer step active
      // while the chat ThinkingStream plays; `scanning: true` mounts the
      // PdfViewer reading scan-line.
      return {
        kind: "doc-viewer",
        documentId: scenario ? `scenario:${scenario}` : "scenario:unknown",
        scanning: true,
      };
    case "f3":
      return {
        kind: "extract-workbench",
        scenarioId: scenario ?? "unknown",
        ...(focusedCategoryId ? { focusedCategoryId } : {}),
      };
    case "f3a":
      return {
        kind: "extract-workbench",
        scenarioId: scenario ?? "unknown",
        surface: "design",
        ...(focusedCategoryId ? { focusedCategoryId } : {}),
      };
    case "f4":
      return { kind: "report", surface: "render" };
    case "f4a":
      return { kind: "report", surface: "builder" };
    case "f5":
    case "f6":
      return { kind: "interact-chat" };
    case "f7":
      return { kind: "integrate" };
    default:
      return { kind: "ingest-picker" };
  }
}
