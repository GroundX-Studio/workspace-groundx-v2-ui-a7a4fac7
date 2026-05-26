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

import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { chatErrorToUserCopy, sendChatMessage } from "@/api/chatSessions";
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";
import { useChatStore } from "@/contexts/ChatStoreContext";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  ICON_SIZE_INLINE,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

import { GateChatPanel } from "./GateChatPanel";

// ARCH-11 (2026-05-26): the timed thinking-note reveal + done-state
// persistence is now owned by `chat-widgets/ThinkingStream` — F2 mounts
// the widget and listens for `onDone` to reveal the "Done." bubble +
// Pick-a-view CTAs. Cadence constants + sessionStorage key live in
// the widget; this file's responsibility is conversation-flow
// orchestration only.

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
 * schema. Each category becomes one pill (label = `category.name`
 * verbatim from the manifest, key = `category.id`). POL-03: we
 * previously `.toLowerCase()`'d the label, which read awkwardly for
 * multi-word categories ("Bill Statement" → "bill statement"). The
 * manifest already authors category names in the right case, so we
 * trust it. Scenarios without an extraction schema (e.g. Solar —
 * Interact + Report only) get a single "Show me chat" pill that
 * jumps to F5.
 */
function derivePickViews(scenario: NonNullable<ReturnType<ReturnType<typeof useScenarioRegistry>["byId"]>>): PickViewOption[] {
  const schema = scenario.manifest.extractionSchema;
  if (!schema) return [{ key: "interact", label: "Show me chat" }];
  return [
    ...schema.categories.map((c) => ({ key: c.id, label: c.name })),
    { key: "edit-schema", label: "Edit schema" },
  ];
}

