/**
 * SmartReportBuilder — the Report **builder** surface (f4a / S3a).
 *
 * A **ScopedViewerWidget** mirroring the F3a schema-editor chrome
 * (`SchemaView` / `ExtractView`): a pinned-samples row, `Sections` / `Render`
 * sub-tabs, a row list with an inline section editor, the `⋮` menu, and the
 * `export ▾ 🔒 · ↻ render · 💾 Save 🔒` control row. (Proposal cards — the
 * agent-driven section suggestions — land with their producer in Phase 5;
 * not rendered here yet.)
 *
 * Reports are **schemas for questions**: the template = an ordered list of
 * sections, each `name + renderAs + question + instructions + variables`. The
 * template is **scope-independent** — there is deliberately NO per-section
 * scope control; the render scope is supplied at render time (recorded on the
 * result, not the template). Variables are **manual / literal-only** (#12 — no
 * auto-inference) via the per-section "make variable" affordance. There is NO
 * version-history UI (#13 — latest-saved only).
 *
 * The builder is the **real second consumer** of the generalized editing
 * overlay: its row edits drive `reportOverlay` on the active ChatSession
 * (`addReportSection` / `editReportSection` / `removeReportSection`), the
 * `report`-kind sibling of the Extract schema overlay built on the same generic
 * `PendingTemplateOverlay` shell.
 *
 * Per `widget-role-access`: `role: WidgetRole` is the authorization axis. Save
 * is sign-in-gated — a `member` saves directly: `handleSave` builds the
 * scope-independent report-kind Template from the effective rows and persists it
 * via `saveReportTemplate` (`POST /api/widgets/smart-report/reports` → the shared
 * `saveTemplate` repo API, the SAME persistence Extract uses). An `anonymous`
 * user's Save opens the sign-in gate (`commitGate`) and never persists.
 * `scope: ContentScope` selects which template's sections to seed from the
 * client-side demo fixture (the demos open on `bucket + project filter`).
 *
 * The widget's `show_smart_report_edit` canvas-dispatch descriptor + the
 * per-control `*.tools.ts` surface are DEFERRED to Phase 5 (step 17) — the
 * widget opts out via `no-llm.md` until its real chat→canvas dispatch lands.
 */

import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { type ChangeEvent, type FC, useCallback, useEffect, useMemo, useState } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import { widgetRoleCanEdit } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CORAL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import type { ReportTemplateDefinition, SaveReportTemplateInput } from "@/api/smartReport";
import { useApi } from "@/contexts/ApiContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import type { ReportSectionEdit, ReportSectionItem, ReportSectionRenderAs } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";

export interface SmartReportBuilderProps {
  /** REQUIRED render-time scope (a real `ContentScope` — ScopedViewerWidget). */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates Save / export. */
  role: WidgetRole;
  /**
   * Optional explicit section to pre-select (open its inline editor on mount).
   * On the live `<ScopedCanvas>` path this prop is absent (the `{ scope, role }`
   * mount contract can't supply it); the builder then falls back to
   * `session.selectedReportSectionId`, which the orchestrator sets from the
   * render→builder `✎ edit §N` control and the `show_smart_report_edit` LLM tool
   * (both emit the `editTemplate` intent → `advanceFrame("f4a", {
   * selectedReportSectionId })`). Omitted with no session value → no editor open.
   */
  selectedSectionId?: string;
}

/** A builder row = a section's effective editable shape (base ⊕ overlay edit). */
interface BuilderSectionRow {
  id: string;
  name: string;
  renderAs: ReportSectionRenderAs;
  question: string;
  instructions: string[];
  variables: string[];
}

const RENDER_AS_OPTIONS: { value: ReportSectionRenderAs; label: string }[] = [
  { value: "PARAGRAPH", label: "¶ Paragraph" },
  { value: "BULLETS", label: "• Bullets" },
  { value: "TABLE", label: "▦ Table" },
];

