/**
 * SteadyShell — steady-mode entry point routed via `/c/:sessionId`.
 *
 * ARCH-07 (2026-05-26): refactored to mount the canonical `<AppShell />`
 * with mode="steady" widgets, proving the unification with onboarding —
 * one shell, different widget bundle.
 *
 * UI-05 (2026-05-27): chat slot now mounts the production chat widget
 * (`<ChatColumn mode="steady" />` — same widget that powers F2-F5
 * onboarding) instead of the SessionSwitcher placeholder. Per
 * the no-duplicates rule, onboarding + steady share the same widget;
 * the `mode` prop locks the onboarding-only decorations (scripted
 * intro, Pick-a-view pills, sample-switcher). Persistence + hydration
 * come for free via RT-01..05. Canvas slot still placeholder until
 * the steady-mode PdfViewer wire-up exists (separate ticket).
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
import { OnboardingNav, useOnboardingNavCollapsed } from "@/components/layout/OnboardingNav/OnboardingNav";
import {
  BODY_TEXT,
  BORDER_RADIUS_CARD,
  FONT_SIZE_LABEL,
  NAVY,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";
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
    // RT-05 hydrator (fires on auth-resolved) will populate it from
    // the server-side list; UI-06 (separate ticket) wires a targeted
    // fetch when the URL session id is missing entirely.
  }, [sessionId, state.activeSessionId, state.sessions, switchTo]);

  const active = sessionId ? state.sessions.get(sessionId) : null;

  // Chat slot — UI-05 production chat widget. Same widget that powers
  // F2-F5 onboarding, gated on `mode="steady"` so the scripted intro +
  // sample-switcher + Pick-a-view pills don't render. RT-01..05 give
  // us persistence + hydration for free.
  //
  // The data-testids that the existing SteadyShell.test.tsx still
  // depends on (`steady-shell-session-id`, `steady-shell-unknown-session`)
  // are preserved via a small header strip above the chat widget — the
  // session id + the "this session isn't in localStorage yet" hint
  // remain user-visible without re-introducing the placeholder body.
  const chatPane = (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WARM_OFFWHITE,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      aria-label="Chat column"
    >
      <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Heading level="h5" sx={{ color: NAVY, m: 0 }}>
          {active?.title ?? "Untitled session"}
        </Heading>
        <BodyText sx={{ fontSize: FONT_SIZE_LABEL, color: BODY_TEXT }}>
          <Box
            component="span"
            data-testid="steady-shell-session-id"
            sx={{ fontFamily: "monospace", color: NAVY }}
          >
            {sessionId ?? "(missing)"}
          </Box>
        </BodyText>
        {!active && sessionId && (
          <BodyText
            data-testid="steady-shell-unknown-session"
            sx={{ fontSize: FONT_SIZE_LABEL, color: BODY_TEXT, fontStyle: "italic" }}
          >
            Session not yet hydrated — RT-05 will populate it on auth-resolved.
          </BodyText>
        )}
        {/* SessionSwitcher kept available here so the user can pivot
            between sessions without leaving the steady shell. UI-07
            will add a cmd-K shortcut on top of this. */}
        <SessionSwitcher hideOnboardingSession={false} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, px: 2, pb: 2 }}>
        <ChatColumn mode="steady" />
      </Box>
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
