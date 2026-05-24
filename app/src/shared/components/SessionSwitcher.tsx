/**
 * SessionSwitcher — steady-mode UI for switching between active chat
 * sessions and starting a new one.
 *
 * Lists every non-archived session from ChatStore, highlights the
 * active session, and lets the user click to switch via switchTo().
 * A "New session" button at the bottom calls newSession() and
 * switches to the freshly created session.
 *
 * Doesn't render in onboarding mode by default — the onboarding
 * session is special-cased (single isOnboardingSession=true session)
 * and the user shouldn't navigate away from it during the F-series
 * flow. Steady-mode shells mount this when the user has at least
 * one non-onboarding session.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, type FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_SM,
  CYAN,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";

export interface SessionSwitcherProps {
  /**
   * When `true` (default), the onboarding session is hidden from the
   * list — steady-mode users shouldn't see it. When `false`, the
   * onboarding session is included (useful for tests / debug).
   */
  hideOnboardingSession?: boolean;
  /** Override the "New session" button label. */
  newSessionLabel?: string;
  /** Called after a new session is created + activated. */
  onCreated?: (sessionId: string) => void;
}

export const SessionSwitcher: FC<SessionSwitcherProps> = ({
  hideOnboardingSession = true,
  newSessionLabel = "New session",
  onCreated,
}) => {
  const { state, newSession, switchTo } = useChatStore();

  const visibleSessions = useMemo(() => {
    return [...state.sessions.values()]
      .filter((s) => !hideOnboardingSession || !s.isOnboardingSession)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.sessions, hideOnboardingSession]);

  const handleNew = () => {
    const id = newSession({ title: "Untitled" });
    onCreated?.(id);
  };

  return (
    <Box data-testid="session-switcher" aria-label="Sessions" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography
        variant="overline"
        sx={{
          color: MUTED_ON_LIGHT,
          fontWeight: FONT_WEIGHT_LABEL,
          letterSpacing: LETTER_SPACING_LABEL,
          fontSize: 10,
          px: 0.5,
        }}
      >
        SESSIONS
      </Typography>
      <Stack spacing={0.25}>
        {visibleSessions.length === 0 ? (
          <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, px: 0.75 }}>
            No sessions yet.
          </Typography>
        ) : (
          visibleSessions.map((session) => {
            const isActive = state.activeSessionId === session.id;
            return (
              <Box
                key={session.id}
                role="button"
                tabIndex={0}
                data-testid={`session-switcher-item-${session.id}`}
                data-active={isActive ? "true" : undefined}
                aria-pressed={isActive}
                onClick={() => switchTo(session.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    switchTo(session.id);
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  padding: "6px 8px",
                  fontSize: 12,
                  fontWeight: isActive ? FONT_WEIGHT_HEADLINE : FONT_WEIGHT_LABEL,
                  backgroundColor: isActive ? CYAN : "transparent",
                  border: isActive ? `1px solid ${BORDER}` : "1px solid transparent",
                  borderRadius: BORDER_RADIUS_SM,
                  color: isActive ? NAVY : BODY_TEXT,
                  cursor: "pointer",
                  "&:hover": { backgroundColor: CYAN },
                }}
              >
                <Box sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.title || "Untitled"}
                </Box>
              </Box>
            );
          })
        )}
      </Stack>
      <Box
        role="button"
        tabIndex={0}
        data-testid="session-switcher-new"
        onClick={handleNew}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleNew();
          }
        }}
        sx={{
          mt: 0.5,
          padding: "6px 8px",
          fontSize: 12,
          fontWeight: FONT_WEIGHT_HEADLINE,
          backgroundColor: WHITE,
          border: `1.5px solid ${GREEN}`,
          borderRadius: BORDER_RADIUS_SM,
          color: NAVY,
          cursor: "pointer",
          textAlign: "center",
          "&:hover": { backgroundColor: CYAN },
        }}
      >
        + {newSessionLabel}
      </Box>
    </Box>
  );
};
