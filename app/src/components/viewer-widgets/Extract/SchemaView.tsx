/**
 * F3a SchemaView — chat-driven schema editor body (Design surface).
 *
 * Per spec (`project_spec_frames.md`, `project_architecture.md`), F3a
 * is the **Design surface inside the extraction-workbench widget**,
 * not a top-level view. ExtractView owns the workbench shell —
 * topbar (`export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒`),
 * frame switching (Results / Design / Peek), and Save state. This
 * file owns ONLY the Design surface's body: the propose-card slot
 * above the field list + the categories with inline-edit rows.
 *
 * Per `project_interactions_animations_responsive.md` (F3a contract):
 *   - Click Edit on a field row → expands inline editor below; other
 *     rows stay collapsed.
 *   - Editor exposes: name, type dropdown, required toggle, extraction
 *     prompt textarea, identifier chips, instructions per line,
 *     preview chip, ↻ rerun, Save, Cancel + ✨ rewrite-with-AI link.
 *   - ProposalCard suggestions appear ABOVE the list with Accept /
 *     Dismiss (mirrors the chat propose-card).
 *
 * Frame routing (per spec — F3/F3a/F4 ALL go to ExtractView):
 *   F3   — Results surface (doc + fields side-by-side)
 *   F3a  — Design surface (this file)
 *   F4   — Citation-provenance peek (deferred)
 */

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useMemo, useState, type ChangeEvent, type FC } from "react";

import { useLiveExtract } from "@/hooks/useLiveExtract";
import {
  BODY_TEXT,
  BORDER,
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
import { useApi } from "@/contexts/ApiContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import type {
  SchemaFieldEdit,
  SchemaFieldExtractionResult,
  SchemaFieldProposal,
} from "@/contexts/ChatStoreContext/types";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import type {
  ExtractedFieldValue,
  ExtractionSchemaDef,
  SchemaCategoryDef,
  SchemaFieldDef,
} from "@/types/scenarios";

/**
 * Apply the per-session overlay onto the base (live) schema:
 *   1. Drop base fields whose id is in `removedFieldIds`.
 *   2. Merge `editedFields` patches onto remaining base fields.
 *   3. Append `addedFields` to the matching category.
 *   4. Orphan additions (categoryId not in the base schema) land in a
 *      synthetic "Custom" category.
 */
function applyOverlay(
  base: ExtractionSchemaDef,
  overlay: {
    addedFields: { categoryId: string; id: string; name: string; type: SchemaFieldDef["type"]; description: string }[];
    removedFieldIds: ReadonlySet<string>;
    editedFields: ReadonlyMap<string, SchemaFieldEdit>;
  },
): ExtractionSchemaDef {
  const known = new Set(base.categories.map((c) => c.id));
  const orphanAdditions = overlay.addedFields.filter((a) => !known.has(a.categoryId));
  const categories: SchemaCategoryDef[] = base.categories.map((cat) => {
    const baseFields = cat.fields
      .filter((f) => !overlay.removedFieldIds.has(f.id))
      .map<SchemaFieldDef>((f) => {
        const edit = overlay.editedFields.get(f.id);
        return edit ? { ...f, ...edit } : f;
      });
    const added = overlay.addedFields
      .filter((a) => a.categoryId === cat.id && !overlay.removedFieldIds.has(a.id))
      .map<SchemaFieldDef>((a) => {
        const edit = overlay.editedFields.get(a.id);
        const base: SchemaFieldDef = {
          id: a.id,
          name: a.name,
          type: a.type,
          description: a.description,
        };
        return edit ? { ...base, ...edit } : base;
      });
    return { ...cat, fields: [...baseFields, ...added] };
  });
  if (orphanAdditions.length > 0) {
    categories.push({
      id: "custom",
      type: "statement",
      name: "Custom",
      fields: orphanAdditions.map<SchemaFieldDef>((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
      })),
    });
  }
  return { ...base, categories };
}

const TYPE_COLOR: Record<SchemaFieldDef["type"], string> = {
  STRING: NAVY,
  NUMBER: GREEN,
  DATE: NAVY,
  BOOLEAN: MUTED_ON_LIGHT,
};

const FIELD_TYPES: SchemaFieldDef["type"][] = ["STRING", "NUMBER", "DATE", "BOOLEAN"];

export interface SchemaViewProps {
  /**
   * Live workflow schema from the Extract widget (the F3a workbench path).
   * When omitted, SchemaView self-resolves the live extract from the
   * scenario's primary document — there is NO manifest fallback.
   */
  schema?: ExtractionSchemaDef | null;
  /** Live extract values from the Extract widget. See {@link schema}. */
  values?: ExtractedFieldValue[];
}

