import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-05-31-schemaview-live-only-extract — SchemaView reads the LIVE extract
// as its sole source. Standalone `<SchemaView />` mounts (no live props)
// self-resolve the live extract from the same load path the Extract widget
// uses (getDocument → filter.workflow_id → getGroundXWorkflow → extract). Tests
// inject a real-shaped live extract at the seam (the runtime has no MOCK_MODE
// path); here we inject the workflow + document/extract loaders so the standalone surfaces have a genuine
// live source keyed by the scenario's primary document. The fixture's field ids
// mirror the manifest (account_number / amount_due / meter_kwh) — same shape,
// LIVE provenance — but the VALUES differ so a test can prove the data flows
// through the live prop path, not the manifest's sampleExtractionValues.

// Resolved (UUID-shaped, colon-free) doc id so `isResolvedDocumentId` accepts
// it and SchemaView runs the live load. Placeholder ids (`utility-bill-2026-04`)
// would skip the load — which is exactly why the manifest arm used to be needed.
const LIVE_UTILITY_DOC_ID = "c3bfff49-6640-4213-822b-e81c3a771e45";
const LIVE_WORKFLOW_ID = "9910308e-3100-473e-9da6-3ac29f5958a6";
const getGroundXWorkflow = vi.fn();
const getGroundXDocument = vi.fn();
const getGroundXDocumentExtract = vi.fn();
const extractField = vi.fn();
const saveTemplate = vi.fn();

// Injected live workflow (test seam) — same field ids as the manifest schema so
// existing row assertions stay valid, but sourced live (workflow → extract), not
// the manifest. Statement: account_number (STRING) + amount_due (NUMBER).
// Meters: meter_kwh (NUMBER).
const LIVE_WORKFLOW = {
  workflow: {
    workflowId: LIVE_WORKFLOW_ID,
    name: "Utility Bill",
    extract: {
      statement: {
        fields: {
          account_number: {
            prompt: { description: "The account number printed in the statement header.", type: "str" },
          },
          amount_due: {
            prompt: { description: "Total amount due across all meters and charges, USD.", type: ["int", "float"] },
          },
        },
      },
      meters: {
        fields: {
          meter_kwh: {
            prompt: { description: "kWh consumed by the meter during the billing period.", type: ["int", "float"] },
          },
        },
      },
    },
  },
};

// Injected live extract VALUES (test seam) — distinct from the manifest's
// sampleExtractionValues (1023456 / 18742.16 / 4128) so a test proves the
// rendered value came from the live extract, not the manifest.
const LIVE_EXTRACT = {
  account_number: "9988776",
  amount_due: 20100.5,
  meters: [{ meter_kwh: 5309 }],
};

/**
 * Install the injected live extract (test seam) for the standalone `<SchemaView />`
 * surfaces. Returns a live-doc utility scenario the caller passes via
 * `initialScenarios` so the scenario's primary document is the resolved id.
 */
function installLiveExtract() {
  getGroundXWorkflow.mockResolvedValue(LIVE_WORKFLOW as never);
  getGroundXDocument.mockResolvedValue({
    document: { documentId: LIVE_UTILITY_DOC_ID, filter: { workflow_id: LIVE_WORKFLOW_ID } },
  } as never);
  getGroundXDocumentExtract.mockResolvedValue(LIVE_EXTRACT as never);
}

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import { Extract } from "@/components/viewer-widgets/Extract/Extract";
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";
import { useAppMode } from "@/contexts/AppModeContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { IngestView } from "@/views/Onboarding/IngestView/IngestView";

import { SchemaView } from "@/components/viewer-widgets/Extract/SchemaView";
import { utilityTestScenario } from "@/test/scenarioFixtures";
import type { ScenarioConfig } from "@/types/scenarios";
import { useEffect, useMemo, useRef, type FC, type ReactElement } from "react";
import type { ContentScope } from "@groundx/shared";

// Utility scenario whose primary document is the resolved live id, so the
// standalone `<SchemaView />` runs the live load (off the injected seam).
const liveUtilityScenario: ScenarioConfig = {
  ...utilityTestScenario,
  documents: [
    { documentId: LIVE_UTILITY_DOC_ID, fileName: "April 2026 Statement.pdf", order: 1 },
  ],
};
const LIVE_SCENARIOS: ScenarioConfig[] = [liveUtilityScenario];

const liveExtractApi = () => ({
  workflow: { getGroundXWorkflow },
  groundxDocuments: { getGroundXDocument, getGroundXDocumentExtract },
});

