/**
 * OnboardingChatColumn — the chat-column body across F1 ↔ F7.
 *
 * Dispatches between three states:
 *
 *   1. Gate active (open / committed / composing)
 *      → render <GateChatPanel /> (the existing gate-typing + GateView surface).
 *
 *   2. F2+ with a scenario picked
 *      → render the wireframe conversation per spec-chapters.jsx · Flow_Processing:
 *         · Conversation header + sample-switcher subline
 *         · User bubble (scenario name)
 *         · Bot lead ("Reading <filename> now.")
 *         · Streaming thinking-notes (timer-driven, one per ~1.1s)
 *         · After the stream finishes: Done + "Pick a view:" pills
 *         · Pills advance to F3 (the existing canvas CTA moves here)
 *
 *   3. F1 or F2-BYO-no-scenario
 *      → idle placeholder ("Ask anything about the sample…") or the BYO
 *         "sign in to upload" copy.
 *
 * Streaming logic + manifest reading is owned here (was previously in
 * UnderstandView). Chunk 4 cleans the canvas accordingly.
 */

import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

import { GateChatPanel } from "./GateChatPanel";

/** ~1.1s between successive thinking-notes (matches the prior canvas-side stream). */
const THINKING_NOTE_INTERVAL_MS = 1100;

/** A short pause after the last note streams in before Done + Pick-a-view appear. */
const DONE_REVEAL_DELAY_MS = 800;

interface PickViewOption {
  key: string;
  label: string;
}

// Per-scenario pick-a-view pills derive from the scenario's extraction
// schema in F2ConversationFlow itself — see the useMemo there.

export interface OnboardingChatColumnProps {
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

export const OnboardingChatColumn: FC<OnboardingChatColumnProps> = ({ overrideScenarioId, overrideFrame }) => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();

  // Gate takes over the chat column when active — preserves the existing
  // F6 typing-indicator + GateView flow.
  const gateActive =
    session.gate.status === "open" ||
    session.gate.status === "committed";
  if (gateActive) return <GateChatPanel />;

  const currentFrame = overrideFrame ?? session.currentFrame;
  const isF1 = currentFrame === "f1";
  const isF2 = currentFrame === "f2";
  const scenarioId =
    overrideScenarioId !== undefined
      ? overrideScenarioId
      : appMode.scenario ?? session.scenario;
  const scenario = scenarioId ? byId(scenarioId) : undefined;

