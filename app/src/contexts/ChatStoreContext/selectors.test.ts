import { describe, expect, it } from "vitest";

import { selectActiveStep } from "./selectors";
import { EMPTY_VIEWER_SESSION } from "./types";
import type { ViewerSession, ViewerStep } from "./types";

/**
 * 2026-05-31-core-data-followups §4 #16 — `selectActiveStep(session)` is the
 * single co-located selector for "the ViewerStep the user is currently on",
 * replacing the inline `stepIndex >= 0 ? history[stepIndex] : null` idiom
 * duplicated across 4 view sites. The selector depends only on a session's
 * `viewer` slot, so it is typed against the minimal `{ viewer }` shape.
 */
function withViewer(viewer: ViewerSession): { viewer: ViewerSession } {
  return { viewer };
}

const docStep: ViewerStep = { kind: "doc-viewer", documentId: "d1" };
const ingestStep: ViewerStep = { kind: "ingest-picker" };

describe("selectActiveStep (§4 #16)", () => {
  it("returns null for a null/undefined session", () => {
    expect(selectActiveStep(null)).toBeNull();
    expect(selectActiveStep(undefined)).toBeNull();
  });

  it("returns null when the viewer has no steps yet (stepIndex -1)", () => {
    expect(selectActiveStep(withViewer(EMPTY_VIEWER_SESSION))).toBeNull();
  });

  it("returns the step at currentStep.stepIndex", () => {
    const session = withViewer({
      ...EMPTY_VIEWER_SESSION,
      history: [ingestStep, docStep],
      currentStep: { stepIndex: 1 },
    });
    expect(selectActiveStep(session)).toBe(docStep);
  });

  it("returns the FIRST step when stepIndex points at index 0", () => {
    const session = withViewer({
      ...EMPTY_VIEWER_SESSION,
      history: [ingestStep, docStep],
      currentStep: { stepIndex: 0 },
    });
    expect(selectActiveStep(session)).toBe(ingestStep);
  });

  // Exercises the `?? null` out-of-bounds defence (selectors.ts:25): a
  // stepIndex >= history.length (e.g. a stale index after history was
  // truncated) reads `undefined` from the array; the selector must coerce
  // that to `null`, never hand a consumer `undefined`.
  it("returns null when stepIndex is past the end of history (out of bounds)", () => {
    const session = withViewer({
      ...EMPTY_VIEWER_SESSION,
      history: [ingestStep],
      currentStep: { stepIndex: 2 },
    });
    expect(selectActiveStep(session)).toBeNull();
  });
});