export const SchemaView: FC<SchemaViewProps> = ({ schema: liveSchema, values: liveValues }) => {
  const api = useApi();
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();
  const {
    state: chatState,
    removeSchemaField,
    editSchemaField,
    resetSchemaFieldEdit,
    acceptFieldProposal,
    dismissFieldProposal,
    setSchemaFieldExtraction,
    appendAgentMessage,
  } = useChatStore();

  const scenarioId = appMode.scenario ?? session.scenario ?? null;
  const scenario = scenarioId ? byId(scenarioId) : null;
  // 2026-05-31-schemaview-live-only-extract — the live extract is the SOLE
  // source. The Extract widget passes the resolved live schema/values as props
  // (the F3a workbench path). When `<SchemaView />` is mounted WITHOUT live
  // props (standalone demo surfaces + the ProposeSchemaFieldCard round-trip),
  // it self-resolves the live extract from the SAME load path the Extract
  // widget uses, keyed by the scenario's primary document (tests inject a
  // real-shaped live extract at that seam — there is no MOCK_MODE runtime path).
  // There is NO manifest fallback: when the live extract is absent the widget
  // renders its real empty/"live extract unavailable" state below.
  const selfLive = useLiveExtract(scenario?.documents[0]?.documentId);
  // Schema/values travel together: the self-resolved values only apply when the
  // self-resolved schema is present (a live extract is a schema + its values).
  const baseSchema = liveSchema ?? selfLive.schema ?? null;
  const sampleValues =
    liveValues ?? (selfLive.schema ? selfLive.values : null) ?? [];

  const activeChatSession = chatState.activeSessionId
    ? chatState.sessions.get(chatState.activeSessionId)
    : null;
  const overlay = activeChatSession?.pendingSchemaOverlay ?? {
    addedFields: [],
    removedFieldIds: new Set<string>(),
    editedFields: new Map<string, SchemaFieldEdit>(),
    pendingFieldProposals: [] as SchemaFieldProposal[],
    pinnedSamples: [] as string[],
    focusedCategoryId: null as string | null,
  };
  const effectiveSchema = useMemo<ExtractionSchemaDef | null>(
    () => (baseSchema ? applyOverlay(baseSchema, overlay) : null),
    [baseSchema, overlay],
  );

  // F3a single-row-open invariant: only one field row may show its
  // inline editor at a time. Local state — switching rows discards
  // any unsaved form state in the previous row (matches the spec's
  // "Edit field … other rows stay collapsed" behavior).
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const openEditor = useCallback((fieldId: string) => setOpenFieldId(fieldId), []);
  const closeEditor = useCallback(() => setOpenFieldId(null), []);

  // Fire focused extraction against the just-added field id. Mirrors
  // the propose-card on Accept (Phase 2c) so canvas-side acceptance
  // doesn't skip the live value lookup.
  //
  // `schema-agent-chat-affordances`: when the field already had a
  // `done` extraction on record AND the new run differs in confidence,
  // narrate the result via `appendAgentMessage` so the chat scroll
  // shows `Re-ran on the sample: <value> [unit] · confidence <new> ↑ from <old>`.
  // The unit comes from `field.format` when supplied (e.g. `kW`).
  const fireExtraction = useCallback(
    async (
      fieldId: string,
      payload: { name: string; type: SchemaFieldDef["type"]; description: string; format?: string },
    ) => {
      const chatSessionId = chatState.activeSessionId;
      if (!chatSessionId) return;
      // Capture prior confidence BEFORE the pending wipe so we can
      // render the delta narration after the new result lands. We read
      // from the latest chatState snapshot (not the closure) — the
      // overlay's addedFields hold the per-field extraction record.
      const priorAddition = chatState.activeSessionId
        ? chatState.sessions
            .get(chatState.activeSessionId)
            ?.pendingSchemaOverlay.addedFields.find((f) => f.id === fieldId)
        : null;
      const priorConfidence =
        priorAddition?.extraction?.status === "done" ? priorAddition.extraction.confidence : undefined;
      setSchemaFieldExtraction(fieldId, { status: "pending" });
      try {
        const result = await api.extract.extractField({
          chatSessionId,
          field: { name: payload.name, type: payload.type, description: payload.description },
        });
        setSchemaFieldExtraction(fieldId, {
          status: "done",
          value: result.value,
          confidence: result.confidence,
          citation: result.citation ?? null,
        });
        // Narrate the rerun outcome when we have a prior baseline + a
        // confidence delta. New-field (first-run) accepts don't have a
        // baseline, so they fall through silently.
        if (
          priorConfidence != null &&
          result.confidence != null &&
          result.confidence !== priorConfidence
        ) {
          const unit = payload.format?.trim() ? ` ${payload.format.trim()}` : "";
          const newConfText = result.confidence.toFixed(2);
          const oldConfText = priorConfidence.toFixed(2);
          const valueText =
            typeof result.value === "number"
              ? result.value.toString()
              : result.value == null
                ? "—"
                : String(result.value);
          appendAgentMessage(
            `Re-ran on the sample: ${valueText}${unit} · confidence ${newConfText} ↑ from ${oldConfText}`,
          );
        }
      } catch {
        setSchemaFieldExtraction(fieldId, { status: "error" });
      }
    },
    [api.extract, chatState.activeSessionId, chatState.sessions, setSchemaFieldExtraction, appendAgentMessage],
  );

  if (!effectiveSchema) {
    // 2026-05-31-schemaview-live-only-extract — the live extract is the sole
    // source. With a scenario selected but no live schema resolved, this is the
    // real "live extract unavailable" state (no manifest fixture stands in);
    // with no scenario at all it's the pick-a-sample prompt.
    const liveUnavailable = scenario != null;
    return (
      <Box
        data-testid="schema-view-empty"
        data-extraction-status={liveUnavailable ? "unavailable" : "none"}
        sx={{ p: 4, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: WARM_OFFWHITE }}
      >
        <Card sx={{ p: 4, borderRadius: BORDER_RADIUS_CARD, maxWidth: 480, textAlign: "center" }}>
          <Typography variant="h5" sx={{ color: NAVY, mb: 1, fontWeight: FONT_WEIGHT_HEADLINE }}>
            {liveUnavailable ? "Live extract unavailable" : "No schema yet"}
          </Typography>
          <Typography variant="body2" sx={{ color: BODY_TEXT }}>
            {liveUnavailable
              ? "We couldn't load a live extraction for this sample. Re-run the extraction or pick another sample."
              : "Pick a sample with an extraction schema (Utility or Loan) to edit it here. Solar scenarios are Interact + Report only."}
          </Typography>
        </Card>
      </Box>
    );
  }

  const valuesById = new Map(sampleValues.map((v: ExtractedFieldValue) => [v.fieldId, v]));
  const extractionsById = new Map<string, SchemaFieldExtractionResult>();
  for (const added of overlay.addedFields) {
    if (added.extraction) extractionsById.set(added.id, added.extraction);
  }

  // Build the master id list (post-overlay) so the inline editor can
  // surface identifier chips for cross-field reference. Read-only.
  const allFieldIds = effectiveSchema.categories.flatMap((c) => c.fields.map((f) => f.id));

  // First pinned sample id labels the inline editor's preview chip
  // per `expand-inline-editor-fields`. Falls back to the scenario's
  // first document when the user hasn't pinned anything yet.
  const previewDocId = overlay.pinnedSamples[0] ?? scenario?.documents[0]?.documentId;

  return (
    <Box
      data-testid="schema-view"
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WARM_OFFWHITE,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, px: 3, pt: 2, pb: 3 }}>
        <Typography variant="body2" sx={{ color: BODY_TEXT, mb: 2 }}>
          Click Edit on any field to tune its extraction prompt — or ask the chat to add a new field.
        </Typography>
        {/* ProposalCard slot — surfaces above the list per spec
            (project_interactions_animations_responsive.md ·
            "ProposalCard suggestions appear above the list with
            Accept / Dismiss"). Empty unless the chat propose-card
            flow enqueued something via `enqueueFieldProposal`. */}
        {overlay.pendingFieldProposals.length > 0 && (
          <Stack spacing={1.25} sx={{ mb: 3 }} data-testid="schema-view-proposals">
            {overlay.pendingFieldProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onAccept={() => {
                  const newFieldId = acceptFieldProposal(proposal.id);
                  if (newFieldId) {
                    void fireExtraction(newFieldId, {
                      name: proposal.name,
                      type: proposal.type,
                      description: proposal.description,
                    });
                  }
                }}
                onDismiss={() => dismissFieldProposal(proposal.id)}
              />
            ))}
          </Stack>
        )}

        {/* `category-scoped-fields-view`: when the overlay carries a
            focusedCategoryId, render ONLY that category's fields as a
            flat list with a single header (`Existing fields · N accepted`
            + optional `● M unsaved` coral indicator). When no scope is
            set (defensive fallback — e.g. SchemaView mounted alone in
            tests), fall back to the per-category multi-section render. */}
        {(() => {
          const focusedId = overlay.focusedCategoryId;
          const focused = focusedId
            ? effectiveSchema.categories.find((c) => c.id === focusedId) ?? null
            : null;
          if (focused) {
            // Count overlay diff affecting THIS category (added or
            // edited fields whose category matches, or removed ids that
            // were originally in this category's base live schema). For tight
            // scope we use addedFields(this category) + editedFields(this
            // category) + base fields removed.
            const focusedBaseFieldIds = new Set(
              (baseSchema?.categories.find((c) => c.id === focusedId)?.fields ?? []).map((f) => f.id),
            );
            const addedInCategory = overlay.addedFields.filter((a) => a.categoryId === focusedId).length;
            const editedInCategory = [...overlay.editedFields.keys()].filter(
              (id) => focusedBaseFieldIds.has(id) || overlay.addedFields.some((a) => a.id === id && a.categoryId === focusedId),
            ).length;
            const removedInCategory = [...overlay.removedFieldIds].filter((id) =>
              focusedBaseFieldIds.has(id),
            ).length;
            const unsaved = addedInCategory + editedInCategory + removedInCategory;
            return (
              <Stack spacing={1.25}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="overline"
                    data-testid="schema-fields-header"
                    sx={{
                      color: MUTED_ON_LIGHT,
                      fontWeight: FONT_WEIGHT_HEADLINE,
                      fontSize: FONT_SIZE_LABEL,
                      letterSpacing: 1.2,
                    }}
                  >
                    Existing fields · {focused.fields.length} accepted
                  </Typography>
                  {unsaved > 0 && (
                    <Typography
                      variant="caption"
                      data-testid="schema-fields-unsaved"
                      sx={{ color: CORAL, fontWeight: FONT_WEIGHT_LABEL, fontSize: FONT_SIZE_LABEL }}
                    >
                      ● {unsaved} unsaved
                    </Typography>
                  )}
                </Box>
                <SchemaCategorySection
                  key={focused.id}
                  category={focused}
                  valuesById={valuesById}
                  extractionsById={extractionsById}
                  openFieldId={openFieldId}
                  onOpenEditor={openEditor}
                  onCloseEditor={closeEditor}
                  onRemoveField={removeSchemaField}
                  onSaveEdit={(fieldId, edit) => {
                    editSchemaField(fieldId, edit);
                    closeEditor();
                  }}
                  onResetEdit={resetSchemaFieldEdit}
                  onRerunExtraction={(field) =>
                    fireExtraction(field.id, {
                      name: field.name,
                      type: field.type,
                      description: field.description,
                      format: field.format,
                    })
                  }
                  allFieldIds={allFieldIds}
                  hasEdit={(fieldId) => overlay.editedFields.has(fieldId)}
                  hasAddition={(fieldId) => overlay.addedFields.some((a) => a.id === fieldId)}
                  hideCategoryHeader
                  previewDocId={previewDocId}
                />
              </Stack>
            );
          }
          return (
            <Stack spacing={3}>
              {effectiveSchema.categories.map((category) => (
                <SchemaCategorySection
                  key={category.id}
                  category={category}
                  valuesById={valuesById}
                  extractionsById={extractionsById}
                  openFieldId={openFieldId}
                  onOpenEditor={openEditor}
                  onCloseEditor={closeEditor}
                  onRemoveField={removeSchemaField}
                  onSaveEdit={(fieldId, edit) => {
                    editSchemaField(fieldId, edit);
                    closeEditor();
                  }}
                  onResetEdit={resetSchemaFieldEdit}
                  onRerunExtraction={(field) =>
                    fireExtraction(field.id, {
                      name: field.name,
                      type: field.type,
                      description: field.description,
                      format: field.format,
                    })
                  }
                  allFieldIds={allFieldIds}
                  hasEdit={(fieldId) => overlay.editedFields.has(fieldId)}
                  hasAddition={(fieldId) => overlay.addedFields.some((a) => a.id === fieldId)}
                  previewDocId={previewDocId}
                />
              ))}
            </Stack>
          );
        })()}
        {/* Reminder copy for the "Add field via chat" affordance. Spec
            calls for the chat to be the primary add path; this line
            nudges the user toward chat rather than a button. */}
        <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_CAPTION, mt: 1, display: "block" }}>
          To add a field, ask in the chat — &ldquo;add a field for total
          tax,&rdquo; for example. A proposal card will appear above
          the list.
        </Typography>
      </Box>
    </Box>
  );
};