  // F2 is the only frame with a streamed thinking-script conversation.
  // F3-F7 (post-Understand) read as "ready for questions" — same idle
  // placeholder as F1. The BYO placeholder is defensive; in practice
  // the F2 BYO path opens the gate, so the gate-active branch above
  // covers it.
  if (isF2 && scenario) {
    return (
      <F2ConversationFlow
        scenarioId={scenarioId!}
        scenarioName={scenario.manifest.hero?.title ?? scenarioId ?? "Sample"}
        fileName={scenario.documents[0]?.fileName ?? "sample.pdf"}
        thinkingScript={scenario.manifest.thinkingScript ?? []}
        pickViews={derivePickViews(scenario)}
      />
    );
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

// ── F2 conversation flow ─────────────────────────────────────────────────

interface F2ConversationFlowProps {
  scenarioId: string;
  scenarioName: string;
  fileName: string;
  thinkingScript: string[];
  pickViews: PickViewOption[];
}

/**
 * Derive the Pick-a-view pill set from the scenario's extraction
 * schema. Each category becomes one pill (label = category.name
 * lowercased, key = category.id). Plus an "edit schema" pill.
 * Scenarios without an extraction schema (e.g. Solar — Interact +
 * Report only) get a single "show me chat" pill that jumps to F5.
 */
function derivePickViews(scenario: NonNullable<ReturnType<ReturnType<typeof useScenarioRegistry>["byId"]>>): PickViewOption[] {
  const schema = scenario.manifest.extractionSchema;
  if (!schema) return [{ key: "interact", label: "show me chat" }];
  return [
    ...schema.categories.map((c) => ({ key: c.id, label: c.name.toLowerCase() })),
    { key: "edit-schema", label: "edit schema" },
  ];
}

const F2ConversationFlow: FC<F2ConversationFlowProps> = ({
  scenarioId,
  scenarioName,
  fileName,
  thinkingScript,
  pickViews,
}) => {
  const { advanceFrame } = useOnboardingSession();
  const { state: registryState } = useScenarioRegistry();
  const navigate = useNavigate();

  // Sample switcher dropdown anchor + state.
  const switcherAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const otherScenarios = useMemo(() => {
    if (registryState.status !== "ready") return [];
    return registryState.scenarios.filter((s) => s.id !== scenarioId);
  }, [registryState, scenarioId]);
  const bucketId = registryState.status === "ready" ? registryState.bucketId : null;
  // Streamed note count — starts at 1 (the first note appears immediately
  // so the user sees motion right away).
  const [noteCount, setNoteCount] = useState<number>(thinkingScript.length > 0 ? 1 : 0);
  const [showDone, setShowDone] = useState<boolean>(thinkingScript.length === 0);

  useEffect(() => {
    if (noteCount >= thinkingScript.length) return;
    const id = window.setTimeout(() => {
      setNoteCount((n) => Math.min(n + 1, thinkingScript.length));
    }, THINKING_NOTE_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [noteCount, thinkingScript.length]);

  useEffect(() => {
    if (noteCount < thinkingScript.length) return;
    if (showDone) return;
    const id = window.setTimeout(() => setShowDone(true), DONE_REVEAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [noteCount, thinkingScript.length, showDone]);

  const visibleNotes = thinkingScript.slice(0, noteCount);

  return (
    <Box data-testid="onboarding-chat-conversation" sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header: G avatar + Conversation label + sample switcher subline */}
      <Box data-testid="onboarding-chat-header" sx={{ pb: 1, borderBottom: `1px solid ${BORDER}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            aria-hidden
            sx={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: NAVY,
              color: WHITE,
              fontSize: 12,
              fontWeight: FONT_WEIGHT_HEADLINE,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            G
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>
            Conversation
          </Typography>
          <Box sx={{ flex: 1 }} />
          {!showDone && (
            <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontStyle: "italic" }}>
              thinking…
            </Typography>
          )}
        </Box>
        <Box
          data-testid="onboarding-chat-sample-switch"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: 11, color: MUTED_ON_LIGHT }}
        >
          <span>sample:</span>
          <span style={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>{scenarioName}</span>
          <Box
            component="span"
            ref={switcherAnchorRef}
            role={otherScenarios.length > 0 ? "button" : undefined}
            tabIndex={otherScenarios.length > 0 ? 0 : -1}
            aria-haspopup={otherScenarios.length > 0 ? "menu" : undefined}
            aria-expanded={switcherOpen ? "true" : undefined}
            data-testid="onboarding-chat-sample-switch-trigger"
            onClick={() => {
              if (otherScenarios.length > 0) setSwitcherOpen(true);
            }}
            onKeyDown={(event) => {
              if (otherScenarios.length === 0) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSwitcherOpen(true);
              }
            }}
            sx={{
              color: otherScenarios.length === 0 ? MUTED_ON_LIGHT : NAVY,
              fontWeight: FONT_WEIGHT_LABEL,
              cursor: otherScenarios.length === 0 ? "default" : "pointer",
              "&:hover": { color: NAVY },
            }}
          >
            switch ▾
          </Box>
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
                  if (bucketId != null) {
                    navigate(`/onboarding/${bucketId}/${s.id}`);
                  }
                }}
              >
                {s.manifest.hero?.title ?? s.id}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Box>

      {/* Bubble stream */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <UserBubble testid="onboarding-chat-user-bubble">{scenarioName}</UserBubble>
        <BotBubble testid="onboarding-chat-bot-lead">
          <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>
            Reading {fileName} now.
          </Box>
        </BotBubble>

        {visibleNotes.length > 0 && (
          <Stack spacing={0.75} sx={{ pl: 0.5 }}>
            {visibleNotes.map((note, i) => (
              <Box
                key={i}
                data-testid={`onboarding-chat-thinking-note-${i}`}
                sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}
              >
                <Box aria-hidden sx={{ color: MUTED_ON_LIGHT, fontWeight: FONT_WEIGHT_HEADLINE, mt: "2px", minWidth: 8 }}>
                  ·
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    flex: 1,
                    fontStyle: "italic",
                    color: BODY_TEXT,
                    lineHeight: 1.4,
                    paddingLeft: 0.75,
                    borderLeft: `2px solid ${BORDER}`,
                  }}
                >
                  {note}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        {showDone && (
          <>
            <BotBubble testid="onboarding-chat-done">
              <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>Done.</Box> Ready to analyze.
            </BotBubble>
            <Box data-testid="onboarding-chat-pick-a-view" sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <BotBubble>Pick a view:</BotBubble>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, pl: 0.5 }}>
                {pickViews.map((view, idx) => (
                  <PickViewPill
                    key={view.key}
                    label={view.label}
                    testid={`onboarding-chat-pick-view-${view.key}`}
                    // First non-edit-schema, non-interact pill carries
                    // the legacy `advance-to-f3` testid so existing e2e
                    // suites that expect a canvas CTA still find a
                    // clickable affordance.
                    legacyTestid={idx === 0 && view.key !== "edit-schema" && view.key !== "interact" ? "advance-to-f3" : undefined}
                    onClick={() => {
                      if (view.key === "edit-schema") {
                        advanceFrame("f3a");
                        return;
                      }
                      if (view.key === "interact") {
                        advanceFrame("f5");
                        return;
                      }
                      // Schema-derived category pill → land on F3 with
                      // ?focus=<categoryId>. ExtractView reads that
                      // param to pre-select the user's picked slice.
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

      {/* Bottom: chat input placeholder. Phase-7 wires this to the real
          chat router; for now it's a visual anchor matching the wireframe. */}
      <Box sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
        <ChatInputStub />
      </Box>
    </Box>
  );
};

// ── Bubble + pill primitives ─────────────────────────────────────────────

interface BubbleProps {
  children: React.ReactNode;
  testid?: string;
}

const UserBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "75%",
        px: 1.25,
        py: 0.75,
        borderRadius: BORDER_RADIUS_SM,
        backgroundColor: CYAN,
        color: NAVY,
        fontSize: 13,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      {children}
    </Box>
  </Box>
);

const BotBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "85%",
        px: 1.25,
        py: 0.75,
        borderRadius: BORDER_RADIUS_SM,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: BODY_TEXT,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      {children}
    </Box>
  </Box>
);

interface PickViewPillProps {
  label: string;
  testid?: string;
  /**
   * Optional second testid for back-compat with pre-rebuild e2e specs.
   * Rendered on a transparent wrapper around the pill so both names
   * resolve to a clickable node via getByTestId.
   */
  legacyTestid?: string;
  onClick: () => void;
}

const PickViewPillInner: FC<PickViewPillProps> = ({ label, testid, onClick }) => (
  <Box
    role="button"
    tabIndex={0}
    data-testid={testid}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    }}
    sx={{
      px: 1.25,
      py: 0.5,
      borderRadius: BORDER_RADIUS_PILL,
      backgroundColor: WHITE,
      border: `1.5px solid ${GREEN}`,
      color: NAVY,
      fontSize: 12,
      fontWeight: FONT_WEIGHT_HEADLINE,
      cursor: "pointer",
      "&:hover": { backgroundColor: CYAN },
      "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
    }}
  >
    {label}
  </Box>
);

const PickViewPill: FC<PickViewPillProps> = (props) => {
  // When a legacy testid is set, wrap in a click-passthrough Box so
  // getByTestId(legacy) and getByTestId(canonical) both resolve.
  if (props.legacyTestid) {
    return (
      <Box data-testid={props.legacyTestid} onClick={props.onClick} sx={{ display: "inline-block" }}>
        <PickViewPillInner {...props} />
      </Box>
    );
  }
  return <PickViewPillInner {...props} />;
};

const ChatInputStub: FC = () => (
  <Box
    sx={{
      borderRadius: BORDER_RADIUS_SM,
      border: `1px solid ${BORDER}`,
      px: 1.25,
      py: 1,
      fontSize: 12,
      color: MUTED_ON_LIGHT,
      backgroundColor: WHITE,
      cursor: "text",
    }}
  >
    ask a question, ready when you are…
  </Box>
);
