/**
 * ChatPanel — the left pane of the split. A thin orchestrator: header, a body
 * that delegates the turns to a per-frame chat component, and the question input
 * shell. The messages region is an aria-live polite region so streamed turns are
 * announced to screen readers.
 */

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import { BORDER, BORDER_RADIUS_PILL, GREEN, INPUT_BORDER, MUTED_ON_LIGHT, NAVY, TINT, WHITE } from "@/constants";

import { AnswerSegment } from "../flow/extractionData";
import { FieldCategoryId, Frame, SampleProject } from "../flow/flowTypes";
import { Avatar, AssistantBubble, UserBubble } from "./chat/parts";
import { BookingChat, GateChat } from "./chat/GateChat";
import { ComingSoonChat, CompareChat, ExtractChat, IntegrateChat, PeekChat, UnderstandChat } from "./chat/phaseChats";

export interface ChatPanelProps {
  sample: SampleProject | null;
  frame: Frame;
  /** Whether the picked sample has wired-up data. */
  wired: boolean;
  onFocusChat?: () => void;
  onPickView?: (view: FieldCategoryId) => void;
  onCompare?: () => void;
  /** Opened field's value/citation (peek, P4). */
  selectedValue?: string;
  selectedCitation?: string;
  /** Comparison Q&A (compare, P5), sourced from the sample's data. */
  comparisonQuestion?: string;
  comparisonAnswer?: AnswerSegment[];
  /** P6 gate overlay / P6a booking. */
  gateOpen?: boolean;
  booking?: boolean;
  onCloseGate?: () => void;
  onBookCall?: () => void;
  onBackToGate?: () => void;
}

export function ChatPanel({
  sample,
  frame,
  wired,
  onFocusChat,
  onPickView,
  onCompare,
  selectedValue,
  selectedCitation,
  comparisonQuestion,
  comparisonAnswer,
  gateOpen,
  booking,
  onCloseGate,
  onBookCall,
  onBackToGate,
}: ChatPanelProps) {
  const docName = sample ? `${sample.name.toLowerCase().replace(/\s+/g, "-")}.pdf` : "document.pdf";

  const renderTurns = () => {
    if (!wired) return <ComingSoonChat sampleName={sample!.name} />;
    if (frame === "extract") return <ExtractChat onPickView={onPickView} onCompare={onCompare} />;
    if (frame === "peek") return <PeekChat value={selectedValue} citation={selectedCitation} />;
    if (frame === "compare") {
      return <CompareChat question={comparisonQuestion ?? ""} answer={comparisonAnswer ?? []} onPickView={onPickView} />;
    }
    return <UnderstandChat onPickView={onPickView} />;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: WHITE, minWidth: 0 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
        <Avatar who="G" />
        <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 15 }}>Conversation</Typography>
        <IconButton
          aria-label="Focus chat"
          onClick={onFocusChat}
          disableRipple
          sx={{
            width: 30,
            height: 30,
            backgroundColor: "transparent",
            border: `1px solid ${INPUT_BORDER}`,
            color: MUTED_ON_LIGHT,
            "&:hover": { backgroundColor: TINT },
          }}
        >
          <OpenInFullIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Stack>

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }} aria-live="polite" aria-label="Conversation messages">
        <Stack spacing={1.5}>
          {!sample ? null : booking ? (
            <BookingChat onBackToGate={onBackToGate} />
          ) : gateOpen ? (
            <GateChat onClose={onCloseGate} onBookCall={onBookCall} />
          ) : frame === "integrate" ? (
            <IntegrateChat />
          ) : (
            <>
              <UserBubble>{sample.name}</UserBubble>
              <AssistantBubble>Reading {docName} now.</AssistantBubble>
              {renderTurns()}
            </>
          )}
        </Stack>
      </Box>

      {/* Input */}
      <Box sx={{ px: 2, py: 1.5, borderTop: `1px solid ${BORDER}` }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 1.5, py: 0.5, borderRadius: BORDER_RADIUS_PILL, border: `1px solid ${INPUT_BORDER}`, backgroundColor: WHITE }}
        >
          <InputBase
            placeholder="ask anything…"
            disabled
            sx={{ flex: 1, fontSize: 14, color: NAVY }}
            inputProps={{ "aria-label": "Ask a question" }}
          />
          <IconButton
            aria-label="Send"
            disableRipple
            disabled
            sx={{
              width: 32,
              height: 32,
              backgroundColor: GREEN,
              color: NAVY,
              "&:hover": { backgroundColor: GREEN },
              "&.Mui-disabled": { backgroundColor: alpha(GREEN, 0.5), color: NAVY },
            }}
          >
            <ArrowUpwardIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}

export default ChatPanel;