/**
 * 2026-05-31-schemaview-live-only-extract — render a standalone `<SchemaView />`
 * over the injected live extract (the manifest arm is retired, so a bare mount
 * has no source otherwise). Installs the live workflow/extract loaders + the
 * live-doc scenario, then waits for the live load to surface the schema. Field
 * ids mirror the manifest (account_number / amount_due / meter_kwh) so the
 * re-grounded assertions are unchanged — only the SOURCE moved to live.
 */
async function renderLiveSchemaView(ui: ReactElement) {
  installLiveExtract();
  const result = renderWithOnboardingProviders(ui, {
    initialFrame: "f3a",
    initialScenario: "utility",
    initialScenarios: LIVE_SCENARIOS,
    api: liveExtractApi(),
  });
  await screen.findByTestId("schema-field-account_number");
  // The schema card appears as soon as the live SCHEMA resolves, but the live
  // VALUES land in the same `setLive` commit — wait for a live value to render
  // before returning so callers that read value chips synchronously can't
  // observe the pre-resolution chip (label "CURRENT", value "—") under
  // full-suite CPU contention. Asserting the live account_number value
  // ("9988776", distinct from the manifest) proves values committed; if they
  // never do (a real load failure) this times out loudly rather than masking.
  await waitFor(() =>
    expect(screen.getByTestId("schema-field-value-account_number").textContent).toMatch(/9988776/),
  );
  return result;
}

/**
 * 2026-05-31-shared-canvas-affordance-restoration — the production
 * `views/Onboarding/ExtractView.tsx` thin wrapper was retired. This test mounts
 * `SchemaView` jointly with the Extract workbench shell, which the deleted
 * wrapper provided; the shim below reproduces it verbatim (scenario documents
 * scope + auth role → `Extract`) so the joint-mount tests are unchanged.
 */
const ExtractView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();
  const widgetRole = useWidgetRole();
  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const scenario = byId(scenarioId);
  const docId = scenario?.documents?.[0]?.documentId ?? null;
  const scope: ContentScope = useMemo(
    () => ({ type: "documents", documentIds: docId ? [docId] : [] }),
    [docId],
  );
  return <Extract scope={scope} role={widgetRole} />;
};

/**
 * Test harness that enqueues a propose-card on the active session
 * once, after mount, so the ProposalCard surface above the list can
 * be asserted. The proposal lands on the next render after mount.
 */
/**
 * `schema-agent-chat-affordances`: seed an added field with a prior
 * `done` extraction so the rerun-narration assertion can flip the
 * confidence delta. Adds `peak_demand_kw` to the `meters` category
 * with `format: "kW"` and seeds a prior extraction at confidence 0.83.
 */
function SchemaAgentRerunSeeder() {
  const {
    addSchemaField,
    editSchemaField,
    setSchemaFieldExtraction,
    setFocusedCategory,
  } = useChatStore();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    addSchemaField({
      id: "peak_demand_kw",
      categoryId: "meters",
      name: "Peak demand kW",
      type: "NUMBER",
      description: "Peak demand in kW",
    });
    editSchemaField("peak_demand_kw", { format: "kW" });
    setSchemaFieldExtraction("peak_demand_kw", {
      status: "done",
      value: 14.5,
      confidence: 0.83,
    });
    // Pre-focus the meters category so SchemaView's category-scoped
    // render exposes the seeded field. Default focus is `statement`.
    setFocusedCategory("meters");
  }, [addSchemaField, editSchemaField, setSchemaFieldExtraction, setFocusedCategory]);
  return null;
}

/**
 * `schema-agent-chat-affordances`: seed three compaction summaries on
 * the active session so the `chat-earlier-turns-summary` test can
 * assert the conditional render fires.
 */
function SummariesSeeder() {
  const { state, appendMessage } = useChatStore();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    // Push three synthetic summary rows directly into the session via
    // a private mutation. We don't have a public `addSummary` action
    // (compaction is a server-side pipeline); use Object.assign onto
    // the existing session entry. `state.sessions` is a ReadonlyMap of
    // sessions whose `summaries` array we mutate in place — acceptable
    // for a test seed since React re-renders are driven by appendMessage.
    const session = state.sessions.get(sessionId);
    if (!session) return;
    (session.summaries as unknown[]).push(
      { id: "s1", fromMessageId: "m1", toMessageId: "m5", generation: 1, absorbedSummaryIds: [], content: "earlier", model: "x", tokensIn: 0, tokensOut: 0, createdAt: Date.now() },
      { id: "s2", fromMessageId: "m6", toMessageId: "m10", generation: 1, absorbedSummaryIds: [], content: "earlier", model: "x", tokensIn: 0, tokensOut: 0, createdAt: Date.now() },
      { id: "s3", fromMessageId: "m11", toMessageId: "m15", generation: 1, absorbedSummaryIds: [], content: "earlier", model: "x", tokensIn: 0, tokensOut: 0, createdAt: Date.now() },
    );
    // Trigger a re-render so the ChatColumn picks up the seeded summaries.
    appendMessage({ role: "system", content: "[seed]" });
  }, [appendMessage, state]);
  return null;
}

