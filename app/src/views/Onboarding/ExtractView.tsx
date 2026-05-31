import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { TemplateApiError, saveTemplate } from "@/api/templates";
import type { ExtractBody } from "@groundx/shared";
import { getGroundXWorkflow } from "@/api/entities/groundxWorkflowsEntity";
import { extractToValues, workflowToSchema } from "@/api/extractLiveData";
import { fetchFieldGeometry, type ResolvedFieldGeometry } from "@/api/fieldGeometry";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CORAL,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { track } from "@/lib/analytics";
import type { ExtractedFieldValue, ExtractionSchemaDef } from "@/types/scenarios";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { SchemaView } from "./SchemaView";

/**
 * ExtractView — F3/F3a/F4 shell for the extraction-workbench widget.
 *
 * Per spec (`project_spec_frames.md`), F3 / F3a / F4 are the three
 * surfaces of the same extraction-workbench. ExtractView owns the
 * **workbench shell** — header / topbar / frame routing — and
 * mounts a different body per frame:
 *
 *   F3   Results  — schema fields on the left, citation peek on the
 *                   right. The "table" / "json" render-mode toggle
 *                   lives here (Loan scenario only).
 *   F3a  Design   — `<SchemaView />` body: ProposalCard above the
 *                   list + inline-edit per field row.
 *   F4   Source   — citation-provenance peek (deferred to a follow-up;
 *                   today it falls back to the Results body's right
 *                   panel).
 *
 * Topbar (per `project_dev_contracts.md`):
 *   `export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒`
 * The padlock icons are locked-for-anon affordances; Save reuses the
 * `saveTemplate` path against the auth-gated
 * `POST /api/templates`. `✎ edit schema` switches Results ↔
 * Design (F3 ↔ F3a). `↻ rerun` is a topbar-level rerun (per-field
 * rerun stays inside the Design surface's inline editor).
 *
 * Optional inbound URL search param `?focus=<categoryId>` pre-selects
 * the first field in that category — used by the F2 Pick-a-view pills
 * (`statement` / `meters` / `charges`) so the chat-driven choice lands
 * the user on the right slice of the schema.
 */
type SaveStatus = "idle" | "saving" | "saved" | "needs-signin" | "error";

function mintTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `es-${crypto.randomUUID()}`;
  }
  return `es-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Merge the per-session overlay onto the manifest extraction-schema for
 * Save. Mirrors SchemaView's render-time merge so the persisted
 * "template" is the same shape the user sees on canvas. Returns a
 * typed `ExtractBody` the saveTemplate helper sends as the Template body.
 */
function mergeOverlayForSave(
  manifestSchema: import("@/types/scenarios").ExtractionSchemaDef,
  overlay: import("@/contexts/ChatStoreContext/types").PendingSchemaOverlay | null,
): ExtractBody {
  // The Template body is just the categories tree (the row owns id/name).
  if (!overlay) return { categories: manifestSchema.categories };
  const known = new Set(manifestSchema.categories.map((c) => c.id));
  const orphanAdditions = overlay.addedFields.filter((a) => !known.has(a.categoryId));
  const categories = manifestSchema.categories.map((cat) => {
    const baseFields = cat.fields
      .filter((f) => !overlay.removedFieldIds.has(f.id))
      .map((f) => {
        const edit = overlay.editedFields.get(f.id);
        return edit ? { ...f, ...edit } : f;
      });
    const added = overlay.addedFields
      .filter((a) => a.categoryId === cat.id && !overlay.removedFieldIds.has(a.id))
      .map((a) => {
        const edit = overlay.editedFields.get(a.id);
        const base = { id: a.id, name: a.name, type: a.type, description: a.description };
        return edit ? { ...base, ...edit } : base;
      });
    return { ...cat, fields: [...baseFields, ...added] };
  });
  if (orphanAdditions.length > 0) {
    categories.push({
      id: "custom",
      type: "statement" as const,
      name: "Custom",
      fields: orphanAdditions.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
      })),
    });
  }
  return { categories };
}

// Shared section-label style for the field-detail (provenance) panel — a
// quiet uppercase eyebrow so the content under each label is the focus.
const detailLabelSx = {
  display: "block",
  color: MUTED_ON_LIGHT,
  fontWeight: FONT_WEIGHT_LABEL,
  fontSize: FONT_SIZE_LABEL,
  letterSpacing: 0.6,
  textTransform: "uppercase",
} as const;

export const ExtractView: FC = () => {
  // All hooks must run before any conditional return. Otherwise the render
  // order diverges when the active scenario flips to one without a schema
  // (e.g. Solar), violating React's rules of hooks and crashing.
  const { state: appMode } = useAppMode();
  const {
    state: session,
    advanceFrame,
    openGate,
  } = useOnboardingSession();
  const {
    state: chatState,
    pinSample,
    unpinSample,
    setFocusedCategory,
    // `master-viewer-session` Phase 5 — pre-attach is now a viewer-step
    // annotation + a chat agent message, not a standalone slot.
    pushStep,
    appendAgentMessage,
  } = useChatStore();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"table" | "json">("table");
  const handleRenderMode = (_event: SyntheticEvent, value: "table" | "json") => {
    if (value) setRenderMode(value);
  };

  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const { byId } = useScenarioRegistry();
  const scenario = byId(scenarioId);
  // WF-12 — live schema/values: getDocument → filter.workflow_id →
  // getGroundXWorkflow (schema) + getDocumentExtract (values). The scenario
  // manifest is the fallback (placeholder ids, pre-resolve, BYO, or errors) so
  // existing tests + the BYO branch keep working.
  const { getDocument, getDocumentExtract } = useDocumentsContext();
  const [liveSchema, setLiveSchema] = useState<ExtractionSchemaDef | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, string | number | boolean | null>>({});
  // WF-05 — per-field source geometry resolved from the X-Ray (getextract
  // carries none). Keyed by fieldId; absent → field-click highlight degrades.
  const [liveGeometry, setLiveGeometry] = useState<Map<string, ResolvedFieldGeometry>>(new Map());
  const liveDocId = scenario?.documents?.[0]?.documentId;
  useEffect(() => {
    if (!liveDocId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(liveDocId)) return; // skip placeholder ids
    let cancelled = false;
    void (async () => {
      try {
        const doc = await getDocument(liveDocId);
        const workflowId = (doc.response?.filter as Record<string, unknown> | undefined)?.workflow_id;
        if (typeof workflowId !== "string") return;
        const wf = await getGroundXWorkflow(workflowId);
        const live = workflowToSchema(wf.workflow as unknown as Record<string, unknown>);
        if (cancelled || !live) return;
        setLiveSchema(live);
        const ex = await getDocumentExtract(liveDocId);
        if (cancelled || !ex.response) return;
        const values = extractToValues(ex.response as Record<string, unknown>, live);
        setLiveValues(values);
        // WF-05 — resolve each field's source region from the X-Ray (the
        // extract carries no geometry). Best-effort: misses ship null.
        const queries = live.categories.flatMap((cat) =>
          cat.fields
            .filter((f) => f.id in values)
            .map((f) => ({ fieldId: f.id, value: values[f.id], label: f.name })),
        );
        const geos = await fetchFieldGeometry(
          liveDocId,
          queries.map(({ value, label }) => ({ value, label })),
        );
        if (cancelled) return;
        const geoMap = new Map<string, ResolvedFieldGeometry>();
        queries.forEach((q, i) => {
          const g = geos[i];
          if (g) geoMap.set(q.fieldId, g);
        });
        setLiveGeometry(geoMap);
      } catch {
        /* fall back to the manifest schema */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveDocId, getDocument, getDocumentExtract]);

  const schema = liveSchema ?? scenario?.manifest.extractionSchema;

  // Topbar Save state (hoisted from SchemaView — F3a Design surface no
  // longer owns chrome). Save state is shared across F3/F3a/F4 because
  // the workbench's overlay (additions / removals / per-field edits)
  // is what gets pinned, regardless of which sub-surface is active.
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const templateIdRef = useRef<string | null>(null);
  // Active overlay diff feeds the topbar Save-button enable state.
  const activeChatSession = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)
    : null;
  const overlay = activeChatSession?.pendingSchemaOverlay;
  const hasUnsavedChanges = overlay
    ? overlay.addedFields.length + overlay.removedFieldIds.size + overlay.editedFields.size > 0
    : false;

  // Topbar buttons:
  //   - export      — Phase-stub. Locked for anon; the unauth padlock
  //                   matches the spec wireframe (`export ▾ 🔒`). Real
  //                   export wiring is deferred.
  //   - ↻ rerun     — Phase-stub. Spec wires a scoped re-run of the
  //                   current schema. Today the per-field rerun lives
  //                   inside the Design surface's inline editor; the
  //                   topbar button stays visible so the user sees the
  //                   spec'd affordance.
  //   - ✎ edit schema ▾ — toggles Results (F3) ↔ Design (F3a). The
  //                   chevron is reserved for a future "load saved
  //                   schema" dropdown.
  //   - 💾 Save     — `saveTemplate` against the auth-gated
  //                   `/api/templates` endpoint. Reuses
  //                   SchemaView's prior save flow verbatim.
  const isAuthed = appMode.authState === "signed-in";
  const widgetRole = useWidgetRole();
  const isDesignSurface = session.currentFrame === "f3a";
  // `← back` on F3a returns to F3 (the Results surface). On F3 it's a
  // no-op; keeping it always-present keeps the topbar geometry stable
  // across F3 ↔ F3a.
  const handleBack = useCallback(() => {
    advanceFrame("f3");
  }, [advanceFrame]);
  // Per realign-f3a-topbar-chrome: the title block renders `Designing
  // <sample-id> · <category-id>`. `<sample-id>` is the active scenario
  // id; `<category-id>` is the focused category — driven by the URL
  // `?focus=<id>` param when present, else the schema's first category.
  // `add-pinned-samples-row` will replace this with a session overlay
  // slot; until then the URL param is the source of truth.
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || saveStatus === "saving") return;
    if (!schema) return;
    if (!templateIdRef.current) {
      templateIdRef.current = mintTemplateId();
    }
    setSaveStatus("saving");
    try {
      // Build the merged schema (manifest + overlay) so the server
      // stores the full pinned snapshot, not just the patch. The
      // SchemaView body already applies overlays at render time; we
      // re-build here because ExtractView is the surface that owns
      // Save now and needs the same merge logic visible to it.
      const merged = mergeOverlayForSave(schema, overlay ?? null);
      await saveTemplate({
        id: templateIdRef.current,
        kind: "extract",
        name: `${schema.name} (custom)`,
        body: merged,
      });
      setSaveStatus("saved");
      // `master-viewer-session` Phase 5 — pre-attach is a viewer-step
      // annotation + a chat agent message. Anonymous flow attaches
      // AFTER the gate completes (see the gate-watch effect below).
      if (templateIdRef.current) {
        const schemaName = `${schema.name} (custom)`;
        pushStep({
          kind: "ingest-picker",
          attachedSchema: { schemaId: templateIdRef.current, name: schemaName },
        });
        appendAgentMessage(`Schema attached: ${schemaName}`);
      }
    } catch (err) {
      if (err instanceof TemplateApiError && err.status === 401) {
        // `f3a-save-signin-gate-handoff`: anonymous user. Open F6 inline
        // with a `save-schema` cause so the post-commit effect knows
        // to retry the save + advance to F1 with the schema pre-attached.
        // Reset to `idle` so the topbar status row doesn't strand the
        // user on a stale "needs-signin" while the gate is up.
        setSaveStatus("idle");
        openGate("save", { cause: "save-schema" });
      } else {
        setSaveStatus("error");
      }
    }
  }, [hasUnsavedChanges, saveStatus, scenario, overlay, openGate, pushStep, appendAgentMessage]);

  // `f3a-save-signin-gate-handoff`: after the gate commits with our
  // cause, retry the save (now with an authed session cookie) → on
  // success, mark the schema as pre-attached AND advance to F1 so the
  // user lands on the ingest surface with the saved schema ready.
  // Effect runs once per commit transition; the `consumedRef` keeps
  // an authed flip from re-firing the save in a loop.
  const postCommitConsumedRef = useRef(false);
  useEffect(() => {
    const gate = session.gate;
    if (gate.status !== "committed") {
      // Reset for the next save-schema handoff cycle.
      postCommitConsumedRef.current = false;
      return;
    }
    if (gate.cause !== "save-schema") return;
    if (postCommitConsumedRef.current) return;
    postCommitConsumedRef.current = true;
    if (!schema) return;
    if (!templateIdRef.current) {
      templateIdRef.current = mintTemplateId();
    }
    setSaveStatus("saving");
    (async () => {
      try {
        const merged = mergeOverlayForSave(schema!, overlay ?? null);
        await saveTemplate({
          id: templateIdRef.current!,
          kind: "extract",
          name: `${schema!.name} (custom)`,
          body: merged,
        });
        setSaveStatus("saved");
        // `master-viewer-session` Phase 5 — advance the legacy frame
        // first (pushes a bare `ingest-picker` step), then layer the
        // attachment annotation on top so the F1 banner reads the
        // annotation off the latest step. Also append a chat agent
        // message so the conversation history records the attachment.
        const schemaName = `${schema!.name} (custom)`;
        advanceFrame("f1");
        pushStep({
          kind: "ingest-picker",
          attachedSchema: { schemaId: templateIdRef.current!, name: schemaName },
        });
        appendAgentMessage(`Schema attached: ${schemaName}`);
      } catch {
        setSaveStatus("error");
      }
    })();
  }, [session.gate, scenario, overlay, advanceFrame, pushStep, appendAgentMessage]);

  // Schema defs come from the manifest; extracted values (with citations)
  // come from the manifest's sampleExtractionValues array. Eventually live
  // extraction will replace the values lookup, schema stays as-is.
  const valuesByFieldId = useMemo(() => {
    const map = new Map<string, ExtractedFieldValue>();
    if (liveSchema) {
      // WF-12 — live values from getDocumentExtract. WF-05 — attach the
      // X-Ray-resolved source geometry as the field's citation so a field
      // click highlights its region on the PDF (getextract carries no bbox).
      for (const [fieldId, value] of Object.entries(liveValues)) {
        const geo = liveGeometry.get(fieldId);
        const citations =
          geo && geo.bbox && liveDocId
            ? [{ documentId: liveDocId, page: geo.page, bbox: geo.bbox }]
            : [];
        map.set(fieldId, { fieldId, value, citations });
      }
    } else {
      for (const v of scenario?.manifest.sampleExtractionValues ?? []) {
        map.set(v.fieldId, v);
      }
    }
    return map;
  }, [scenario, liveSchema, liveValues, liveGeometry, liveDocId]);

  // ?focus=<categoryId> from the F2 Pick-a-view pill → select the first
  // field in that category so the right-side preview opens to the
  // user's chosen slice. Only runs on initial mount; user clicks on
  // other fields after that take precedence.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !schema || selectedFieldId !== null) return;
    const category = schema.categories.find((c) => c.id === focus);
    const firstField = category?.fields[0];
    if (firstField) setSelectedFieldId(firstField.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // `add-pinned-samples-row`: on F3a entry, auto-pin the scenario's
  // primary document AND seed the focused-category id from URL or the
  // first manifest category. Idempotent via ChatStore action guards.
  const primaryDocId = scenario?.documents?.[0]?.documentId ?? null;
  const primaryDocFileName = scenario?.documents?.[0]?.fileName ?? primaryDocId;
  const primaryDocPages = scenario?.documents?.[0]?.pageCount;
  useEffect(() => {
    if (!schema || !overlay) return;
    if (primaryDocId && overlay.pinnedSamples.length === 0) {
      pinSample(primaryDocId);
    }
    if (overlay.focusedCategoryId === null) {
      const focus = searchParams.get("focus");
      const seed =
        (focus && schema.categories.find((c) => c.id === focus)?.id) ??
        schema.categories[0]?.id ??
        null;
      if (seed) setFocusedCategory(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, primaryDocId]);

  if (!schema) {
    // `chapters.extract === "off"` is the only state that genuinely has no
    // extract (Solar = Interact + Report only). For every other scenario the
    // schema arrives from the async GroundX workflow fetch — so a null schema
    // means "still loading," NOT "skips extract." Without this split the
    // skips-extract copy flashed on every Extract load before live data
    // resolved (e.g. the Utility sample, which does extract).
    const skipsExtract = scenario?.manifest.hero.chapters.extract === "off";
    if (skipsExtract) {
      return (
        <Box sx={{ p: 4 }}>
          <Typography variant="body1" sx={{ color: BODY_TEXT }}>
            This sample skips extract — it's an Interact + Report sample. Try the chat instead.
          </Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ p: 4, display: "flex", alignItems: "center", gap: 1.5 }} data-testid="extract-loading">
        <LoadingDots size={6} aria-label="Reading the extraction" />
        <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
          Reading the extraction…
        </Typography>
      </Box>
    );
  }

  const focusParam = searchParams.get("focus");
  // `add-pinned-samples-row`: overlay's focusedCategoryId wins; URL
  // `?focus=` pre-seeds it; first manifest category is the fallback.
  const focusedCategoryId =
    overlay?.focusedCategoryId ??
    (focusParam && schema.categories.find((c) => c.id === focusParam)?.id) ??
    schema.categories[0]?.id ??
    null;

  const allFields = schema.categories.flatMap((c) => c.fields);
  const selectedField = selectedFieldId ? allFields.find((f) => f.id === selectedFieldId) ?? null : null;
  const selectedValue = selectedField ? valuesByFieldId.get(selectedField.id) : undefined;

  // Loan scenario surfaces the workflow handoff demo via JSON render mode.
  const supportsJsonRender = scenarioId === "loan";

  const jsonOutput = JSON.stringify(
    {
      schemaId: schema.id,
      name: schema.name,
      categories: schema.categories.map((category) => ({
        id: category.id,
        type: category.type,
        fields: category.fields.map((field) => {
          const value = valuesByFieldId.get(field.id);
          return {
            id: field.id,
            type: field.type,
            value: value?.value ?? null,
            citations: value?.citations.map((c) => ({ documentId: c.documentId, page: c.page })) ?? [],
          };
        }),
      })),
    },
    null,
    2
  );

  return (
    <Box
      data-testid="extract-workbench"
      aria-label="Extract workbench"
      sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: WARM_OFFWHITE }}
    >
      {/* Workbench topbar — per spec
          (project_dev_contracts.md):
            `export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒`
          Header (eyebrow + scenario name) sits on the LEFT; controls
          on the RIGHT. The same topbar renders for F3, F3a, and F4 so
          switching surfaces keeps the workbench shell stable. */}
      <Box
        data-testid="extract-topbar"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          px: { xs: 2, md: 4 },
          py: 1.5,
          backgroundColor: WHITE,
          borderBottom: `1px solid ${BORDER}`,
          flexWrap: "wrap",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          // WF-01 C6 (2026-05-28). minWidth:0 lets the title block
          // shrink properly when the canvas pane is narrow; overflow
          // hidden + nowrap + flexShrink:1 prevents the title from
          // overlapping the actions stack at narrow widths. Before this
          // change the topbar text stacked on top of itself at common
          // pane widths (974px viewport ÷ 280px chat = 694px canvas).
          sx={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}
        >
          {/* `← back` only renders on the F3a Design surface, where it
              returns to F3 (Results). On F3 there is nowhere to go back to,
              so it was a dead no-op control — hidden to avoid the "button
              that does nothing" confusion on initial Extract load. */}
          {isDesignSurface && (
            <>
              <Box
                component="button"
                type="button"
                data-testid="extract-topbar-back"
                onClick={handleBack}
                aria-label="Back to extract"
                sx={{
                  border: "none",
                  background: "none",
                  color: NAVY,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                  padding: 0,
                  flexShrink: 0,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                ← back
              </Box>
              <Box sx={{ width: "1px", height: 18, backgroundColor: BORDER, flexShrink: 0 }} />
            </>
          )}
          {/* Designing <sample-id> · <category-id> + version chip */}
          <Typography
            variant="body1"
            data-testid="extract-topbar-title"
            sx={{
              color: NAVY,
              fontWeight: FONT_WEIGHT_HEADLINE,
              fontSize: FONT_SIZE_LABEL,
              letterSpacing: 0.2,
              // Truncate gracefully when the canvas pane is narrow.
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              flexShrink: 1,
            }}
          >
            Designing&nbsp;
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {scenarioId}
            </Box>
            &nbsp;·&nbsp;
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {focusedCategoryId ?? "—"}
            </Box>
          </Typography>
          <Box
            data-testid="extract-topbar-version"
            sx={{
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_PILL,
              px: 1,
              py: 0.125,
              color: MUTED_ON_LIGHT,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              fontFamily: "monospace",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            v1 · draft
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
          {/* export ▾ 🔒 */}
          <TopbarButton
            data-testid="extract-topbar-export"
            disabled
            locked={!isAuthed}
            ariaLabel={isAuthed ? "Export ▾" : "Export ▾ (sign in to enable)"}
          >
            export ▾
          </TopbarButton>
          {/* ↻ rerun */}
          <TopbarButton data-testid="extract-topbar-rerun" disabled ariaLabel="↻ rerun">
            ↻ rerun
          </TopbarButton>
          {/* 💾 Save 🔒 */}
          <TopbarButton
            data-testid="extract-topbar-save"
            primary
            disabled={!hasUnsavedChanges || saveStatus === "saving"}
            locked={!isAuthed}
            onClick={handleSave}
            ariaLabel="💾 Save template"
          >
            💾 Save
          </TopbarButton>
        </Stack>
      </Box>

      {/* Topbar status line — combines:
            - Save-flow status (saving / saved / needs-signin / error)
            - Diff count when there are unsaved overlay changes
          Both states render in the same slot so the topbar stays
          compact when nothing's pending. */}
      {(saveStatus !== "idle" || hasUnsavedChanges) && (
        <Box
          data-testid="extract-topbar-status"
          sx={{
            px: { xs: 2, md: 4 },
            py: 0.5,
            backgroundColor:
              saveStatus === "error" || saveStatus === "needs-signin"
                ? alpha(CORAL, 0.08)
                : saveStatus === "saved"
                  ? alpha(GREEN, 0.08)
                  : alpha(NAVY, 0.04),
            borderBottom: `1px solid ${BORDER}`,
            color: saveStatus === "error" || saveStatus === "needs-signin" ? CORAL : NAVY,
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_LABEL,
          }}
        >
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "Saved."}
          {saveStatus === "needs-signin" && "Sign in to save this template."}
          {saveStatus === "error" && "Save failed — try again in a moment."}
          {saveStatus === "idle" && overlay && hasUnsavedChanges && (
            <Box component="span" data-testid="extract-topbar-diff">
              {overlay.addedFields.length} added · {overlay.removedFieldIds.size} removed · {overlay.editedFields.size} edited (unsaved)
            </Box>
          )}
        </Box>
      )}

      {/* Pinned-samples row (Design surface only) — per
          `add-pinned-samples-row` openspec change. */}
      {isDesignSurface && overlay && (
        <PinnedSamplesRow
          pinnedIds={overlay.pinnedSamples}
          primaryDocLabel={primaryDocFileName ?? ""}
          primaryDocPages={primaryDocPages}
          onUnpin={unpinSample}
          focusedCategoryId={focusedCategoryId}
          categories={schema.categories}
          onSelectCategory={setFocusedCategory}
        />
      )}

      {/* Body — Design (F3a) vs Results (F3, F4 fallback). */}
      {isDesignSurface ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {/* WF-12 — hand the live schema + values down so F3a edits the live schema, not the manifest. */}
          <SchemaView schema={schema} values={Array.from(valuesByFieldId.values())} />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
            gridTemplateRows: "auto 1fr",
            gap: 2,
            p: { xs: 1.5, md: 2 },
            overflow: "hidden",
          }}
        >
      {supportsJsonRender ? (
        <Stack direction="row" justifyContent="flex-end" sx={{ gridColumn: "1 / -1" }}>
          <Tabs
            value={renderMode}
            onChange={handleRenderMode}
            aria-label="Render mode"
            data-testid="render-mode-tabs"
            sx={{ minHeight: 36 }}
          >
            <Tab value="table" label="Table" data-testid="render-mode-table" sx={{ minHeight: 36 }} />
            <Tab value="json" label="JSON" data-testid="render-mode-json" sx={{ minHeight: 36 }} />
          </Tabs>
        </Stack>
      ) : null}

      {/* WF-01 C6 (2026-05-28). PDF viewer on the LEFT, fields panel
          on the RIGHT — per `spec-flow.jsx Flow_Peek`. The viewer pane
          uses the scenario's first document; when an extraction-schema
          field is hovered/clicked, the highlight bbox + active page
          are forwarded to the viewer (wired via local state below). */}
      <Box
        data-testid="extract-doc-pane"
        sx={{
          minHeight: 0,
          overflow: "hidden",
          borderRadius: BORDER_RADIUS_CARD,
          backgroundColor: WHITE,
          display: "flex",
        }}
      >
        {scenario?.documents?.[0]?.documentId ? (
          (() => {
            // WF-01b C (2026-05-28). When a field is selected, surface
            // its first-citation page + bbox to the viewer so the
            // user sees the cross-link visually. Falls back to default
            // (page 1, no highlight) when nothing is selected.
            const firstCite = selectedField && selectedValue ? selectedValue.citations?.[0] : null;
            return (
              <PdfViewerWidget
                scope={{ type: "documents", documentIds: [scenario.documents[0].documentId] }}
                role={widgetRole}
                targetPage={firstCite?.page ?? undefined}
                highlightBbox={firstCite?.bbox ?? null}
              />
            );
          })()
        ) : (
          <Stack spacing={1} sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              SOURCE
            </Typography>
            <Typography variant="body2" sx={{ color: BODY_TEXT }}>
              No source document is attached to this scenario yet.
            </Typography>
          </Stack>
        )}
      </Box>

      {selectedField ? (
        // WF-01 C9 (2026-05-28). F4 provenance panel — replaces the
        // fields list when a field is selected. Sections are FIELD /
        // SOURCE / WHY MATCHED / CONFIDENCE / NEIGHBORS per
        // `spec-flow.jsx Flow_Extract`. WHY MATCHED is heuristic-derived
        // here (we don't have model-side rationale yet); CONFIDENCE
        // displays the raw value when present, else "—".
        <Box data-testid="field-provenance-panel" sx={{ overflow: "auto", p: 1 }}>
          {/* Breadcrumb stays inside the right pane (the spec puts it
              above both panes, but our grid uses gridTemplateRows:
              "auto 1fr" with the topbar already filling row 1). For
              this change the breadcrumb lives just above the panel
              content; revisit if the layout grows a dedicated breadcrumb
              row. */}
          <Stack
            data-testid="extract-breadcrumb"
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 1.5, fontSize: FONT_SIZE_LABEL, color: NAVY }}
          >
            <Box
              component="button"
              type="button"
              data-testid="extract-breadcrumb-collapse"
              onClick={() => setSelectedFieldId(null)}
              aria-label="Collapse to all fields"
              sx={{
                border: "none",
                background: "none",
                color: NAVY,
                fontFamily: "inherit",
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                cursor: "pointer",
                padding: 0,
                "&:hover": { textDecoration: "underline" },
              }}
            >
              ▴ ← all fields
            </Box>
            <Box component="span" sx={{ color: MUTED_ON_LIGHT }}>›</Box>
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {schema.categories.find((c) => c.fields.some((f) => f.id === selectedField.id))?.name ?? "—"}
            </Box>
            <Box component="span" sx={{ color: MUTED_ON_LIGHT }}>›</Box>
            <Box component="span" sx={{ fontFamily: "monospace", fontWeight: FONT_WEIGHT_HEADLINE }}>
              {selectedField.id}
            </Box>
          </Stack>

          <Stack spacing={2.25}>
            {/* Value hero — the extracted value is the headline; the field
                id + type read as supporting metadata. */}
            <Box
              sx={{
                p: 2,
                borderRadius: BORDER_RADIUS_CARD,
                backgroundColor: alpha(NAVY, 0.04),
                border: `1px solid ${alpha(NAVY, 0.08)}`,
              }}
            >
              <Typography sx={detailLabelSx}>FIELD</Typography>
              <Typography
                sx={{
                  fontFamily: "monospace",
                  fontSize: FONT_SIZE_LABEL,
                  color: MUTED_ON_LIGHT,
                  mt: 0.75,
                }}
              >
                {selectedField.id}
              </Typography>
              <Typography
                sx={{
                  color: NAVY,
                  fontWeight: FONT_WEIGHT_HEADLINE,
                  fontFamily: "monospace",
                  fontSize: "1.25rem",
                  lineHeight: 1.3,
                  mt: 0.25,
                  wordBreak: "break-word",
                }}
              >
                {selectedValue?.value === undefined || selectedValue?.value === null
                  ? "—"
                  : String(selectedValue.value)}
              </Typography>
              <Typography sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION, mt: 0.5 }}>
                {selectedField.name} · {selectedField.type}
              </Typography>
            </Box>

            <Box>
              <Typography sx={detailLabelSx}>SOURCE</Typography>
              <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                {(selectedValue?.citations ?? []).map((c, idx) => (
                  <Box key={idx}>
                    <Box
                      component="span"
                      sx={{
                        display: "inline-block",
                        px: 1,
                        py: 0.25,
                        borderRadius: BORDER_RADIUS_PILL,
                        backgroundColor: alpha(CYAN, 0.22),
                        border: `1px solid ${alpha(CYAN, 0.5)}`,
                        color: NAVY,
                        fontSize: FONT_SIZE_LABEL,
                        fontWeight: FONT_WEIGHT_LABEL,
                      }}
                    >
                      page {c.page}
                    </Box>
                    {c.snippet ? (
                      <Typography
                        sx={{
                          mt: 0.5,
                          pl: 1.25,
                          borderLeft: `2px solid ${alpha(CYAN, 0.5)}`,
                          color: BODY_TEXT,
                          fontSize: FONT_SIZE_CAPTION,
                          fontStyle: "italic",
                          lineHeight: 1.45,
                        }}
                      >
                        “{c.snippet.trim().slice(0, 90)}”
                      </Typography>
                    ) : null}
                  </Box>
                ))}
                {(selectedValue?.citations ?? []).length === 0 ? (
                  <Typography sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_CAPTION }}>
                    No source citations on this field.
                  </Typography>
                ) : null}
              </Stack>
            </Box>

            <Box>
              <Typography sx={detailLabelSx}>WHY MATCHED</Typography>
              <Typography sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION, lineHeight: 1.5, mt: 0.75 }}>
                {selectedField.description}
              </Typography>
            </Box>

            <Box>
              <Typography sx={detailLabelSx}>CONFIDENCE</Typography>
              {/* The sample `ExtractedFieldValue` fixtures don't carry a
                  confidence score yet — render a graceful "not scored" pill
                  instead of a bare em-dash. Live extraction can swap this for
                  a real meter once the value shape gains a confidence field. */}
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  mt: 0.75,
                  px: 1,
                  py: 0.25,
                  borderRadius: BORDER_RADIUS_PILL,
                  backgroundColor: alpha(NAVY, 0.06),
                  color: MUTED_ON_LIGHT,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                }}
              >
                Not scored yet
              </Box>
            </Box>

            <Box>
              <Typography sx={detailLabelSx}>NEIGHBORS</Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                {(() => {
                  const cat = schema.categories.find((c) => c.fields.some((f) => f.id === selectedField.id));
                  const neighbors = (cat?.fields ?? []).filter((f) => f.id !== selectedField.id).slice(0, 3);
                  if (neighbors.length === 0) {
                    return (
                      <Typography sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_CAPTION }}>
                        No neighbors in this category.
                      </Typography>
                    );
                  }
                  return neighbors.map((n) => {
                    const nv = valuesByFieldId.get(n.id)?.value;
                    return (
                      <Box
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFieldId(n.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedFieldId(n.id);
                          }
                        }}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                          px: 1,
                          py: 0.375,
                          borderRadius: BORDER_RADIUS_PILL,
                          border: `1px solid ${BORDER}`,
                          backgroundColor: WHITE,
                          color: NAVY,
                          fontFamily: "monospace",
                          fontSize: FONT_SIZE_LABEL,
                          cursor: "pointer",
                          "&:hover": { borderColor: NAVY, backgroundColor: alpha(NAVY, 0.04) },
                        }}
                      >
                        {n.id}
                        <Box component="span" sx={{ color: MUTED_ON_LIGHT }}>
                          {nv === undefined || nv === null ? "—" : String(nv).slice(0, 18)}
                        </Box>
                      </Box>
                    );
                  });
                })()}
              </Stack>
            </Box>
          </Stack>
        </Box>
      ) : (
      <Box data-testid="extract-fields-panel" sx={{ overflow: "auto" }}>
        {/* Fields-panel header — category tabs (left) + the ⋮ menu floating
            right, on ONE row (the ⋮ no longer offsets the tabs downward).
            WF-01 C7: tabs are jump-links to each category card. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1.5,
            borderBottom: `1px solid ${BORDER}`,
            pb: 0.75,
          }}
        >
          {!supportsJsonRender && schema.categories.length > 1 ? (
            <Box
              data-testid="extract-category-tabs"
              sx={{
                display: "flex",
                gap: 0.5,
                flexWrap: "wrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {schema.categories.map((category) => (
              <Box
                key={category.id}
                role="button"
                tabIndex={0}
                data-testid={`extract-category-tab-${category.id}`}
                onClick={() => {
                  const target = document.querySelector(`[aria-label="${category.name}"]`);
                  if (target && "scrollIntoView" in target) {
                    (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    (event.target as HTMLElement).click();
                  }
                }}
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: BORDER_RADIUS_PILL,
                  border: `1px solid ${alpha(NAVY, 0.18)}`,
                  backgroundColor: WHITE,
                  cursor: "pointer",
                  color: NAVY,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                  whiteSpace: "nowrap",
                  "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
                }}
              >
                <Box component="span" sx={{ fontFamily: "monospace" }}>{category.name}</Box>
                <Box
                  component="span"
                  sx={{ color: MUTED_ON_LIGHT, ml: 0.75, fontFamily: "monospace" }}
                >
                  · {category.fields.length}
                </Box>
              </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
          <FieldsPanelMenu />
        </Box>
        {supportsJsonRender && renderMode === "json" ? (
          <Box
            component="pre"
            data-testid="extract-json"
            sx={{
              fontFamily: "monospace",
              fontSize: FONT_SIZE_LABEL,
              backgroundColor: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_2X,
              p: 2,
              m: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: NAVY,
            }}
          >
            {jsonOutput}
          </Box>
        ) : null}
        {!supportsJsonRender || renderMode === "table" ? schema.categories.map((category) => (
          <Card key={category.id} sx={{ mb: 2, p: 2 }} aria-label={category.name}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              {category.name}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {category.fields.map((field) => {
                const extracted = valuesByFieldId.get(field.id);
                const value = extracted?.value;
                const citations = extracted?.citations ?? [];
                return (
                  <Box
                    key={field.id}
                    tabIndex={0}
                    aria-label={`Inspect field: ${field.name}`}
                    data-testid={`field-row-${field.id}`}
                    onMouseEnter={() => {
                      // OB-02 — extract.field_hovered fires on every
                      // row hover. PostHog dedupes via session_id +
                      // event_ts so spam isn't a concern; the funnel
                      // wants total hover-count per field.
                      track("extract.field_hovered", {
                        fieldId: field.id,
                        fieldName: field.name,
                      });
                    }}
                    onClick={() => setSelectedFieldId(field.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedFieldId(field.id);
                      }
                    }}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      // Generous gutter + top-align so the value never crowds
                      // the (wrapping) description — the readability fix.
                      columnGap: 3,
                      alignItems: "start",
                      p: 1.5,
                      borderRadius: BORDER_RADIUS,
                      cursor: "pointer",
                      backgroundColor: selectedFieldId === field.id ? alpha(GREEN, 0.12) : "transparent",
                      "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
                    }}
                  >
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      {/* WF-01 C8: snake_case key (mono) is the primary id;
                          label + description trail as secondary text. The
                          description is clamped + muted so it recedes behind
                          the value. */}
                      <Typography
                        variant="body2"
                        sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, fontFamily: "monospace" }}
                      >
                        {field.id}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: MUTED_ON_LIGHT,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        <Box component="span" sx={{ color: BODY_TEXT, fontWeight: FONT_WEIGHT_LABEL }}>
                          {field.name}
                        </Box>{" "}
                        — {field.description}
                      </Typography>
                    </Stack>
                    <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0, maxWidth: 180 }}>
                      {/* The extracted value as a distinct token — a subtle
                          tinted chip, clearly set apart from the description. */}
                      <Box
                        sx={{
                          px: 1,
                          py: 0.5,
                          borderRadius: BORDER_RADIUS_SM,
                          backgroundColor: value === undefined || value === null ? "transparent" : alpha(NAVY, 0.05),
                          fontFamily: "monospace",
                          fontSize: FONT_SIZE_LABEL,
                          fontWeight: FONT_WEIGHT_HEADLINE,
                          color: NAVY,
                          textAlign: "right",
                          wordBreak: "break-word",
                        }}
                      >
                        {value === undefined || value === null ? "—" : String(value)}
                      </Box>
                      {citations.length > 0 && (
                        <Stack direction="row" spacing={0.5}>
                          {citations.map((c, idx) => (
                            <CiteChip key={`${field.id}-${idx}`} citation={c} index={idx + 1} />
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Card>
        )) : null}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Box
            role="button"
            tabIndex={0}
            data-testid="advance-to-f5"
            onClick={() => advanceFrame("f5")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                advanceFrame("f5");
              }
            }}
            sx={{
              display: "inline-block",
              px: 2,
              py: 1,
              borderRadius: BORDER_RADIUS_PILL,
              border: `1px solid ${NAVY}`,
              color: NAVY,
              cursor: "pointer",
              fontWeight: FONT_WEIGHT_LABEL,
              "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
            }}
          >
            Try asking a question →
          </Box>
        </Stack>
      </Box>
      )}

      {/* WF-01 C6 (2026-05-28). The separate `extract-preview` pane was
          removed in this change. The PDF viewer in the left pane is now
          the live source-preview surface; selected-field provenance
          (F4) will swap the fields panel itself rather than rendering
          alongside in a third column. */}
          {/* WF-01 C7 (2026-05-28). Sign-in unlock banner — pinned
              below the panes, spanning both columns. For anonymous
              users only; signed-in users skip it. Click → opens the
              gate (F6). */}
          {!isAuthed ? (
            <Box
              data-testid="extract-unlock-banner"
              role="button"
              tabIndex={0}
              onClick={() => openGate("save")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openGate("save");
                }
              }}
              sx={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                px: 2,
                py: 1.25,
                borderRadius: BORDER_RADIUS_2X,
                border: `1px solid ${alpha(NAVY, 0.18)}`,
                backgroundColor: alpha(GREEN, 0.06),
                color: NAVY,
                cursor: "pointer",
                "&:hover": { backgroundColor: alpha(GREEN, 0.12) },
              }}
            >
              <Box component="span" sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}>
                🔒 Locked behind sign-in: locked fields · CSV / JSON export · save · upload your own docs
              </Box>
              <Box
                component="span"
                sx={{
                  flexShrink: 0,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: BORDER_RADIUS_PILL,
                  backgroundColor: GREEN,
                  color: NAVY,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_HEADLINE,
                  whiteSpace: "nowrap",
                }}
              >
                Sign in to unlock →
              </Box>
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  );
};

