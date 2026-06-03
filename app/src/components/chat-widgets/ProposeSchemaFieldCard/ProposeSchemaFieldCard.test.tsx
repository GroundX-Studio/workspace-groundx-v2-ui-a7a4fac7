import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-05-31-schemaview-live-only-extract — SchemaView reads the LIVE extract
// as its sole source (the manifest arm is retired). The Accept round-trip
// mounts `<SchemaView />` with no live props, so it self-resolves the live
// extract via getDocument → getGroundXWorkflow → getDocumentExtract. Stub those
// loaders so the standalone SchemaView has a genuine live source — a real-shaped
// live extract injected at the seam (the runtime has no MOCK_MODE path).

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import type { ProposedSchemaField } from "@/api/chatSessions";
import { SchemaView } from "@/components/viewer-widgets/Extract/SchemaView";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { utilityTestScenario } from "@/test/scenarioFixtures";
import type { ScenarioConfig } from "@/types/scenarios";

import { ProposeSchemaFieldCard } from "./ProposeSchemaFieldCard";

const LIVE_UTILITY_DOC_ID = "c3bfff49-6640-4213-822b-e81c3a771e45";
const LIVE_WORKFLOW_ID = "9910308e-3100-473e-9da6-3ac29f5958a6";
const getGroundXWorkflow = vi.fn();
const getGroundXDocument = vi.fn();
const getGroundXDocumentExtract = vi.fn();

// Utility scenario whose primary document is the resolved live id so SchemaView
// runs the live load off the injected seam (placeholder ids would skip it).
const liveUtilityScenario: ScenarioConfig = {
  ...utilityTestScenario,
  documents: [{ documentId: LIVE_UTILITY_DOC_ID, fileName: "April 2026 Statement.pdf", order: 1 }],
};

// Injected live workflow + extract (test seam) — statement.account_number is the
// field the proposal lands beside (categoryId "statement"), so the category
// exists to host the accepted field.
function installLiveExtract() {
  getGroundXWorkflow.mockResolvedValue({
    workflow: {
      workflowId: LIVE_WORKFLOW_ID,
      name: "Utility Bill",
      extract: {
        statement: {
          fields: { account_number: { prompt: { description: "account number", type: "str" } } },
        },
      },
    },
  } as never);
  getGroundXDocument.mockResolvedValue({
    document: { documentId: LIVE_UTILITY_DOC_ID, filter: { workflow_id: LIVE_WORKFLOW_ID } },
  } as never);
  getGroundXDocumentExtract.mockResolvedValue({ account_number: "9988776" } as never);
}

const originalFetch = global.fetch;

beforeEach(() => {
  __resetEnsuredChatSessions();
  getGroundXWorkflow.mockReset();
  getGroundXDocument.mockReset();
  getGroundXDocumentExtract.mockReset();
  // ChatStoreProvider's eager-ensure useEffect + the propose-card
  // Accept handler may fire async fetch chains. Silencing the
  // global throw-on-error spy keeps act() noise from this widget's
  // surface (mirrors InteractView / SchemaView test patterns).
  vi.spyOn(console, "error").mockImplementation(() => {});
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ chatSessionId: "stub", ownerUserId: null, ownerAnonId: "anon-stub" }),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

const sampleField: ProposedSchemaField = {
  categoryId: "statement",
  name: "total_tax",
  type: "NUMBER",
  description: "Total tax billed this period.",
};

