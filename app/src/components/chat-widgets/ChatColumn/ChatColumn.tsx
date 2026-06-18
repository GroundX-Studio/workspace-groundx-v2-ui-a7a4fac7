/**
 * ChatColumn — the chat-column body across F1 ↔ F7 AND the steady shell.
 *
 * 2026-05-30-unified-conversation-flow Phase 2 — ChatColumn no longer forks a
 * SteadyConversationFlow / F2ConversationFlow. There is ONE chat view,
 * `<ConversationFlow>`, over the durable `useConversation` engine. ChatColumn's
 * only job is dispatch + experience selection:
 *
 *   1. Viewer overlays (sign-in / booking) keep <ConversationFlow> mounted.
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
import { selectActiveStep } from "@/contexts/ChatStoreContext";
import { VIEWER_STEP_TO_JOURNEY } from "@/components/layout/StepStrip/journeyCatalog";
import type { StepId } from "@/components/layout/StepStrip/types";

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
   * Booking is a viewer overlay, not a replacement chat mode. While the
   * calendar is open, keep the current conversation mounted even if the
   * underlying onboarding gate is open/committed.
   */
  bookingActive?: boolean;
  /**
   * Sign-in is a viewer overlay, not a replacement chat mode. While the
   * sign-in widget is open, keep the active conversation mounted.
   */
  signInActive?: boolean;
}

export const ChatColumn: FC<ChatColumnProps> = ({
  overrideScenarioId,
  bookingActive = false,
  signInActive = false,
}) => {
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

  // standardized-viewer-control — the chat's conversation-journey predicate is
  // sourced from the ACTIVE VIEWER STEP's journey stage (via the single-source
  // `VIEWER_STEP_TO_JOURNEY`). `null` stage = the journey hasn't started
  // (picker / pre-scenario).
  const activeStep = selectActiveStep(activeChatSession);
  const journeyStage: StepId | null = activeStep
    ? VIEWER_STEP_TO_JOURNEY[activeStep.kind]?.step ?? null
    : null;
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
  // report-default-template — config-driven (NOT a hardcoded `"utility"` gate):
  // the scenario's manifest carries the seeded default report template id; the
  // onboarding experience loads it onto the session's reportOverlay. Scenarios
  // without one (loan/solar) leave it undefined → empty-state default.
  const experienceReportTemplateId = scenario?.manifest.reportTemplateId;
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
      ...(experienceReportTemplateId ? { reportTemplateId: experienceReportTemplateId } : {}),
    });
  }, [scenarioId, scenario, thinkingScript, experienceFileName, experienceTitle, experienceReportTemplateId]);

  // A non-onboarding session is the steady chat — the bare ConversationFlow,
  // no experience, no placeholders.
  if (!isOnboardingSession) {
    return <ConversationFlow chatSessionId={activeSessionId} />;
  }

  // The picker: the active step is the ingest-picker (journey stage `ingest`),
  // OR there's no journey at all (no step, no scenario) — the pre-scenario idle
  // state. (Was `currentFrame === "f1"`.)
  const isF1 = journeyStage === "ingest" || (journeyStage == null && !scenario);

  // The onboarding journey gets the onboarding experience. The conversation
  // stays mounted across the whole journey so auto-advance doesn't wipe
  // liveTurns — persistence is structural now. standardized-viewer-control T6 —
  // this whitelist is now STEP-SOURCED: the Understand + Analyze journey stages
  // (Analyze covers Extract / Interact / Report — the `report` step is Analyze,
  // so the BUILDER keeps the working chat exactly like the render; omitting it
  // dropped the chat to a static placeholder — Regression: ChatColumn.test.tsx
  // "on F4a (report builder) …"). Under the book-call overlay (booking, not
  // sign-in) the onboarding experience also stays mounted for the journey-
  // adjacent stages (Integrate / Ingest / pre-step) so the conversation sliding
  // behind the calendar shows the journey, not the bare flow (was the f6/f7/f1
  // booking special case).
  const isInScenarioJourney =
    journeyStage === "understand" ||
    journeyStage === "analyze" ||
    (bookingActive &&
      !signInActive &&
      (journeyStage === "integrate" || journeyStage === "ingest" || journeyStage == null));

  if (isInScenarioJourney && scenario) {
    return <ConversationFlow chatSessionId={activeSessionId} experience={onboardingExperience} />;
  }

  if (bookingActive || signInActive) {
    return <ConversationFlow chatSessionId={activeSessionId} />;
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
