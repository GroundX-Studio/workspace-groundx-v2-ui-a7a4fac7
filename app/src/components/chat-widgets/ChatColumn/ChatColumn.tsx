/**
 * ChatColumn — the chat-column body across F1 ↔ F7 AND the steady shell.
 *
 * 2026-05-30-unified-conversation-flow Phase 2 — ChatColumn no longer forks a
 * SteadyConversationFlow / F2ConversationFlow. There is ONE chat view,
 * `<ConversationFlow>`, over the durable `useConversation` engine. ChatColumn's
 * only job is dispatch + experience selection:
 *
 *   1. Gate active (open / committed) → render <GateChatPanel /> (unchanged).
 *   2. F1 / BYO-no-scenario → idle / sign-in placeholders (unchanged).
 *   3. In the onboarding journey (F2–F5 with a scenario) → mount
 *      <ConversationFlow> WITH the onboarding `ChatExperience` looked up from
 *      `chatExperienceRegistry` and constructed with the scenario config.
 *   4. Anywhere else (the steady shell) → mount <ConversationFlow> with NO
 *      experience (the bare chat).
 *
 * There is NO `mode`/`surface` prop and no steady/onboarding branching — the
 * presence/shape of the experience is the only thing that varies. Per the
 * no-duplicates rule (memory `feedback_no_onboarding_duplicates.md`), chat is
 * literally one production flow; onboarding is an injected experience.
 */

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, type FC } from "react";

import type { WidgetRole, WidgetScope } from "@groundx/shared";
import { chatExperienceRegistry } from "@/conversation/chatExperienceRegistry";
import { ConversationFlow } from "@/conversation/ConversationFlow";

import {
  BODY_TEXT,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistryOptional } from "@/contexts/ScenarioRegistryContext";

import { GateChatPanel } from "@/components/chat-widgets/GateChatPanel/GateChatPanel";

export interface ChatColumnProps {
  /**
   * 2026-05-30-widget-role-access — widget AUTHORIZATION role.
   * `anonymous` (uncommitted / pre-sign-up) · `member` (signed in).
   * ChatColumn is available to ALL roles and locks NO affordance by
   * role today (see `docs/agents/widget-access-matrix.md` §1 + §2);
   * the prop is required to satisfy the widget contract and is
   * forwarded to children as roles get teeth. NEVER derive the
   * conversation flow from `role`.
   */
  role: WidgetRole;
  /**
   * 2026-05-30-widget-role-access — required widget scope. Chat is
   * session-scoped, not document-scoped, so ChatColumn always declares
   * `{ type: "none" }` (matrix §1b). It is not a ScopedViewerWidget.
   */
  scope: WidgetScope;
  /**
   * Override the scenario id read from session/appMode context. Used by
   * the OnboardingShell during the F2->F1 slide-out so the panes can
   * show the conversation that is sliding away, not the new F1 idle
   * state that has already taken over the session.
   */
  overrideScenarioId?: string | null;
  /**
   * Override the current frame. Same use case as overrideScenarioId.
   */
  overrideFrame?: "f1" | "f2" | "f3" | "f3a" | "f4" | "f5" | "f6" | "f7";
}

