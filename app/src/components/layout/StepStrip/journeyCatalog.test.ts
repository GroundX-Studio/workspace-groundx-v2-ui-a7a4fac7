import { viewerStepKindSchema, viewerStepKindToJourneyStage, type ViewerStepKind } from "@groundx/shared";
import { describe, expect, it } from "vitest";

import { INGEST_LIVE_LABEL, JOURNEY_CATALOG, VIEWER_STEP_TO_JOURNEY } from "./journeyCatalog";

describe("journeyCatalog — single source of journey vocabulary", () => {
  it("carries the StepStrip pill labels (unchanged from what the strip shows today)", () => {
    expect(JOURNEY_CATALOG.ingest.stepLabel).toBe("1 Ingest");
    expect(JOURNEY_CATALOG.understand.stepLabel).toBe("2 Understand");
    expect(JOURNEY_CATALOG.analyze.stepLabel).toBe("Analyze");
    expect(JOURNEY_CATALOG.integrate.stepLabel).toBe("4 Integrate");
  });

  it("stores eyebrow values mixed-case (the Label eyebrow variant uppercases via CSS)", () => {
    expect(JOURNEY_CATALOG.understand.eyebrow).toBe("Understand");
    expect(JOURNEY_CATALOG.analyze.eyebrow).toBe("Analyze");
    expect(JOURNEY_CATALOG.integrate.eyebrow).toBe("Integrate");
  });

  it("gives Integrate a non-duplicate title (Connect), distinct from its eyebrow", () => {
    expect(JOURNEY_CATALOG.integrate.title).toBe("Connect");
    expect(JOURNEY_CATALOG.integrate.title).not.toBe(JOURNEY_CATALOG.integrate.eyebrow);
  });

  it("carries the Analyze sub-step labels + titles", () => {
    expect(JOURNEY_CATALOG.analyze.substeps?.extract).toEqual({ label: "Extract", title: "Extract" });
    expect(JOURNEY_CATALOG.analyze.substeps?.interact).toEqual({ label: "Interact", title: "Interact" });
    expect(JOURNEY_CATALOG.analyze.substeps?.report).toEqual({ label: "Report", title: "Report" });
  });

  it("maps every viewer step kind to its journey step/sub-step", () => {
    expect(VIEWER_STEP_TO_JOURNEY["doc-viewer"]).toEqual({ step: "understand" });
    expect(VIEWER_STEP_TO_JOURNEY["interact-chat"]).toEqual({ step: "analyze", substep: "interact" });
    expect(VIEWER_STEP_TO_JOURNEY["extract-workbench"]).toEqual({ step: "analyze", substep: "extract" });
    expect(VIEWER_STEP_TO_JOURNEY.report).toEqual({ step: "analyze", substep: "report" });
    expect(VIEWER_STEP_TO_JOURNEY.integrate).toEqual({ step: "integrate" });
    expect(VIEWER_STEP_TO_JOURNEY["ingest-picker"]).toEqual({ step: "ingest" });
  });

  it("derives every kind's top-level step from the shared viewerStepKindToJourneyStage (one source)", () => {
    // The app map's `step` field is the SAME kind → top-stage projection the
    // shared map exposes (the LLM context + strip both read it). This guards
    // against the two maps drifting if a future kind's stage is changed in only
    // one place.
    for (const kind of viewerStepKindSchema.options as ViewerStepKind[]) {
      expect(VIEWER_STEP_TO_JOURNEY[kind].step).toBe(viewerStepKindToJourneyStage[kind]);
    }
  });

  it("covers every viewer step kind (total over the shared schema)", () => {
    for (const kind of viewerStepKindSchema.options as ViewerStepKind[]) {
      expect(VIEWER_STEP_TO_JOURNEY[kind]).toBeDefined();
    }
  });

  it("provides the live ingest line (mechanism over magic — no hype words)", () => {
    expect(INGEST_LIVE_LABEL).toContain("Reading the document");
    expect(INGEST_LIVE_LABEL).not.toMatch(/magical|seamless|revolutionary|unleash/i);
  });
});
