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
 *   - `Choreography` — a render-null director using `useOnboardingSession`:
 *     `advanceFrame("f3")` when the ThinkingStream completes, `advanceFrame("f5")`
 *     on the first user send. Exactly the old two `advanceFrame` calls, moved
 *     out of the engine.
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

import type { ChatExperienceEntry } from "@/conversation/chatExperienceRegistry";

import { useLiveExtractionSchema } from "@/hooks/useLiveExtractionSchema";
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";
import type { ChatExperience, ChatExperienceComponentProps } from "@/conversation/ChatExperience";
import { BotBubble, PickViewPill, UserBubble } from "@/conversation/chatPrimitives";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
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
  const OnboardingIntro: FC<ChatExperienceComponentProps> = () => {
    const { scenarioId, thinkingScript } = config;
    const { advanceFrame, state: onboardingState } = useOnboardingSession();
    const { byId, state: registryState } = useScenarioRegistry();
    const { state: chatState } = useChatStore();
    const widgetRole = useWidgetRole();
    const navigate = useNavigate();

    const scenario = byId(scenarioId);
    const scenarioName = scenario?.manifest.hero?.title ?? scenarioId ?? "Sample";
    const fileName = scenario?.documents?.[0]?.fileName ?? "sample.pdf";
    const liveSchema = useLiveExtractionSchema(scenario?.documents?.[0]?.documentId);
    const pickViews = scenario ? derivePickViews(scenario, liveSchema) : [];

    const chatSessionId = chatState.activeSessionId;
    const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;

    const currentFrameRef = useRef(onboardingState.currentFrame);
    currentFrameRef.current = onboardingState.currentFrame;

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

        {onboardingState.currentFrame === "f3a" && (
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
              onDone={() => {
                setShowDone(true);
                // Auto-advance Understand (F2) → Extract (F3) when the
                // scripted stream finishes. Guard: only if still on F2.
                if (currentFrameRef.current === "f2") {
                  advanceFrame("f3");
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
                          advanceFrame("f5");
                          return;
                        }
                        advanceFrame("f3");
                        navigate({ search: `?focus=${view.key}` }, { replace: false });
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
 * The onboarding `Choreography` — a render-null director using
 * `useOnboardingSession`. It owns the first-send → `advanceFrame("f5")`
 * advance: a real user-typed turn means they're moving past browsing the
 * canvas, so the nav jumps to Interact (F5). It observes the engine's
 * `firstUserMessageSent` lifecycle STATE (set ONLY by a genuine `send()`,
 * never by RT-01 hydration of a persisted user turn) and fires once. (The
 * intro-done → `advanceFrame("f3")` advance lives in `Intro`'s ThinkingStream
 * `onDone`, which owns the per-note timing.)
 *
 * Guard: only advance if currently on F2/F3/F3a/F4 (the pre-Interact part of
 * the journey). A user already at/past F5 (e.g. clicked the "Show me chat"
 * pill) is not bounced.
 */
function makeOnboardingChoreography(): FC<ChatExperienceComponentProps> {
  const OnboardingChoreography: FC<ChatExperienceComponentProps> = ({ conversation }) => {
    const { advanceFrame, state: onboardingState } = useOnboardingSession();
    const firstSendFiredRef = useRef(false);
    const currentFrameRef = useRef(onboardingState.currentFrame);
    currentFrameRef.current = onboardingState.currentFrame;

    const { firstUserMessageSent } = conversation;
    useEffect(() => {
      if (!firstUserMessageSent || firstSendFiredRef.current) return;
      firstSendFiredRef.current = true;
      const frame = currentFrameRef.current;
      if (frame === "f2" || frame === "f3" || frame === "f3a" || frame === "f4") {
        advanceFrame("f5");
      }
    }, [firstUserMessageSent, advanceFrame]);

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
    Choreography: makeOnboardingChoreography(),
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