// ── ProposalCard (above-the-list) ───────────────────────────────────────

const ProposalCard: FC<{
  proposal: SchemaFieldProposal;
  onAccept: () => void;
  onDismiss: () => void;
}> = ({ proposal, onAccept, onDismiss }) => (
  <Box
    data-testid={`schema-proposal-${proposal.id}`}
    data-widget="schema-proposal-card"
    sx={{
      p: 2,
      borderRadius: BORDER_RADIUS_2X,
      border: `1.5px dashed ${CORAL}`,
      backgroundColor: WHITE,
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Typography
        variant="overline"
        sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.6 }}
      >
        PROPOSED · {proposal.categoryId.toUpperCase()}
      </Typography>
      {/* proposal-envelope-provenance: matches the chat-side
          ProposeSchemaFieldCard. Gated on server Zod parse success. */}
      {proposal.provenance?.verified === true && (
        <Typography
          variant="caption"
          data-testid={`schema-proposal-provenance-${proposal.id}`}
          sx={{
            color: MUTED_ON_LIGHT,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            fontFamily: "monospace",
          }}
        >
          proposal_{proposal.provenance.version} · envelope verified
        </Typography>
      )}
    </Box>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
      <Typography variant="subtitle1" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE }}>
        {proposal.name}
      </Typography>
      <Box
        sx={{
          borderRadius: BORDER_RADIUS_SM,
          px: 0.75,
          py: 0.125,
          backgroundColor: CYAN,
          color: TYPE_COLOR[proposal.type],
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
          letterSpacing: 0.6,
        }}
      >
        {proposal.type}
      </Box>
    </Box>
    <Typography variant="body2" sx={{ color: BODY_TEXT, mt: 0.75 }}>
      {proposal.description}
    </Typography>
    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
      <Box
        component="button"
        type="button"
        data-testid={`schema-proposal-accept-${proposal.id}`}
        onClick={onAccept}
        sx={{
          border: `1px solid ${GREEN}`,
          backgroundColor: GREEN,
          color: WHITE,
          borderRadius: BORDER_RADIUS_PILL,
          px: 2,
          py: 0.5,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: FONT_SIZE_CAPTION,
          fontWeight: FONT_WEIGHT_HEADLINE,
        }}
      >
        Accept
      </Box>
      <Box
        component="button"
        type="button"
        data-testid={`schema-proposal-dismiss-${proposal.id}`}
        onClick={onDismiss}
        sx={{
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          color: BODY_TEXT,
          borderRadius: BORDER_RADIUS_PILL,
          px: 2,
          py: 0.5,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: FONT_SIZE_CAPTION,
          fontWeight: FONT_WEIGHT_LABEL,
          "&:hover": { color: NAVY, borderColor: NAVY },
        }}
      >
        Dismiss
      </Box>
    </Stack>
  </Box>
);

