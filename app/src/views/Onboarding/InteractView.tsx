import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useState, type FC } from "react";

import { listChatMessages } from "@/api/chatSessions";
import {
  BORDER,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import type { Citation } from "@groundx/shared";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { litRegionsFromCitations, type LitRegion } from "./litRegions";

// TODO(WF-05): TEMP demo hard-code — remove once word-level geometry lands.
// The utility sample is extract-workflow-indexed, so its search citations are
// BARE (no bbox), and we don't yet join X-Ray word boxes to light the exact
// answer span. Until then, the "what is the total amount due" answer lights a
// hand-placed box over the Remittance "Amount Due $7,613.20" line on page 1.
// Color = cyan to match the citation chip in the chat answer.
// NOTE: these are wrapper-relative coords. The page image overflows its
// clipping wrapper (page taller than the pane shows only the top portion),
// so the vertical value bakes in the clip ratio for the current pane aspect
// rather than being a clean page-normalized fraction. This is one reason the
// proper fix (WF-05) positions highlights against the image, not the wrapper.
const UTILITY_AMOUNT_DUE_REGION: LitRegion = {
  page: 1,
  x: 0.548,
  y: 0.218,
  w: 0.4,
  h: 0.046,
  color: "cyan",
};

/**
 * F5 InteractView — the CANVAS (viewer-slot) half of Interact.
 *
 * P3.b (2026-05-29): per the wireframe `Flow_Answer` + the
 * `no-onboarding-duplicates` rule, the canvas is the SOURCE DOCUMENT
 * viewer — NOT a chat. The conversation lives in the shell's
 * `ChatColumn` (the single chat surface). This view used to render its
 * own duplicate chat (turns + input + Save), which is the "weird chat
 * input at the bottom" the owner flagged; that is removed.
 *
 * What it does now:
 *   • Mounts the production `PdfViewerWidget` for the active sample doc.
 *   • Lights citation regions on the page that trail the latest
 *     assistant turn in the shared chat thread (read via
 *     `listChatMessages`, re-read when the session updates).
 *   • Keeps the "Save 🔒" affordance (top-right) that opens the F6 gate
 *     — the only interactive control here.
 */
export const InteractView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame, openGate } = useOnboardingSession();
  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const { byId } = useScenarioRegistry();
  const scenario = byId(scenarioId);
  const { state: chatState } = useChatStore();
  const chatSessionId = chatState.activeSessionId;
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  // Re-read the thread when the shared chat session changes so the lit
  // regions trail the latest answer. We key on BOTH updatedAt AND the
  // in-memory message count — appending a turn always bumps the count, so
  // this fires even if updatedAt doesn't change for a same-tick append
  // (which left the highlight stale until a remount).
  const sessionUpdatedAt = activeChatSession?.updatedAt;
  const messageCount = activeChatSession?.messages.length ?? 0;

  // Lit-region source — the citations on the latest assistant turn in the
  // shared chat thread (the same thread ChatColumn writes to). Read-only;
  // sending happens in ChatColumn, not here.
  const [litCitations, setLitCitations] = useState<Citation[]>([]);

  useEffect(() => {
    if (!chatSessionId) return;
    let cancelled = false;
    const readOnce = async () => {
      try {
        const messages = await listChatMessages(chatSessionId);
        if (cancelled) return;
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.citations.length > 0);
        setLitCitations(
          lastAssistant
            ? lastAssistant.citations.map((c) => ({
                documentId: c.documentId,
                page: c.page,
                snippet: c.snippet,
                bbox: c.bbox,
                tier: c.tier,
              }))
            : [],
        );
      } catch {
        // best-effort — no citations to light is a valid state
      }
    };
    void readOnce();
    // ChatColumn persists turns to the server without bumping this
    // ChatStore session's in-memory state, so neither updatedAt nor the
    // message count changes here when an answer arrives. Poll the thread
    // while mounted so the lit regions trail the latest answer live (not
    // only after a remount). Cheap; the thread is small.
    const poll = setInterval(() => void readOnce(), 1500);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [chatSessionId, sessionUpdatedAt, messageCount]);

  // TODO(WF-05): TEMP demo override. The utility "amount due" citation DOES
  // carry a bbox from the WF-03 X-Ray join, but it's coarse and lands on the
  // wrong chunk (the payment-stub barcode, not the "Amount Due" line). Until
  // word-level geometry (WF-05) tightens it, force the hand-placed amount-due
  // box (cyan, to match the citation chip) whenever the utility answer cites
  // the "Amount Due" line on page 1. Keyed on the citation snippet so other
  // answers still use their real geometry.
  const isUtilityAmountDue =
    scenarioId === "utility" &&
    litCitations.some((c) => c.page === 1 && /amount\s*due/i.test(c.snippet ?? ""));
  const litRegions = isUtilityAmountDue
    ? [UTILITY_AMOUNT_DUE_REGION]
    : litRegionsFromCitations(litCitations);
  const highlightTargetPage = isUtilityAmountDue ? 1 : (litCitations[0]?.page ?? undefined);
  const canvasDocumentId = scenario?.documents?.[0]?.documentId ?? null;

  const handleSave = useCallback(() => {
    advanceFrame("f6");
    openGate("save");
  }, [advanceFrame, openGate]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        gap: 1.5,
        p: { xs: 2, md: 3 },
      }}
      aria-label="Interact"
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ gap: 1 }}>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          ANALYZE · INTERACT
        </Typography>
        {/* The lone interactive control — opens the F6 sign-in gate.
            (Chat lives in the left ChatColumn; this canvas is doc-only.) */}
        <Box
          role="button"
          tabIndex={0}
          data-testid="advance-to-f6"
          onClick={handleSave}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSave();
            }
          }}
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: BORDER_RADIUS_PILL,
            color: NAVY,
            border: `1px solid ${NAVY}`,
            cursor: "pointer",
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_LABEL,
            whiteSpace: "nowrap",
            "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
          }}
        >
          💾 Save 🔒
        </Box>
      </Stack>

      {canvasDocumentId ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            border: `1px solid ${BORDER}`,
            borderRadius: BORDER_RADIUS_SM,
            backgroundColor: WHITE,
          }}
        >
          <PdfViewerWidget
            documentId={canvasDocumentId}
            mode="onboarding"
            litRegions={litRegions}
            targetPage={highlightTargetPage}
          />
        </Box>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}
    </Box>
  );
};