export const ChatColumn: FC<ChatColumnProps> = ({ overrideScenarioId, overrideFrame }) => {
  const { state: appMode } = useAppMode();
  const scenarioRegistry = useScenarioRegistryOptional();
  const { state: chatState } = useChatStore();
  // OnboardingSession is a global provider, so it's present under both shells.
  // It's read optionally only to stay decoupled — the steady-vs-onboarding
  // signal is the ACTIVE CHAT SESSION's `isOnboardingSession` flag (read from
  // the source of truth, NOT a flow mode prop), exactly as `useConversation`
  // reads `isOnboarding` from the session.
  const onboarding = useOnboardingSessionOptional();
  const session = onboarding?.state;

  const activeSessionId = chatState.activeSessionId;
  const activeChatSession = activeSessionId ? chatState.sessions.get(activeSessionId) : null;
  // Default to onboarding (the initial session is onboarding-flagged) so a
  // not-yet-hydrated session renders the onboarding chrome, not the bare chat.
  const isOnboardingSession = activeChatSession?.isOnboardingSession ?? true;

  const currentFrame = overrideFrame ?? session?.currentFrame;
  const scenarioId =
    overrideScenarioId !== undefined
      ? overrideScenarioId
      : appMode.scenario ?? session?.scenario ?? null;
  const scenario = scenarioId ? scenarioRegistry?.byId(scenarioId) : undefined;

  // Memoize the onboarding ChatExperience on its config inputs so its `Intro`
  // and `Choreography` components keep a STABLE identity across ChatColumn
  // re-renders. `makeOnboardingExperience` mints fresh `Intro`/`Choreography`
  // FCs on every call; constructing it inline handed <ConversationFlow> a new
  // `experience` (new component identities) every render, so React unmounted +
  // remounted the Choreography, resetting its `firstSendFiredRef` and
  // re-firing `advanceFrame("f5")` on any re-render during the journey — making
  // the frame un-holdable after the first send. The registry entry, scenario
  // object, and its derived fields are all stable references, so this memo is
  // recomputed only when the scenario actually changes. (Regression:
  // ChatColumn.test.tsx "stable-experience-identity …".) Computed
  // unconditionally (before the early returns below) to respect Rules of Hooks;
  // only consumed on the scenario-journey branch.
  const thinkingScript = scenario?.manifest.thinkingScript;
  const experienceFileName = scenario?.documents[0]?.fileName ?? "sample.pdf";
  const experienceTitle = scenario?.manifest.hero?.title ?? scenarioId ?? "Sample";
  const onboardingExperience = useMemo(() => {
    if (!scenarioId || !scenario) return undefined;
    return chatExperienceRegistry.byId("onboarding")?.create({
      scenarioId,
      thinkingScript: thinkingScript ?? [],
      // Scenario file/title → the experience's grounding scopeHint (the
      // functional input the deleted onboarding fork threaded into
      // useConversation). Derived here exactly as that fork did.
      fileName: experienceFileName,
      scenarioTitle: experienceTitle,
    });
  }, [scenarioId, scenario, thinkingScript, experienceFileName, experienceTitle]);

  // A non-onboarding session is the steady chat — the bare ConversationFlow,
  // no experience, no placeholders.
  if (!isOnboardingSession) {
    return <ConversationFlow chatSessionId={activeSessionId} />;
  }

  // Gate takes over the chat column when active — preserves the existing F6
  // typing-indicator + GateView flow.
  const gateActive =
    session?.gate.status === "open" || session?.gate.status === "committed";
  // The gate is the anonymous, pre-sign-up moment — session-scoped, not
  // document-scoped. Pass the gate's own role/scope (anonymous /
  // { type: "none" }), NOT ChatColumn's role, preserving the byte-for-byte
  // behavior of GateChatPanel's prior hardcoded GateChatRail mount.
  if (gateActive) return <GateChatPanel role="anonymous" scope={{ type: "none" }} />;

  const isF1 = currentFrame === "f1";

  // The onboarding journey (F2–F5 with a scenario) gets the onboarding
  // experience. The conversation stays mounted across the whole journey so
  // auto-advance doesn't wipe liveTurns — persistence is structural now.
  const isInScenarioJourney =
    currentFrame === "f2" ||
    currentFrame === "f3" ||
    currentFrame === "f3a" ||
    currentFrame === "f4" ||
    currentFrame === "f5";

  if (isInScenarioJourney && scenario) {
    return <ConversationFlow chatSessionId={activeSessionId} experience={onboardingExperience} />;
  }

  if (isF1) return <IdleChatPlaceholder />;
  if (!scenario) return <ByoChatPlaceholder />;
  return <IdleChatPlaceholder />;
};

// ── Idle / BYO placeholders ───────────────────────────────────────────────

const IdleChatPlaceholder: FC = () => (
  <Stack spacing={1}>
    <Typography
      variant="overline"
      sx={{
        color: NAVY,
        letterSpacing: LETTER_SPACING_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      CHAT
    </Typography>
    <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
      Ask anything about the sample. Citations appear next to every answer.
    </Typography>
  </Stack>
);

const ByoChatPlaceholder: FC = () => (
  <Stack spacing={1}>
    <Typography
      variant="overline"
      sx={{
        color: EYEBROW_ON_LIGHT,
        letterSpacing: LETTER_SPACING_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      UNDERSTAND
    </Typography>
    <Typography variant="h5" sx={{ color: NAVY }}>
      Sign in to start uploading your own docs.
    </Typography>
    <Typography variant="body2" sx={{ color: BODY_TEXT, mt: 1 }}>
      Once you sign in, this chat streams the same parse + extract experience
      over your documents.
    </Typography>
  </Stack>
);