function ProposalSeeder({
  name,
  provenance,
}: {
  name: string;
  /** When set, the canvas ProposalCard renders the `envelope verified` label. */
  provenance?: { version: "v1"; verified: true };
}) {
  const { enqueueFieldProposal } = useChatStore();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    enqueueFieldProposal({
      categoryId: "statement",
      name,
      type: "NUMBER",
      description: `${name} description`,
      provenance,
    });
  }, [enqueueFieldProposal, name, provenance]);
  return null;
}

// The ChatStoreProvider's eager-ensure useEffect fires ensureServerChatSession
// on mount + on every active-session state change (e.g. after a Remove click
// re-renders the session). Without a fetch stub, that POST resolves
// asynchronously after the test finishes and triggers an act() warning that
// the global console.error spy promotes to a failure. The stub keeps the
// promise chain resolved within the test's lifetime so React's commit phase
// stays inside the test's act boundary.
const originalFetch = global.fetch;

beforeEach(() => {
  __resetEnsuredChatSessions();
  // Canvas↔chat coherence (2026-06-11): these suites mount MID-FLOW frames
  // (f3a / f4) with an empty thread. Mid-flow implies the scripted Understand
  // intro already played, so seed its doneness — otherwise the Intro's
  // replay-snap (correctly) yanks the canvas back to f2 and unmounts the
  // view under test.
  window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
  getGroundXWorkflow.mockReset();
  getGroundXDocument.mockReset();
  getGroundXDocumentExtract.mockReset();
  extractField.mockReset();
  extractField.mockResolvedValue({ value: null, confidence: 0, citation: null });
  saveTemplate.mockReset();
  saveTemplate.mockResolvedValue({ id: "es-stub", name: "Utility (custom)", updatedAt: "2026-05-27T00:00:00Z" });
  // Replace the global setup.ts throw-on-error spy with a silent one for
  // this suite. The ChatStoreProvider's eager-ensure useEffect fires
  // async fetch chains whose continuations may resolve outside the
  // test's act boundary — that's expected (fire-and-forget telemetry).
  // Mirrors the InteractView.test.tsx pattern.
  vi.spyOn(console, "error").mockImplementation(() => {});
  // SC-01: pre-set csrf_token cookie so csrfFetch skips the bootstrap
  // GET round-trip in the test environment.
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

describe("SchemaView (UI-01 Phase 1)", () => {
  it("renders an empty state when no scenario is active", () => {
    renderWithOnboardingProviders(<SchemaView />, { initialFrame: "f3a", initialScenario: null });
    expect(screen.getByTestId("schema-view-empty")).toBeInTheDocument();
  });

  // ── 2026-05-31-schemaview-live-only-extract · Task 1 ────────────
  // With a live extract injected at the seam, the standalone `<SchemaView />`
  // mount (no live props) renders from the LIVE prop path — schema + values
  // resolved via the same getDocument → getGroundXWorkflow → getDocumentExtract
  // path the Extract widget uses — NOT the manifest. Assert via the live VALUE
  // (distinct from the manifest's sampleExtractionValues) so the source is
  // provably live.
  it("injected-seam: standalone SchemaView renders from the live extract (not the manifest)", async () => {
    installLiveExtract();
    renderWithOnboardingProviders(<SchemaView />, {
      initialFrame: "f3a",
      initialScenario: "utility",
      initialScenarios: LIVE_SCENARIOS,
      api: liveExtractApi(),
    });
    // Field card resolves from the live workflow schema. Value is the LIVE
    // extract's amount_due (20,100.5), NOT the manifest's sampleExtractionValues
    // (18,742.16). The schema card and live values land in the SAME `setLive`
    // commit, but assert the value inside `waitFor` so the read can't race the
    // pre-resolution chip ("CURRENT" / "—") under full-suite CPU contention.
    await waitFor(() => {
      expect(screen.getByTestId("schema-field-value-amount_due").textContent).toMatch(/20,100\.5/);
    });
    const amountValue = screen.getByTestId("schema-field-value-amount_due");
    expect(amountValue.textContent).not.toMatch(/18,742\.16/);
    // account_number live value (9988776), not the manifest's 1023456.
    const acctValue = screen.getByTestId("schema-field-value-account_number");
    expect(acctValue.textContent).toMatch(/9988776/);
    expect(acctValue.textContent).not.toMatch(/1023456/);
  });

  // ── 2026-05-31-schemaview-live-only-extract · Task 2 ────────────
  // When the live extract is ABSENT (no workflow on the doc → live load yields
  // nothing), SchemaView surfaces its real empty ("live extract unavailable")
  // state and does NOT fall back to scenario.manifest.extractionSchema. The
  // manifest's fields (account_number / amount_due / meter_kwh) must NOT render.
  it("no live extract → real empty state, NO manifest fallback", async () => {
    // Doc resolves but carries no workflow_id → live schema is null.
    getGroundXDocument.mockResolvedValue({
      document: { documentId: LIVE_UTILITY_DOC_ID },
    } as never);
    getGroundXDocumentExtract.mockResolvedValue({} as never);
    renderWithOnboardingProviders(<SchemaView />, {
      initialFrame: "f3a",
      initialScenario: "utility",
      initialScenarios: LIVE_SCENARIOS,
      api: liveExtractApi(),
    });
    // Empty / "live extract unavailable" state is shown.
    expect(await screen.findByTestId("schema-view-empty")).toBeInTheDocument();
    // The manifest schema's fields are NEVER rendered.
    expect(screen.queryByTestId("schema-field-account_number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-amount_due")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-meter_kwh")).not.toBeInTheDocument();
    // No element defaults its extraction status to the literal "manifest".
    expect(document.querySelector('[data-extraction-status="manifest"]')).toBeNull();
  });

  it("data-extraction-status reflects the live extraction state, never the literal \"manifest\"", async () => {
    installLiveExtract();
    renderWithOnboardingProviders(<SchemaView />, {
      initialFrame: "f3a",
      initialScenario: "utility",
      initialScenarios: LIVE_SCENARIOS,
      api: liveExtractApi(),
    });
    const amountValue = await screen.findByTestId("schema-field-value-amount_due");
    const statusEl = amountValue.querySelector("[data-extraction-status]");
    expect(statusEl).not.toBeNull();
    // Live extract present but no per-field focused re-run → status is the
    // base live "current" state, NOT the retired "manifest" literal.
    expect(statusEl?.getAttribute("data-extraction-status")).not.toBe("manifest");
  });

  it("renders the Utility scenario's category sections + field cards", async () => {
    await renderLiveSchemaView(<SchemaView />);
    expect(screen.getByTestId("schema-view")).toBeInTheDocument();
    expect(screen.getByTestId("schema-category-statement")).toBeInTheDocument();
    expect(screen.getByTestId("schema-category-meters")).toBeInTheDocument();
    // Spot-check fields from the live extract's utility schema.
    expect(screen.getByTestId("schema-field-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-amount_due")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-meter_kwh")).toBeInTheDocument();
  });

  it("each field card surfaces its type badge + current sample value", async () => {
    await renderLiveSchemaView(<SchemaView />);
    // STRING field
    expect(screen.getByTestId("schema-field-type-account_number")).toHaveTextContent("STRING");
    // NUMBER field — current value pulled from the live extract.
    expect(screen.getByTestId("schema-field-type-amount_due")).toHaveTextContent("NUMBER");
    const amountValue = screen.getByTestId("schema-field-value-amount_due");
    expect(amountValue).toBeInTheDocument();
    // Live extract sets amount_due to a specific number; just confirm
    // a numeric-looking value renders (formatted via toLocaleString).
    expect(amountValue.textContent).toMatch(/\d/);
    // The second NUMBER field (kWh consumed) should also render.
    expect(screen.getByTestId("schema-field-type-meter_kwh")).toHaveTextContent("NUMBER");
  });

  // Per spec (project_spec_frames.md), F3a is the Design surface
  // INSIDE the extraction-workbench (ExtractView). The topbar (Save /
  // rerun / export / edit schema) lives on the ExtractView shell, not
  // SchemaView. These tests mount ExtractView with initialFrame=f3a so
  // the Design surface is rendered + the topbar's Save button is in
  // scope.
  it("topbar Save stays disabled until the overlay has an unsaved change", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    expect(screen.getByTestId("extract-topbar-save")).toBeDisabled();
    // Per spec: the Design surface has no manual Add-field button —
    // proposals come from chat and surface above the list as
    // ProposalCards.
    expect(screen.queryByTestId("schema-add-field-statement")).not.toBeInTheDocument();
  });

  it("topbar status shows nothing when overlay is empty (saveStatus = idle, no diff)", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    expect(screen.queryByTestId("extract-topbar-status")).not.toBeInTheDocument();
  });

  it("clicking Remove on a field dispatches removeSchemaField; field disappears + topbar shows diff", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    expect(screen.getByTestId("schema-field-account_number")).toBeInTheDocument();
    await user.click(screen.getByTestId("schema-remove-field-account_number"));
    await waitFor(() => {
      expect(screen.queryByTestId("schema-field-account_number")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("extract-topbar-diff")).toHaveTextContent(/0 added · 1 removed/);
  });

  it("topbar Save is disabled when the overlay is empty", () => {
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    expect(screen.getByTestId("extract-topbar-save")).toBeDisabled();
  });

  it("topbar Save becomes enabled when there are unsaved changes (Phase 2d)", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    expect(screen.getByTestId("extract-topbar-save")).toBeDisabled();
    await user.click(screen.getByTestId("schema-remove-field-amount_due"));
    await waitFor(() => {
      expect(screen.getByTestId("extract-topbar-save")).not.toBeDisabled();
    });
  });

  it("clicking topbar Save calls the injected template client + flips status to Saved", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, {
      initialFrame: "f3a",
      initialScenario: "utility",
      api: { template: { saveTemplate } },
    });
    // Make a change so the button enables.
    await user.click(screen.getByTestId("schema-remove-field-amount_due"));
    await waitFor(() => {
      expect(screen.getByTestId("extract-topbar-save")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("extract-topbar-save"));
    await waitFor(() => {
      expect(screen.getByTestId("extract-topbar-status")).toHaveTextContent(/Saved/);
    });
    const body = saveTemplate.mock.calls[0][0];
    expect(body.name).toBeTruthy();
    expect(body.kind).toBe("extract");
    expect(body.body.categories).toBeInstanceOf(Array);
    // 🔒 client never sends an owner.
    expect("ownerUsername" in body).toBe(false);
  });

  // ── category-scoped-fields-view (openspec change) ───────────────

  it("Fields tab scoped to the focused category renders only that category's fields + a flat header", async () => {
    // Mounting via ExtractView triggers the auto-pin + seed-focus
    // effect that lands focusedCategoryId = "statement" (first category).
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    await waitFor(() => expect(screen.getByTestId("schema-view")).toBeInTheDocument());
    // Statement category fields are present.
    expect(screen.getByTestId("schema-field-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-amount_due")).toBeInTheDocument();
    // Meters fields are NOT (filtered out by focusedCategoryId scope).
    expect(screen.queryByTestId("schema-field-meter_kwh")).not.toBeInTheDocument();
    // Flat list header.
    expect(screen.getByTestId("schema-fields-header")).toHaveTextContent(/Existing fields\s*·\s*2 accepted/i);
    // No unsaved indicator when overlay clean.
    expect(screen.queryByTestId("schema-fields-unsaved")).not.toBeInTheDocument();
  });

  it("unsaved indicator surfaces when overlay carries diff affecting the focused category", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    await waitFor(() => expect(screen.getByTestId("schema-fields-header")).toBeInTheDocument());
    await user.click(screen.getByTestId("schema-remove-field-account_number"));
    await waitFor(() =>
      expect(screen.getByTestId("schema-fields-unsaved")).toHaveTextContent(/●\s*1\s+unsaved/),
    );
  });

  // ── Inline-edit pattern (wireframe fix) ─────────────────────────

  it("clicking Edit on a field opens the inline editor below; other rows stay collapsed", async () => {
    const user = userEvent.setup();
    await renderLiveSchemaView(<SchemaView />);
    // Initial: no editor open.
    expect(screen.queryByTestId("schema-field-editor-account_number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-editor-amount_due")).not.toBeInTheDocument();
    // Open the first field's editor.
    await user.click(screen.getByTestId("schema-edit-field-account_number"));
    expect(screen.getByTestId("schema-field-editor-account_number")).toBeInTheDocument();
    // Other rows stay collapsed.
    expect(screen.queryByTestId("schema-field-editor-amount_due")).not.toBeInTheDocument();
    // Opening a second editor closes the first (single-row-open invariant).
    await user.click(screen.getByTestId("schema-edit-field-amount_due"));
    expect(screen.getByTestId("schema-field-editor-amount_due")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-editor-account_number")).not.toBeInTheDocument();
  });

  it("inline editor exposes name, type, format, required, prompt, instructions, identifier chips, preview + Save/Cancel/Rerun (expand-inline-editor-fields)", async () => {
    const user = userEvent.setup();
    await renderLiveSchemaView(<SchemaView />);
    await user.click(screen.getByTestId("schema-edit-field-account_number"));
    expect(screen.getByTestId("schema-field-editor-name-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-type-account_number")).toBeInTheDocument();
    // `format` column lives next to name + type per the wireframe.
    expect(screen.getByTestId("schema-field-editor-format-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-required-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-prompt-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-instructions-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-preview-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-rerun-account_number")).toBeInTheDocument();
    // `✨ rewrite with agent` (renamed from "with AI" per spec).
    const rewrite = screen.getByTestId("schema-field-editor-rewrite-account_number");
    expect(rewrite).toBeInTheDocument();
    expect(rewrite.textContent ?? "").toMatch(/rewrite with agent/);
    expect(screen.getByTestId("schema-field-editor-save-account_number")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-editor-cancel-account_number")).toBeInTheDocument();
    // `save field` lowercased per spec.
    expect(screen.getByTestId("schema-field-editor-save-account_number").textContent).toMatch(/save field/);
    // Identifier chips: editable container exists with a + add affordance.
    const idContainer = screen.getByTestId("schema-field-editor-identifiers-account_number");
    expect(idContainer).toBeInTheDocument();
    expect(within(idContainer).getByTestId("schema-field-editor-identifier-add-account_number")).toBeInTheDocument();
  });

  it("identifiers chip array supports add + remove via the editor (expand-inline-editor-fields)", async () => {
    const user = userEvent.setup();
    await renderLiveSchemaView(<SchemaView />);
    await user.click(screen.getByTestId("schema-edit-field-account_number"));
    const addBtn = screen.getByTestId("schema-field-editor-identifier-add-account_number");
    // Click + add → enters input mode.
    await user.click(addBtn);
    const input = screen.getByTestId("schema-field-editor-identifier-input-account_number") as HTMLInputElement;
    await user.type(input, "Account No.{Enter}");
    // Chip with the new identifier appears.
    expect(screen.getByTestId("schema-field-editor-identifier-chip-account_number-0")).toHaveTextContent(/Account No\./);
    // Remove the chip.
    await user.click(screen.getByTestId("schema-field-editor-identifier-remove-account_number-0"));
    expect(screen.queryByTestId("schema-field-editor-identifier-chip-account_number-0")).not.toBeInTheDocument();
  });

  it("Save commits the edit; the row shows an 'edited' badge + topbar diff counts the edit", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<ExtractView />, { initialFrame: "f3a", initialScenario: "utility" });
    await user.click(screen.getByTestId("schema-edit-field-account_number"));
    // Tweak the prompt textarea so Save lands a real patch.
    const promptInput = screen.getByTestId("schema-field-editor-prompt-account_number").querySelector("textarea");
    expect(promptInput).not.toBeNull();
    await user.clear(promptInput!);
    await user.type(promptInput!, "Just the account number digits.");
    await user.click(screen.getByTestId("schema-field-editor-save-account_number"));
    // Editor closes on save.
    await waitFor(() => {
      expect(screen.queryByTestId("schema-field-editor-account_number")).not.toBeInTheDocument();
    });
    // Row now carries the edited badge.
    expect(screen.getByTestId("schema-field-edited-account_number")).toBeInTheDocument();
    // Topbar diff reflects 1 edited.
    expect(screen.getByTestId("extract-topbar-diff")).toHaveTextContent(/1 edited/);
  });

  it("Cancel discards the form state and closes the editor without changing the overlay", async () => {
    const user = userEvent.setup();
    await renderLiveSchemaView(<SchemaView />);
    await user.click(screen.getByTestId("schema-edit-field-account_number"));
    const promptInput = screen.getByTestId("schema-field-editor-prompt-account_number").querySelector("textarea");
    await user.clear(promptInput!);
    await user.type(promptInput!, "About to discard.");
    await user.click(screen.getByTestId("schema-field-editor-cancel-account_number"));
    await waitFor(() => {
      expect(screen.queryByTestId("schema-field-editor-account_number")).not.toBeInTheDocument();
    });
    // No edit landed; topbar shows no status (overlay clean).
    expect(screen.queryByTestId("schema-field-edited-account_number")).not.toBeInTheDocument();
  });

  // ── ProposalCard above the list (wireframe fix) ──────────────────

  it("renders a ProposalCard above the field list when the chat enqueues a proposal", async () => {
    installLiveExtract();
    renderWithOnboardingProviders(
      <>
        <ProposalSeeder name="total_tax" />
        <SchemaView />
      </>,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialScenarios: LIVE_SCENARIOS,
        api: liveExtractApi(),
      },
    );
    await waitFor(() => {
      expect(screen.getByTestId("schema-view-proposals")).toBeInTheDocument();
    });
    // Card shows the proposal's name + dispatch controls.
    const card = screen.getByTestId("schema-view-proposals");
    expect(card.textContent).toMatch(/total_tax/);
    expect(card.querySelector('[data-testid^="schema-proposal-accept-"]')).not.toBeNull();
    expect(card.querySelector('[data-testid^="schema-proposal-dismiss-"]')).not.toBeNull();
  });

  it("Accept on the canvas ProposalCard adds the field to the schema list + clears the proposal", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <>
        <ProposalSeeder name="total_tax" />
        <ExtractView />
      </>,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const acceptBtn = await screen.findByTestId(/^schema-proposal-accept-/);
    await user.click(acceptBtn);
    // The proposal slot disappears once the queue is empty.
    await waitFor(() => {
      expect(screen.queryByTestId("schema-view-proposals")).not.toBeInTheDocument();
    });
    // The new field appears in the Statement category (matched by name).
    const statementCategory = screen.getByTestId("schema-category-statement");
    expect(statementCategory.textContent).toMatch(/total_tax/);
    // Topbar diff reflects the addition.
    expect(screen.getByTestId("extract-topbar-diff")).toHaveTextContent(/1 added/);
  });

  // ── schema-agent-chat-affordances ───────────────────────────────

  it("renders chat-earlier-turns-summary when the active session has summaries", async () => {
    renderWithOnboardingProviders(
      <>
        <SummariesSeeder />
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <ExtractView />
      </>,
      { initialFrame: "f3a", initialScenario: "utility" },
    );
    const node = await screen.findByTestId("chat-earlier-turns-summary");
    expect(node).toHaveTextContent(/▾ earlier turns \(\d+ proposals · \d+ fields accepted\)/);
  });

  it("clicking ↻ rerun on a field with a prior confidence appends an assistant bubble narrating the delta", async () => {
    extractField.mockResolvedValueOnce({
      value: 16.2,
      confidence: 0.98,
      citation: null,
    });
    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <>
        <SchemaAgentRerunSeeder />
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <ExtractView />
      </>,
      // `?focus=meters` so ExtractView's initial-focus effect lands on
      // the same category our seeder pre-pins, avoiding the race with
      // ExtractView's default-to-first-category effect.
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialUrl: "/onboarding/28454/utility?focus=meters",
        api: { extract: { extractField } },
      },
    );
    // Field appears via the seeder.
    const editBtn = await screen.findByTestId("schema-edit-field-peak_demand_kw");
    await user.click(editBtn);
    await user.click(screen.getByTestId("schema-field-editor-rerun-peak_demand_kw"));
    await waitFor(() => {
      const bubbles = screen.queryAllByTestId("chat-live-assistant");
      expect(
        bubbles.some((b) =>
          /Re-ran on the sample: 16\.2 kW · confidence 0\.98 ↑ from 0\.83/.test(b.textContent ?? ""),
        ),
      ).toBe(true);
    });
  });

  // ── proposal-envelope-provenance ────────────────────────────────

  it("F3a ProposalCard renders `proposal_v1 · envelope verified` when provenance is verified", async () => {
    installLiveExtract();
    renderWithOnboardingProviders(
      <>
        <ProposalSeeder name="total_tax" provenance={{ version: "v1", verified: true }} />
        <SchemaView />
      </>,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialScenarios: LIVE_SCENARIOS,
        api: liveExtractApi(),
      },
    );
    const label = await screen.findByTestId(/^schema-proposal-provenance-/);
    expect(label).toHaveTextContent("proposal_v1 · envelope verified");
  });

  it("F3a ProposalCard omits the provenance label when provenance is absent", async () => {
    installLiveExtract();
    renderWithOnboardingProviders(
      <>
        <ProposalSeeder name="total_tax" />
        <SchemaView />
      </>,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialScenarios: LIVE_SCENARIOS,
        api: liveExtractApi(),
      },
    );
    await waitFor(() => {
      expect(screen.getByTestId("schema-view-proposals")).toBeInTheDocument();
    });
    expect(screen.queryByTestId(/^schema-proposal-provenance-/)).not.toBeInTheDocument();
  });

  it("Dismiss on the canvas ProposalCard clears the proposal without adding the field", async () => {
    const user = userEvent.setup();
    installLiveExtract();
    renderWithOnboardingProviders(
      <>
        <ProposalSeeder name="total_tax" />
        <SchemaView />
      </>,
      {
        initialFrame: "f3a",
        initialScenario: "utility",
        initialScenarios: LIVE_SCENARIOS,
        api: liveExtractApi(),
      },
    );
    const dismissBtn = await screen.findByTestId(/^schema-proposal-dismiss-/);
    await user.click(dismissBtn);
    await waitFor(() => {
      expect(screen.queryByTestId("schema-view-proposals")).not.toBeInTheDocument();
    });
    // No "total_tax" anywhere.
    expect(screen.queryByText(/total_tax/)).not.toBeInTheDocument();
  });

  // ── f3a-save-signin-gate-handoff ─────────────────────────────────

  it("anonymous Save → 401 opens the F6 gate inline with the save-schema preamble", async () => {
    const user = userEvent.setup();
    saveTemplate.mockRejectedValueOnce(Object.assign(new Error("unauthenticated"), { status: 401 }));
    renderWithOnboardingProviders(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <ExtractView />
      </>,
      { initialFrame: "f3a", initialScenario: "utility", api: { template: { saveTemplate } } },
    );
    await user.click(screen.getByTestId("schema-remove-field-amount_due"));
    await waitFor(() => {
      expect(screen.getByTestId("extract-topbar-save")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("extract-topbar-save"));
    // The legacy `extract-topbar-status` no longer carries the "sign in"
    // nudge — instead the F6 gate opens inline in chat with the
    // cause-specific preamble.
    const preamble = await screen.findByTestId("gate-rail-preamble");
    expect(preamble).toHaveTextContent("Sign in to save this schema");
  });

  it("anonymous Save → gate → commit retries the save and lands on F1 with the schema pre-attached", async () => {
    const user = userEvent.setup();
    saveTemplate
      .mockRejectedValueOnce(Object.assign(new Error("unauthenticated"), { status: 401 }))
      .mockResolvedValueOnce({ id: "es-stub", name: "Utility (custom)", updatedAt: "2026-05-27T00:00:00Z" });

    // GateCommitter — simulates the gate's sign-up form submitting.
    // Listens for the gate to open with cause "save-schema" and then
    // calls commitGate("register"); the injected saveTemplate mock is
    // staged as 401 then success so the post-commit retry can complete.
    function GateCommitter() {
      const { state, commitGate } = useOnboardingSession();
      useEffect(() => {
        if (state.gate.status === "open" && state.gate.cause === "save-schema") {
          commitGate("register");
        }
      }, [state.gate, commitGate]);
      return null;
    }

    renderWithOnboardingProviders(
      <>
        <GateCommitter />
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <ExtractView />
        {/* IngestView is mounted as a sibling so the banner is
            assertable after the post-commit advance to F1 — the test
            wrapper doesn't simulate OnboardingShell's frame routing. */}
        <IngestView />
      </>,
      { initialFrame: "f3a", initialScenario: "utility", api: { template: { saveTemplate } } },
    );
    await user.click(screen.getByTestId("schema-remove-field-amount_due"));
    await waitFor(() => {
      expect(screen.getByTestId("extract-topbar-save")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("extract-topbar-save"));
    // GateCommitter sees the gate open + commits → ExtractView's
    // post-commit effect fires the save retry (mocked 200) → sets
    // preAttachedSchemaId + advances to F1. F1 surfaces the
    // pre-attached banner.
    const banner = await screen.findByTestId("ingest-pre-attached-schema");
    expect(banner.textContent ?? "").toMatch(/SCHEMA ATTACHED/);
    expect(banner.textContent ?? "").toMatch(/^SCHEMA ATTACHEDes-/);
  });

  // `master-viewer-session` Phase 5 — the legacy `preAttachedSchemaId`
  // slot was deleted; the pre-attach signal lives on the F1 ingest-
  // picker step's `attachedSchema` annotation. Probe the viewer step
  // directly via ChatStore.
  it("pushStep with attachedSchema annotation lands on the F1 step (Phase 5 viewer-step source)", async () => {
    function Probe() {
      const { state, pushStep } = useChatStore();
      const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
      const top =
        session && session.viewer.currentStep.stepIndex >= 0
          ? session.viewer.history[session.viewer.currentStep.stepIndex]
          : null;
      const attached = top && top.kind === "ingest-picker" ? top.attachedSchema?.schemaId ?? null : null;
      return (
        <>
          <div data-testid="probe-pre-attached">{attached ?? "null"}</div>
          <button
            type="button"
            data-testid="probe-set"
            onClick={() => pushStep({ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } })}
          >
            set
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    renderWithOnboardingProviders(<Probe />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByTestId("probe-pre-attached")).toHaveTextContent("null");
    await user.click(screen.getByTestId("probe-set"));
    await waitFor(() => expect(screen.getByTestId("probe-pre-attached")).toHaveTextContent("es-1"));
  });
});
