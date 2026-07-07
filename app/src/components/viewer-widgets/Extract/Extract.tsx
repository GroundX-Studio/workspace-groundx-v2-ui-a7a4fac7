import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type SyntheticEvent } from "react";

import { type ContentScope, type ExtractBody, type WidgetRole } from "@groundx/shared";

import { instancesToJson, manifestToInstances } from "@/api/extractInstances";
import { entriesToFieldValues } from "@/api/extractLiveData";
import type { FieldRegion } from "@/api/fieldGeometry";
import { cryptoRandom } from "@/lib/cryptoRandom";
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
import { useApi } from "@/contexts/ApiContext";
import { useCanvasOrchestratorOptional } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useExtractWorkbench } from "@/hooks/queries/useExtractWorkbench";
import { Loading } from "@/components/primitives/Loading/Loading";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { track } from "@/lib/analytics";
import type { ExtractedFieldValue } from "@/types/scenarios";
import { InstanceFields } from "./InstanceFields";
import { SchemaView } from "./SchemaView";

/**
 * Extract — the production extraction-workbench ScopedViewerWidget.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 3a PACKAGED the live extract
 * workbench (previously `views/Onboarding/ExtractView.tsx` + `SchemaView.tsx`)
 * as a `ScopedViewerWidget` (PdfViewer · Extract · SmartReport · Integrate).
 * Per `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget
 * set; the live shell mounts this via `<ScopedCanvas>` (the per-frame
 * `ExtractView` wrapper was retired in
 * 2026-05-31-shared-canvas-affordance-restoration). NOT a reimplementation —
 * the F3/F3a/F4 guts are lifted verbatim, the only change being where the
 * document comes from:
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
 * mode + the skips-extract copy — read off the onboarding session/appMode.
 * (standardized-viewer-control R7 — the extract-workbench step, incl. its
 * `surface:"design"` schema editor, is reachable in BOTH experiences: SteadyShell
 * mounts it through `<ScopedCanvas>` via `showExtract`/`editSchema`. It is no
 * longer onboarding-only.)
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
  /**
   * standardized-viewer-control — the schema category to focus, forwarded from
   * the active `extract-workbench` viewer step. When present it wins over the
   * widget's own default, so a `showExtract` intent that mutates/pushes the step
   * re-focuses the live workbench. Absent leaves the existing default.
   */
  focusedCategoryId?: string;
  /**
   * standardized-viewer-control T5 (R7) — the Extract sub-position, forwarded
   * from the active `extract-workbench` viewer step (mirrors `report.surface`):
   *   • "fields" (or absent) — the extracted-fields workbench (the default).
   *   • "design" — the schema DESIGN surface (`SchemaView` design pane).
   * Reads from this PROP (the dispatched step's `surface`), so the design
   * surface is reachable for AUTHENTICATED (steady) users — a production bug
   * before this change.
   */
  surface?: "fields" | "design";
}

function mintTemplateId(): string {
  return `es-${cryptoRandom()}`;
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

// agentic-template-item-editor — build an `ExtractionSchemaDef` base from a
// persisted draft body so the editor resumes on the user's saved edits (design
// D5: the draft wins as the base). Impedance adapter: the Template body's
// category `type` is a scenario-agnostic FREE STRING, but the F3a editor's
// `ExtractionSchemaDef` uses the strict fixture enum (`statement|charges|meters`).
// Every draft category originates either from the manifest (enum-valued) or the
// orphan "custom" group (type "statement") — the app never mints a custom
// category type — so coercing an out-of-enum type to "statement" is runtime-safe.
// The schema-level `name`/`id` come from the live/manifest base (a draft has no
// schema-level name — its `name` is the eventual save-name, nullable until then).
const DRAFT_CATEGORY_TYPES = new Set(["statement", "charges", "meters"]);
function draftBodyToSchemaDef(
  body: ExtractBody,
  liveBase: import("@/types/scenarios").ExtractionSchemaDef | undefined,
): import("@/types/scenarios").ExtractionSchemaDef {
  return {
    id: liveBase?.id ?? "draft-schema",
    name: liveBase?.name ?? "Custom schema",
    categories: body.categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: (DRAFT_CATEGORY_TYPES.has(c.type) ? c.type : "statement") as "statement" | "charges" | "meters",
      fields: c.fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        description: f.description,
        ...(f.required !== undefined ? { required: f.required } : {}),
        ...(f.instructions ? { instructions: f.instructions } : {}),
        ...(f.format ? { format: f.format } : {}),
        ...(f.identifiers ? { identifiers: f.identifiers } : {}),
      })),
    })),
  };
}

