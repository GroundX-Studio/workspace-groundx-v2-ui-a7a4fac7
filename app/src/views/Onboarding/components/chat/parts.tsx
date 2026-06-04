/** Shared chat primitives: avatars, message bubbles, the collapsed earlier-turns
 *  line, the streamed "thinking" notes, and the view-switch chip row. */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { ReactNode } from "react";

import { BORDER_RADIUS_2X, CYAN, GREEN, INPUT_BORDER, MUTED_ON_LIGHT, NAVY, TINT, WHITE } from "@/constants";
import { GxPill } from "@/shared/components/GxPill";

import { CATEGORY_ORDER, UNDERSTAND_NOTES } from "../../flow/extractionData";
import { FieldCategoryId } from "../../flow/flowTypes";

export const Avatar = ({ who }: { who: "G" | "U" }) => (
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

export const UserBubble = ({ children }: { children: ReactNode }) => (
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

export const AssistantBubble = ({ children }: { children: ReactNode }) => (
  <Stack direction="row" spacing={1} alignItems="flex-start">
    <Avatar who="G" />
    <Box
      sx={{ maxWidth: "88%", px: 1.5, py: 1, borderRadius: BORDER_RADIUS_2X, backgroundColor: alpha(GREEN, 0.16), color: NAVY, fontSize: 14 }}
    >
      {children}
    </Box>
  </Stack>
);

export const EarlierTurns = ({ label }: { label: string }) => (
  <Typography sx={{ pl: 4, fontSize: 12, color: MUTED_ON_LIGHT }}>▾ {label}</Typography>
);

export const ThinkingNotes = () => (
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

export const ViewChips = ({
  label,
  onPick,
  extra,
}: {
  label: string;
  onPick?: (view: FieldCategoryId) => void;
  extra?: { label: string; onClick?: () => void }[];
}) => (
  <Box sx={{ pl: 4 }}>
    <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT, mb: 0.5 }}>{label}</Typography>
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
      {CATEGORY_ORDER.map((id) => (
        <GxPill key={id} variant={id === "meters" ? "success" : "default"} onClick={() => onPick?.(id)}>
          {id}
        </GxPill>
      ))}
      {extra?.map((chip) => (
        <GxPill key={chip.label} onClick={chip.onClick ?? (() => undefined)}>
          {chip.label}
        </GxPill>
      ))}
    </Stack>
  </Box>
);
