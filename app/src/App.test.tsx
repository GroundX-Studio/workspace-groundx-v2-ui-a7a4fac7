/**
 * App-level smoke test. Mounts `<AppProviders>` — the EXACT provider
 * stack used in production — around a tiny probe component that
 * subscribes to every context a widget might need.
 *
 * If any provider is removed from `AppProviders`, the probe's hook
 * call throws and this test fails. That's the regression net.
 *
 * Why this exists: on 2026-05-25 the PdfViewerWidget shipped needing
 * `DocumentsContext` but App.tsx didn't mount its provider. The
 * widget-level tests passed because the TEST HELPER had the provider;
 * production crashed because the APP did not. The test harness had
 * silently diverged from the production tree.
 *
 * The fix: factor the provider stack into `AppProviders` and test
 * the contract on the AppProviders component directly, the way
 * production renders.
 */

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Mock the GroundX API barrel so providers don't fire network on mount.
vi.mock("@/api", () => ({
  api: {
    groundxBuckets: {
      listGroundXBuckets: vi.fn(),
      getGroundXBucket: vi.fn(),
      createGroundXBucket: vi.fn(),
      updateGroundXBucket: vi.fn(),
      deleteGroundXBucket: vi.fn(),
    },
    partnerBuckets: {
      listPartnerBuckets: vi.fn(),
      getPartnerBucket: vi.fn(),
      createPartnerBucket: vi.fn(),
      updatePartnerBucket: vi.fn(),
      deletePartnerBucket: vi.fn(),
    },
    groundxDocuments: {
      listGroundXDocuments: vi.fn(),
      getGroundXDocument: vi.fn(),
      ingestGroundXRemoteDocuments: vi.fn(),
      crawlGroundXWebsite: vi.fn(),
      copyGroundXDocuments: vi.fn(),
      updateGroundXDocuments: vi.fn(),
      deleteGroundXDocument: vi.fn(),
      deleteGroundXDocuments: vi.fn(),
      lookupGroundXDocument: vi.fn(),
      listGroundXProcesses: vi.fn(),
      getGroundXProcessingStatus: vi.fn(),
      cancelGroundXProcess: vi.fn(),
      getGroundXDocumentXray: vi.fn(),
      getGroundXDocumentExtract: vi.fn(),
    },
    confirmUserChangingPassword: vi.fn(),
    getUserData: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    resetUserPassword: vi.fn(),
    updateAppMetadata: vi.fn(),
  },
}));

vi.mock("@/api/entities/scenarioRegistryEntity", () => ({
  listScenarios: vi.fn().mockResolvedValue({ scenarios: [], bucketId: null }),
}));

import { AppProviders } from "./App";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { api } from "@/api";

/**
 * Probe that touches every context a frame view / production widget
 * reads. If any provider is missing from `AppProviders`, the matching
 * hook throws here.
 *
 * When adding a new production context, add its hook call to this
 * probe. The cost is one line; the value is "any provider drift fails
 * this test before it reaches the dev server."
 */
const ContextProbe = () => {
  useAppMode();
  useDocumentsContext();
  useOnboardingSession();
  useScenarioRegistry();
  useCanvasOrchestrator();
  return <div data-testid="probe-ok">all contexts available</div>;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue({
    fileName: "x.pdf",
    fileType: "pdf",
    sourceUrl: "https://example.com/x.pdf",
    documentPages: [],
    chunks: [],
  });
});

describe("App provider tree (smoke)", () => {
  it("mounts the production AppProviders chain without throwing", async () => {
    await act(async () => {
      render(
        <AppProviders>
          <ContextProbe />
        </AppProviders>,
      );
    });
    expect(screen.getByTestId("probe-ok")).toBeInTheDocument();
    expect(screen.queryByTestId("app-error-boundary")).not.toBeInTheDocument();
  });

  it("PdfViewerWidget mounts inside AppProviders without a useDocumentsContext crash (regression for 2026-05-25)", async () => {
    // This is the exact crash the user hit: PdfViewerWidget calls
    // useDocumentsContext, which throws if DocumentsProvider is not
    // in the tree. Mounting against the REAL AppProviders chain
    // proves the production tree has the provider.
    const { PdfViewerWidget } = await import(
      "@/components/widgets/PdfViewer/PdfViewerWidget"
    );
    await act(async () => {
      render(
        <AppProviders>
          <PdfViewerWidget documentId="probe-doc" mode="onboarding" />
        </AppProviders>,
      );
    });
    expect(screen.queryByTestId("app-error-boundary")).not.toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
  });
});