// ── Pinned-samples row (F3a) ────────────────────────────────────────────

/**
 * The thin row above the F3a sub-tabs per `add-pinned-samples-row`:
 *
 *   PINNED <n>/3 · <chip × …> · + pin another sample · category: <id>
 *
 * Click the `×` on a chip → unpin; click the `category:` chip → open a
 * popover of category ids → select one → update the focused category
 * (which drives the topbar title + the Fields-tab scope).
 */
interface PinnedSamplesRowProps {
  pinnedIds: ReadonlyArray<string>;
  primaryDocLabel: string;
  primaryDocPages: number | undefined;
  onUnpin: (sampleId: string) => void;
  focusedCategoryId: string | null;
  categories: ReadonlyArray<{ id: string; name: string }>;
  onSelectCategory: (categoryId: string | null) => void;
}

const PinnedSamplesRow: FC<PinnedSamplesRowProps> = ({
  pinnedIds,
  primaryDocLabel,
  primaryDocPages,
  onUnpin,
  focusedCategoryId,
  categories,
  onSelectCategory,
}) => {
  const [catAnchor, setCatAnchor] = useState<HTMLElement | null>(null);
  const openCat = catAnchor != null;
  return (
    <Box
      data-testid="extract-pinned-samples-row"
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: { xs: 2, md: 4 },
        py: 0.75,
        backgroundColor: WHITE,
        borderBottom: `1px solid ${BORDER}`,
        fontSize: FONT_SIZE_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
        color: NAVY,
        flexWrap: "wrap",
      }}
    >
      <Box
        data-testid="extract-pinned-count"
        component="span"
        sx={{ color: MUTED_ON_LIGHT, letterSpacing: 0.6, textTransform: "uppercase" }}
      >
        PINNED {pinnedIds.length}/3
      </Box>
      {pinnedIds.map((id) => (
        <Box
          key={id}
          data-testid={`extract-pinned-chip-${id}`}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            border: `1px solid ${BORDER}`,
            backgroundColor: alpha(CYAN, 0.4),
            borderRadius: BORDER_RADIUS_PILL,
            px: 1,
            py: 0.125,
          }}
        >
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            {/* If this is the primary doc, render its filename; else fall back to id */}
            {primaryDocLabel || id}
          </Box>
          {primaryDocPages != null && (
            <Box component="span" sx={{ color: MUTED_ON_LIGHT }}>
              · {primaryDocPages}p
            </Box>
          )}
          <Box
            component="button"
            type="button"
            data-testid={`extract-pinned-chip-remove-${id}`}
            aria-label={`Unpin ${primaryDocLabel || id}`}
            onClick={() => onUnpin(id)}
            sx={{
              border: "none",
              background: "none",
              color: MUTED_ON_LIGHT,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: FONT_SIZE_LABEL,
              padding: 0,
              ml: 0.25,
              "&:hover": { color: NAVY },
            }}
          >
            ×
          </Box>
        </Box>
      ))}
      <Box
        component="button"
        type="button"
        data-testid="extract-pinned-add"
        disabled={pinnedIds.length >= 3}
        title={pinnedIds.length >= 3 ? "Maximum 3 pinned samples" : "Sign in to load more samples"}
        sx={{
          border: "none",
          background: "none",
          color: pinnedIds.length >= 3 ? MUTED_ON_LIGHT : NAVY,
          cursor: pinnedIds.length >= 3 ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
          padding: 0,
          "&:hover": pinnedIds.length >= 3 ? {} : { textDecoration: "underline" },
        }}
      >
        + pin another sample
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box
        component="button"
        type="button"
        data-testid="extract-pinned-category-badge"
        onClick={(e: React.MouseEvent<HTMLElement>) => setCatAnchor(e.currentTarget)}
        aria-label="Choose focused category"
        sx={{
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          color: NAVY,
          borderRadius: BORDER_RADIUS_PILL,
          px: 1,
          py: 0.125,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
        }}
      >
        category:&nbsp;
        <Box component="span" sx={{ fontFamily: "monospace", fontWeight: FONT_WEIGHT_HEADLINE }}>
          {focusedCategoryId ?? "—"}
        </Box>
        &nbsp;▾
      </Box>
      <Menu anchorEl={catAnchor} open={openCat} onClose={() => setCatAnchor(null)}>
        {categories.map((c) => (
          <MenuItem
            key={c.id}
            data-testid={`extract-pinned-category-option-${c.id}`}
            onClick={() => {
              onSelectCategory(c.id);
              setCatAnchor(null);
            }}
          >
            {c.name} ({c.id})
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

// ── Fields-panel menu (F3a entry point) ─────────────────────────────────

/**
 * Hamburger menu at the top-right of the F3 fields panel. Per
 * `openspec/specs/onboarding-schema-editor/spec.md`:
 *
 *   F3a SHALL be entered only by clicking the hamburger icon on the F3
 *   fields panel and selecting `Save schema…` or `Edit schema…`.
 *
 * Both menu items route to F3a today. Save's actual sign-in-gated
 * persistence flow lands separately via `f3a-save-signin-gate-handoff`.
 */
const FieldsPanelMenu: FC = () => {
  const { advanceFrame } = useOnboardingSession();
  // Save is sign-in-gated — mirror the topbar Save button's lock so the
  // menu can't offer a path the anon user can't complete.
  const { state: appMode } = useAppMode();
  const isAuthed = appMode.authState === "signed-in";
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = anchorEl != null;
  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);
  const handleClose = useCallback(() => setAnchorEl(null), []);
  const handleEdit = useCallback(() => {
    advanceFrame("f3a");
    setAnchorEl(null);
  }, [advanceFrame]);
  const handleSave = useCallback(() => {
    // Save flow (sign-in gate + persist) ships via
    // f3a-save-signin-gate-handoff; for now route to F3a where the
    // future Save button lives.
    advanceFrame("f3a");
    setAnchorEl(null);
  }, [advanceFrame]);
  return (
    <>
      <IconButton
        data-testid="extract-fields-panel-hamburger"
        onClick={handleOpen}
        aria-label="Fields panel menu"
        size="small"
        sx={{ color: NAVY, flexShrink: 0 }}
      >
        <Box component="span" aria-hidden sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_HEADLINE }}>
          ⋮
        </Box>
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem
          data-testid="extract-fields-panel-menu-save-schema"
          onClick={handleSave}
          disabled={!isAuthed}
          sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
        >
          Save schema…
          {!isAuthed ? (
            <Box component="span" aria-hidden sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>
              🔒
            </Box>
          ) : null}
        </MenuItem>
        <MenuItem
          data-testid="extract-fields-panel-menu-edit-schema"
          onClick={handleEdit}
        >
          Edit schema…
        </MenuItem>
      </Menu>
    </>
  );
};

