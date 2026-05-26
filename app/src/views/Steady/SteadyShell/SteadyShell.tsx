/**
 * SteadyShell — steady-mode entry point routed via `/c/:sessionId`.
 *
 * ARCH-07 (2026-05-26): refactored to mount the canonical `<AppShell />`
 * with mode="steady" widgets, proving the unification with onboarding —
 * one shell, different widget bundle. Closure test asserts the
 * `appshell-root` testid is present (i.e. the shell is the canonical
 * one, not a parallel custom layout).
 *
 * Today's steady-mode body is still mostly placeholder: SessionSwitcher
 * in the chat slot, "select a doc" in the canvas slot. Real widgets
 * (`ChatWithSources` for chat, steady-mode `PdfViewer` for canvas) are
 * future tickets — UI-05 lands the steady-mode chat + multi-session
 * drawer; the canvas-side viewer is the existing PdfViewer widget once
 * the steady-mode upload path exists.
 *
 * Per the chat session model (project_chat_session_model), the URL is
 * the source of truth for which session is active. The mount effect
 * reads `sessionId` from useParams and calls ChatStore.switchTo(id) so
 * deep-links + browser back/forward stay in sync with the active
 * session.
 */

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import { useEffect, type FC } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Heading } from "@/components/primitives/Heading/Heading";
import { Label } from "@/components/primitives/Label/Label";
import { OnboardingNav, useOnboardingNavCollapsed } from "@/components/layout/OnboardingNav/OnboardingNav";
import {
  BODY_TEXT,
  BORDER_RADIUS_CARD,
  EYEBROW_ON_LIGHT,
  NAVY,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { SessionSwitcher } from "@/views/Steady/SteadyShell/SessionSwitcher";

export const SteadyShell: FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { state, switchTo } = useChatStore();
  const [navCollapsed, setNavCollapsed] = useOnboardingNavCollapsed();
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionId) return;
    if (state.activeSessionId === sessionId) return;
    if (state.sessions.has(sessionId)) {
      switchTo(sessionId);
    }
    // If the URL references a session we don't have locally, the
    // BFF will need to fetch it. That fetch lands with the real
    // multi-session DB read path — until then, the chat-side hint
    // below surfaces an "unknown session" message.
  }, [sessionId, state.activeSessionId, state.sessions, switchTo]);

  const active = sessionId ? state.sessions.get(sessionId) : null;

  // Chat slot — for now a placeholder body with the SessionSwitcher
  // and the session-id text. Replace with `ChatWithSources` widget in
  // UI-05 (steady-mode chat surface). Keeps the existing test selectors
  // (`steady-shell-session-id`, `steady-shell-unknown-session`) so the
  // SteadyShell.test.tsx assertions don't need to know about the
  // AppShell internals.
  const chatPane = (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WARM_OFFWHITE,
        overflow: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      aria-label="Chat column"
    >
      <Label sx={{ color: EYEBROW_ON_LIGHT }}>STEADY · CHAT SESSION</Label>
      <Heading level="h4">{active?.title ?? "Untitled session"}</Heading>
      <BodyText>
        Session id:{" "}
        <Box
          component="span"
          data-testid="steady-shell-session-id"
          sx={{ fontFamily: "monospace", color: NAVY }}
        >
          {sessionId ?? "(missing)"}
        </Box>
        . The real steady-mode chat (ChatWithSources widget) is still
        being built — for now use the switcher below.
      </BodyText>
      <Box>
        <SessionSwitcher hideOnboardingSession={false} />
      </Box>
      {!active && sessionId && (
        <BodyText
          data-testid="steady-shell-unknown-session"
          sx={{ color: BODY_TEXT, fontStyle: "italic" }}
        >
          Session{" "}
          <Box
            component="span"
            sx={{ fontFamily: "monospace", color: NAVY, fontStyle: "normal" }}
          >
            {sessionId}
          </Box>{" "}
          is not in this browser&apos;s ChatStore. Once the BFF fetch
          path lands, the middleware will hydrate it from MySQL.
        </BodyText>
      )}
    </Box>
  );

  // Canvas slot — "select a document" placeholder until the steady-
  // mode PdfViewer wire-up lands. Mirrors the F1 picker's "ready for
  // input" affordance but at steady-mode altitude (the user is signed
  // in; the session is loaded; we're waiting on a doc selection or
  // upload).
  const canvasPane = (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WHITE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
      data-testid="steady-shell-canvas-placeholder"
      aria-label="Canvas"
    >
      <Card sx={{ p: 4, borderRadius: BORDER_RADIUS_CARD, maxWidth: 480, textAlign: "center" }}>
        <Heading level="h5" sx={{ color: NAVY, mb: 1 }}>
          Pick a document to view
        </Heading>
        <BodyText>
          The steady-mode document viewer + extraction surface lands in
          UI-05. For now the chat side stays interactive and the canvas
          waits for a doc selection.
        </BodyText>
      </Card>
    </Box>
  );

  return (
    <Box
      sx={{ position: "relative", height: "100vh", overflow: "hidden", backgroundColor: WHITE }}
      data-testid="steady-shell"
    >
      <AppShell
        nav={
          <OnboardingNav
            accountState="free"
            collapsed={navCollapsed}
            onToggleCollapsed={() => setNavCollapsed(!navCollapsed)}
            onLogoClick={() => navigate("/")}
          />
        }
        chat={chatPane}
        canvas={canvasPane}
        initialChatWidth={360}
        navWidth={navCollapsed ? ONBOARDING_NAV_WIDTH_COLLAPSED : ONBOARDING_NAV_WIDTH_FULL}
      />
    </Box>
  );
};
