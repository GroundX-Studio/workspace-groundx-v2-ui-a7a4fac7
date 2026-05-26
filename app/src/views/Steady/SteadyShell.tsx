/**
 * SteadyShell — steady-mode entry point routed via `/c/:sessionId`.
 *
 * This is the URL scheme for an authenticated user's chat session
 * (per project_chat_session_model — steady mode adds the c-<id>
 * segment after the onboarding flow completes).
 *
 * The real steady-mode UI (multi-session drawer + canvas + chat) is
 * still to be built. Today this shell does two things:
 *
 *   1. Reads `sessionId` from useParams + calls ChatStore.switchTo(id)
 *      on mount, so the chat session referenced by the URL becomes
 *      active.
 *   2. Renders a placeholder body showing which session is active.
 *      Once the real steady-mode UI lands, swap that placeholder for
 *      the actual nav + chat + canvas surface.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, type FC } from "react";
import { useParams } from "react-router-dom";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  NAVY,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { OnboardingNav, useOnboardingNavCollapsed } from "@/shared/components/OnboardingNav";
import { SessionSwitcher } from "@/shared/components/SessionSwitcher";

export const SteadyShell: FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { state, switchTo } = useChatStore();
  const [navCollapsed, setNavCollapsed] = useOnboardingNavCollapsed();

  useEffect(() => {
    if (!sessionId) return;
    if (state.activeSessionId === sessionId) return;
    if (state.sessions.has(sessionId)) {
      switchTo(sessionId);
    }
    // If the URL references a session we don't have locally, the
    // BFF will need to fetch it. That fetch lands with the real
    // multi-session DB read path — until then, the placeholder body
    // below surfaces an "unknown session" hint.
  }, [sessionId, state.activeSessionId, state.sessions, switchTo]);

  const active = sessionId ? state.sessions.get(sessionId) : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
      data-testid="steady-shell"
    >
      <OnboardingNav
        accountState="free"
        collapsed={navCollapsed}
        onToggleCollapsed={() => setNavCollapsed(!navCollapsed)}
      />
      <Box sx={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto", p: { xs: 2, md: 4 } }}>
        <Stack spacing={2} sx={{ maxWidth: 720, mx: "auto" }}>
          <Typography
            variant="overline"
            sx={{
              color: EYEBROW_ON_LIGHT,
              letterSpacing: LETTER_SPACING_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
            }}
          >
            STEADY · CHAT SESSION
          </Typography>
          <Typography variant="h4">{active?.title ?? "Untitled session"}</Typography>
          <Typography variant="body2" sx={{ color: BODY_TEXT }}>
            Session id:{" "}
            {/* POL-02: MUI Typography (mono-flavored) instead of bare
                inline <code>. Picks up design tokens (font, color)
                and gives a11y a real semantic anchor. */}
            <Typography
              component="span"
              variant="body2"
              data-testid="steady-shell-session-id"
              sx={{ fontFamily: "monospace", color: NAVY }}
            >
              {sessionId ?? "(missing)"}
            </Typography>
            . The real steady-mode UI (multi-session drawer, canvas, chat) is still being built.
            Use the SessionSwitcher below to navigate; the URL stays in sync.
          </Typography>
          <Box
            sx={{
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_2X,
              backgroundColor: WHITE,
              p: 2,
              maxWidth: 320,
            }}
          >
            <SessionSwitcher hideOnboardingSession={false} />
          </Box>
          {!active && sessionId && (
            <Typography variant="caption" sx={{ color: BODY_TEXT, fontStyle: "italic" }} data-testid="steady-shell-unknown-session">
              Session{" "}
              <Typography
                component="span"
                variant="caption"
                sx={{ fontFamily: "monospace", color: NAVY, fontStyle: "normal" }}
              >
                {sessionId}
              </Typography>{" "}
              is not in this browser&apos;s ChatStore. Once the BFF fetch path lands, the
              middleware will hydrate it from MySQL.
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
};
