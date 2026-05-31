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

import type { ContentScope, ExtractBody, WidgetRole } from "@groundx/shared";

import { TemplateApiError, saveTemplate } from "@/api/templates";
import { getGroundXWorkflow } from "@/api/entities/groundxWorkflowsEntity";
import {
  citationsForJson,
  extractToValues,
  liveValuesToFieldValues,
  workflowToSchema,
} from "@/api/extractLiveData";
import { fetchFieldGeometry, type ResolvedFieldGeometry } from "@/api/fieldGeometry";
import { isResolvedDocumentId } from "@/api/documentId";
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
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { track } from "@/lib/analytics";
import type { ExtractedFieldValue, ExtractionSchemaDef } from "@/types/scenarios";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { SchemaView } from "@/views/Onboarding/SchemaView";

/**
 * Extract — the production extraction-workbench ScopedViewerWidget.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 3a PACKAGED the live extract
 * workbench (previously `views/Onboarding/ExtractView.tsx` + `SchemaView.tsx`)
 * as a `ScopedViewerWidget` (PdfViewer · Extract · SmartReport · Integrate).
 * Per `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget
 * set; `ExtractView` is now a thin wrapper that mounts this with a scenario-
 * derived scope. NOT a reimplementation — the F3/F3a/F4 guts are lifted
 * verbatim, the only change being where the document comes from:
 *
 *   • The primary `documentId` / doc set is derived FROM `scope`
 *     (`scope.documentIds[0]`), NOT from scenario context.
 *   • The live schema/values/geometry load (getDocument → filter.workflow_id →
 *     getGroundXWorkflow → workflowToSchema; getDocumentExtract →
 *     extractToValues; fetchFieldGeometry) runs in a `useScopeAdapter` so it
 *     re-resolves when the scope IDENTITY changes (not on every render).
 *
 * The scenario manifest is still the fallback schema/values source (BYO,
 * placeholder ids, pre-resolve, errors) and drives the loan-only JSON render
 * mode + the skips-extract copy — read off the onboarding session/appMode
 * (the workbench is an onboarding-only surface today; SteadyShell mounts only
 * the doc-viewer kind through `<ScopedCanvas>`).
 *
 * Per `widget-role-access`: `role: WidgetRole` is the authorization axis
 * (export / Save locked-for-anonymous via the padlock affordances + the
 * server-side 401 → gate handoff). Surfaced on the root via `data-role`.
 *
 * Topbar (per `project_dev_contracts.md`):
 *   `export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒`
 */
type SaveStatus = "idle" | "saving" | "saved" | "needs-signin" | "error";

export interface ExtractProps {
  /**
   * REQUIRED content scope (ScopedViewerWidget contract). The single-doc case
   * — the only shape the workbench renders today — is
   * `{ type: "documents", documentIds: [id] }`; the widget resolves the live
   * schema/values/geometry for `documentIds[0]`. A `bucket`/`group` scope
   * resolves to no document and falls back to the manifest schema.
   */
  scope: ContentScope;
  /**
   * Authorization role (`anonymous` | `member`). Gates the export / Save
   * affordances; surfaced via `data-role` on the root.
   */
  role: WidgetRole;
}

function mintTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `es-${crypto.randomUUID()}`;
  }
  return `es-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** The first document the scope targets, or null when the scope holds none. */
function primaryDocumentIdFromScope(scope: ContentScope): string | null {
  if (scope.type === "documents") return scope.documentIds[0] ?? null;
  return null;
}

/**
 * Merge the per-session overlay onto the manifest extraction-schema for
 * Save. Mirrors SchemaView's render-time merge so the persisted
 * "template" is the same shape the user sees on canvas.
 */
function mergeOverlayForSave(
  manifestSchema: import("@/types/scenarios").ExtractionSchemaDef,
  overlay: import("@/contexts/ChatStoreContext/types").PendingSchemaOverlay | null,
): ExtractBody {
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

// Shared section-label style for the field-detail (provenance) panel.
const detailLabelSx = {
  display: "block",
  color: MUTED_ON_LIGHT,
  fontWeight: FONT_WEIGHT_LABEL,
  fontSize: FONT_SIZE_LABEL,
  letterSpacing: 0.6,
  textTransform: "uppercase",
} as const;

export const Extract: FC<ExtractProps> = ({ scope, role }) => {
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

  // ScopedViewerWidget contract: the document set comes FROM the scope, not
  // from scenario context. The live schema/values/geometry load re-runs only
  // when the scope IDENTITY changes (via `useScopeAdapter`).
  const liveDocId = primaryDocumentIdFromScope(scope);
  const { getDocument, getDocumentExtract } = useDocumentsContext();
  const [liveSchema, setLiveSchema] = useState<ExtractionSchemaDef | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, string | number | boolean | null>>({});
  const [liveGeometry, setLiveGeometry] = useState<Map<string, ResolvedFieldGeometry>>(new Map());
  // Monotonic load token: each scope-identity change bumps it; a resumed async
  // load from a stale scope checks the token before committing state, so a slow
  // prior load can't overwrite the current scope's data (`useScopeAdapter` has
  // no cleanup hook — the token is the cancellation mechanism).
  const loadTokenRef = useRef(0);
  useScopeAdapter(scope, (nextScope) => {
    const token = ++loadTokenRef.current;
    // Reset the prior scope's live data so a re-scope doesn't strand stale
    // schema/values while the next load resolves.
    setLiveSchema(null);
    setLiveValues({});
    setLiveGeometry(new Map());
    const docId = primaryDocumentIdFromScope(nextScope);
    // Skip placeholder ids (BYO / fixture) — the manifest fallback handles them.
    if (!docId || !isResolvedDocumentId(docId)) return;
    const isStale = () => loadTokenRef.current !== token;
    void (async () => {
      try {
        const doc = await getDocument(docId);
        if (isStale()) return;
        const workflowId = (doc.response?.filter as Record<string, unknown> | undefined)?.workflow_id;
        if (typeof workflowId !== "string") return;
        const wf = await getGroundXWorkflow(workflowId);
        const live = workflowToSchema(wf.workflow as unknown as Record<string, unknown>);
        if (isStale() || !live) return;
        setLiveSchema(live);
        const ex = await getDocumentExtract(docId);
        if (isStale() || !ex.response) return;
        const values = extractToValues(ex.response as Record<string, unknown>, live);
        setLiveValues(values);
        const queries = live.categories.flatMap((cat) =>
          cat.fields
            .filter((f) => f.id in values)
            .map((f) => ({ fieldId: f.id, value: values[f.id], label: f.name })),
        );
        const geos = await fetchFieldGeometry(
          docId,
          queries.map(({ value, label }) => ({ value, label })),
        );
        if (isStale()) return;
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
  });

  const schema = liveSchema ?? scenario?.manifest.extractionSchema;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const templateIdRef = useRef<string | null>(null);
  const activeChatSession = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)
    : null;
  const overlay = activeChatSession?.pendingSchemaOverlay;
  const hasUnsavedChanges = overlay
    ? overlay.addedFields.length + overlay.removedFieldIds.size + overlay.editedFields.size > 0
    : false;

  const isAuthed = appMode.authState === "signed-in";
  const isDesignSurface = session.currentFrame === "f3a";
  const handleBack = useCallback(() => {
    advanceFrame("f3");
  }, [advanceFrame]);
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || saveStatus === "saving") return;
    if (!schema) return;
    if (!templateIdRef.current) {
      templateIdRef.current = mintTemplateId();
    }
    setSaveStatus("saving");
    try {
      const merged = mergeOverlayForSave(schema, overlay ?? null);
      await saveTemplate({
        id: templateIdRef.current,
        kind: "extract",
        name: `${schema.name} (custom)`,
        body: merged,
      });
      setSaveStatus("saved");
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
        setSaveStatus("idle");
        openGate("save", { cause: "save-schema" });
      } else {
        setSaveStatus("error");
      }
    }
  }, [hasUnsavedChanges, saveStatus, schema, overlay, openGate, pushStep, appendAgentMessage]);

  const postCommitConsumedRef = useRef(false);
  useEffect(() => {
    const gate = session.gate;
    if (gate.status !== "committed") {
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
  }, [session.gate, schema, overlay, advanceFrame, pushStep, appendAgentMessage]);

  const valuesByFieldId = useMemo(() => {
    if (liveSchema) {
      // WF-12 live values + WF-05 X-Ray geometry → ExtractedFieldValue map.
      return liveValuesToFieldValues(liveDocId ?? "", liveValues, liveGeometry);
    }
    const map = new Map<string, ExtractedFieldValue>();
    for (const v of scenario?.manifest.sampleExtractionValues ?? []) {
      map.set(v.fieldId, v);
    }
    return map;
  }, [scenario, liveSchema, liveValues, liveGeometry, liveDocId]);

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !schema || selectedFieldId !== null) return;
    const category = schema.categories.find((c) => c.id === focus);
    const firstField = category?.fields[0];
    if (firstField) setSelectedFieldId(firstField.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // On F3a entry, auto-pin the scope's primary document AND seed the focused
  // category from URL or the first manifest category. Idempotent.
  const primaryDocId = liveDocId;
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
    const skipsExtract = scenario?.manifest.hero.chapters.extract === "off";
    if (skipsExtract) {
      return (
        <Box data-testid="extract-workbench" data-role={role} sx={{ p: 4 }}>
          <Typography variant="body1" sx={{ color: BODY_TEXT }}>
            This sample skips extract — it's an Interact + Report sample. Try the chat instead.
          </Typography>
        </Box>
      );
    }
    return (
      <Box
        data-testid="extract-workbench"
        data-role={role}
        sx={{ p: 4, display: "flex", alignItems: "center", gap: 1.5 }}
      >
        <Box data-testid="extract-loading" sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <LoadingDots size={6} aria-label="Reading the extraction" />
          <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
            Reading the extraction…
          </Typography>
        </Box>
      </Box>
    );
  }

  const focusParam = searchParams.get("focus");
  const focusedCategoryId =
    overlay?.focusedCategoryId ??
    (focusParam && schema.categories.find((c) => c.id === focusParam)?.id) ??
    schema.categories[0]?.id ??
    null;

  const allFields = schema.categories.flatMap((c) => c.fields);
  const selectedField = selectedFieldId ? allFields.find((f) => f.id === selectedFieldId) ?? null : null;
  const selectedValue = selectedField ? valuesByFieldId.get(selectedField.id) : undefined;

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
            citations: citationsForJson(value?.citations),
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
      data-role={role}
      aria-label="Extract workbench"
      sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: WARM_OFFWHITE }}
    >
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
          sx={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}
        >
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
          <Typography
            variant="body1"
            data-testid="extract-topbar-title"
            sx={{
              color: NAVY,
              fontWeight: FONT_WEIGHT_HEADLINE,
              fontSize: FONT_SIZE_LABEL,
              letterSpacing: 0.2,
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
          <TopbarButton
            data-testid="extract-topbar-export"
            disabled
            locked={!isAuthed}
            ariaLabel={isAuthed ? "Export ▾" : "Export ▾ (sign in to enable)"}
          >
            export ▾
          </TopbarButton>
          <TopbarButton data-testid="extract-topbar-rerun" disabled ariaLabel="↻ rerun">
            ↻ rerun
          </TopbarButton>
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

      {isDesignSurface ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
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
            {liveDocId ? (
              (() => {
                const firstCite = selectedField && selectedValue ? selectedValue.citations?.[0] : null;
                return (
                  <PdfViewerWidget
                    scope={scope}
                    role={role}
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
                  No source document is attached to this scope yet.
                </Typography>
              </Stack>
            )}
          </Box>

          {selectedField ? (
            <Box data-testid="field-provenance-panel" sx={{ overflow: "auto", p: 1 }}>
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

export default Extract;

// ── Pinned-samples row (F3a) ────────────────────────────────────────────

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

const FieldsPanelMenu: FC = () => {
  const { advanceFrame } = useOnboardingSession();
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