describe("ProposeSchemaFieldCard (UI-01 Phase 2a)", () => {
  it("renders the field name + type badge + description + Accept/Reject controls", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    expect(screen.getByTestId("propose-schema-field-card")).toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-name")).toHaveTextContent("total_tax");
    expect(screen.getByTestId("propose-schema-field-type")).toHaveTextContent("NUMBER");
    expect(screen.getByTestId("propose-schema-field-description")).toHaveTextContent(
      "Total tax billed this period.",
    );
    expect(screen.getByTestId("propose-schema-field-accept")).toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-reject")).toBeInTheDocument();
  });

  // ── proposal-envelope-provenance ────────────────────────────────

  it("renders `proposal_v1 · envelope verified` when provenance.verified === true", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard
        proposedField={{ ...sampleField, provenance: { version: "v1", verified: true } }}
        role="anonymous"
        scope={{ type: "none" }}
      />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const label = screen.getByTestId("propose-schema-field-provenance");
    expect(label).toHaveTextContent("proposal_v1 · envelope verified");
  });

  it("omits the provenance label when provenance is absent (defensive)", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    expect(screen.queryByTestId("propose-schema-field-provenance")).not.toBeInTheDocument();
  });

  it("widget contract: declares slot + role via data-attributes", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="member" scope={{ type: "none" }} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const card = screen.getByTestId("propose-schema-field-card");
    expect(card.getAttribute("data-widget")).toBe("propose-schema-field-card");
    expect(card.getAttribute("data-role")).toBe("member");
  });

  // 2026-05-30-widget-role-access — matrix row: ProposeSchemaFieldCard is
  // available to ALL roles (anonymous ✅ / member ✅) and locks no
  // affordance by role. The card mounts + renders its editable controls
  // identically under both roles.
  it.each(["anonymous", "member"] as const)(
    "matrix row: mounts + renders Accept/Reject under role=%s (all roles, no affordance lock)",
    (role) => {
      renderWithOnboardingProviders(
        <ProposeSchemaFieldCard proposedField={sampleField} role={role} scope={{ type: "none" }} />,
        { initialFrame: "f3a", initialScenario: "utility" },
      );
      const card = screen.getByTestId("propose-schema-field-card");
      expect(card).toBeInTheDocument();
      expect(card.getAttribute("data-role")).toBe(role);
      // Affordance lock = NONE today: both editable controls present
      // regardless of role.
      expect(screen.getByTestId("propose-schema-field-accept")).toBeInTheDocument();
      expect(screen.getByTestId("propose-schema-field-reject")).toBeInTheDocument();
    },
  );

  it("Accept dispatches addSchemaField → card swaps to a confirmation state", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    await user.click(screen.getByTestId("propose-schema-field-accept"));
    // After accept the card swaps to a confirmation surface; the
    // Accept/Reject buttons are gone so the user can't double-fire.
    expect(screen.queryByTestId("propose-schema-field-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("propose-schema-field-reject")).not.toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-accepted")).toBeInTheDocument();
  });

  it("Accept starts focused extraction through the injected extract client", async () => {
    const user = userEvent.setup();
    const extractField = vi.fn(async () => ({ value: 14.07, confidence: 0.92, citation: null }));
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        api: { extract: { extractField } },
      },
    );

    await user.click(screen.getByTestId("propose-schema-field-accept"));

    await waitFor(() => expect(extractField).toHaveBeenCalledTimes(1));
    expect(extractField).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expect.objectContaining({ name: "total_tax" }),
      }),
    );
  });

  it("Reject swaps the card to a dismissed state without mutating the schema overlay", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    await user.click(screen.getByTestId("propose-schema-field-reject"));
    expect(screen.queryByTestId("propose-schema-field-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("propose-schema-field-reject")).not.toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-rejected")).toBeInTheDocument();
  });

  it("Accept → SchemaView shows the new field with a live extracted value (UI-01 Phase 2c round-trip)", async () => {
    const user = userEvent.setup();
    // 2026-05-31-schemaview-live-only-extract — SchemaView's source is the live
    // extract; install it so the standalone mount renders the statement
    // category that hosts the accepted field.
    installLiveExtract();
    const extractField = vi.fn(async () => ({ value: 14.07, confidence: 0.92, citation: null }));
    // Mount BOTH the propose-card AND SchemaView under the same
    // provider tree so the ChatStore mutation lands in shared state.
    // SchemaView reads `pendingSchemaOverlay.addedFields[].extraction`
    // and re-renders when the extraction status flips.
    renderWithOnboardingProviders(
      <>
        <ProposeSchemaFieldCard proposedField={sampleField} role="anonymous" scope={{ type: "none" }} />
        <SchemaView />
      </>,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialScenarios: [liveUtilityScenario],
        api: {
          workflow: { getGroundXWorkflow },
          groundxDocuments: { getGroundXDocument, getGroundXDocumentExtract },
          extract: { extractField },
        },
      },
    );
    // Wait for the live schema to resolve so the statement category is mounted.
    await screen.findByTestId("schema-field-account_number");

    await user.click(screen.getByTestId("propose-schema-field-accept"));

    // The new field card appears in SchemaView; the extraction flips
    // through "Extracting…" → "14.07" as the focused extraction
    // returns. The card test-id is `schema-field-<fieldId>` and the
    // value test-id is `schema-field-value-<fieldId>`. We don't know
    // the minted id up front, so we waitFor any card whose status
    // attribute reaches "done".
    await waitFor(
      () => {
        const doneEl = document.querySelector('[data-extraction-status="done"]');
        expect(doneEl).not.toBeNull();
        expect(doneEl?.textContent).toMatch(/14\.07/);
      },
      { timeout: 3000 },
    );
  });
});