// ── Topbar button primitive ─────────────────────────────────────────────

interface TopbarButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  active?: boolean;
  primary?: boolean;
  ariaLabel: string;
  "data-testid"?: string;
}

const TopbarButton: FC<TopbarButtonProps> = ({
  children,
  onClick,
  disabled = false,
  locked = false,
  active = false,
  primary = false,
  ariaLabel,
  ...rest
}) => {
  // `locked` is a visual indicator only (shows the 🔒 padlock for
  // anon users) — it does NOT prevent the click. The server-side
  // 401 + topbar-status nudge handles the auth flow. `disabled`
  // alone gates pointer events.
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      data-testid={rest["data-testid"]}
      data-locked={locked ? "true" : undefined}
      data-active={active ? "true" : undefined}
      sx={{
        border: `1px solid ${primary && !disabled ? GREEN : active ? NAVY : BORDER}`,
        backgroundColor: primary && !disabled ? GREEN : active ? alpha(NAVY, 0.06) : WHITE,
        color: primary && !disabled ? WHITE : disabled ? MUTED_ON_LIGHT : NAVY,
        borderRadius: BORDER_RADIUS_PILL,
        px: 1.5,
        py: 0.5,
        fontSize: FONT_SIZE_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : locked ? 0.85 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        "&:hover": disabled ? {} : { borderColor: primary ? GREEN : NAVY },
      }}
    >
      {children}
      {locked ? <Box component="span" aria-hidden sx={{ ml: 0.25 }}>🔒</Box> : null}
    </Box>
  );
};