// ── Category section ────────────────────────────────────────────────────

interface SchemaCategorySectionProps {
  category: SchemaCategoryDef;
  valuesById: Map<string, ExtractedFieldValue>;
  extractionsById: Map<string, SchemaFieldExtractionResult>;
  openFieldId: string | null;
  onOpenEditor: (fieldId: string) => void;
  onCloseEditor: () => void;
  onRemoveField: (fieldId: string) => void;
  onSaveEdit: (fieldId: string, edit: SchemaFieldEdit) => void;
  onResetEdit: (fieldId: string) => void;
  onRerunExtraction: (field: SchemaFieldDef) => void;
  allFieldIds: string[];
  hasEdit: (fieldId: string) => boolean;
  hasAddition: (fieldId: string) => boolean;
  /**
   * `category-scoped-fields-view` — when true, hide the per-category
   * eyebrow header. The parent supplies a flat `Existing fields · N
   * accepted` header instead. Used on the focused-category branch.
   */
  hideCategoryHeader?: boolean;
  /** First pinned sample id — labels the editor's preview chip. */
  previewDocId?: string;
}

const SchemaCategorySection: FC<SchemaCategorySectionProps> = ({
  category,
  valuesById,
  extractionsById,
  openFieldId,
  onOpenEditor,
  onCloseEditor,
  onRemoveField,
  onSaveEdit,
  onResetEdit,
  onRerunExtraction,
  allFieldIds,
  hasEdit,
  hasAddition,
  hideCategoryHeader = false,
  previewDocId,
}) => (
  <Box data-testid={`schema-category-${category.id}`}>
    {!hideCategoryHeader && (
      <Typography
        variant="overline"
        sx={{
          color: NAVY,
          fontWeight: FONT_WEIGHT_HEADLINE,
          fontSize: FONT_SIZE_LABEL,
          letterSpacing: 1.2,
          display: "block",
          mb: 1,
        }}
      >
        {category.name}
      </Typography>
    )}
    <Stack spacing={1.25}>
      {category.fields.map((field) => (
        <SchemaFieldCard
          key={field.id}
          field={field}
          value={valuesById.get(field.id) ?? null}
          extraction={extractionsById.get(field.id) ?? null}
          isOpen={openFieldId === field.id}
          onOpen={() => onOpenEditor(field.id)}
          onClose={onCloseEditor}
          onRemove={() => onRemoveField(field.id)}
          onSaveEdit={(edit) => onSaveEdit(field.id, edit)}
          onResetEdit={() => onResetEdit(field.id)}
          onRerunExtraction={() => onRerunExtraction(field)}
          allFieldIds={allFieldIds}
          isEdited={hasEdit(field.id)}
          isAdded={hasAddition(field.id)}
          previewDocId={previewDocId}
        />
      ))}
    </Stack>
  </Box>
);

