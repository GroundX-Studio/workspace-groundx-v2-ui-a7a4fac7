/**
 * MessageActions — the per-message footer row (chat-message-actions-timestamps).
 *
 * Lays out `[Copy] [extraActions…] [timestamp]` beneath a chat bubble, aligned
 * to the message's side (assistant left, user right). Greyscale throughout.
 *
 * Reveal is a collaboration with the turn wrapper (in `chatPrimitives`): the
 * footer is `opacity: 0` by default and the wrapper reveals it on
 * `:hover` / `:focus-within` (hover-capable devices only). On touch
 * (`@media (hover: none)`) it is persistently visible. The row's vertical space
 * is always reserved (opacity toggle, not `display`) so revealing it never
 * shifts the transcript. The wrapper targets `[data-testid="message-actions"]`.
 *
 * Under `components/conversation/` (not a widget slot) → widget contract
 * (README / mode prop / `.tools.ts`) does not apply; `no-hardcoded-styles` does.
 */

import Box from "@mui/material/Box";
import { type FC, type ReactNode } from "react";

import { FONT_SIZE_LABEL, MUTED_ON_LIGHT } from "@/constants";

import { CopyButton } from "../CopyButton/CopyButton";
import { formatMessageTime } from "./formatMessageTime";

export interface MessageActionsProps {
  /** Message role — drives side alignment (assistant left, user right). */
  role: "user" | "assistant";
  /** The message text (copied by the embedded CopyButton). */
  text: string;
  /** Send time (epoch ms) → the footer timestamp. */
  timestamp: number;
  /**
   * Extra action controls placed between Copy and the timestamp — e.g. the
   * compact `PinToReportAction` for a pinnable assistant turn. Omit for turns
   * with no extra action (user turns, non-pinnable assistant turns).
   */
  extraActions?: ReactNode;
}

export const MessageActions: FC<MessageActionsProps> = ({ role, text, timestamp, extraActions }) => (
  <Box
    data-testid="message-actions"
    data-role={role}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.5,
      mt: 0.25,
      pl: 0.25,
      justifyContent: role === "user" ? "flex-end" : "flex-start",
      color: MUTED_ON_LIGHT,
      // Reveal: hidden on hover-capable devices (the turn wrapper fades it in on
      // hover/focus), persistent on touch. Space stays reserved either way.
      opacity: 0,
      transition: "opacity 120ms ease",
      "@media (hover: none)": { opacity: 1 },
    }}
  >
    <CopyButton text={text} />
    {extraActions}
    <Box component="span" sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, lineHeight: 1 }}>
      {formatMessageTime(timestamp, Date.now())}
    </Box>
  </Box>
);

export default MessageActions;
