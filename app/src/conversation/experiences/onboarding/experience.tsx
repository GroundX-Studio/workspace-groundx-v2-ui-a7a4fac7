/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the ONBOARDING reference
 * `ChatExperience`.
 *
 * `makeOnboardingExperience({ scenarioId, thinkingScript })` is a factory
 * closing over its typed config. It yields:
 *   - `Intro` — the scripted onboarding header (clickable filename + sample
 *     switcher + F3a schema-agent chrome + earlier-turns summary), the seed
 *     bubbles (scenario name + "Reading <file> now."), the scripted
 *     `ThinkingStream`, and the Pick-a-view pills (`derivePickViews`).
 *     Exactly the old `F2ConversationFlow` header content, lifted out.
 *   - `Choreography` — a render-null director that DISPATCHES the destination
 *     intent through the CanvasOrchestrator (standardized-viewer-control T6/T9):
 *     `showExtract` when the ThinkingStream completes (in `Intro`'s `onDone`),
 *     `showInteract` on the first user send. The canvas moves only via the
 *     orchestrator seam; the onboarding journey + analytics layer on top inside
 *     the orchestrator's handlers (no direct `advanceFrame` for the canvas).
 *
 * NB: the SCRIPTED intro turns (user bubble + bot lead) are rendered inline by
 * `Intro` (not via the engine's `seedTurns`) so the existing wireframe testids
 * (`onboarding-chat-user-bubble` / `onboarding-chat-bot-lead`) stay verbatim
 * and the ThinkingStream sits between them. `seedTurns` is left unused here.
 */
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import type { ContentScope } from "@groundx/shared";

import type { ChatExperienceEntry } from "@/conversation/chatExperienceRegistry";

import { useLiveExtractionSchema } from "@/hooks/useLiveExtractionSchema";
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";
import type { ChatExperience, ChatExperienceComponentProps } from "@/conversation/ChatExperience";
import { BotBubble, PickViewPill, UserBubble } from "@/conversation/chatPrimitives";
import { selectActiveStep, useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

import {
  BORDER,
  BORDER_RADIUS_SM,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
} from "@/constants";

export interface OnboardingExperienceConfig {
  scenarioId: string;
  thinkingScript: string[];
  /**
   * The scenario's primary document file name + hero title, resolved at the
   * mount site (where the scenario is in hand). They become the experience's
   * grounding `scopeHint` so the grounded LLM can answer/redirect off-topic
   * queries even when GroundX returns 0 snippets. Optional so the factory and
   * its config schema stay back-compatible; absent → no scopeHint (matches the
   * bare-chat fallback). Mirrors the deleted onboarding fork's
   * `scopeHint: { fileName, scenarioTitle: scenarioName }`.
   */
  fileName?: string;
  scenarioTitle?: string;
  /**
   * report-default-template — the seeded default report template id for this
   * scenario (`scenario.manifest.reportTemplateId`). When present, the
   * experience loads it onto the active session's `reportOverlay.templateId` so
   * the Report render surface fills the real sample invoice. Absent → the
   * empty-state default (loan/solar). Config-driven; NO scenario is hardcoded.
   */
  reportTemplateId?: string;
}

interface PickViewOption {
  key: string;
  label: string;
}

/**
 * Derive the Pick-a-view pill set from the scenario's extraction schema. Each
 * category becomes one pill. The LIVE workflow schema is the source of truth;
 * the manifest is the fallback. Schemaless scenarios (Solar) get a single
 * "Show me chat" pill that jumps to F5.
 */
export function derivePickViews(
  scenario: NonNullable<ReturnType<ReturnType<typeof useScenarioRegistry>["byId"]>>,
  liveSchema?: import("@/types/scenarios").ExtractionSchemaDef | null,
): PickViewOption[] {
  const schema = liveSchema ?? scenario.manifest.extractionSchema;
  if (!schema) return [{ key: "interact", label: "Show me chat" }];
  return schema.categories.map((c) => ({ key: c.id, label: c.name }));
}

/**
 * The onboarding `Intro` — scripted header + seed bubbles + ThinkingStream +
 * Pick-a-view pills. Closes over `{ scenarioId, thinkingScript }`; reads the
 * scenario, the live schema, and the frame from context.
 */
function makeOnboardingIntro(config: OnboardingExperienceConfig): FC<ChatExperienceComponentProps> {
  const OnboardingIntro: FC<ChatExperienceComponentProps> = ({ conversation }) => {
    const { scenarioId, thinkingScript } = config;
    // `advanceFrame` is retained ONLY for the flagged intro-snap below (no
    // Understand-snap intent exists yet — design §0 R2/R7). All forward canvas
    // navigation goes through `dispatchIntent`.
    const { advanceFrame } = useOnboardingSession();
    const { byId, state: registryState } = useScenarioRegistry();
    const { state: chatState } = useChatStore();
    const { dispatch: dispatchIntent } = useCanvasOrchestrator();
    const widgetRole = useWidgetRole();
    const navigate = useNavigate();

    const scenario = byId(scenarioId);
    const scenarioName = scenario?.manifest.hero?.title ?? scenarioId ?? "Sample";
    const fileName = scenario?.documents?.[0]?.fileName ?? "sample.pdf";
    const liveSchema = useLiveExtractionSchema(scenario?.documents?.[0]?.documentId);
    const pickViews = scenario ? derivePickViews(scenario, liveSchema) : [];

    // standardized-viewer-control T6 — the scenario's primary document, as the
    // documents-scope the navigation intents carry (`showExtract`/`showInteract`).
    // The orchestrator resolves the doc off this scope so the shared widgets
    // aren't doc-less in steady; an absent doc yields an empty documents scope.
    const docId = scenario?.documents?.[0]?.documentId;
    const docScope: ContentScope = docId
      ? { type: "documents", documentIds: [docId] }
      : { type: "documents", documentIds: [] };

    const chatSessionId = chatState.activeSessionId;
    const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;

    // standardized-viewer-control T6 — the active viewer step is the frame-free
    // source for "where the canvas is". Two reads draw off it:
    //   • the schema-agent chat header shows when the active step is the schema
    //     DESIGN surface (`extract-workbench` + `surface === "design"`), NOT the
    //     retired `currentFrame === "f3a"` — so it tracks the dispatched
    //     `editSchema` step in BOTH onboarding and steady (mirrors Extract's
    //     `isDesignSurface = surface === "design"`).
    //   • the intro-snap guard reads "is the canvas already on Understand"
    //     (active step kind `doc-viewer`) instead of `currentFrame === "f2"`.
    const activeStep = selectActiveStep(activeChatSession);
    const isDesignSurface =
      activeStep?.kind === "extract-workbench" && activeStep.surface === "design";
    const isOnUnderstandStep = activeStep?.kind === "doc-viewer";

    // Synced ref of "is the canvas already on Understand" — both once-only canvas
    // side effects below read it at FIRE time (the intro-snap guard + the
    // ThinkingStream-done auto-advance guard, each formerly `currentFrame ===
    // "f2"`). R6: compute one-time side-effect decisions from a synced ref, never
    // a value mutated inside a setState/reducer updater.
    const isOnUnderstandStepRef = useRef(isOnUnderstandStep);
    isOnUnderstandStepRef.current = isOnUnderstandStep;

    // Sample switcher.
    const switcherAnchorRef = useRef<HTMLSpanElement | null>(null);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const otherScenarios = useMemo(() => {
      if (registryState.status !== "ready") return [];
      return registryState.scenarios.filter((s) => s.id !== scenarioId);
    }, [registryState, scenarioId]);
    let switcherBucketId: number | null = null;
    if (registryState.status === "ready") switcherBucketId = registryState.bucketId;

    // "Done." + Pick-a-view reveal — driven by the ThinkingStream's onDone.
    const [showDone, setShowDone] = useState<boolean>(thinkingScript.length === 0);

    // Canvas↔chat coherence (2026-06-11): when the scripted scan narration is
    // about to ANIMATE (fresh play, not a replay-restore) and the thread is
    // GENUINELY empty (hydration settled, zero real turns), the canvas must
    // show Understand — replaying "Reading <file> now…" over a resumed later
    // frame (Interact/Integrate) is incoherent. A returning user with history
    // is never yanked: the snap waits for `conversation.hydrated` and stands
    // down if any real turn exists.
    const [introWillPlay, setIntroWillPlay] = useState(false);
    const snapFiredRef = useRef(false);
    useEffect(() => {
      if (snapFiredRef.current) return;
      if (!introWillPlay || !conversation.hydrated) return;
      if (conversation.liveTurns.length > 0) {
        // Real history arrived — the intro replay is decoration above it.
        snapFiredRef.current = true;
        return;
      }
      snapFiredRef.current = true;
      // Guard re-expressed as a STEP predicate (T6): snap only if the canvas is
      // not ALREADY on the Understand doc-viewer step (was `currentFrame !==
      // "f2"`). Read off the synced ref so the once-only decision can't observe
      // a stale render value (R6).
      //
      // FLAG SITE (design §0 R2/R7) — the snap stays on `advanceFrame("f2")`.
      // This is a BACKWARD/lateral onboarding transition that must BOTH (a) push
      // the Understand *scanning* doc-viewer beat and (b) set the f2 journey edge
      // (`markFrameReached("f2")` → `currentFrame === "f2"`, which the ChatColumn
      // intro-snap test + the OnboardingShell "wires reachable pills" test read).
      // No `show*` intent reproduces that pair: `openDocument` pushes a doc-viewer
      // step but CLEARS scanning and does NOT touch the journey edge; `showSample`
      // re-runs `pickScenario` (wipes the reached-set + re-fires analytics). There
      // is no Understand/ingest-return navigation intent in `canvasIntentSchema`
      // today (same gap the Extract `advanceFrame("f1")` + OnboardingShell
      // URL-effect sites flagged). Removable once a dedicated Understand-snap /
      // ingest-picker intent + the symbol-deletion phase land.
      if (!isOnUnderstandStepRef.current) advanceFrame("f2");
    }, [introWillPlay, conversation.hydrated, conversation.liveTurns.length, advanceFrame]);

    return (
      <Box data-testid="onboarding-chat-conversation">
        <Box data-testid="onboarding-chat-header" sx={{ pb: 1, borderBottom: `1px solid ${BORDER}` }}>
          <Box
            data-testid="onboarding-chat-home"
            role="button"
            tabIndex={0}
            aria-label="Back to onboarding home"
            onClick={() => navigate("/onboarding")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("/onboarding");
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              cursor: "pointer",
              borderRadius: BORDER_RADIUS_SM,
              "&:hover": { opacity: 0.85 },
              "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 2 },
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: FONT_WEIGHT_HEADLINE,
                color: NAVY,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
              title={fileName}
            >
              {fileName}
            </Typography>
            <Box sx={{ flex: 1 }} />
            {!showDone && (
              <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontStyle: "italic", flexShrink: 0 }}>
                thinking…
              </Typography>
            )}
          </Box>
          <Box
            data-testid="onboarding-chat-sample-switch"
            sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}
          >
            <span>sample:</span>
            <span style={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>{scenarioName}</span>
            {otherScenarios.length > 0 && (
              <Box
                component="span"
                ref={switcherAnchorRef}
                role="button"
                tabIndex={0}
                aria-haspopup="menu"
                aria-expanded={switcherOpen ? "true" : undefined}
                data-testid="onboarding-chat-sample-switch-trigger"
                onClick={() => setSwitcherOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSwitcherOpen(true);
                  }
                }}
                sx={{
                  color: NAVY,
                  fontWeight: FONT_WEIGHT_LABEL,
                  cursor: "pointer",
                  "&:hover": { color: NAVY },
                }}
              >
                switch ▾
              </Box>
            )}
            <Menu
              anchorEl={switcherAnchorRef.current}
              open={switcherOpen}
              onClose={() => setSwitcherOpen(false)}
              data-testid="onboarding-chat-sample-switch-menu"
            >
              {otherScenarios.map((s) => (
                <MenuItem
                  key={s.id}
                  data-testid={`onboarding-chat-sample-switch-item-${s.id}`}
                  onClick={() => {
                    setSwitcherOpen(false);
                    if (switcherBucketId != null) {
                      navigate(`/onboarding/${switcherBucketId}/${s.id}`);
                    }
                  }}
                >
                  {s.manifest.hero?.title ?? s.id}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </Box>

        {isDesignSurface && (
          <Box
            data-testid="chat-schema-agent-header"
            sx={{
              mt: 1,
              pb: 1,
              borderBottom: `1px solid ${BORDER}`,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography
              variant="overline"
              sx={{
                color: NAVY,
                letterSpacing: LETTER_SPACING_LABEL,
                fontWeight: FONT_WEIGHT_HEADLINE,
                fontSize: FONT_SIZE_LABEL,
              }}
            >
              Schema Agent
            </Typography>
            <Box
              component="span"
              data-testid="chat-schema-agent-sample-switcher"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                fontSize: FONT_SIZE_LABEL,
                color: MUTED_ON_LIGHT,
              }}
            >
              <span>sample:</span>
              <span style={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>{scenarioName}</span>
              <span>·</span>
              <span style={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>switch ▾</span>
            </Box>
          </Box>
        )}

        {(activeChatSession?.summaries?.length ?? 0) > 0 && (
          <Box
            data-testid="chat-earlier-turns-summary"
            sx={{
              mt: 1,
              px: 1,
              py: 0.5,
              backgroundColor: WARM_OFFWHITE,
              borderRadius: BORDER_RADIUS_SM,
              border: `1px dashed ${BORDER}`,
              fontSize: FONT_SIZE_LABEL,
              color: MUTED_ON_LIGHT,
            }}
          >
            {(() => {
              const overlay = activeChatSession?.pendingSchemaOverlay;
              const accepted = overlay?.addedFields.length ?? 0;
              const pending = overlay?.pendingFieldProposals.length ?? 0;
              const proposalsSeen = accepted + pending;
              return `▾ earlier turns (${proposalsSeen} proposals · ${accepted} fields accepted)`;
            })()}
          </Box>
        )}

        {/* Scripted seed bubbles + thinking-stream + done/pick-a-view. */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, mt: 1.5 }}>
          <UserBubble testid="onboarding-chat-user-bubble">{scenarioName}</UserBubble>
          <BotBubble testid="onboarding-chat-bot-lead">
            <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>
              Reading {fileName} now.
            </Box>
          </BotBubble>

          {thinkingScript.length > 0 && (
            <ThinkingStream
              notes={thinkingScript}
              scenarioKey={scenarioId}
              role={widgetRole}
              scope={{ type: "none" }}
              persistReplay
              onWillPlay={() => setIntroWillPlay(true)}
              onDone={() => {
                setShowDone(true);
                // standardized-viewer-control T9 — auto-advance Understand →
                // Extract when the scripted stream finishes, by DISPATCHING
                // `showExtract` through the orchestrator (the one seam), NOT
                // `advanceFrame("f3")`. The handler pushes the extract-workbench
                // step (canvas → Extract) and layers the onboarding journey
                // (`markFrameReached("f3")` + the Extract first-reach analytic).
                // No `focusedCategoryId` → the default first category, exactly as
                // the bare `advanceFrame("f3")` landed.
                // Guard re-expressed as a STEP predicate (was `currentFrame ===
                // "f2"`): only auto-advance if the canvas is still on the
                // Understand doc-viewer step. Read off the synced ref so the
                // onDone callback can't observe a stale render value (R6).
                if (isOnUnderstandStepRef.current) {
                  dispatchIntent({ kind: "showExtract", scope: docScope, schemaId: scenarioId }, "user");
                }
              }}
            />
          )}

          {showDone && (
            <>
              <BotBubble testid="onboarding-chat-done">
                <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>Done.</Box> Ready to analyze.
              </BotBubble>
              <Box data-testid="onboarding-chat-pick-a-view" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                <BotBubble>Pick a view:</BotBubble>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {pickViews.map((view, idx) => (
                    <PickViewPill
                      key={view.key}
                      label={view.label}
                      testid={`onboarding-chat-pick-view-${view.key}`}
                      legacyTestid={idx === 0 && view.key !== "interact" ? "advance-to-f3" : undefined}
                      onClick={() => {
                        if (view.key === "interact") {
                          // standardized-viewer-control T6 — the "Show me chat"
                          // pill MOVES the canvas to Interact by DISPATCHING
                          // `showInteract` (was `advanceFrame("f5")`). The handler
                          // pushes the interact-chat step resolving the scenario
                          // document from the scope, and layers the onboarding
                          // Interact journey stage (`markFrameReached("f5")`).
                          dispatchIntent({ kind: "showInteract", scope: docScope }, "user");
                          return;
                        }
                        // standardized-viewer-control — dispatch showExtract with
                        // the category through the orchestrator (the one seam), so
                        // it opens Extract focused on that category AND re-focuses
                        // the live workbench when already shown (replaces the
                        // non-reactive `?focus=` URL steer).
                        dispatchIntent(
                          {
                            kind: "showExtract",
                            scope: docScope,
                            schemaId: scenarioId,
                            focusedCategoryId: view.key,
                          },
                          "user",
                        );
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>
    );
  };
  return OnboardingIntro;
}

/**
 * standardized-viewer-control T6 (M1) — the set of active viewer-step kinds that
 * count as "pre-Interact": the user is browsing the canvas (Understand, Extract,
 * or Report) and has NOT yet moved into the Interact chat. A genuine first send
 * from any of these jumps the canvas to Interact. The kinds map 1:1 to the
 * legacy guard `frame === "f2"|"f3"|"f3a"|"f4"` (understand/extract/report); it
 * EXCLUDES `interact-chat` (already AT Interact — don't bounce), `integrate`,
 * and `ingest-picker`. This is the BEHAVIORAL read M1 calls out — re-expressed
 * as an explicit step predicate, not a frame literal.
 */
const PRE_INTERACT_STEP_KINDS: ReadonlySet<string> = new Set([
  "doc-viewer",
  "extract-workbench",
  "report",
]);

/**
 * The first-send → Interact advance is scenario-agnostic: it carries an empty
 * documents scope (the orchestrator's `showInteract` handler falls back to the
 * onboarding session's active scenario for the step's scenarioId). Module-level
 * so the effect's identity is stable.
 */
const FIRST_SEND_INTERACT_SCOPE: ContentScope = { type: "documents", documentIds: [] };

/**
 * The onboarding `Choreography` — a render-null director. It owns the
 * first-send → Interact advance: a real user-typed turn means they're moving
 * past browsing the canvas, so it DISPATCHES `showInteract` (was
 * `advanceFrame("f5")`). It observes the engine's `firstUserMessageSent`
 * lifecycle STATE (set ONLY by a genuine `send()`, never by RT-01 hydration of a
 * persisted user turn) and fires once. (The intro-done → Extract auto-advance
 * lives in `Intro`'s ThinkingStream `onDone`, which owns the per-note timing.)
 *
 * Guard: only advance if the active canvas step is PRE-INTERACT (Understand /
 * Extract / Report). A user already AT Interact (e.g. clicked "Show me chat") is
 * not bounced. Read off a synced ref so the once-only decision can't observe a
 * stale render value (R6).
 */
function makeOnboardingChoreography(reportTemplateId?: string): FC<ChatExperienceComponentProps> {
  const OnboardingChoreography: FC<ChatExperienceComponentProps> = ({ conversation }) => {
    const { state: chatState, setReportTemplateId } = useChatStore();
    const { dispatch: dispatchIntent } = useCanvasOrchestrator();
    const firstSendFiredRef = useRef(false);

    // The active viewer step's kind — the frame-free source for the pre-Interact
    // guard (was `currentFrame`). Synced to a ref for the once-only effect (R6).
    const activeStep = selectActiveStep(
      chatState.activeSessionId ? chatState.sessions.get(chatState.activeSessionId) : null,
    );
    const activeStepKindRef = useRef(activeStep?.kind);
    activeStepKindRef.current = activeStep?.kind;

    // report-default-template — load this scenario's configured default report
    // template onto the active session ONCE (the render surface reads
    // `reportOverlay.templateId`; the templateId-change re-render effect picks it
    // up). Config-driven: a scenario WITHOUT `reportTemplateId` never sets it
    // (empty state). Guarded on the active session existing.
    const templateLoadedRef = useRef(false);
    useEffect(() => {
      if (templateLoadedRef.current || !reportTemplateId || !chatState.activeSessionId) return;
      templateLoadedRef.current = true;
      setReportTemplateId(reportTemplateId);
    }, [chatState.activeSessionId, setReportTemplateId]);

    const { firstUserMessageSent } = conversation;
    useEffect(() => {
      if (!firstUserMessageSent || firstSendFiredRef.current) return;
      firstSendFiredRef.current = true;
      if (activeStepKindRef.current && PRE_INTERACT_STEP_KINDS.has(activeStepKindRef.current)) {
        dispatchIntent({ kind: "showInteract", scope: FIRST_SEND_INTERACT_SCOPE }, "user");
      }
    }, [firstUserMessageSent, dispatchIntent]);

    return null;
  };
  return OnboardingChoreography;
}

export function makeOnboardingExperience(config: OnboardingExperienceConfig): ChatExperience {
  // Thread the scenario file/title into the grounded LLM prompt — the
  // functional grounding the deleted onboarding fork supplied via
  // `useConversation(..., { scopeHint, title })`. Only set scopeHint when at
  // least one field is known (mirrors the bare-chat omission otherwise).
  const scopeHint =
    config.fileName != null || config.scenarioTitle != null
      ? { fileName: config.fileName ?? null, scenarioTitle: config.scenarioTitle ?? null }
      : undefined;
  return {
    Intro: makeOnboardingIntro(config),
    Choreography: makeOnboardingChoreography(config.reportTemplateId),
    ...(scopeHint ? { scopeHint } : {}),
    // Fallback label for ensure-create when the session is title-less; the
    // session's own title ("Onboarding") wins in the engine.
    title: "Onboarding",
  };
}

/** Validates `create()`'s config arg — mirrors `WidgetTool.input`. */
const onboardingConfigSchema = z.object({
  scenarioId: z.string(),
  thinkingScript: z.array(z.string()),
  fileName: z.string().optional(),
  scenarioTitle: z.string().optional(),
  // report-default-template — preserved through the registry's `.parse()` (a
  // z.object strips unknown keys, so it MUST be declared here or the
  // ChatColumn→create→makeOnboardingExperience path would drop it).
  reportTemplateId: z.string().optional(),
});

/**
 * The catalog entry. Glob-discovered by `chatExperienceRegistry` as the
 * module's `experience` export.
 */
export const experience: ChatExperienceEntry = {
  id: "onboarding",
  label: "Onboarding",
  configSchema: onboardingConfigSchema,
  create: (config) => makeOnboardingExperience(onboardingConfigSchema.parse(config)),
};
