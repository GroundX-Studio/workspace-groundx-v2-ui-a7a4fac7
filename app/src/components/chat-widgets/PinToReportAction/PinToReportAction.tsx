/**
 * PinToReportAction — chat-widget for the `📌 pin to report` affordance
 * (2026-05-29-smart-report-screen Phase 5).
 *
 * Carried on EVERY assistant turn. Clicking it pins the turn's LITERAL text
 * (#12 — no auto-variable inference) as a report section via the ChatStore
 * `pinToReport` action — the existing-or-new template UX (NO silent
 * auto-create). The action returns a `PinResolution`; the affordance surfaces
 * the existing-or-new prompt when the resolution asks for one.
 *
 * Mid-stream behavior (spec "disabled mid-stream; queues if clicked"): while the
 * assistant turn is still `streaming`, the button is announced DISABLED
 * (`aria-disabled` + dimmed) but stays clickable — a native `disabled` button
 * swallows the click, which would make the "queues if clicked" contract
 * impossible. A click during streaming is QUEUED and drains once `streaming`
 * flips to false (so a user who clicks early still gets the pin). This is the
 * SAME ChatStore action the `pin_to_report` LLM tool drives (the interim
 * AgentToolBus bridge).
 *
 * Widget-contract: chat-widget slot, REQUIRED `role: WidgetRole` + `scope:
 * WidgetScope` (`{ type: "none" }` — the affordance operates on the draft
 * template + the source turn, not a document set), sibling test + README, tools.
 */

import Box from "@mui/material/Box";
import { useCallback, useEffect, useRef, useState, type FC } from "react";

import type { WidgetRole, WidgetScope } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_PILL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import type { PinResolution } from "@/contexts/ChatStoreContext/resolvePinTarget";

export interface PinToReportActionProps {
  /** Widget-contract authorization role. Pin is available to all roles. */
  role: WidgetRole;
  /** Widget-contract scope — `{ type: "none" }`; operates on the draft template. */
  scope: WidgetScope;
  /** The assistant turn being pinned (recorded as `pinnedFromTurnId`). */
  turnId: string;
  /** The turn's literal text → the pinned section's `question` (#12). */
  turnText: string;
  /** True while the turn is still streaming — dims + `aria-disabled`s the button and queues clicks. */
  streaming?: boolean;
}

export const PinToReportAction: FC<PinToReportActionProps> = ({
  role,
  // scope is contract-required (`{ type: "none" }`); no render effect.
  scope: _scope,
  turnId,
  turnText,
  streaming = false,
}) => {
  const { pinToReport } = useChatStore();
  const [resolution, setResolution] = useState<PinResolution | null>(null);
  // A click that arrived mid-stream, waiting for streaming to end.
  const queuedRef = useRef(false);

  const doPin = useCallback(() => {
    const next = pinToReport({ turnId, text: turnText });
    setResolution(next);
  }, [pinToReport, turnId, turnText]);

  const handleClick = useCallback(() => {
    if (streaming) {
      // Queue: fire once streaming ends (the effect below drains it).
      queuedRef.current = true;
      return;
    }
    doPin();
  }, [streaming, doPin]);

  // Drain a queued click once the turn finishes streaming.
  useEffect(() => {
    if (!streaming && queuedRef.current) {
      queuedRef.current = false;
      doPin();
    }
  }, [streaming, doPin]);

  return (
    <Box
      data-testid="pin-to-report-action"
      data-widget="pin-to-report-action"
      data-role={role}
      sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, flexWrap: "wrap" }}
    >
      <Box
        component="button"
        type="button"
        data-testid="pin-to-report-button"
        aria-label="Pin this answer to a report"
        // Announced disabled mid-stream (dimmed + aria-disabled), but NOT the
        // native `disabled` attribute — a native-disabled button swallows the
        // click, so the mid-stream click could never be QUEUED. Keeping the
        // handler reachable is what makes "queues if clicked" true; the handler
        // itself queues (vs. pins) while `streaming`.
        aria-disabled={streaming || undefined}
        onClick={handleClick}
        sx={{
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          color: NAVY,
          borderRadius: BORDER_RADIUS_PILL,
          px: 1.5,
          py: 0.5,
          cursor: streaming ? "default" : "pointer",
          opacity: streaming ? 0.5 : 1,
          fontFamily: "inherit",
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
          "&:focus-visible": { outline: `2px solid ${NAVY}` },
        }}
      >
        📌 pin to report
      </Box>

      {/* Existing-or-new prompt (NO silent auto-create). The resolution decides
          which prompt to show; landing already happened into the draft. */}
      {resolution !== null ? (
        <Box
          data-testid={`pin-to-report-resolution-${resolution.mode}`}
          sx={{ color: resolution.mode === "single-existing" ? EYEBROW_ON_LIGHT : BODY_TEXT, fontSize: FONT_SIZE_LABEL }}
        >
          {resolution.mode === "prompt-new-only"
            ? "Pinned to a new report draft."
            : resolution.mode === "single-existing"
              ? "Pinned to your report."
              : "Pick a report — or start a new one."}
        </Box>
      ) : null}
    </Box>
  );
};

export default PinToReportAction;
