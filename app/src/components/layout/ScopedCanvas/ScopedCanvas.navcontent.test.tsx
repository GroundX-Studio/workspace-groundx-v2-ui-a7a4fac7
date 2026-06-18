/**
 * Cornerstone — the viewer nav shows the RIGHT content per surface
 * (viewer-nav-redesign). Asserts the resolved eyebrow/title/processing line in
 * the frame header, scoped to `viewer-frame-header` / `viewer-frame-status` so
 * widget body text can't false-match. Eyebrow assertions check the VALUE
 * ("Analyze") — the eyebrow variant uppercases via CSS, so the DOM text is
 * mixed-case.
 */
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import type { ViewerStep } from "@/contexts/ChatStoreContext";
import { INGEST_LIVE_LABEL } from "@/components/layout/StepStrip/journeyCatalog";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ScopedCanvas } from "./ScopedCanvas";

const DOC_SCOPE: ContentScope = { type: "documents", documentIds: ["doc-1"] };
const UTILITY_SCOPE: ContentScope = { type: "bucket", bucketId: 28454, filter: { project: "utility" } };
const header = () => screen.getByTestId("viewer-frame-header");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("viewer nav content — onboarding journey", () => {
  it("Analyze▸Extract: eyebrow 'Analyze', title 'Extract'", () => {
    const step: ViewerStep = { kind: "extract-workbench", scenarioId: "utility" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={{ type: "documents", documentIds: ["utility-bill-2026-04"] }} step={step} role="member" experience="onboarding" />,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    expect(within(header()).getByText("Analyze")).toBeInTheDocument();
    expect(within(header()).getByText("Extract")).toBeInTheDocument();
  });

  it("Analyze▸Interact: eyebrow 'Analyze', title 'Interact'", () => {
    const step: ViewerStep = { kind: "interact-chat" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="member" experience="onboarding" />,
    );
    expect(within(header()).getByText("Analyze")).toBeInTheDocument();
    expect(within(header()).getByText("Interact")).toBeInTheDocument();
  });

  it("Integrate: eyebrow 'Integrate', title 'Connect' (not the duplicated 'Integrate/Integrate')", () => {
    const step: ViewerStep = { kind: "integrate" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={UTILITY_SCOPE} step={step} role="member" experience="onboarding" />,
      { initialFrame: "f7", initialScenario: "utility" },
    );
    expect(within(header()).getByText("Integrate")).toBeInTheDocument();
    expect(within(header()).getByText("Connect")).toBeInTheDocument();
  });

  it("Report: eyebrow 'Analyze'", () => {
    const step: ViewerStep = { kind: "report" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={UTILITY_SCOPE} step={step} role="member" experience="onboarding" />,
    );
    expect(within(header()).getByText("Analyze")).toBeInTheDocument();
  });

  it("Understand: eyebrow 'Understand', NOT the generic 'Document viewer'", () => {
    const step: ViewerStep = { kind: "doc-viewer", documentId: "doc-1" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="anonymous" experience="onboarding" />,
    );
    expect(within(header()).getByText("Understand")).toBeInTheDocument();
    expect(within(header()).queryByText("Document viewer")).not.toBeInTheDocument();
  });

  it("Understand while scanning: the live ingest line shows via the loading slot", () => {
    const step: ViewerStep = { kind: "doc-viewer", documentId: "doc-1", scanning: true };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="anonymous" experience="onboarding" />,
    );
    const status = screen.getByTestId("viewer-frame-status");
    expect(within(status).getByText(INGEST_LIVE_LABEL)).toBeInTheDocument();
  });
});

describe("viewer nav content — steady has NO journey words", () => {
  it("steady Extract: no journey eyebrow; title is the feature 'Extract'", () => {
    const step: ViewerStep = { kind: "extract-workbench", scenarioId: "utility" };
    renderWithOnboardingProviders(
      <ScopedCanvas scope={{ type: "documents", documentIds: ["utility-bill-2026-04"] }} step={step} role="member" experience="steady" />,
      { initialFrame: "f3", initialScenario: "utility" },
    );
    expect(within(header()).getByText("Extract")).toBeInTheDocument();
    expect(within(header()).queryByText("Analyze")).not.toBeInTheDocument();
    expect(within(header()).queryByText("Understand")).not.toBeInTheDocument();
    expect(within(header()).queryByText("Integrate")).not.toBeInTheDocument();
  });
});
