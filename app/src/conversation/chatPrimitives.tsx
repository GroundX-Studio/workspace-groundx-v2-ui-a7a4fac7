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
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { AnswerActions } from "@/components/conversation/AnswerActions/AnswerActions";
import { PinToReportAction } from "@/components/chat-widgets/PinToReportAction/PinToReportAction";
import { ProposeSchemaFieldCard } from "@/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard";
import { SuggestedActionChips } from "@/components/chat-widgets/SuggestedActionChips/SuggestedActionChips";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { Markdown } from "@/components/primitives/Markdown/Markdown";
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
  /**
   * Optional second testid for back-compat with pre-rebuild e2e specs.
   * Rendered on a transparent wrapper so both names resolve via getByTestId.
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

export const PickViewPill: FC<PickViewPillProps> = (props) => {
  if (props.legacyTestid) {
    return (
      <Box data-testid={props.legacyTestid} onClick={props.onClick} sx={{ display: "inline-block" }}>
        <PickViewPillInner {...props} />
      </Box>
    );
  }
  return <PickViewPillInner {...props} />;
};

// ── Live turn list ──────────────────────────────────────────────────────────

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
  role,
  onSuggestedAction,
}: {
  liveTurns: LiveTurn[];
  sending: boolean;
  role: WidgetRole;
  onSuggestedAction: (action: ChatSuggestedAction, citations?: Citation[]) => void;
}) {
  if (liveTurns.length === 0 && !sending) return null;
  return (
    <Stack spacing={1} sx={{ mt: 0.5 }}>
      {liveTurns.map((turn, idx) =>
        turn.role === "user" ? (
          <UserBubble key={turn.id} testid="chat-live-user">
            {turn.content}
          </UserBubble>
        ) : (
          <Stack key={turn.id} spacing={1}>
            {turn.content.trim().length > 0 && (
              <BotBubble testid="chat-live-assistant">
                <Markdown>{turn.content}</Markdown>
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
            {((turn.citations?.length ?? 0) > 0 || (turn.suggestedActions?.length ?? 0) > 0) && (
              <Stack
                direction="row"
                alignItems="center"
                sx={{ pl: 0.25, columnGap: 0.75, rowGap: 0.5, flexWrap: "wrap" }}
              >
                {turn.citations?.map((c, idx) => (
                  <CiteChip key={`${turn.id}-cite-${idx}`} citation={c} index={idx + 1} />
                ))}
                {turn.suggestedActions && turn.suggestedActions.length > 0 && (
                  <SuggestedActionChips
                    actions={turn.suggestedActions}
                    role={role}
                    scope={{ type: "none" }}
                    onAction={(action) => onSuggestedAction(action, turn.citations)}
                  />
                )}
              </Stack>
            )}
            {turn.proposedSchemaField && (
              <ProposeSchemaFieldCard
                proposedField={turn.proposedSchemaField}
                role={role}
                scope={{ type: "none" }}
              />
            )}
            {turn.pinnable === true && turn.content.trim().length > 0 && (
              <AnswerActions
                actions={[
                  {
                    id: "pin",
                    label: "Pin to report",
                    icon: "📌",
                    node: (
                      <PinToReportAction
                        role={role}
                        scope={{ type: "none" }}
                        turnId={turn.id}
                        turnText={turn.content}
                        streaming={sending && idx === liveTurns.length - 1}
                        variant="compact"
                      />
                    ),
                  },
                ]}
              />
            )}
          </Stack>
        ),
      )}
      {sending && (
        <BotBubble testid="chat-thinking">
          <LoadingDots aria-label="Assistant is thinking" />
        </BotBubble>
      )}
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