// ── Field card — collapsed header + inline editor ───────────────────────

interface SchemaFieldCardProps {
  field: SchemaFieldDef;
  value: ExtractedFieldValue | null;
  extraction: SchemaFieldExtractionResult | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRemove: () => void;
  onSaveEdit: (edit: SchemaFieldEdit) => void;
  onResetEdit: () => void;
  onRerunExtraction: () => void;
  allFieldIds: string[];
  isEdited: boolean;
  isAdded: boolean;
  /** First pinned sample id — labels the editor's preview chip. */
  previewDocId?: string;
}

const SchemaFieldCard: FC<SchemaFieldCardProps> = ({
  field,
  value,
  extraction,
  isOpen,
  onOpen,
  onClose,
  onRemove,
  onSaveEdit,
  onResetEdit,
  onRerunExtraction,
  allFieldIds,
  isEdited,
  isAdded,
  previewDocId,
}) => {
  const liveValue = extraction?.status === "done" ? extraction.value : null;
  const valueLabel = (() => {
    if (extraction?.status === "pending") return "EXTRACTING";
    if (extraction?.status === "error") return "FAILED";
    if (extraction?.status === "done") return "EXTRACTED";
    return "CURRENT";
  })();
  const renderedValue = (() => {
    if (extraction?.status === "pending") return "Extracting…";
    if (extraction?.status === "error") return "Couldn't extract";
    if (extraction?.status === "done") {
      if (liveValue === null) return "Not found in document";
      if (typeof liveValue === "number") return liveValue.toLocaleString();
      return String(liveValue);
    }
    if (value === null) return "—";
    if (typeof value.value === "number") return value.value.toLocaleString();
    if (value.value == null) return "—";
    return String(value.value);
  })();

  return (
    <Card
      data-testid={`schema-field-${field.id}`}
      data-edited={isEdited ? "true" : "false"}
      data-added={isAdded ? "true" : "false"}
      sx={{
        borderRadius: BORDER_RADIUS_CARD,
        border: `1px solid ${isEdited ? CORAL : BORDER}`,
        boxShadow: "none",
        p: 2,
        backgroundColor: WHITE,
      }}
    >
      {/* Header row — name + type badge + value chip + Edit / Remove. */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="subtitle1" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE }}>
              {field.name}
            </Typography>
            <Box
              data-testid={`schema-field-type-${field.id}`}
              sx={{
                borderRadius: BORDER_RADIUS_SM,
                px: 0.75,
                py: 0.125,
                backgroundColor: CYAN,
                color: TYPE_COLOR[field.type],
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                letterSpacing: 0.6,
              }}
            >
              {field.type}
            </Box>
            {field.required && (
              <Box
                data-testid={`schema-field-required-${field.id}`}
                sx={{
                  borderRadius: BORDER_RADIUS_SM,
                  px: 0.75,
                  py: 0.125,
                  backgroundColor: WARM_OFFWHITE,
                  border: `1px solid ${CORAL}`,
                  color: CORAL,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                  letterSpacing: 0.4,
                }}
              >
                REQUIRED
              </Box>
            )}
            {isEdited && (
              <Typography
                variant="caption"
                data-testid={`schema-field-edited-${field.id}`}
                sx={{ color: CORAL, fontWeight: FONT_WEIGHT_LABEL, fontSize: FONT_SIZE_LABEL }}
              >
                edited
              </Typography>
            )}
          </Box>
          <Typography variant="body2" sx={{ color: BODY_TEXT, mt: 0.25 }}>
            {field.description}
          </Typography>
          <Box
            sx={{
              mt: 1,
              borderRadius: BORDER_RADIUS_2X,
              backgroundColor: WARM_OFFWHITE,
              border: `1px solid ${BORDER}`,
              px: 1.25,
              py: 0.5,
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
            }}
            data-testid={`schema-field-value-${field.id}`}
          >
            <Typography
              variant="caption"
              data-testid={`schema-field-value-label-${field.id}`}
              sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4 }}
            >
              {valueLabel}
            </Typography>
            <Typography
              variant="body2"
              // 2026-05-31-schemaview-live-only-extract — default off the live
              // extraction STATE. A focused per-field re-run (`extraction`)
              // reports its own status; otherwise the value is the base live
              // extract ("live"), never the retired "manifest" literal.
              data-extraction-status={extraction?.status ?? "live"}
              sx={{
                color: NAVY,
                fontWeight: FONT_WEIGHT_LABEL,
                fontFamily: value === null && !extraction ? undefined : "monospace",
              }}
            >
              {renderedValue}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          <Box
            component="button"
            type="button"
            data-testid={`schema-edit-field-${field.id}`}
            onClick={isOpen ? onClose : onOpen}
            aria-label={isOpen ? `Close editor for ${field.name}` : `Edit ${field.name}`}
            sx={{
              border: `1px solid ${BORDER}`,
              backgroundColor: isOpen ? WARM_OFFWHITE : WHITE,
              color: NAVY,
              borderRadius: BORDER_RADIUS_PILL,
              px: 1.5,
              py: 0.5,
              cursor: "pointer",
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              fontFamily: "inherit",
              "&:hover": { borderColor: NAVY },
            }}
          >
            {isOpen ? "Close" : "Edit"}
          </Box>
          <Box
            component="button"
            type="button"
            data-testid={`schema-remove-field-${field.id}`}
            onClick={onRemove}
            aria-label={`Remove ${field.name}`}
            sx={{
              border: `1px solid ${BORDER}`,
              backgroundColor: WHITE,
              color: BODY_TEXT,
              borderRadius: BORDER_RADIUS_PILL,
              px: 1.5,
              py: 0.5,
              cursor: "pointer",
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              fontFamily: "inherit",
              "&:hover": { color: NAVY, borderColor: NAVY },
            }}
          >
            Remove
          </Box>
        </Stack>
      </Box>

      {/* Inline editor — expanded below the header when isOpen. */}
      {isOpen && (
        <FieldInlineEditor
          field={field}
          allFieldIds={allFieldIds}
          isEdited={isEdited}
          onCancel={onClose}
          onSave={onSaveEdit}
          onReset={onResetEdit}
          onRerunExtraction={onRerunExtraction}
          previewValue={renderedValue}
          previewLabel={valueLabel}
          extraction={extraction}
          previewDocId={previewDocId}
        />
      )}
    </Card>
  );
};

