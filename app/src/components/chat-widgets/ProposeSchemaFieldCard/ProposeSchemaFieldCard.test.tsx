import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import type { ProposedSchemaField } from "@/api/chatSessions";
import { SchemaView } from "@/views/Onboarding/SchemaView";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ProposeSchemaFieldCard } from "./ProposeSchemaFieldCard";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetEnsuredChatSessions();
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
      <ProposeSchemaFieldCard proposedField={sampleField} />,
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
      />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const label = screen.getByTestId("propose-schema-field-provenance");
    expect(label).toHaveTextContent("proposal_v1 · envelope verified");
  });

  it("omits the provenance label when provenance is absent (defensive)", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    expect(screen.queryByTestId("propose-schema-field-provenance")).not.toBeInTheDocument();
  });

  it("widget contract: declares slot + mode via data-attributes", () => {
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} mode="steady" />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const card = screen.getByTestId("propose-schema-field-card");
    expect(card.getAttribute("data-widget")).toBe("propose-schema-field-card");
    expect(card.getAttribute("data-mode")).toBe("steady");
  });

  it("Accept dispatches addSchemaField → card swaps to a confirmation state", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    await user.click(screen.getByTestId("propose-schema-field-accept"));
    // After accept the card swaps to a confirmation surface; the
    // Accept/Reject buttons are gone so the user can't double-fire.
    expect(screen.queryByTestId("propose-schema-field-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("propose-schema-field-reject")).not.toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-accepted")).toBeInTheDocument();
  });

  it("Reject swaps the card to a dismissed state without mutating the schema overlay", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <ProposeSchemaFieldCard proposedField={sampleField} />,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    await user.click(screen.getByTestId("propose-schema-field-reject"));
    expect(screen.queryByTestId("propose-schema-field-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("propose-schema-field-reject")).not.toBeInTheDocument();
    expect(screen.getByTestId("propose-schema-field-rejected")).toBeInTheDocument();
  });

  it("Accept → SchemaView shows the new field with a live extracted value (UI-01 Phase 2c round-trip)", async () => {
    const user = userEvent.setup();
    // Mount BOTH the propose-card AND SchemaView under the same
    // provider tree so the ChatStore mutation lands in shared state.
    // SchemaView reads `pendingSchemaOverlay.addedFields[].extraction`
    // and re-renders when the extraction status flips.
    renderWithOnboardingProviders(
      <>
        <ProposeSchemaFieldCard proposedField={sampleField} />
        <SchemaView />
      </>,
      { initialFrame: "f3a", initialScenario: "utility" },
    );

    // Pre-stage the /api/extract-field response — beforeEach already
    // installed a default ensure-create mock; mockResolvedValueOnce
    // wins for the NEXT call (which is extract-field, since ensure is
    // already in cache from the eager useEffect on mount).
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: 14.07, confidence: 0.92, citation: null }),
    });

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
