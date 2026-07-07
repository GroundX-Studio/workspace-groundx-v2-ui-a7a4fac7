/**
 * 2026-05-30-unified-conversation-flow Phase 2 — shared chat presentational
 * primitives, lifted out of ChatColumn.tsx so the single `<ConversationFlow>`
 * AND the onboarding `ChatExperience`'s `Intro` can both render them without a
 * widget→widget import cycle.
 *
 * NOTHING here knows about onboarding/frames/scenarios — these are bubbles,
 * a pill, the live-turn list, and the input bar. `LiveTurnList` emits the
 * SINGLE `chat-live-*` testid set (no `onboarding-`/`steady-` prefix — there
 * is one flow now). Style comes from `@/constants` tokens (no literals → the
 * no-hardcoded-styles guard stays green).
 */
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, type FC, type FormEvent, type ReactNode } from "react";

import type { ChatSuggestedAction } from "@/api/chatSessions";
import type { Citation, WidgetRole } from "@groundx/shared";
import { SourceList } from "@/components/brand/SourceList/SourceList";
import { MessageActions } from "@/components/conversation/MessageActions/MessageActions";
import { PinToReportAction } from "@/components/chat-widgets/PinToReportAction/PinToReportAction";
import { ProposeSchemaFieldCard } from "@/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard";
import { SuggestedActionChips } from "@/components/chat-widgets/SuggestedActionChips/SuggestedActionChips";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";
import { Markdown } from "@/components/primitives/Markdown/Markdown";
import { consumedAnchorKeys } from "@/components/primitives/Markdown/remarkClickableSpans";
import type { LiveTurn } from "./useConversation";

import {
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  CYAN,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  ICON_SIZE_INLINE,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";

// ── Bubbles ───────────────────────────────────────────────────────────────

interface BubbleProps {
  children: ReactNode;
  testid?: string;
}

export const UserBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "75%",
        px: 1.25,
        py: 0.75,
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

export const BotBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "85%",
        px: 1.25,
        py: 0.75,
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: NAVY,
        fontSize: FONT_SIZE_CAPTION,
        lineHeight: 1.4,
      }}
    >
      {children}
    </Box>
  </Box>
);

// ── Pick-a-view pill ────────────────────────────────────────────────────────

export interface PickViewPillProps {
  label: string;
  testid?: string;
  onClick: () => void;
}