// ── Inline editor body ──────────────────────────────────────────────────

interface FieldInlineEditorProps {
  field: SchemaFieldDef;
  /**
   * Master id list — retained so future cross-field reference UI
   * (click-to-insert into the prompt) has the inventory. Currently
   * unused by the editor body since identifiers are now free-text
   * chips owned by `editedFields`.
   */
  allFieldIds: string[];
  isEdited: boolean;
  previewValue: string;
  previewLabel: string;
  /**
   * Live extraction result for this field (status + value + confidence
   * + previousConfidence). When `previousConfidence` is present, the
   * preview chip renders `preview on <sample> · <value> · conf <new> ↑ <old>`.
   */
  extraction: SchemaFieldExtractionResult | null;
  /**
   * Pinned sample doc id this preview is being computed against. Used
   * to label the preview chip per `expand-inline-editor-fields`.
   */
  previewDocId?: string;
  onSave: (edit: SchemaFieldEdit) => void;
  onCancel: () => void;
  onReset: () => void;
  onRerunExtraction: () => void;
}

const FieldInlineEditor: FC<FieldInlineEditorProps> = ({
  field,
  allFieldIds: _allFieldIds,
  isEdited,
  previewValue,
  previewLabel,
  extraction,
  previewDocId,
  onSave,
  onCancel,
  onReset,
  onRerunExtraction,
}) => {
  // Local form state — discarded on Cancel; persisted on Save. Initial
  // value is the effective field (already live ∪ overlay-edit).
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<SchemaFieldDef["type"]>(field.type);
  const [required, setRequired] = useState(field.required ?? false);
  const [prompt, setPrompt] = useState(field.description);
  const [instructions, setInstructions] = useState((field.instructions ?? []).join("\n"));
  // `expand-inline-editor-fields`: new editable surfaces.
  const [format, setFormat] = useState(field.format ?? "");
  const [identifiers, setIdentifiers] = useState<string[]>(field.identifiers ?? []);
  const [identifierDraft, setIdentifierDraft] = useState<string | null>(null);
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
      borderColor: CYAN,
      outline: `2px solid ${CYAN}55`,
      outlineOffset: 1,
    },
  } as const;

  const handleSave = useCallback(() => {
    const edit: SchemaFieldEdit = {
      name,
      type,
      required,
      description: prompt,
      instructions: instructions
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      format: format.trim(),
      identifiers,
    };
    onSave(edit);
  }, [name, type, required, prompt, instructions, format, identifiers, onSave]);

  const commitIdentifierDraft = useCallback(() => {
    if (identifierDraft == null) return;
    const trimmed = identifierDraft.trim();
    if (trimmed.length > 0) {
      setIdentifiers((prev) => [...prev, trimmed]);
    }
    setIdentifierDraft(null);
  }, [identifierDraft]);

  const removeIdentifierAt = useCallback((idx: number) => {
    setIdentifiers((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <Box
      data-testid={`schema-field-editor-${field.id}`}
      sx={{
        mt: 2,
        pt: 2,
        borderTop: `1px dashed ${BORDER}`,
        display: "flex",
        flexDirection: "column",
        gap: 1.75,
        // `expand-inline-editor-fields`: 3px coral inset stripe on the
        // editor card's left edge to mark the "design surface" state.
        boxShadow: `inset 3px 0 0 ${CORAL}`,
        pl: 1.5,
      }}
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          data-testid={`schema-field-editor-name-${field.id}`}
          id={`schema-field-editor-name-input-${field.id}`}
          name={`schemaFieldName-${field.id}`}
          label="Name"
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ flex: 1 }}
          inputProps={{ "aria-label": "Field name" }}
        />
        <Select
          data-testid={`schema-field-editor-type-${field.id}`}
          id={`schema-field-editor-type-input-${field.id}`}
          size="small"
          value={type}
          onChange={(e) => setType(e.target.value as SchemaFieldDef["type"])}
          sx={{ minWidth: 130 }}
          inputProps={{
            id: `schema-field-editor-type-native-${field.id}`,
            name: `schemaFieldType-${field.id}`,
            "aria-label": "Field type",
          }}
        >
          {FIELD_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
        {/* `expand-inline-editor-fields`: free-text format hint —
            e.g. `float · kW`, `ISO 8601`, `XX-XXXXXXX`. Optional. */}
        <TextField
          data-testid={`schema-field-editor-format-${field.id}`}
          id={`schema-field-editor-format-input-${field.id}`}
          name={`schemaFieldFormat-${field.id}`}
          label="Format (opt)"
          size="small"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          sx={{ flex: 1 }}
          inputProps={{ "aria-label": "Field format" }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Switch
            data-testid={`schema-field-editor-required-${field.id}`}
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            inputProps={{
              id: `schema-field-editor-required-input-${field.id}`,
              name: `schemaFieldRequired-${field.id}`,
              "aria-label": "Required",
            }}
            size="small"
          />
          <Typography variant="caption" sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_LABEL }}>
            Required
          </Typography>
        </Box>
      </Stack>

      {/* Extraction prompt textarea + ✨ rewrite-with-agent link. */}
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4 }}>
            EXTRACTION PROMPT
          </Typography>
          <Box
            component="button"
            type="button"
            data-testid={`schema-field-editor-rewrite-${field.id}`}
            onClick={() => {
              // Phase 2-followup: actually call an LLM to rewrite the
              // prompt. For now, append a stub suffix so the wiring is
              // visible end-to-end.
              setPrompt((current) =>
                current.includes("(rewritten)") ? current : `${current} (rewritten)`,
              );
            }}
            sx={{
              border: "none",
              background: "none",
              color: NAVY,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              padding: 0,
              "&:hover": { textDecoration: "underline" },
            }}
          >
            ✨ rewrite with agent
          </Box>
        </Box>
        <Box data-testid={`schema-field-editor-prompt-${field.id}`}>
          <Box
            component="textarea"
            id={`schema-field-editor-prompt-input-${field.id}`}
            name={`schemaFieldPrompt-${field.id}`}
            rows={2}
            value={prompt}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
            aria-label="Extraction prompt"
            sx={textareaSx}
          />
        </Box>
      </Box>

      {/* `expand-inline-editor-fields`: editable identifiers — short
          aliases or labels found near the field in the source doc.
          Free-text chip array with a `+ add` affordance. */}
      <Box>
        <Typography variant="caption" sx={{ display: "block", color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4, mb: 0.5 }}>
          IDENTIFIERS
        </Typography>
        <Box
          data-testid={`schema-field-editor-identifiers-${field.id}`}
          sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}
        >
          {identifiers.map((label, idx) => (
            <Box
              key={`${label}-${idx}`}
              data-testid={`schema-field-editor-identifier-chip-${field.id}-${idx}`}
              sx={{
                borderRadius: BORDER_RADIUS_PILL,
                border: `1px solid ${BORDER}`,
                px: 1,
                py: 0.125,
                backgroundColor: WHITE,
                color: BODY_TEXT,
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                fontFamily: "monospace",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <span>{label}</span>
              <Box
                component="button"
                type="button"
                data-testid={`schema-field-editor-identifier-remove-${field.id}-${idx}`}
                aria-label={`Remove identifier ${label}`}
                onClick={() => removeIdentifierAt(idx)}
                sx={{
                  border: "none",
                  background: "none",
                  color: MUTED_ON_LIGHT,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: FONT_SIZE_LABEL,
                  lineHeight: 1,
                  "&:hover": { color: NAVY },
                }}
              >
                ×
              </Box>
            </Box>
          ))}
          {identifierDraft != null ? (
            <TextField
              size="small"
              autoFocus
              value={identifierDraft}
              onChange={(e) => setIdentifierDraft(e.target.value)}
              onBlur={commitIdentifierDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitIdentifierDraft();
                } else if (e.key === "Escape") {
                  setIdentifierDraft(null);
                }
              }}
              // `data-testid` lives on inputProps so the test can target
              // the `<input>` directly with `as HTMLInputElement` +
              // `user.type(...)`.
              inputProps={{
                id: `schema-field-editor-identifier-input-${field.id}`,
                name: `schemaFieldIdentifier-${field.id}`,
                "aria-label": "New identifier",
                "data-testid": `schema-field-editor-identifier-input-${field.id}`,
              }}
              sx={{ minWidth: 120, "& .MuiInputBase-input": { py: 0.25, fontFamily: "monospace", fontSize: FONT_SIZE_LABEL } }}
            />
          ) : (
            <Box
              component="button"
              type="button"
              data-testid={`schema-field-editor-identifier-add-${field.id}`}
              onClick={() => setIdentifierDraft("")}
              sx={{
                border: `1px dashed ${BORDER}`,
                background: "none",
                color: NAVY,
                cursor: "pointer",
                borderRadius: BORDER_RADIUS_PILL,
                px: 1,
                py: 0.125,
                fontFamily: "inherit",
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                "&:hover": { borderColor: NAVY },
              }}
            >
              + add
            </Box>
          )}
        </Box>
      </Box>

      {/* Instructions per line. */}
      <Box>
        <Typography variant="caption" sx={{ display: "block", color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4, mb: 0.5 }}>
          INSTRUCTIONS (one per line)
        </Typography>
        <Box data-testid={`schema-field-editor-instructions-${field.id}`}>
          <Box
            component="textarea"
            id={`schema-field-editor-instructions-input-${field.id}`}
            name={`schemaFieldInstructions-${field.id}`}
            rows={3}
            value={instructions}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInstructions(e.target.value)}
            aria-label="Per-line instructions"
            sx={textareaSx}
          />
        </Box>
      </Box>

      {/* Preview chip + rerun. When previousConfidence is set on the
          extraction (i.e. this field has been re-run), render the
          `expand-inline-editor-fields` form:
          `preview on <sample> · <value> · conf <new> ↑ <old>`. Otherwise
          fall back to the legacy `<LABEL> PREVIEW · <value>` shape. */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            borderRadius: BORDER_RADIUS_2X,
            backgroundColor: WARM_OFFWHITE,
            border: `1px solid ${BORDER}`,
            px: 1.25,
            py: 0.5,
          }}
          data-testid={`schema-field-editor-preview-${field.id}`}
        >
          {extraction?.status === "done" && extraction.previousConfidence != null && extraction.confidence != null ? (
            <>
              <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4 }}>
                preview on {previewDocId ?? "sample"}
              </Typography>
              <Typography variant="body2" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL, fontFamily: "monospace" }}>
                · {previewValue} · conf {extraction.confidence.toFixed(2)} ↑ {extraction.previousConfidence.toFixed(2)}
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontSize: FONT_SIZE_LABEL, letterSpacing: 0.4 }}>
                {previewLabel} PREVIEW
              </Typography>
              <Typography variant="body2" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL, fontFamily: "monospace" }}>
                {previewValue}
              </Typography>
            </>
          )}
        </Box>
        <Box
          component="button"
          type="button"
          data-testid={`schema-field-editor-rerun-${field.id}`}
          onClick={onRerunExtraction}
          sx={{
            border: `1px solid ${BORDER}`,
            backgroundColor: WHITE,
            color: NAVY,
            borderRadius: BORDER_RADIUS_PILL,
            px: 1.5,
            py: 0.5,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
          }}
        >
          ↻ Rerun
        </Box>
      </Box>

      {/* Footer — Save / Cancel / (Reset if edited). */}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        {isEdited && (
          <Box
            component="button"
            type="button"
            data-testid={`schema-field-editor-reset-${field.id}`}
            onClick={onReset}
            sx={{
              border: "none",
              background: "none",
              color: BODY_TEXT,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              padding: "6px 12px",
              "&:hover": { color: NAVY, textDecoration: "underline" },
            }}
          >
            Revert
          </Box>
        )}
        <Box
          component="button"
          type="button"
          data-testid={`schema-field-editor-cancel-${field.id}`}
          onClick={onCancel}
          sx={{
            border: `1px solid ${BORDER}`,
            backgroundColor: WHITE,
            color: BODY_TEXT,
            borderRadius: BORDER_RADIUS_PILL,
            px: 2,
            py: 0.5,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_LABEL,
            "&:hover": { color: NAVY, borderColor: NAVY },
          }}
        >
          Cancel
        </Box>
        <Box
          component="button"
          type="button"
          data-testid={`schema-field-editor-save-${field.id}`}
          onClick={handleSave}
          sx={{
            border: `1px solid ${GREEN}`,
            backgroundColor: GREEN,
            color: WHITE,
            borderRadius: BORDER_RADIUS_PILL,
            px: 2,
            py: 0.5,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_HEADLINE,
          }}
        >
          save field
        </Box>
      </Stack>
    </Box>
  );
};
