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
 * is sign-in-gated — a `member` saves directly (Phase 6 wires the persist
 * endpoint); an `anonymous` user's Save opens the sign-in gate (`commitGate`)
 * rather than persisting. `scope: ContentScope` selects which template's
 * sections to seed from the MOCK_MODE fixture (the demos open on
 * `bucket + project filter`).
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
import { type FC, useCallback, useMemo, useState } from "react";

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
import { useChatStore } from "@/contexts/ChatStoreContext";
import type { ReportSectionEdit, ReportSectionItem, ReportSectionRenderAs } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";
import { getReportFixture } from "@/widgets/reportFixtures";

export interface SmartReportBuilderProps {
  /** REQUIRED render-time scope (a real `ContentScope` — ScopedViewerWidget). */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates Save / export. */
  role: WidgetRole;
  // NOTE: render→builder section *pre-selection* (the `✎ edit §N` hand-off
  // carrying a section id) lands in Phase 5 with the `show_smart_report_edit`
  // tool that carries the id — not shipped here as a dormant prop with no
  // production caller (per the locked "no code with no caller" rule).
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
 * Seed the base section rows for a scope from the MOCK_MODE report fixture.
 * The rendered fixture carries `name + renderAs`; the builder seeds a starter
 * `question` from the section name until the live template read (Phase 6)
 * supplies the authored question.
 */
function baseRowsForScope(scope: ContentScope): BuilderSectionRow[] {
  const report = getReportFixture(scope);
  if (!report) return [];
  return report.sections.map((s) => ({
    id: s.sectionId,
    name: s.name,
    renderAs: s.renderAs,
    question: `Answer the "${humanizeName(s.name)}" section for the selected scope.`,
    instructions: [],
    variables: [],
  }));
}

export const SmartReportBuilder: FC<SmartReportBuilderProps> = ({ scope, role }) => {
  const { addReportSection, editReportSection, removeReportSection, state: chatState } = useChatStore();
  const { state: session, openGate } = useOnboardingSession();

  // ScopedViewerWidget adaptation: re-seed the base rows whenever the scope
  // IDENTITY changes (via `useScopeAdapter` — load-bearing, not a no-op).
  const [baseRows, setBaseRows] = useState<BuilderSectionRow[]>(() => baseRowsForScope(scope));
  useScopeAdapter(scope, (nextScope) => {
    setBaseRows(baseRowsForScope(nextScope));
  });

  // Sub-tab: Sections (the editor) vs Render (a preview hand-off, Phase 5/6).
  const [tab, setTab] = useState<"sections" | "render">("sections");
  // Only one row's inline editor is open at a time (the F3a invariant).
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const canEdit = widgetRoleCanEdit(role);

  // The active session's report overlay (the draft diff over the base rows).
  const overlay = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)?.reportOverlay
    : undefined;

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

  const handleSave = useCallback(() => {
    // Save is sign-in-gated. An anonymous user's Save opens the gate
    // (`commitGate`); the actual persist (the `report`-kind Template save
    // bridge + endpoint) is Phase 6. A member's Save is enabled here and
    // wires to the endpoint in Phase 6.
    if (!canEdit) {
      openGate("save");
      return;
    }
    // Member persist path lands in Phase 6 (the render + Save endpoints).
  }, [canEdit, openGate]);

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
          component="span"
          data-testid="report-builder-render"
          sx={{ color: NAVY, fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}
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
  // The `⋮` menu open state (reused from the F3a row menu).
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Manual "make variable" (#12): wrap the first un-wrapped `{token}`-able
  // word? No — literal-only + manual. We surface the affordance that records
  // a literal variable the user names; for the inline editor we add the
  // section's own name token as the canonical example.
  const handleMakeVariable = useCallback(() => {
    setVariables((prev) => (prev.includes("project") ? prev : [...prev, "project"]));
  }, []);

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
            label="Section name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            inputProps={{ "aria-label": "Section name" }}
          />
          <Box>
            <Box
              component="label"
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
              inputProps={{ "aria-labelledby": `renderAs-label-${row.id}` }}
            >
              {RENDER_AS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <TextField
            label="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            size="small"
            multiline
            minRows={2}
            inputProps={{ "aria-label": "Question" }}
          />
          <TextField
            label="Instructions"
            placeholder="One rule per line"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            size="small"
            multiline
            minRows={2}
            inputProps={{ "aria-label": "Instructions" }}
          />
          {/* NO per-section scope field — the template is scope-independent. */}

          {/* Manual "make variable" (#12 — no auto-inference). */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
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
