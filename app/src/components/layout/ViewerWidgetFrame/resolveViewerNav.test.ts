import { describe, expect, it } from "vitest";

import type { ViewerFrameDescriptor } from "./viewerFrameDescriptor";
import { DOCUMENT_NAME_PLACEHOLDER, resolveViewerNav } from "./resolveViewerNav";

// A representative widget intrinsic descriptor (the `defaults`).
const EXTRACT_DEFAULTS: ViewerFrameDescriptor = {
  chromePolicy: "framed",
  contentMode: "padded-scroll",
  eyebrow: "Analyze", // a now-unused canvas eyebrow; the resolver overrides/empties it
  title: "Extract",
  subtitle: "Review structured fields and citations for the active scope.",
};

const DOC_DEFAULTS: ViewerFrameDescriptor = {
  chromePolicy: "edge-to-edge",
  contentMode: "edge-to-edge",
  title: "Document viewer",
};

describe("resolveViewerNav", () => {
  it("onboarding sub-step: eyebrow = journey step, title = sub-step (from the catalog)", () => {
    const r = resolveViewerNav(
      { kind: "onboarding-step", step: "analyze", substep: "extract" },
      EXTRACT_DEFAULTS,
    );
    expect(r.eyebrow).toBe("Analyze");
    expect(r.title).toBe("Extract");
  });

  it("onboarding interact: eyebrow Analyze, title Interact", () => {
    const r = resolveViewerNav(
      { kind: "onboarding-step", step: "analyze", substep: "interact" },
      DOC_DEFAULTS,
    );
    expect(r.eyebrow).toBe("Analyze");
    expect(r.title).toBe("Interact");
  });

  it("onboarding integrate: title is Connect, not a repeat of the eyebrow", () => {
    const r = resolveViewerNav({ kind: "onboarding-step", step: "integrate" }, EXTRACT_DEFAULTS);
    expect(r.eyebrow).toBe("Integrate");
    expect(r.title).toBe("Connect");
    expect(r.title).not.toBe(r.eyebrow);
  });

  it("onboarding understand: eyebrow Understand, title = document name", () => {
    const r = resolveViewerNav(
      { kind: "onboarding-step", step: "understand", documentName: "utility-bill.pdf" },
      DOC_DEFAULTS,
    );
    expect(r.eyebrow).toBe("Understand");
    expect(r.title).toBe("utility-bill.pdf");
  });

  it("onboarding understand without a resolved name: title is the placeholder", () => {
    const r = resolveViewerNav({ kind: "onboarding-step", step: "understand" }, DOC_DEFAULTS);
    expect(r.title).toBe(DOCUMENT_NAME_PLACEHOLDER);
  });

  it("steady: NO eyebrow (journey words never leak into steady)", () => {
    const r = resolveViewerNav({ kind: "steady-canvas", widget: "extract-workbench" }, EXTRACT_DEFAULTS);
    expect(r.eyebrow).toBeUndefined();
    expect(r.title).toBe("Extract"); // falls back to the widget's intrinsic title
  });

  it("steady doc-viewer: title = the resolved document name", () => {
    const r = resolveViewerNav(
      { kind: "steady-canvas", widget: "doc-viewer", documentName: "report.pdf" },
      DOC_DEFAULTS,
    );
    expect(r.eyebrow).toBeUndefined();
    expect(r.title).toBe("report.pdf");
  });

  it("does NOT crash when a substep is set on a step that has none (degrades gracefully)", () => {
    // The type permits {step:"understand", substep:"extract"} even though
    // "understand" has no sub-steps. The resolver must degrade, never throw.
    const r = resolveViewerNav(
      { kind: "onboarding-step", step: "understand", substep: "extract" },
      DOC_DEFAULTS,
    );
    expect(r.eyebrow).toBe("Understand");
    expect(r.title).toBe(DOCUMENT_NAME_PLACEHOLDER);
  });

  it("chromePolicy/contentMode ALWAYS come from defaults; subtitle falls back", () => {
    const r = resolveViewerNav(
      { kind: "onboarding-step", step: "analyze", substep: "extract" },
      EXTRACT_DEFAULTS,
    );
    expect(r.chromePolicy).toBe("framed");
    expect(r.contentMode).toBe("padded-scroll");
    expect(r.subtitle).toBe(EXTRACT_DEFAULTS.subtitle);
  });
});