// Document / schema layout geometry (extract-screen-audit). Plain px — this is
// responsive layout geometry, not a brand token. Below this measured canvas
// width the PDF + schema can't both be comfortable, so the canvas switches from
// side-by-side to a single-pane Document/Fields toggle. ~760 = a readable PDF
// (~360) + a comfortable schema (~380) + the column gap.
const SIDE_BY_SIDE_MIN_PX = 760;

export const Extract: FC<ExtractProps> = ({
  scope,
  role,
  focusedCategoryId: focusedCategoryIdProp,
  surface,
}) => {
  const api = useApi();
  const { state: appMode } = useAppMode();
  const onboardingSession = useOnboardingSessionOptional();
  const session = onboardingSession?.state;
  const openGate = onboardingSession?.openGate ?? (() => undefined);
  const {
    state: chatState,
    pinSample,
    unpinSample,
    appendAgentMessage,
    commitDraftTemplate,
  } = useChatStore();
  // standardized-viewer-control — category focus is a viewer-step sub-position
  // now, so the category dropdown DISPATCHES `showExtract` through the
  // orchestrator (the single viewer-mutation seam) rather than poking a
  // ChatStore overlay field. Optional: a standalone widget mount (some tests)
  // has no orchestrator, where the dropdown is a no-op.
  const orchestrator = useCanvasOrchestratorOptional();
  // analyze-and-chat-ux §3.2/§3.2b — the field detail card is retired. Hovering
  // or focusing a field-instance row lights that instance's source regions on
  // the embedded PDF; a click PINS the highlight (stable target for
  // keyboard/touch), a second click unpins. Hover wins while active.
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [pinnedPath, setPinnedPath] = useState<string | null>(null);
  const handleFieldHover = useCallback((path: string | null) => {
    setHoverPath(path);
    if (path) track("extract.field_hovered", { path });
  }, []);
  const [renderMode, setRenderMode] = useState<"table" | "json">("table");
  const handleRenderMode = (_event: SyntheticEvent, value: "table" | "json") => {
    if (value) setRenderMode(value);
  };

  // ── Document / schema layout (extract-screen-audit) ─────────────────────
  // The canvas shows the PDF and the field schema SIDE-BY-SIDE only when it is
  // actually wide enough for both to be comfortable. Below that, cramming them
  // produces a ~270px schema where field ids overflow and the category tabs
  // can't fit — so instead we show ONE pane at a time behind a Document/Fields
  // toggle (plain tabs, not a slider), giving the active pane the full width.
  // The decision is driven by the MEASURED canvas width (not a viewport media
  // query), because the resizable chat pane changes how much room the canvas
  // actually has at any given viewport.
  const [activePane, setActivePane] = useState<"document" | "fields">("document");
  const [contentWidth, setContentWidth] = useState(0);
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null);
  // Callback ref (not useEffect + ref.current): the content container only
  // mounts AFTER the early loading return resolves, so an effect keyed on mount
  // would observe a null ref and never re-run. A callback ref fires whenever the
  // node actually attaches/detaches.
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    contentResizeObserverRef.current?.disconnect();
    if (!node || typeof ResizeObserver === "undefined") return;
    setContentWidth(node.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setContentWidth(w);
    });
    ro.observe(node);
    contentResizeObserverRef.current = ro;
  }, []);
  // Assume there's room until we've measured otherwise (contentWidth === 0):
  // the callback ref measures synchronously on attach, so a real browser has the
  // true width before first paint (no flash); environments without ResizeObserver
  // (jsdom) stay side-by-side.
  const useSideBySide = contentWidth === 0 || contentWidth >= SIDE_BY_SIDE_MIN_PX;
  // Pin toggle (§3.2b). In the stacked single-pane layout, pinning also brings
  // the document pane forward so the pinned highlight is actually visible.
  const handleFieldPin = useCallback(
    (path: string) => {
      setPinnedPath((prev) => (prev === path ? null : path));
      if (!useSideBySide) setActivePane("document");
    },
    [useSideBySide],
  );

  const scenarioId = appMode.scenario ?? session?.scenario ?? "utility";
  const { byId } = useScenarioRegistry();
  const scenario = byId(scenarioId);

  // Re-focus the workbench on a schema category through the orchestrator. When
  // the workbench is already shown the dispatch re-focuses the active step in
  // place (history unchanged); otherwise it enters the workbench focused there.
  const handleSelectCategory = useCallback(
    (categoryId: string | null) => {
      if (!categoryId || !orchestrator) return;
      orchestrator.dispatch(
        { kind: "showExtract", scope, schemaId: scenarioId, focusedCategoryId: categoryId },
        "user",
      );
    },
    [orchestrator, scope, scenarioId],
  );

  // ScopedViewerWidget contract: the document set comes FROM the scope, not
  // from scenario context.
  // adopt-tanstack-query: the whole live read (document → workflow → schema →
  // values/confidences → geometry) is now ONE keyed `useQuery` in
  // `useExtractWorkbench`, replacing the `useScopeAdapter` + `loadSeqRef` + four
  // `setState` sinks. Keyed on the documentId, so an Interact↔Extract toggle over
  // the same doc reads the cache instead of re-running the chain; TanStack drops
  // stale results (no manual load-sequence guard). Placeholder ids / failures →
  // empty, so the manifest fallback still applies.
  const liveDocId = primaryDocumentIdFromScope(scope);
  const {
    schema: liveSchema,
    root: liveRoot,
    entries: liveEntries,
    geometry: liveGeometry,
  } = useExtractWorkbench(liveDocId ?? "");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const templateIdRef = useRef<string | null>(null);
  const activeChatSession = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)
    : null;
  const overlay = activeChatSession?.pendingSchemaOverlay;
  const hasUnsavedChanges = overlay
    ? overlay.addedFields.length + overlay.removedFieldIds.size + overlay.editedFields.size > 0
    : false;

  // agentic-template-item-editor — a persisted uncommitted draft (the user's
  // saved-but-not-committed question set) WINS as the base schema (design D5):
  // it is frozen + independent of the sample manifest, so the editor resumes on
  // the user's edits after a reload (incl. onboarding/anon where no committed
  // Template can be saved). No draft → seed from the live/manifest schema.
  const activeEntity =
    activeChatSession?.activeEntityKey != null
      ? activeChatSession.entities.get(activeChatSession.activeEntityKey)
      : null;
  const draftTemplate =
    activeEntity?.draftTemplate && activeEntity.draftTemplate.kind === "extract"
      ? activeEntity.draftTemplate
      : null;
  const liveBaseSchema = liveSchema ?? scenario?.manifest.extractionSchema;
  const schema = draftTemplate ? draftBodyToSchemaDef(draftTemplate.body, liveBaseSchema) : liveBaseSchema;

  const isAuthed = appMode.authState === "signed-in";
  // standardized-viewer-control T5 (R7) — the design surface is driven by the
  // active step's `surface` (forwarded as a prop). This is what makes the schema
  // design surface reachable in STEADY.
  const isDesignSurface = surface === "design";
  // "← back" returns to the fields workbench by re-dispatching `showExtract`
  // (surface defaults to "fields") through the orchestrator — the single
  // viewer-mutation seam. No-op in a standalone mount with no orchestrator.
  const handleBack = useCallback(() => {
    orchestrator?.dispatch({ kind: "showExtract", scope, schemaId: scenarioId }, "user");
  }, [orchestrator, scope, scenarioId]);
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || saveStatus === "saving") return;
    if (!schema) return;
    if (!templateIdRef.current) {
      templateIdRef.current = mintTemplateId();
    }
    setSaveStatus("saving");
    const merged = mergeOverlayForSave(schema, overlay ?? null);
    // Save-moment (the chosen write trigger) — persist the resolved draft to the
    // DB twin + localStorage cache so the edits survive a reload even if the
    // committed save below can't complete (onboarding/anon → 401 → sign-up gate).
    // Flattens the overlay into the draft base so a repeat save can't double-add.
    commitDraftTemplate({ id: templateIdRef.current, kind: "extract", name: null, body: merged });
    try {
      await api.template.saveTemplate({
        id: templateIdRef.current,
        kind: "extract",
        name: `${schema.name} (custom)`,
        body: merged,
      });
      setSaveStatus("saved");
      // Committed → the draft is now a real Template; clear the uncommitted draft
      // so it doesn't shadow the committed template as the base on re-open.
      commitDraftTemplate(null);
      if (templateIdRef.current) {
        const schemaName = `${schema.name} (custom)`;
        // standardized-viewer-control T10 — the "save-and-return to the Ingest
        // picker" choreography dispatches the generic `presentExperienceBeat`
        // `ingest-picker` beat through the STANDARD dispatch seam (NOT a direct
        // `pushStep` — viewer-step mutators are reachable only from the
        // orchestrator). The beat handler deactivates the entity, resets the
        // gate, records the "left" viewer-event, and pushes the picker step
        // carrying the freshly-attached schema — one seam, no double-push. This
        // mirrors the post-commit (gate-resolved) path below.
        orchestrator?.dispatch(
          {
            kind: "presentExperienceBeat",
            beat: {
              kind: "ingest-picker",
              attachedSchema: { schemaId: templateIdRef.current, name: schemaName },
            },
          },
          "user",
        );
        appendAgentMessage(`Schema attached: ${schemaName}`);
      }
    } catch (err) {
      const status = typeof err === "object" && err !== null && "status" in err ? err.status : null;
      if (status === 401) {
        setSaveStatus("idle");
        openGate("save", { cause: "save-schema" });
      } else {
        setSaveStatus("error");
      }
    }
  }, [api.template, hasUnsavedChanges, saveStatus, schema, overlay, openGate, orchestrator, appendAgentMessage, commitDraftTemplate]);

  const postCommitConsumedRef = useRef(false);
  useEffect(() => {
    const gate = session?.gate;
    if (!gate) return;
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
        await api.template.saveTemplate({
          id: templateIdRef.current!,
          kind: "extract",
          name: `${schema!.name} (custom)`,
          body: merged,
        });
        setSaveStatus("saved");
        // Committed post-sign-up → the draft is now a real Template; clear it so
        // it doesn't shadow the committed template as the base on re-open.
        commitDraftTemplate(null);
        const schemaName = `${schema!.name} (custom)`;
        // standardized-viewer-control deletion-phase — the onboarding-only
        // "save-and-return to the Ingest picker" choreography dispatches the
        // generic `presentExperienceBeat` `ingest-picker` beat through the STANDARD
        // dispatch seam. The beat handler does the entity-DEACTIVATE + gate-reset
        // + "left" viewer-event side effects (a BACKWARD transition to ingest, R2)
        // AND pushes the picker step carrying the freshly-attached schema — one
        // seam, no double-push.
        orchestrator?.dispatch(
          {
            kind: "presentExperienceBeat",
            beat: {
              kind: "ingest-picker",
              attachedSchema: { schemaId: templateIdRef.current!, name: schemaName },
            },
          },
          "user",
        );
        appendAgentMessage(`Schema attached: ${schemaName}`);
      } catch {
        setSaveStatus("error");
      }
    })();
  }, [api.template, session?.gate, schema, overlay, orchestrator, appendAgentMessage, commitDraftTemplate]);

  // analyze-and-chat-ux §2.2 — the render source is the OUTPUT-FIRST instance
  // tree: live → the workbench's tree + per-instance-path geometry; no live doc
  // → a degenerate single-instance tree from the manifest fixtures (no
  // geometry — fixture citations carry no boxes). Same recursive render both
  // ways. (The old F4 "land on the first field's provenance" effect died with
  // the detail card; focus now preselects the matching tab in InstanceFields.)
  const displayData = useMemo(() => {
    if (liveSchema && liveRoot) {
      return { root: liveRoot, geometry: liveGeometry, pages: undefined };
    }
    const base = scenario?.manifest.extractionSchema;
    if (base) {
      const { root, pages } = manifestToInstances(base, scenario?.manifest.sampleExtractionValues ?? []);
      return { root, geometry: new Map<string, FieldRegion[]>(), pages };
    }
    return null;
  }, [liveSchema, liveRoot, liveGeometry, scenario]);

  // SchemaView (design surface) consumes a flat per-field sample-value list —
  // it is the LABEL editor, so first-instance samples are its semantic.
  const schemaViewValues = useMemo<ExtractedFieldValue[]>(() => {
    if (liveSchema) return entriesToFieldValues(liveDocId ?? "", liveEntries, liveGeometry);
    return scenario?.manifest.sampleExtractionValues ?? [];
  }, [liveSchema, liveEntries, liveGeometry, liveDocId, scenario]);

  // On F3a entry, auto-pin the scope's primary document. Idempotent. (The
  // focused category is no longer seeded here — focus lives on the viewer step
  // and defaults to the first category via the derivation below.)
  const primaryDocId = liveDocId;
  const primaryDocFileName = scenario?.documents?.[0]?.fileName ?? primaryDocId;
  const primaryDocPages = scenario?.documents?.[0]?.pageCount;
  useEffect(() => {
    if (!schema || !overlay) return;
    if (primaryDocId && overlay.pinnedSamples.length === 0) {
      pinSample(primaryDocId);
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
    // unified-loader §1.5 — the shared boundary in place of the old dots. The
    // frame body is a top-anchored column (§1.1), and the boundary flexes to
    // fill it, so the mark centers in the pane instead of floating.
    return (
      <Box
        data-testid="extract-workbench"
        data-role={role}
        sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <Box data-testid="extract-loading" sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          <Loading loading size="lg" message="Reading the extraction…" />
        </Box>
      </Box>
    );
  }

  // standardized-viewer-control — focus comes SOLELY from the active step
  // (forwarded prop), so a `showExtract` intent re-focuses the live workbench.
  // Absent (or naming a category not in this schema) defaults to the first
  // category. The overlay / `?focus` carriers are gone.
  const focusedCategoryId =
    (focusedCategoryIdProp && schema.categories.find((c) => c.id === focusedCategoryIdProp)?.id) ??
    schema.categories[0]?.id ??
    null;

  // Hover wins while active; otherwise the pinned path holds the highlight
  // (§3.2/§3.2b). Regions are per instance path, so meter 2's usage lights its
  // own box, not meter 1's. Manifest fixtures have pages but no boxes → page
  // jump only.
  const activeFieldPath = hoverPath ?? pinnedPath;
  const activeRegions = activeFieldPath
    ? displayData?.geometry.get(activeFieldPath) ?? null
    : null;
  const activeTargetPage =
    activeRegions?.[0]?.page ??
    (activeFieldPath ? displayData?.pages?.get(activeFieldPath) : undefined);

  const supportsJsonRender = scenario?.supportsJsonRender ?? false;

  // Tree-shaped JSON: the schema-visible slice of the extraction output in its
  // own recursive shape (§2.2 — replaces the flat category projection).
  const jsonOutput = JSON.stringify(
    displayData ? instancesToJson(displayData.root) : {},
    null,
    2
  );

  return (
    <Box
      data-testid="extract-workbench"
      data-role={role}
      aria-label="Extract workbench"
      // width:100% + minWidth:0 — the workbench is a flex item in a row frame
      // (`viewer-frame-body`), so without an explicit width it defaults to
      // `flex: 0 1 auto` and shrinks to its CONTENT's intrinsic width. That made
      // the measured content width (and therefore the side-by-side vs stacked
      // decision) depend on WHICH field's detail was showing — a narrow field
      // detail shrank the workbench below the 760px threshold and spuriously
      // collapsed the PDF, while a wide one didn't. Filling the frame makes the
      // layout decision depend only on the real available canvas width. Same
      // fix PdfViewerWidget already carries for the same reason.
      sx={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0, height: "100%", overflow: "hidden", backgroundColor: WARM_OFFWHITE }}
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
          onSelectCategory={handleSelectCategory}
        />
      )}

      {isDesignSurface ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <SchemaView
            schema={schema}
            values={schemaViewValues}
            focusedCategoryId={focusedCategoryId}
          />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
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

          {!useSideBySide ? (
            <Box
              data-testid="extract-pane-toggle"
              role="tablist"
              aria-label="Extract pane"
              sx={{
                flexShrink: 0,
                alignSelf: "flex-start",
                display: "flex",
                gap: 0.5,
                p: 0.5,
                borderRadius: BORDER_RADIUS_PILL,
                border: `1px solid ${BORDER}`,
                backgroundColor: WHITE,
              }}
            >
              {(["document", "fields"] as const).map((pane) => (
                <Box
                  key={pane}
                  component="button"
                  type="button"
                  role="tab"
                  aria-selected={activePane === pane}
                  data-testid={`extract-pane-toggle-${pane}`}
                  onClick={() => setActivePane(pane)}
                  sx={{
                    border: "none",
                    cursor: "pointer",
                    px: 1.5,
                    py: 0.5,
                    borderRadius: BORDER_RADIUS_PILL,
                    fontFamily: "inherit",
                    fontSize: FONT_SIZE_LABEL,
                    fontWeight: FONT_WEIGHT_LABEL,
                    color: NAVY,
                    backgroundColor: activePane === pane ? alpha(GREEN, 0.16) : "transparent",
                  }}
                >
                  {pane === "document" ? "Document" : "Fields"}
                </Box>
              ))}
            </Box>
          ) : null}

          <Box
            ref={contentRef}
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "row",
              gap: useSideBySide ? 2 : 0,
              overflow: "hidden",
            }}
          >
            {useSideBySide || activePane === "document" ? (
              <Box
                sx={{
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  // Side-by-side: document gets a slightly smaller share than
                  // the denser schema. Stacked: it's the only pane → full width.
                  flex: useSideBySide ? "1 1 0" : 1,
                }}
              >
          <Box
            data-testid="extract-doc-pane"
            sx={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflow: "hidden",
              borderRadius: BORDER_RADIUS_CARD,
              backgroundColor: WHITE,
              display: "flex",
            }}
          >
            {liveDocId ? (
              <PdfViewerWidget
                scope={scope}
                role={role}
                targetPage={activeTargetPage ?? undefined}
                highlightBbox={activeRegions?.[0]?.bbox ?? null}
                highlightTier={activeRegions ? "paraphrase" : undefined}
                // multi-region-citations P1.3b — light EVERY place the hovered/
                // pinned field instance's value appears (§3.2).
                highlightRegions={
                  activeRegions
                    ? activeRegions.map((r) => ({ page: r.page, bbox: r.bbox, tier: "paraphrase" as const }))
                    : undefined
                }
              />
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
              </Box>
            ) : null}

            {useSideBySide || activePane === "fields" ? (
              <Box
                data-testid="extract-fields-scroll"
                sx={{
                  // Side-by-side: schema gets a slightly larger share than the
                  // document (it's denser). Stacked: it's the only pane.
                  flex: useSideBySide ? "1.2 1 0" : 1,
                  minWidth: 0,
                  minHeight: 0,
                  // The SOLE scroll container for the recursive fields tree — a
                  // plain block so tall children scroll here, not in an inner
                  // region. (The list↔detail scroll save/restore died with the
                  // detail card, §3.1.)
                  overflow: "auto",
                  // analyze-and-chat-ux §7.1 — scrollbar FLUSH to the pane edge:
                  // bleed through the workbench body's right padding (negative
                  // margin) and give the CONTENT its breathing room back via the
                  // scroller's own padding-right — the same pattern as the chat
                  // pane. The scrollbar hugs the pane instead of floating ~24px
                  // inside it. (Chat's `scrollbarGutter: stable` is untouched.)
                  mr: { xs: -1.5, md: -2 },
                  pr: { xs: 1.5, md: 2 },
                }}
              >
          <Box data-testid="extract-fields-panel" sx={{ p: 1 }}>
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
              <Box sx={{ flex: 1 }} />
              <FieldsPanelMenu scenarioId={scenarioId} />
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
            ) : displayData ? (
              // analyze-and-chat-ux §2.2 — the recursive output-first render.
              // Every instance renders (no [0] flatten); hovering/focusing a row
              // lights its own source regions on the embedded PDF; clicking pins.
              <InstanceFields
                root={displayData.root}
                schema={schema}
                geometry={displayData.geometry}
                pages={displayData.pages}
                pinnedPath={pinnedPath}
                onFieldHover={handleFieldHover}
                onFieldPin={handleFieldPin}
                focusedGroupId={focusedCategoryId}
              />
            ) : null}
          </Box>
              </Box>
            ) : null}
          </Box>

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

const FieldsPanelMenu: FC<{ scenarioId: string }> = ({ scenarioId }) => {
  // standardized-viewer-control T5 (R7) — the "Edit schema" / "Save schema"
  // menu items dispatch `editSchema` through the orchestrator (the single
  // viewer-mutation seam) so the schema DESIGN surface opens via the active
  // step's `surface: "design"` sub-position — in BOTH onboarding and steady.
  // No-op in a standalone mount.
  const orchestrator = useCanvasOrchestratorOptional();
  const { state: appMode } = useAppMode();
  const isAuthed = appMode.authState === "signed-in";
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = anchorEl != null;
  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);
  const handleClose = useCallback(() => setAnchorEl(null), []);
  const openDesignSurface = useCallback(() => {
    orchestrator?.dispatch({ kind: "editSchema", schemaId: scenarioId }, "user");
    setAnchorEl(null);
  }, [orchestrator, scenarioId]);
  const handleEdit = openDesignSurface;
  const handleSave = openDesignSurface;
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