/** Title-case a snake_case section name for display. */
function humanizeName(name: string): string {
  return name
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * The template identity (id + display name) for a from-scratch builder. No
 * fixture identity — an "Untitled report" is minted (a fresh id) so a
 * from-scratch template still persists. A loaded template overrides this (its
 * own id when owned; a fresh forked id when NOT owned — see the load effect).
 */
function mintUntitledIdentity(): { id: string; name: string } {
  return { id: `rt-${Date.now()}`, name: "Untitled report" };
}

/**
 * Map a loaded template's section definition onto a `BuilderSectionRow`. The
 * persisted `instructions` is a single string (one rule per line); the builder
 * row carries them as an array, so split on newlines (Save re-joins).
 */
function templateSectionToRow(
  section: ReportTemplateDefinition["sections"][number],
): BuilderSectionRow {
  return {
    id: section.id,
    name: section.name,
    renderAs: section.renderAs,
    question: section.question,
    instructions: section.instructions ? section.instructions.split("\n") : [],
    variables: section.variables,
  };
}

/** Builder Save lifecycle (mirrors Extract's SaveStatus). */
type SaveStatus = "idle" | "saving" | "saved" | "error";

export const SmartReportBuilder: FC<SmartReportBuilderProps> = ({ scope, role, selectedSectionId }) => {
  const {
    report: { renderReport, saveReportTemplate, getReportTemplate },
  } = useApi();
  const { addReportSection, editReportSection, removeReportSection, state: chatState } = useChatStore();
  const onboardingSession = useOnboardingSessionOptional();
  const openGate = onboardingSession?.openGate ?? (() => undefined);
  const advanceFrame = onboardingSession?.advanceFrame ?? (() => undefined);

  // The active session's report overlay (the draft diff) + the template id it
  // renders/edits. The template is scope-INDEPENDENT, so base rows are driven by
  // `templateId` (below), NOT by the scope.
  const overlay = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)?.reportOverlay
    : undefined;
  const templateId = overlay?.templateId;

  const [baseRows, setBaseRows] = useState<BuilderSectionRow[]>([]);
  const [templateIdentity, setTemplateIdentity] = useState(mintUntitledIdentity);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // A scope-identity change is a new render TARGET, not a new template — reset
  // only the save status (the template + its rows are scope-independent).
  useScopeAdapter(scope, () => setSaveStatus("idle"));

  // Load the template's section definitions when a `templateId` is set (else a
  // from-scratch empty draft). FORK-ON-EDIT (report-default-template §C2.2): a
  // loaded template the caller does NOT own (the sentinel-owned sample) gets a
  // FRESH minted identity so Save creates a member copy (copy-on-write) and never
  // targets the original id; an owned template keeps its id.
  useEffect(() => {
    let cancelled = false;
    if (!templateId) {
      setBaseRows([]);
      setTemplateIdentity(mintUntitledIdentity());
      return;
    }
    void (async () => {
      const result = await getReportTemplate(templateId);
      if (cancelled) return;
      if (!result) {
        setBaseRows([]);
        setTemplateIdentity(mintUntitledIdentity());
        return;
      }
      setBaseRows(result.template.sections.map(templateSectionToRow));
      setTemplateIdentity(
        result.owned
          ? { id: result.template.id, name: result.template.name }
          : { id: `rt-${Date.now()}`, name: result.template.name },
      );
      setSaveStatus("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, getReportTemplate]);

  // Sub-tab: Sections (the editor) vs Render (a preview hand-off, Phase 5/6).
  const [tab, setTab] = useState<"sections" | "render">("sections");
  // The section to pre-open the inline editor on. The `selectedSectionId` prop
  // is the explicit caller value; on the live `<ScopedCanvas>` path that prop
  // is absent (the `{ scope, role }` mount contract can't supply it), so fall
  // back to `session.selectedReportSectionId` — set by the orchestrator's
  // editTemplate routing (advanceFrame("f4a", { selectedReportSectionId })),
  // which is the render→builder + `show_smart_report_edit` hand-off.
  const effectiveSelectedSectionId =
    selectedSectionId ?? onboardingSession?.state.selectedReportSectionId ?? undefined;
  // Only one row's inline editor is open at a time (the F3a invariant). Seeded
  // from the effective selected section.
  const [openRowId, setOpenRowId] = useState<string | null>(effectiveSelectedSectionId ?? null);

  const canEdit = widgetRoleCanEdit(role);

  // Effective rows = base ⊕ overlay (added · removed · edited).
  const rows = useMemo<BuilderSectionRow[]>(() => {
    const removed = overlay?.removedFieldIds ?? new Set<string>();
    const edits = overlay?.editedFields ?? new Map<string, ReportSectionEdit>();
    const seeded = baseRows
      .filter((r) => !removed.has(r.id))
      .map((r) => {
        const edit = edits.get(r.id);
        return edit ? { ...r, ...edit } : r;
      });
    const added: BuilderSectionRow[] = (overlay?.addedFields ?? [])
      .filter((a: ReportSectionItem) => !removed.has(a.id))
      .map((a: ReportSectionItem) => {
        const edit = edits.get(a.id);
        const base: BuilderSectionRow = {
          id: a.id,
          name: a.name,
          renderAs: a.renderAs,
          question: a.question,
          instructions: a.instructions,
          variables: a.variables,
        };
        return edit ? { ...base, ...edit } : base;
      });
    return [...seeded, ...added];
  }, [baseRows, overlay]);

  const openEditor = useCallback((id: string) => setOpenRowId(id), []);
  const closeEditor = useCallback(() => setOpenRowId(null), []);

  // Re-open when the hand-off targets a different section after mount (a fresh
  // `✎ edit §N` / `show_smart_report_edit` while the builder is already shown).
  // Tracks the effective id so a session-driven hand-off (live ScopedCanvas
  // path, no prop) re-opens too.
  useEffect(() => {
    if (effectiveSelectedSectionId !== undefined) setOpenRowId(effectiveSelectedSectionId);
  }, [effectiveSelectedSectionId]);

  const handleSave = useCallback(async () => {
    // Save is sign-in-gated. An anonymous user's Save opens the gate
    // (`commitGate`); it never persists.
    if (!canEdit) {
      openGate("save");
      return;
    }
    if (saveStatus === "saving") return;
    // Member persist: build the scope-independent report-kind Template from the
    // builder's effective rows and persist it via the shared `saveTemplate`
    // repo API (`POST /api/widgets/smart-report/reports`) — the SAME persistence
    // Extract uses. The template carries questions/sections only; scope is a
    // render-time input, never stored on the template.
    const template: SaveReportTemplateInput = {
      id: templateIdentity.id,
      name: templateIdentity.name,
      format: "ic-brief",
      sections: rows.map((r) => ({
        id: r.id,
        name: r.name,
        renderAs: r.renderAs,
        question: r.question,
        variables: r.variables,
        ...(r.instructions.length > 0 ? { instructions: r.instructions.join("\n") } : {}),
      })),
    };
    setSaveStatus("saving");
    try {
      await saveReportTemplate(template);
      setSaveStatus("saved");
    } catch (err) {
      // A 401 (auth state flipped to anon mid-edit) routes to the sign-in gate;
      // any other failure surfaces an error the user can retry from.
      const status = typeof err === "object" && err !== null && "status" in err ? err.status : undefined;
      if (status === 401) {
        setSaveStatus("idle");
        openGate("save");
      } else {
        setSaveStatus("error");
      }
    }
  }, [canEdit, openGate, saveStatus, templateIdentity, rows, saveReportTemplate]);

  // ↻ render — re-run the template over the current scope through the render
  // endpoint (`renderReport`), then advance to the render surface (f4) to show
  // the result. The endpoint is the production caller (round-trip closed); the
  // render surface re-fetches its own first paint, so advancing is sufficient.
  const handleRerender = useCallback(async () => {
    const chatSessionId = chatState.activeSessionId;
    if (!chatSessionId) {
      advanceFrame("f4");
      return;
    }
    try {
      await renderReport({ templateId: templateIdentity.id, scope, chatSessionId });
    } catch {
      /* the render surface owns the visible error state; advance regardless */
    }
    advanceFrame("f4");
  }, [chatState.activeSessionId, templateIdentity.id, scope, advanceFrame, renderReport]);

  const handleAddSection = useCallback(() => {
    const id = `sec-${Date.now()}`;
    addReportSection({
      id,
      name: "new_section",
      renderAs: "PARAGRAPH",
      question: "",
      instructions: [],
      variables: [],
    });
    openEditor(id);
  }, [addReportSection, openEditor]);

  return (
    <Box
      data-testid="smart-report-builder"
      data-role={role}
      aria-label="Report builder surface"
      sx={{
        height: "100%",
        overflow: "auto",
        backgroundColor: WARM_OFFWHITE,
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* Pinned-samples row (reused from the F3a chrome). */}
      <Box
        data-testid="report-builder-pinned-samples"
        sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
      >
        <Box
          component="span"
          sx={{
            color: MUTED_ON_LIGHT,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Samples
        </Box>
        {(overlay?.pinnedSamples ?? []).length === 0 ? (
          <Box component="span" sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL }}>
            none pinned
          </Box>
        ) : (
          (overlay?.pinnedSamples ?? []).map((s) => (
            <Box
              key={s}
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: BORDER_RADIUS_PILL,
                backgroundColor: WHITE,
                border: `1px solid ${BORDER}`,
                fontSize: FONT_SIZE_LABEL,
                color: NAVY,
              }}
            >
              {s}
            </Box>
          ))
        )}
      </Box>

      {/* Sections / Render sub-tabs (reused from the F3a chrome). */}
      <Box sx={{ display: "flex", gap: 0.5 }} role="tablist" aria-label="Builder sub-tabs">
        {(["sections", "render"] as const).map((t) => (
          <Box
            key={t}
            component="button"
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-testid={`report-builder-tab-${t}`}
            onClick={() => setTab(t)}
            sx={{
              border: "none",
              cursor: "pointer",
              px: 1.5,
              py: 0.5,
              borderRadius: BORDER_RADIUS_SM,
              backgroundColor: tab === t ? NAVY : "transparent",
              color: tab === t ? WHITE : BODY_TEXT,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              "&:focus-visible": { outline: `2px solid ${NAVY}` },
            }}
          >
            {t === "sections" ? "Sections" : "Render"}
          </Box>
        ))}
      </Box>

      {tab === "sections" ? (
        <Stack spacing={1.25} data-testid="report-builder-rows">
          {rows.length === 0 ? (
            <Box data-testid="report-builder-empty" sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION }}>
              No sections yet. Add one — or pin an answer from chat (Phase 5).
            </Box>
          ) : (
            rows.map((row) => (
              <SectionRow
                key={row.id}
                row={row}
                open={openRowId === row.id}
                onOpen={() => openEditor(row.id)}
                onClose={closeEditor}
                onSave={(edit) => {
                  editReportSection(row.id, edit);
                  closeEditor();
                }}
                onRemove={() => {
                  removeReportSection(row.id);
                  closeEditor();
                }}
              />
            ))
          )}
          <Box
            component="button"
            type="button"
            data-testid="report-builder-add-section"
            onClick={handleAddSection}
            sx={{
              alignSelf: "flex-start",
              border: `1px dashed ${BORDER}`,
              borderRadius: BORDER_RADIUS_SM,
              background: "none",
              cursor: "pointer",
              color: NAVY,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              px: 1.5,
              py: 0.5,
              "&:focus-visible": { outline: `2px solid ${NAVY}` },
            }}
          >
            + add section
          </Box>
        </Stack>
      ) : (
        <Box data-testid="report-builder-render-tab" sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION }}>
          Render preview opens on the render surface (f4) — use ↻ render below.
        </Box>
      )}

      {/* Control row: export ▾ 🔒 · ↻ render · 💾 Save 🔒 (reused from F3a topbar). */}
      <Box
        data-testid="report-builder-controls"
        sx={{ display: "flex", alignItems: "center", gap: 2, mt: "auto", pt: 1 }}
      >
        <Box
          data-testid="report-builder-export"
          aria-disabled={!canEdit || undefined}
          sx={{
            color: canEdit ? NAVY : BODY_TEXT,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            opacity: canEdit ? 1 : 0.6,
          }}
        >
          {canEdit ? "export ▾" : "export ▾ 🔒"}
        </Box>
        <Box
          component="button"
          type="button"
          data-testid="report-builder-render"
          aria-label="Re-render report"
          onClick={handleRerender}
          sx={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            p: 0,
            "&:focus-visible": { outline: `2px solid ${NAVY}` },
          }}
        >
          ↻ render
        </Box>
        <Box
          component="button"
          type="button"
          data-testid="report-builder-save"
          aria-label="Save report template"
          onClick={handleSave}
          sx={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            p: 0,
            "&:focus-visible": { outline: `2px solid ${NAVY}` },
          }}
        >
          {canEdit ? "💾 Save" : "💾 Save 🔒"}
        </Box>
        {saveStatus !== "idle" ? (
          <Box
            component="span"
            data-testid="report-builder-save-status"
            sx={{
              color: saveStatus === "error" ? CORAL : MUTED_ON_LIGHT,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
            }}
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved."}
            {saveStatus === "error" && "Save failed — try again."}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

// ── Section row + inline editor ──────────────────────────────────────────

interface SectionRowProps {
  row: BuilderSectionRow;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (edit: ReportSectionEdit) => void;
  onRemove: () => void;
}

const SectionRow: FC<SectionRowProps> = ({ row, open, onOpen, onClose, onSave, onRemove }) => {
  const [name, setName] = useState(row.name);
  const [renderAs, setRenderAs] = useState<ReportSectionRenderAs>(row.renderAs);
  const [question, setQuestion] = useState(row.question);
  const [instructions, setInstructions] = useState(row.instructions.join("\n"));
  const [variables, setVariables] = useState<string[]>(row.variables);
  // The user-chosen variable token (step-16 follow-up — no longer a hardcoded
  // literal). Sanitized to a `{token}`-safe slug on record.
  const [variableName, setVariableName] = useState("");
  // The `⋮` menu open state (reused from the F3a row menu).
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaSx = {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    border: `1px solid ${BORDER}`,
    borderRadius: BORDER_RADIUS_SM,
    backgroundColor: WHITE,
    color: NAVY,
    fontFamily: "inherit",
    fontSize: FONT_SIZE_CAPTION,
    lineHeight: 1.5,
    px: 1.5,
    py: 1,
    "&:focus": {
      borderColor: NAVY,
      outline: `2px solid ${NAVY}55`,
      outlineOffset: 1,
    },
  } as const;

  const handleSave = useCallback(() => {
    onSave({
      name,
      renderAs,
      question,
      instructions: instructions
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
      variables,
    });
  }, [name, renderAs, question, instructions, variables, onSave]);

  // Manual "make variable" (#12 — literal-only, no auto-inference): the user
  // NAMES the token (step-16 follow-up — was a hardcoded "project"). The chosen
  // name is slugged to a `{token}`-safe identifier; a blank name is a no-op.
  const handleMakeVariable = useCallback(() => {
    const token = variableName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (token.length === 0) return;
    setVariables((prev) => (prev.includes(token) ? prev : [...prev, token]));
    setVariableName("");
  }, [variableName]);

  return (
    <Box
      data-testid={`report-builder-row-${row.id}`}
      sx={{
        border: `1px solid ${BORDER}`,
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box
          component="span"
          sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, fontSize: FONT_SIZE_CAPTION }}
        >
          {humanizeName(row.name)}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            component="button"
            type="button"
            data-testid={`report-builder-edit-${row.id}`}
            onClick={open ? onClose : onOpen}
            sx={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: NAVY,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              p: 0,
              "&:focus-visible": { outline: `2px solid ${NAVY}` },
            }}
          >
            {open ? "Close" : "Edit"}
          </Box>
          {/* ⋮ menu (reused from the F3a row menu) — Remove section. */}
          <Box
            component="button"
            type="button"
            aria-label={`Section menu ${row.name}`}
            data-testid={`report-builder-menu-${row.id}`}
            onClick={() => setMenuOpen((v) => !v)}
            sx={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: MUTED_ON_LIGHT,
              fontSize: FONT_SIZE_CAPTION,
              p: 0,
              "&:focus-visible": { outline: `2px solid ${NAVY}` },
            }}
          >
            ⋮
          </Box>
        </Box>
      </Box>

      {menuOpen ? (
        <Box
          component="button"
          type="button"
          data-testid={`report-builder-remove-${row.id}`}
          onClick={() => {
            setMenuOpen(false);
            onRemove();
          }}
          sx={{
            alignSelf: "flex-end",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: CORAL,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            p: 0,
          }}
        >
          Remove section
        </Box>
      ) : null}

      {open ? (
        <Box
          data-testid={`report-builder-editor-${row.id}`}
          sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: 0.5 }}
        >
          <TextField
            id={`report-builder-section-name-input-${row.id}`}
            name={`reportBuilderSectionName-${row.id}`}
            label="Section name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            inputProps={{ "aria-label": "Section name" }}
          />
          <Box>
            <Box
              component="label"
              htmlFor={`report-builder-render-as-input-${row.id}`}
              id={`renderAs-label-${row.id}`}
              sx={{ display: "block", color: BODY_TEXT, fontSize: FONT_SIZE_LABEL, mb: 0.5 }}
            >
              Render as
            </Box>
            <Select
              value={renderAs}
              onChange={(e) => setRenderAs(e.target.value as ReportSectionRenderAs)}
              size="small"
              fullWidth
              inputProps={{
                id: `report-builder-render-as-input-${row.id}`,
                name: `reportBuilderRenderAs-${row.id}`,
                "aria-labelledby": `renderAs-label-${row.id}`,
              }}
            >
              {RENDER_AS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Box>
            <Box
              component="label"
              htmlFor={`report-builder-question-input-${row.id}`}
              sx={{ display: "block", color: BODY_TEXT, fontSize: FONT_SIZE_LABEL, mb: 0.5 }}
            >
              Question
            </Box>
            <Box
              component="textarea"
              id={`report-builder-question-input-${row.id}`}
              name={`reportBuilderQuestion-${row.id}`}
              aria-label="Question"
              rows={2}
              value={question}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
              sx={textareaSx}
            />
          </Box>
          <Box>
            <Box
              component="label"
              htmlFor={`report-builder-instructions-input-${row.id}`}
              sx={{ display: "block", color: BODY_TEXT, fontSize: FONT_SIZE_LABEL, mb: 0.5 }}
            >
              Instructions
            </Box>
            <Box
              component="textarea"
              id={`report-builder-instructions-input-${row.id}`}
              name={`reportBuilderInstructions-${row.id}`}
              aria-label="Instructions"
              placeholder="One rule per line"
              rows={2}
              value={instructions}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInstructions(e.target.value)}
              sx={textareaSx}
            />
          </Box>
          {/* NO per-section scope field — the template is scope-independent. */}

          {/* Manual "make variable" (#12 — no auto-inference). The user NAMES
              the token (step-16 follow-up — no hardcoded literal). */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <TextField
              id={`report-builder-variable-name-input-${row.id}`}
              name={`reportBuilderVariableName-${row.id}`}
              label="Variable name"
              size="small"
              placeholder="variable name"
              value={variableName}
              onChange={(e) => setVariableName(e.target.value)}
              inputProps={{
                "data-testid": `report-builder-variable-name-${row.id}`,
              }}
            />
            <Box
              component="button"
              type="button"
              data-testid={`report-builder-make-variable-${row.id}`}
              onClick={handleMakeVariable}
              sx={{
                border: `1px solid ${BORDER}`,
                borderRadius: BORDER_RADIUS_SM,
                background: "none",
                cursor: "pointer",
                color: NAVY,
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                px: 1,
                py: 0.25,
                "&:focus-visible": { outline: `2px solid ${NAVY}` },
              }}
            >
              make variable
            </Box>
            {variables.map((v) => (
              <Box
                key={v}
                data-testid={`report-builder-variable-${row.id}-${v}`}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: BORDER_RADIUS_PILL,
                  backgroundColor: WARM_OFFWHITE,
                  border: `1px solid ${BORDER}`,
                  fontSize: FONT_SIZE_LABEL,
                  color: EYEBROW_ON_LIGHT,
                }}
              >
                {`{${v}}`}
              </Box>
            ))}
          </Box>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Box
              component="button"
              type="button"
              data-testid={`report-builder-row-save-${row.id}`}
              onClick={handleSave}
              sx={{
                border: "none",
                background: NAVY,
                color: WHITE,
                cursor: "pointer",
                borderRadius: BORDER_RADIUS_SM,
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                px: 1.5,
                py: 0.5,
                "&:focus-visible": { outline: `2px solid ${NAVY}` },
              }}
            >
              Save
            </Box>
            <Box
              component="button"
              type="button"
              data-testid={`report-builder-row-cancel-${row.id}`}
              onClick={onClose}
              sx={{
                border: `1px solid ${BORDER}`,
                background: "none",
                color: BODY_TEXT,
                cursor: "pointer",
                borderRadius: BORDER_RADIUS_SM,
                fontSize: FONT_SIZE_LABEL,
                px: 1.5,
                py: 0.5,
                "&:focus-visible": { outline: `2px solid ${NAVY}` },
              }}
            >
              Cancel
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

export default SmartReportBuilder;
