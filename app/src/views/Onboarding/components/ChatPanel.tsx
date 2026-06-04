/**
 * ChatPanel — the left pane of the split. Hosts the conversation, the "thinking"
 * notes streamed during Understand (F2), the Done summary, and the view chips
 * that open an Extract (F3) category. Always present in some form (rail / sheet
 * / puck); here it's the desktop rail.
 *
 * The question input is a disabled shell in this slice — live streaming and
 * pin-to-report land in F4/F5.
 */

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { ReactNode } from "react";

import { BORDER, BORDER_RADIUS_2X, BORDER_RADIUS_PILL, CYAN, GREEN, INPUT_BORDER, MUTED_ON_LIGHT, NAVY, TINT, WHITE } from "@/constants";
import { GxPill } from "@/shared/components/GxPill";

import { CATEGORY_ORDER, UNDERSTAND_NOTES, UNDERSTAND_SUMMARY, UTILITY_BILL_CATEGORIES } from "../flow/extractionData";
import { FieldCategoryId, FlowPhase, SampleProject } from "../flow/flowTypes";

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

const UserBubble = ({ children }: { children: ReactNode }) => (
  <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="flex-start">
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
      {children}
    </Box>
    <Avatar who="U" />
  </Stack>
);

const AssistantBubble = ({ children }: { children: ReactNode }) => (
  <Stack direction="row" spacing={1} alignItems="flex-start">
    <Avatar who="G" />
    <Box
      sx={{ maxWidth: "88%", px: 1.5, py: 1, borderRadius: BORDER_RADIUS_2X, backgroundColor: alpha(GREEN, 0.16), color: NAVY, fontSize: 14 }}
    >
      {children}
    </Box>
  </Stack>
);

const ThinkingNotes = () => (
  <Stack direction="row" spacing={1} alignItems="flex-start">
    <Avatar who="G" />
    <Box sx={{ maxWidth: "88%", px: 1.5, py: 1, borderRadius: BORDER_RADIUS_2X, backgroundColor: TINT }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: MUTED_ON_LIGHT, mb: 0.75 }}>thinking…</Typography>
      <Stack spacing={0.75}>
        {UNDERSTAND_NOTES.map((note) => (
          <Typography key={note.title} sx={{ fontSize: 13, color: NAVY, lineHeight: 1.5 }}>
            <Box component="span" sx={{ fontWeight: 700 }}>
              {note.title}
            </Box>{" "}
            — {note.body}
          </Typography>
        ))}
      </Stack>
    </Box>
  </Stack>
);

const ViewChips = ({
  label,
  onPick,
  extra,
}: {
  label: string;
  onPick?: (view: FieldCategoryId) => void;
  extra?: string[];
}) => (
  <Box sx={{ pl: 4 }}>
    <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT, mb: 0.5 }}>{label}</Typography>
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
      {CATEGORY_ORDER.map((id) => (
        <GxPill key={id} variant={id === "meters" ? "success" : "default"} onClick={() => onPick?.(id)}>
          {UTILITY_BILL_CATEGORIES[id].label}
        </GxPill>
      ))}
      {/* TODO(F3a): "compare two meters" and "edit schema" open later frames. */}
      {extra?.map((chip) => (
        <GxPill key={chip} onClick={() => undefined}>
          {chip}
        </GxPill>
      ))}
    </Stack>
  </Box>
);

export interface ChatPanelProps {
  sample: SampleProject | null;
  phase: FlowPhase;
  onFocusChat?: () => void;
  /** Open an Extract category from a view chip. */
  onPickView?: (view: FieldCategoryId) => void;
}

export function ChatPanel({ sample, phase, onFocusChat, onPickView }: ChatPanelProps) {
  const isUtilityBill = sample?.id === "utility-bill";
  const docName = sample ? `${sample.name.toLowerCase().replace(/\s+/g, "-")}.pdf` : "document.pdf";
  const understanding = phase === "understand";

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
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
        <Stack spacing={1.5}>
          {sample ? (
            <>
              <UserBubble>{sample.name}</UserBubble>
              <AssistantBubble>Reading {docName} now.</AssistantBubble>

              {isUtilityBill ? (
                understanding ? (
                  <>
                    <ThinkingNotes />
                    <AssistantBubble>Done. {UNDERSTAND_SUMMARY}</AssistantBubble>
                    <ViewChips label="Pick a view:" onPick={onPickView} />
                  </>
                ) : (
                  <>
                    <Typography sx={{ pl: 4, fontSize: 12, color: MUTED_ON_LIGHT }}>
                      ▾ thinking notes (closing the comprehension gap…)
                    </Typography>
                    <AssistantBubble>Done. {UNDERSTAND_SUMMARY}</AssistantBubble>
                    <AssistantBubble>
                      8 meters · 10 fields each. Hover a field on the right and I&apos;ll light up its rows on the doc.
                    </AssistantBubble>
                    <ViewChips label="Or another view:" onPick={onPickView} extra={["compare two meters", "edit schema"]} />
                  </>
                )
              ) : (
                <AssistantBubble>
                  I&apos;ll surface the fields I find across {sample.docLabel}, then you can ask questions across the set.
                </AssistantBubble>
              )}
            </>
          ) : null}
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
