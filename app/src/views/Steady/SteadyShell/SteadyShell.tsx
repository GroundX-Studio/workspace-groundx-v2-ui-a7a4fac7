/**
 * SteadyShell — steady-mode entry point routed via `/c/:sessionId`.
 *
 * ARCH-07 (2026-05-26): refactored to mount the canonical `<AppShell />`
 * with mode="steady" widgets, proving the unification with onboarding —
 * one shell, different widget bundle.
 *
 * UI-05 (2026-05-27): chat slot mounts the production chat widget
 * (`<ChatColumn … />` — same widget that powers F2-F5 onboarding) instead
 * of the SessionSwitcher placeholder. Per the no-duplicates rule, onboarding
 * + steady share the same widget. 2026-05-30-unified-conversation-flow: there
 * is ONE chat view; the steady shell's active chat session is non-onboarding
 * (`isOnboardingSession:false`), so ChatColumn mounts the bare ConversationFlow
 * (no experience → no scripted intro / Pick-a-view pills / sample-switcher) —
 * no `surface`/`mode` prop. Persistence + hydration come for free via RT-01..05.
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
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
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
import { useWidgetRole } from "@/lib/widgetRole";

export const SteadyShell: FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { state, switchTo } = useChatStore();
  const [navCollapsed, setNavCollapsed] = useOnboardingNavCollapsed();
  const navigate = useNavigate();
  const widgetRole = useWidgetRole();

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
        {/* 2026-05-30-unified-conversation-flow: ONE ChatColumn → one
            ConversationFlow. The steady shell's active chat session is
            non-onboarding (`isOnboardingSession:false`), so ChatColumn mounts
            the bare conversation (no experience) — no `surface`/`mode` prop.
            `role` is the auth-derived `WidgetRole` (usually `member`, but an
            anonymous session can reach the steady shell — never hardcode);
            chat is session-scoped (`{ type: "none" }`). */}
        <ChatColumn role={widgetRole} scope={{ type: "none" }} />
      </Box>
    </Box>
  );

  // Canvas slot — read the active session's viewer step and surface
  // the matching widget. clickable-citations Phase 5: when the active
  // step is `doc-viewer` (pushed by a citation click via
  // `gotoDocViewer`), mount `PdfViewerWidget` with the cited
  // documentId + targetPage + highlightBbox. Without an active
  // doc-viewer step (steady mode starts empty), fall back to the
  // "pick a document" placeholder.
  const activeStep =
    active && active.viewer.currentStep.stepIndex >= 0
      ? active.viewer.history[active.viewer.currentStep.stepIndex]
      : null;
  const canvasPane =
    activeStep && activeStep.kind === "doc-viewer" ? (
      <Box
        sx={{ height: "100%", width: "100%", backgroundColor: WHITE }}
        data-testid="steady-shell-canvas-doc-viewer"
        aria-label="Canvas"
      >
        <PdfViewerWidget
          scope={{ type: "documents", documentIds: [activeStep.documentId] }}
          role={widgetRole}
          targetPage={activeStep.highlight?.page ?? activeStep.page ?? null}
          highlightBbox={activeStep.highlight?.bbox ?? null}
          highlightTier={activeStep.highlight?.tier}
        />
      </Box>
    ) : (
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
            Click a citation chip in the chat, or open a document from
            your session, to surface it here.
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
