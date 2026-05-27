import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useState, type FC, type FormEvent } from "react";

import { chatErrorToUserCopy, sendChatMessage } from "@/api/chatSessions";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import type { ScenarioCitation, SampleChatTurn } from "@/types/scenarios";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";

/**
 * F5 InteractView — grounded chat with citation chips.
 *
 * Placeholder rendering; the real Phase 2/7 wire-up mounts the
 * `chat-with-sources` widget configured for the scenario's ContentScope.
 * Here we replay the fixture chat script and respond to free-form input
 * with a canned "demo only" assistant turn.
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

  const initialTurns: SampleChatTurn[] = scenario?.manifest.sampleChatScript ?? [];
  const [turns, setTurns] = useState<SampleChatTurn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Re-seed when the active scenario changes (e.g. user backs out to F1
  // and picks a different sample). Without this, the initial useState
  // captures the first scenario's chat forever.
  useEffect(() => {
    setTurns(scenario?.manifest.sampleChatScript ?? []);
  }, [scenario]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || sending) return;

      // Optimistic user-turn render so the chat stays responsive even
      // before the network reply lands.
      const userId = `u-${Date.now()}`;
      setTurns((current) => [...current, { id: userId, role: "user", content: trimmed }]);
      setDraft("");

      if (!chatSessionId) {
        // No active chat session — should never happen inside onboarding
        // (EntityRegistryProvider auto-seeds one), but fall back to a
        // polite message rather than throwing.
        setTurns((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "No active chat session — please refresh and try again.",
          },
        ]);
        return;
      }

      setSending(true);
      try {
        const result = await sendChatMessage({
          chatSessionId,
          newUserMessage: trimmed,
          sessionMeta: {
            title: activeChatSession?.title ?? "Onboarding",
            isOnboarding: activeChatSession?.isOnboardingSession ?? true,
            onboardingSessionId: chatSessionId,
            activeEntityKey: activeChatSession?.activeEntityKey ?? null,
          },
          // Same scope hint F2's ChatColumn passes — names the active
          // doc + scenario in the grounded LLM prompt so the model
          // knows what to talk about even when GroundX search returns
          // zero snippets for an off-topic query.
          scopeHint: scenario
            ? {
                fileName: scenario.documents[0]?.fileName ?? null,
                scenarioTitle: scenario.manifest.hero?.title ?? scenarioId,
              }
            : undefined,
        });
        const replyCitations: ScenarioCitation[] | undefined = result.reply.citations.length
          ? result.reply.citations.map((c) => ({ documentId: c.documentId, page: c.page, snippet: c.snippet }))
          : undefined;
        setTurns((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply.answer,
            citations: replyCitations,
          },
        ]);
      } catch (err) {
        // CF-08: branch the user-facing copy on the upstream status.
        const mapped = chatErrorToUserCopy(err);
        setTurns((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: mapped.message,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [draft, sending, chatSessionId, activeChatSession],
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 1,
        p: { xs: 2, md: 3 },
        height: "100%",
        overflow: "hidden",
      }}
      aria-label="Interact"
    >
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          ANALYZE · INTERACT
        </Typography>
        <Typography variant="h5">Ask anything about the sample</Typography>
        <Typography variant="caption" sx={{ color: BODY_TEXT }}>
          Every answer cites the page it came from.
        </Typography>
      </Stack>

      <Box sx={{ overflow: "auto", pr: 1 }} aria-live="polite">
        <Stack spacing={1.5}>
          {turns.map((turn) => (
            <Box
              key={turn.id}
              data-testid={`chat-turn-${turn.role}`}
              sx={{
                alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                px: 1.5,
                py: 1,
                borderRadius: BORDER_RADIUS_2X,
                backgroundColor: turn.role === "user" ? NAVY : WHITE,
                color: turn.role === "user" ? WHITE : NAVY,
                border: turn.role === "assistant" ? `1px solid ${BORDER}` : "none",
              }}
            >
              <Typography variant="body2">{turn.content}</Typography>
              {turn.citations?.length ? (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  {turn.citations.map((c, idx) => (
                    <CiteChip key={`${turn.id}-${idx}`} citation={c} index={idx + 1} />
                  ))}
                </Stack>
              ) : null}
            </Box>
          ))}
        </Stack>
      </Box>

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          backgroundColor: WHITE,
          border: `1px solid ${BORDER}`,
          borderRadius: BORDER_RADIUS_PILL,
          px: 2,
          py: 1,
        }}
      >
        <InputBase
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about the sample…"
          sx={{ flex: 1, color: NAVY }}
          inputProps={{ "aria-label": "Chat input" }}
          data-testid="chat-input"
        />
        <IconButton type="submit" aria-label="Send" sx={{ backgroundColor: CYAN, color: NAVY, "&:hover": { backgroundColor: GREEN } }}>
          <SendOutlinedIcon />
        </IconButton>
        <Box
          role="button"
          tabIndex={0}
          data-testid="advance-to-f6"
          onClick={() => {
            advanceFrame("f6");
            openGate("save");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              advanceFrame("f6");
              openGate("save");
            }
          }}
          sx={{
            ml: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: BORDER_RADIUS_PILL,
            color: NAVY,
            border: `1px solid ${NAVY}`,
            cursor: "pointer",
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_LABEL,
            "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
          }}
        >
          💾 Save
        </Box>
      </Box>
    </Box>
  );
};
