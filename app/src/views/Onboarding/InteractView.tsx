import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, type FC } from "react";

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
import { useWidgetRole } from "@/lib/widgetRole";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { litRegionsFromCitations } from "./litRegions";

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
 *     assistant turn in the shared chat thread — read straight off the
 *     ChatStore (`ChatMessage.citations`, which ChatColumn writes on
 *     append). No API poll: the in-memory store is the source.
 *   • Keeps the "Save 🔒" affordance (top-right) that opens the F6 gate
 *     — the only interactive control here.
 */
export const InteractView: FC = () => {
  const { state: appMode } = useAppMode();
  const widgetRole = useWidgetRole();
  const { state: session, advanceFrame, openGate } = useOnboardingSession();
  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const { byId } = useScenarioRegistry();
  const scenario = byId(scenarioId);
  const { state: chatState } = useChatStore();
  const chatSessionId = chatState.activeSessionId;
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;

  // Lit-region source — the citations on the latest assistant turn in the
  // shared chat session (the same session ChatColumn writes to via
  // `appendMessage`). Read straight off the in-memory ChatStore; no poll.
  const litCitations =
    [...(activeChatSession?.messages ?? [])]
      .reverse()
      .find((m) => m.role === "assistant" && (m.citations?.length ?? 0) > 0)?.citations ?? [];

  // The lit regions render each citation's REAL bbox (WF-03 X-Ray join).
  // If a box is too coarse for a clean highlight, the fix is word-level
  // geometry (WF-05 `-118-map`), tracked separately — NOT a hardcoded box.
  const litRegions = litRegionsFromCitations(litCitations);
  const highlightTargetPage = litCitations[0]?.page ?? undefined;
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
            scope={{ type: "documents", documentIds: [canvasDocumentId] }}
            role={widgetRole}
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