interface LiveTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const { state: chatState } = useChatStore();
  const chatSessionId = chatState.activeSessionId;
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  const navigate = useNavigate();

  // CF-18: live ad-hoc chat turns that follow the scripted thinking flow.
  // Owned here (not by ChatInputBar) so they render in the conversation
  // scroll body alongside thinking notes + Pick-a-view.
  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: LiveTurn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
      setLiveTurns((cur) => [...cur, userTurn]);

      if (!chatSessionId) {
        // EntityRegistry seeds a chat session on mount; if we got here
        // without one something has broken upstream. Fall back to a
        // polite assistant turn rather than crashing.
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "No active chat session — please refresh and try again.",
          },
        ]);
        return;
      }

      setSending(true);
      try {
        const result = await sendChatMessage({
          chatSessionId,
          newUserMessage: trimmed,
          sessionMeta: {
            title: activeChatSession?.title ?? "Onboarding",
            isOnboarding: activeChatSession?.isOnboardingSession ?? true,
            onboardingSessionId: chatSessionId,
            activeEntityKey: activeChatSession?.activeEntityKey ?? null,
          },
        });
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply.answer,
          },
        ]);
      } catch (err) {
        // CF-08: branch the user-facing copy on the upstream status
        // so 401 / 501 / 504 / 5xx / 400 each say the right thing.
        const mapped = chatErrorToUserCopy(err);
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: mapped.message,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, chatSessionId, activeChatSession],
  );

  // Sample switcher dropdown anchor + state.
  const switcherAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const otherScenarios = useMemo(() => {
    if (registryState.status !== "ready") return [];
    return registryState.scenarios.filter((s) => s.id !== scenarioId);
  }, [registryState, scenarioId]);
  const bucketId = registryState.status === "ready" ? registryState.bucketId : null;

  // ARCH-11 (2026-05-26): thinking-stream state owned by the
  // `ThinkingStream` chat-widget; this surface just listens for its
  // `onDone` callback to know when to reveal the "Done." bubble +
  // Pick-a-view pills. The widget handles the timer cadence + the
  // per-scenario sessionStorage replay guard internally.
  const [showDone, setShowDone] = useState<boolean>(thinkingScript.length === 0);

  return (
    <Box data-testid="onboarding-chat-conversation" sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header: clickable G + filename (was "Conversation" — replaced
          2026-05-25 because the filename gives real context and frees
          up the canvas pane from carrying a duplicate filename header).
          Clicking either the G or the filename navigates to
          /onboarding (the onboarding home / sample picker). */}
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
          <Box
            aria-hidden
            sx={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: NAVY,
              color: WHITE,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_HEADLINE,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            G
          </Box>
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
          {/* "switch" affordance only renders when there's actually
              something else to switch to. Previous behavior was to
              render a muted-styled label that did nothing on click;
              the screenshot 2026-05-25 showed this as user-confusing
              (looks like a dropdown trigger, fires nothing). */}
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

        {thinkingScript.length > 0 && (
          <ThinkingStream
            notes={thinkingScript}
            scenarioKey={scenarioId}
            mode="onboarding"
            onDone={() => setShowDone(true)}
          />
        )}

        {showDone && (
          <>
            <BotBubble testid="onboarding-chat-done">
              <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>Done.</Box> Ready to analyze.
            </BotBubble>
            {/* Pick-a-view block.
                - Inner gap (1.25) matches the parent conversation
                  Stack's gap so the pill row sits the same distance
                  from "Pick a view:" as two consecutive chat bubbles
                  do. Was 0.75 → looked too tight (user 2026-05-25).
                - Pills row drops its prior `pl: 0.5` (4px) offset —
                  it was pushing the row right of the bubble above
                  for no design reason. */}
            <Box data-testid="onboarding-chat-pick-a-view" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <BotBubble>Pick a view:</BotBubble>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
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

        {/* CF-18 live ad-hoc turns: appended after the scripted flow.
            User bubbles right-aligned, assistant bubbles left-aligned. */}
        {liveTurns.length > 0 && (
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {liveTurns.map((turn) =>
              turn.role === "user" ? (
                <UserBubble key={turn.id} testid="onboarding-chat-live-user">
                  {turn.content}
                </UserBubble>
              ) : (
                <BotBubble key={turn.id} testid="onboarding-chat-live-assistant">
                  {turn.content}
                </BotBubble>
              ),
            )}
          </Stack>
        )}
      </Box>

      {/* Bottom: real chat input (CF-18). Posts via sendChatMessage and
          appends the assistant reply as a live turn above. */}
      <Box sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
        <LiveChatInputBar onSend={handleSend} disabled={sending} />
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
        // Shared chat-element radius across bubbles + Pick-a-view
        // pills. Bumped from BORDER_RADIUS_SM (4px) to
        // BORDER_RADIUS_2X (12px) on 2026-05-25 so the moderate-
        // rounded bubble matches the pills below, instead of looking
        // square next to fully-pill CTAs.
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: CYAN,
        color: NAVY,
        fontSize: FONT_SIZE_CAPTION,
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
        // Shared chat-element radius — see UserBubble comment above.
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: BODY_TEXT,
        fontSize: FONT_SIZE_CAPTION,
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
      // Match the bubbles' BORDER_RADIUS_2X. The fully-pill prior
      // shape (BORDER_RADIUS_PILL = 200px) clashed visually with the
      // 12px bubbles — user flagged the mismatch 2026-05-25.
      borderRadius: BORDER_RADIUS_2X,
      backgroundColor: WHITE,
      border: `1.5px solid ${GREEN}`,
      color: NAVY,
      fontSize: FONT_SIZE_LABEL,
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

interface LiveChatInputBarProps {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * CF-18 — F2 chat input. Mirrors InteractView (F5) so anything we
 * change here we also change there until the two surfaces merge into a
 * shared `chat-with-sources` widget mount.
 */
const LiveChatInputBar: FC<LiveChatInputBarProps> = ({ onSend, disabled }) => {
  const [draft, setDraft] = useState("");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || disabled) return;
    setDraft("");
    void onSend(trimmed);
  };
  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      data-testid="onboarding-chat-input"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: BORDER_RADIUS_PILL,
        px: 1.5,
        py: 0.5,
      }}
    >
      <InputBase
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // GroundX-equivalent of Claude's "Describe what you want to
        // create…" — surface-agnostic prompt that fits both ask-the-
        // document chat and "describe what to extract" extraction
        // intents. Updated 2026-05-25.
        placeholder="Ask about your documents…"
        disabled={disabled}
        sx={{ flex: 1, color: NAVY, fontSize: FONT_SIZE_CAPTION }}
        inputProps={{ "aria-label": "Chat input" }}
      />
      <IconButton
        type="submit"
        size="small"
        disabled={disabled}
        data-testid="onboarding-chat-send"
        aria-label="Send"
        // Cyan circle (the prior color the user explicitly preferred
        // over the brief 2026-05-25 GREEN experiment). The icon inside
        // is hand-sized to 14px — `fontSize="small"` was 20px which
        // made the glyph overflow the 28px button. Pairs cyan circle
        // + navy arrow per the design system.
        sx={{
          backgroundColor: CYAN,
          color: NAVY,
          width: 28,
          height: 28,
          "&:hover": { backgroundColor: CYAN, filter: "brightness(0.95)" },
          "&.Mui-disabled": { backgroundColor: BORDER, color: MUTED_ON_LIGHT },
        }}
      >
        <SendOutlinedIcon sx={{ fontSize: ICON_SIZE_INLINE }} />
      </IconButton>
    </Box>
  );
};

