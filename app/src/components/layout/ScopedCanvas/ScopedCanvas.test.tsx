/**
 * <ScopedCanvas> — coverage (2026-05-30-onboarding-shell-shared-view Phase 1).
 *
 * `<ScopedCanvas>` is the SOLE canvas mount path: it resolves a `ViewerStep`
 * to its `CanvasKind`, looks the widget up in the production registry, and
 * mounts it with the active `scope` + `role`. As of
 * 2026-05-30-onboarding-shell-shared-view Phase 3a `extract-workbench` is a
 * BUILT kind (the packaged Extract workbench widget) and `interact-chat`
 * resolves to the doc-viewer mount (its canvas is doc-only). Only genuinely
 * future kinds (`integrate` — next step — / `ingest-picker` — the F1 overlay)
 * resolve to the labelled "not yet available" placeholder, NOT a crash.
 *
 * This is the runtime mount test the tasks.md "Runtime mount test + import
 * ban" line calls for: every DECLARED CanvasKind mounts a real widget that
 * receives the scope; an undeclared kind hits the placeholder.
 *
 * TDD: failing-first. The component under test does not exist yet.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import type { ViewerStep } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ScopedCanvas } from "./ScopedCanvas";

const DOC_SCOPE: ContentScope = { type: "documents", documentIds: ["doc-1"] };
const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { project: "utility" },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ScopedCanvas — declared CanvasKinds mount real widgets", () => {
  it("doc-viewer step → PdfViewerWidget, fed the scope", () => {
    const step: ViewerStep = { kind: "doc-viewer", documentId: "doc-1" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="anonymous" />,
    );
    const widget = screen.getByTestId("pdf-viewer-widget");
    expect(widget).toBeInTheDocument();
    // The widget received the role (the scope contract surfaces role on the root).
    expect(widget).toHaveAttribute("data-role", "anonymous");
    expect(screen.queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
  });

  it("report step → SmartReportRender, fed the scope", () => {
    const step: ViewerStep = { kind: "report" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={UTILITY_SCOPE} step={step} role="member" />,
    );
    const widget = screen.getByTestId("smart-report-render");
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute("data-role", "member");
  });

  it("report step + reportSurface='builder' → SmartReportBuilder (report-builder kind)", () => {
    const step: ViewerStep = { kind: "report" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={UTILITY_SCOPE} step={step} role="member" reportSurface="builder" />,
    );
    expect(screen.getByTestId("smart-report-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-render")).not.toBeInTheDocument();
  });

  it("interact-chat step → the doc viewer (the canvas shows the cited source)", () => {
    const step: ViewerStep = { kind: "interact-chat", scenarioId: "utility" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="member" />,
    );
    expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
    expect(screen.queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
  });

  it("extract-workbench step → the packaged Extract workbench, fed the scope (Phase 3a)", () => {
    // The extract workbench resolves the live doc + workflow from the scope's
    // documentIds[0]; the Utility test scenario's placeholder id falls back to
    // the manifest schema so the workbench renders without a network round-trip.
    const step: ViewerStep = { kind: "extract-workbench", scenarioId: "utility" };
    const utilityDocScope: ContentScope = {
      type: "documents",
      documentIds: ["utility-bill-2026-04"],
    };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={utilityDocScope} step={step} role="member" />,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    const widget = screen.getByTestId("extract-workbench");
    expect(widget).toBeInTheDocument();
    expect(widget).toHaveAttribute("data-role", "member");
    // The real workbench, NOT the "not yet available" placeholder.
    expect(screen.queryByTestId("scoped-canvas-unavailable")).not.toBeInTheDocument();
  });
});

describe("ScopedCanvas — undeclared kinds hit the placeholder (no crash)", () => {
  it.each<ViewerStep>([
    { kind: "integrate" },
    { kind: "ingest-picker" },
  ])("renders a labelled placeholder for $kind", (step) => {
    renderWithOnboardingProviders(
      <ScopedCanvas scope={UTILITY_SCOPE} step={step} role="member" />,
    );
    const placeholder = screen.getByTestId("scoped-canvas-unavailable");
    expect(placeholder).toBeInTheDocument();
    // No viewer widget mounted for an undeclared kind.
    expect(screen.queryByTestId("pdf-viewer-widget")).not.toBeInTheDocument();
    expect(screen.queryByTestId("smart-report-render")).not.toBeInTheDocument();
    expect(screen.queryByTestId("extract-workbench")).not.toBeInTheDocument();
  });
});
