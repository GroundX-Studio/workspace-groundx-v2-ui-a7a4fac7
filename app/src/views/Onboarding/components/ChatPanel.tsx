/**
 * ChatPanel — the left pane of the split. Hosts the conversation, citation
 * chips, and the question input. Always present in some form (rail / sheet /
 * puck); here it's the desktop rail.
 *
 * Foundation slice: a seeded placeholder conversation per sample plus a working
 * input shell. Real streaming, citations-to-canvas linking, and pin-to-report
 * land in later frames (F3–F5).
 */

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BLUE,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  CYAN,
  GREEN,
  INPUT_BORDER,
  MUTED_ON_LIGHT,
  NAVY,
  TINT,
  WHITE,
} from "@/constants";

import { SampleProject } from "../flow/flowTypes";

interface SeedMessage {
  role: "user" | "assistant";
  text: string;
  citation?: string;
}

const seedConversation = (sample: SampleProject | null): SeedMessage[] => {
  if (!sample) return [];
  if (sample.id === "utility-bill") {
    return [
      { role: "user", text: "Extract every charge by meter" },
      {
        role: "assistant",
        text: "56 charges, 8 meters. Highest demand: Meter #3 ($412.80).",
        citation: "[1] utility-bill p.2",
      },
    ];
  }
  return [
    { role: "assistant", text: `Reading your ${sample.name} (${sample.docLabel}) now — about 6 seconds.` },
    {
      role: "assistant",
      text: "I'll surface the fields I find, then you can ask questions across the set.",
    },
  ];
};

const Avatar = ({ who }: { who: "G" | "U" }) => (
  <Box
    aria-hidden="true"
    sx={{
      width: 24,
      height: 24,
      flexShrink: 0,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 800,
      backgroundColor: who === "G" ? GREEN : CYAN,
      color: NAVY,
    }}
  >
    {who}
  </Box>
);

const CitationChip = ({ label }: { label: string }) => (
  <Box
    sx={{
      display: "inline-flex",
      alignItems: "center",
      mt: 0.75,
      px: 1,
      py: 0.25,
      borderRadius: BORDER_RADIUS_PILL,
      backgroundColor: alpha(BLUE, 0.12),
      color: NAVY,
      fontSize: 11,
      fontWeight: 600,
      border: `1px solid ${alpha(BLUE, 0.3)}`,
    }}
  >
    {label}
  </Box>
);

export interface ChatPanelProps {
  sample: SampleProject | null;
  onFocusChat?: () => void;
}

export function ChatPanel({ sample, onFocusChat }: ChatPanelProps) {
  const messages = seedConversation(sample);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: WHITE, minWidth: 0 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}` }}
      >
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
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
        <Stack spacing={1.5}>
          {messages.map((message, idx) =>
            message.role === "user" ? (
              <Stack key={idx} direction="row" spacing={1} justifyContent="flex-end" alignItems="flex-start">
                <Box
                  sx={{
                    maxWidth: "80%",
                    px: 1.5,
                    py: 1,
                    borderRadius: BORDER_RADIUS_2X,
                    border: `1px solid ${INPUT_BORDER}`,
                    backgroundColor: WHITE,
                    color: NAVY,
                    fontSize: 14,
                  }}
                >
                  {message.text}
                </Box>
                <Avatar who="U" />
              </Stack>
            ) : (
              <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                <Avatar who="G" />
                <Box
                  sx={{
                    maxWidth: "85%",
                    px: 1.5,
                    py: 1,
                    borderRadius: BORDER_RADIUS_2X,
                    backgroundColor: alpha(GREEN, 0.16),
                    color: NAVY,
                    fontSize: 14,
                  }}
                >
                  {message.text}
                  {message.citation ? (
                    <Box>
                      <CitationChip label={message.citation} />
                    </Box>
                  ) : null}
                </Box>
              </Stack>
            ),
          )}
        </Stack>
      </Box>

      {/* Input */}
      <Box sx={{ px: 2, py: 1.5, borderTop: `1px solid ${BORDER}` }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: BORDER_RADIUS_PILL,
            border: `1px solid ${INPUT_BORDER}`,
            backgroundColor: WHITE,
          }}
        >
          <InputBase
            placeholder="next question…"
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