export const PickViewPill: FC<PickViewPillProps> = ({ label, testid, onClick }) => (
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

// ── Live turn list ──────────────────────────────────────────────────────────

/**
 * chat-message-actions-timestamps — the per-message footer (`MessageActions`)
 * is `opacity: 0` by default; on hover-capable devices the turn wrapper fades it
 * in on hover / keyboard focus-within. Touch devices show it persistently
 * (handled inside `MessageActions` via `@media (hover: none)`). Space is always
 * reserved, so revealing it never shifts the transcript.
 */
const revealFooterOnHoverSx = {
  "@media (hover: hover)": {
    "&:hover [data-testid='message-actions'], &:focus-within [data-testid='message-actions']": {
      opacity: 1,
    },
  },
} as const;

/**
 * The live ad-hoc turn list — user/assistant bubbles + the answer-source
 * footer (CiteChips + SuggestedActionChips) + propose-card + the "thinking"
 * indicator. ONE definition for the single flow; testids are the unprefixed
 * `chat-live-*` set. `role` (the auth axis, 2026-05-30-widget-role-access) is
 * forwarded to the child widgets that require it. Returns `null` when there's
 * nothing live to show.
 */
export function LiveTurnList({
  liveTurns,
  sending,
  thinking,
  role,
  onSuggestedAction,
}: {
  liveTurns: LiveTurn[];
  sending: boolean;
  /**
   * simulated-agent-narration — drives the bottom "thinking" indicator. A real
   * in-flight turn OR scripted agent narration being revealed. Defaults to
   * `sending` (back-compat). `sending` still gates pin-streaming below.
   */
  thinking?: boolean;
  role: WidgetRole;
  onSuggestedAction: (action: ChatSuggestedAction, citations?: Citation[]) => void;
}) {
  const showThinking = thinking ?? sending;
  if (liveTurns.length === 0 && !showThinking) return null;
  return (
    <Stack spacing={1} sx={{ mt: 0.5 }}>
      {liveTurns.map((turn, idx) =>
        turn.role === "user" ? (
          <Stack key={turn.id} spacing={0.25} sx={revealFooterOnHoverSx}>
            <UserBubble testid="chat-live-user">{turn.content}</UserBubble>
            <MessageActions role="user" text={turn.content} timestamp={turn.timestamp} />
          </Stack>
        ) : (
          (() => {
            // standardized-viewer-control T8 — partition the offered actions into
            // inline anchors vs. pills with the SAME walk the Markdown render uses
            // (`consumedAnchorKeys`), so the two agree by construction and a
            // not-found / no-anchor / non-navigation action always falls back to a
            // pill (never lost). Only `tool:`-keyed navigation offers with an
            // `anchor` are inline-eligible; mutate + UI-driven actions stay pills.
            const anchorRules = (turn.suggestedActions ?? [])
              .filter((a) => a.key.startsWith("tool:") && typeof a.anchor === "string" && a.anchor.length > 0)
              .map((a) => ({ key: a.key, phrase: a.anchor as string }));
            const placedKeys = anchorRules.length > 0 ? consumedAnchorKeys(turn.content, anchorRules) : new Set<string>();
            const inlineActions = (turn.suggestedActions ?? []).filter((a) => placedKeys.has(a.key));
            const pillActions = (turn.suggestedActions ?? []).filter((a) => !placedKeys.has(a.key));
            const activateByKey = (key: string): void => {
              const action = inlineActions.find((a) => a.key === key);
              if (action) onSuggestedAction(action, turn.citations);
            };
            return (
          <Stack key={turn.id} spacing={1} sx={revealFooterOnHoverSx}>
            {turn.content.trim().length > 0 && (
              <BotBubble testid="chat-live-assistant">
                {/* inline-footnote-citations — pass citations so inline `[N]` tokens
                    render as footnote markers. Empty while streaming → inert `[N]`
                    text; populated on the envelope → clickable markers.
                    standardized-viewer-control T8 — `offeredActions` wrap an
                    offered navigation phrase as inline clickable prose. */}
                <Markdown
                  citations={turn.citations}
                  offeredActions={inlineActions.length > 0 ? inlineActions : undefined}
                  onAffordanceActivate={activateByKey}
                >
                  {turn.content}
                </Markdown>
              </BotBubble>
            )}
            {/* agentic-tool-loop — muted "what the agent consulted" annotation
                (e.g. "Checked GroundX docs") when a server tool ran this turn. */}
            {(turn.toolActivity?.length ?? 0) > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pl: 0.25 }}
                data-testid="chat-tool-activity"
              >
                {/* Distinct labels — the same tool consulted twice in one turn
                    shows once (the wire array keeps one entry per call). */}
                {[...new Set(turn.toolActivity!.map((a) => a.label))].join(" · ")}
              </Typography>
            )}
            {/* inline-footnote-citations — the grouped, collapsed source list
                replaces the flat wall of numbered chips; the inline `[N]` markers
                in the answer prose (above) are the per-claim affordance. */}
            {(turn.citations?.length ?? 0) > 0 && <SourceList citations={turn.citations!} />}
            {pillActions.length > 0 && (
              <Stack
                direction="row"
                alignItems="center"
                // Assistant-side, so left-aligned; cap the row at the same 85%
                // the BotBubble uses so a clipped chip's right edge lines up
                // with the answer bubbles above it instead of stretching wider.
                sx={{ columnGap: 0.75, rowGap: 0.5, flexWrap: "wrap", maxWidth: "85%" }}
              >
                <SuggestedActionChips
                  actions={pillActions}
                  role={role}
                  scope={{ type: "none" }}
                  onAction={(action) => onSuggestedAction(action, turn.citations)}
                />
              </Stack>
            )}
            {turn.proposedSchemaField && (
              <ProposeSchemaFieldCard
                proposedField={turn.proposedSchemaField}
                role={role}
                scope={{ type: "none" }}
              />
            )}
            {/* chat-message-actions-timestamps — per-message footer (copy +
                timestamp, plus the greyscale pin ONLY on a pinnable answer). */}
            {turn.content.trim().length > 0 && (
              <MessageActions
                role="assistant"
                text={turn.content}
                timestamp={turn.timestamp}
                extraActions={
                  turn.pinnable === true ? (
                    <PinToReportAction
                      role={role}
                      scope={{ type: "none" }}
                      turnId={turn.id}
                      turnText={turn.content}
                      streaming={sending && idx === liveTurns.length - 1}
                      variant="compact"
                    />
                  ) : undefined
                }
              />
            )}
          </Stack>
            );
          })()
        ),
      )}
      {showThinking &&
        (() => {
          // analyze-and-chat-ux §6.3b — an in-flight REAL turn streams
          // ThinkingEvents (status narration + provider reasoning summaries):
          // reveal them live in place of the bare dots. No events (yet, or a
          // scripted/legacy path) → the dots, unchanged. The final envelope
          // clears `thinkingEvents`, so the answer collapses over the stream.
          const inFlight = [...liveTurns].reverse().find((t) => t.role === "assistant");
          const events = inFlight?.thinkingEvents ?? [];
          return events.length > 0 ? (
            <Box data-testid="chat-thinking" sx={{ pl: 0.25 }}>
              <ThinkingStream
                notes={[]}
                scenarioKey="live-turn"
                role={role}
                scope={{ type: "none" }}
                events={events}
              />
            </Box>
          ) : (
            <BotBubble testid="chat-thinking">
              <LoadingDots aria-label="Assistant is thinking" />
            </BotBubble>
          );
        })()}
    </Stack>
  );
}

// ── Input bar ────────────────────────────────────────────────────────────────

interface LiveChatInputBarProps {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * The single chat input bar. Posts via the engine's `send`. Carries the
 * unprefixed `chat-live-input` / `chat-live-send` testids.
 */
export const LiveChatInputBar: FC<LiveChatInputBarProps> = ({ onSend, disabled }) => {
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
      data-testid="chat-live-input"
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
        placeholder="Ask about your documents…"
        disabled={disabled}
        sx={{ flex: 1, color: NAVY, fontSize: FONT_SIZE_CAPTION }}
        inputProps={{ id: "chat-live-input-field", name: "chatInput", "aria-label": "Chat input" }}
      />
      <IconButton
        type="submit"
        size="small"
        disabled={disabled}
        data-testid="chat-live-send"
        aria-label="Send"
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
