/**
 * ProposeSchemaFieldCard — chat-widget for UI-01 Phase 2a.
 *
 * When the grounded LLM emits a `proposedSchemaField` in its fenced
 * JSON block (because the user asked to add a schema field), the chat
 * column renders this card inline with the assistant turn. The user
 * confirms or dismisses; Accept dispatches the ChatStore
 * `addSchemaField` action which lands the field in
 * `pendingSchemaOverlay.addedFields` on the active session. SchemaView
 * picks the addition up automatically via its `applyOverlay` merge.
 *
 * Widget-contract requirements (per ARCH epic / project_widget_contract.md):
 *   - Slot: `chat-widgets/` (declared via data-widget attribute)
 *   - `mode: "onboarding" | "steady"` prop
 *   - Sibling test + README
 *
 * Phase 2c will wire per-field extraction on Accept (re-run a focused
 * extraction so the user sees a real value, not a placeholder).
 * Phase 2d will wire Save Template (POST /api/extraction-schemas).
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useState, type FC } from "react";

import type { ProposedSchemaField } from "@/api/chatSessions";
import { ExtractFieldApiError, extractField } from "@/api/extractField";
import { captureException } from "@/lib/sentry";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";

export type ProposeSchemaFieldCardMode = "onboarding" | "steady";

export interface ProposeSchemaFieldCardProps {
  /**
   * The well-formed `proposedSchemaField` extracted from the grounded
   * LLM's JSON block. Already validated server-side — by the time it
   * reaches this component, all four fields are present and the type
   * is one of STRING/NUMBER/DATE/BOOLEAN.
   */
  proposedField: ProposedSchemaField;
  /**
   * Widget-contract mode flag. The card's behavior is identical in
   * both modes today (both surfaces dispatch `addSchemaField`); the
   * prop exists for contract conformance + future locking of e.g. the
   * Reject control in steady mode.
   */
  mode?: ProposeSchemaFieldCardMode;
}

/** Generate a stable-enough field id for the overlay. */
function mintFieldId(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  // Snake-case the name as a courtesy; the LLM should already be
  // emitting snake_case but we don't want a user-visible field id like
  // "Total Tax" if the model slipped.
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `field_${slug}_${suffix}`;
}

export const ProposeSchemaFieldCard: FC<ProposeSchemaFieldCardProps> = ({
  proposedField,
  mode = "onboarding",
}) => {
  const { state: chatState, addSchemaField, setSchemaFieldExtraction } = useChatStore();
  // Local UI state: "pending" → user hasn't decided; "accepted" /
  // "rejected" → controls collapse to a confirmation/dismissal surface
  // so the user can't double-fire and the chat scroll still shows the
  // outcome of the turn.
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");

  const handleAccept = useCallback(() => {
    const fieldId = mintFieldId(proposedField.name);
    addSchemaField({
      id: fieldId,
      categoryId: proposedField.categoryId,
      name: proposedField.name,
      type: proposedField.type,
      description: proposedField.description,
    });
    setStatus("accepted");

    // UI-01 Phase 2c — kick off the focused extraction so the new
    // field card shows a real value (or "couldn't extract") instead
    // of the manifest placeholder. Fire-and-forget — the optimistic
    // overlay addition is the authoritative state for the SchemaView.
    // The extraction result lands as a status flip + value on the
    // same addition record.
    const chatSessionId = chatState.activeSessionId;
    if (!chatSessionId) return;
    setSchemaFieldExtraction(fieldId, { status: "pending", value: null });
    (async () => {
      try {
        const result = await extractField({
          chatSessionId,
          field: {
            name: proposedField.name,
            type: proposedField.type,
            description: proposedField.description,
          },
        });
        setSchemaFieldExtraction(fieldId, {
          status: "done",
          value: result.value,
          confidence: result.confidence,
          citation: result.citation ?? null,
        });
      } catch (err) {
        if (!(err instanceof ExtractFieldApiError)) {
          captureException(err, { route: "/api/extract-field" });
        }
        setSchemaFieldExtraction(fieldId, { status: "error", value: null });
      }
    })();
  }, [addSchemaField, chatState.activeSessionId, proposedField, setSchemaFieldExtraction]);

  const handleReject = useCallback(() => {
    setStatus("rejected");
  }, []);

  return (
    <Box
      data-testid="propose-schema-field-card"
      data-widget="propose-schema-field-card"
      data-mode={mode}
      aria-label="Add field proposal"
      sx={{
        p: 2,
        borderRadius: BORDER_RADIUS_2X,
        border: `1.5px solid ${status === "accepted" ? GREEN : BORDER}`,
        backgroundColor: WHITE,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
            fontSize: FONT_SIZE_LABEL,
          }}
        >
          {status === "accepted" ? "FIELD ADDED" : status === "rejected" ? "DISMISSED" : "ADD FIELD"}
        </Typography>
        {/* proposal-envelope-provenance: only render when the server's
            Zod envelope parse succeeded (verified === true). */}
        {proposedField.provenance?.verified === true && (
          <Typography
            variant="caption"
            data-testid="propose-schema-field-provenance"
            sx={{
              color: MUTED_ON_LIGHT,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              fontFamily: "monospace",
            }}
          >
            proposal_{proposedField.provenance.version} · envelope verified
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
        <Typography
          variant="subtitle1"
          data-testid="propose-schema-field-name"
          sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE }}
        >
          {proposedField.name}
        </Typography>
        <Box
          data-testid="propose-schema-field-type"
          sx={{
            borderRadius: BORDER_RADIUS_SM,
            px: 0.75,
            py: 0.125,
            backgroundColor: CYAN,
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: 0.6,
          }}
        >
          {proposedField.type}
        </Box>
      </Box>

      <Typography
        variant="body2"
        data-testid="propose-schema-field-description"
        sx={{ color: BODY_TEXT, mt: 0.75 }}
      >
        {proposedField.description}
      </Typography>

      {status === "pending" && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Box
            component="button"
            type="button"
            data-testid="propose-schema-field-accept"
            onClick={handleAccept}
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
            data-testid="propose-schema-field-reject"
            onClick={handleReject}
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
            Reject
          </Box>
        </Stack>
      )}

      {status === "accepted" && (
        <Typography
          variant="caption"
          data-testid="propose-schema-field-accepted"
          sx={{ display: "block", color: GREEN, mt: 1, fontWeight: FONT_WEIGHT_LABEL }}
        >
          Added to the schema overlay. Save the template to keep it.
        </Typography>
      )}

      {status === "rejected" && (
        <Typography
          variant="caption"
          data-testid="propose-schema-field-rejected"
          sx={{ display: "block", color: MUTED_ON_LIGHT, mt: 1, fontWeight: FONT_WEIGHT_LABEL }}
        >
          Dismissed. Ask again any time to revisit.
        </Typography>
      )}
    </Box>
  );
};
