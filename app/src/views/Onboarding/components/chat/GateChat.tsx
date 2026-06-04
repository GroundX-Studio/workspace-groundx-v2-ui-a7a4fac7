/**
 * P6 gate + P6a booking, rendered inline in the chat (never modal). The gate
 * offers email / SSO / book-a-call; booking shows the call context while the
 * canvas shows the Calendly embed. Email + SSO are placeholders pending the
 * P7 sign-in completion.
 */

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  INPUT_BORDER,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";

import { AssistantBubble, EarlierTurns, UserBubble } from "./parts";

const WHAT_YOU_GET = [
  "All 10 fields per meter (3 currently locked each)",
  "CSV / JSON export of extractions",
  "Save this conversation + replay against new docs",
  "Upload your own docs (sample stays free either way)",
];

const BookACall = ({ onBookCall }: { onBookCall?: () => void }) => (
  <ButtonBase
    onClick={onBookCall}
    disableRipple
    aria-label="Book a call"
    sx={{
      width: "100%",
      display: "block",
      textAlign: "left",
      border: `1px solid ${GREEN}`,
      borderRadius: BORDER_RADIUS,
      p: 1.25,
      backgroundColor: alpha(GREEN, 0.08),
      "&:hover": { backgroundColor: alpha(GREEN, 0.16) },
    }}
  >
    <Typography sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: NAVY }}>
      NEED HELP?
    </Typography>
    <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Book a call →</Typography>
    <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>30 min with an engineer</Typography>
  </ButtonBase>
);

export const GateChat = ({ onClose, onBookCall }: { onClose?: () => void; onBookCall?: () => void }) => (
  <>
    <EarlierTurns label="earlier turns (reading · meters · 2 questions)" />
    <UserBubble>unlock everything</UserBubble>
    <AssistantBubble>
      <Box component="span" sx={{ fontWeight: 700 }}>
        One quick step.
      </Box>{" "}
      Sign in to unlock the full demo.
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: NAVY, mt: 1 }}>What you&apos;ll get:</Typography>
      <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2 }}>
        {WHAT_YOU_GET.map((item) => (
          <Typography key={item} component="li" sx={{ fontSize: 13, color: NAVY }}>
            {item}
          </Typography>
        ))}
      </Stack>
      <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT, mt: 0.75 }}>
        <Box component="span" sx={{ fontWeight: 700, color: NAVY }}>
          Free tier:
        </Box>{" "}
        100 pages parsed. No credit card.
      </Typography>
    </AssistantBubble>

    {/* CONTINUE WITH card */}
    <Box sx={{ ml: 4, border: `1px solid ${BORDER}`, borderRadius: BORDER_RADIUS, p: 1.5 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: NAVY }}>
          CONTINUE WITH…
        </Typography>
        <IconButton
          aria-label="Dismiss sign-in"
          onClick={onClose}
          disableRipple
          sx={{ width: 22, height: 22, backgroundColor: "transparent", color: MUTED_ON_LIGHT }}
        >
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Stack>
      <Box sx={{ px: 1.25, py: 0.75, borderRadius: BORDER_RADIUS, border: `1px solid ${INPUT_BORDER}`, mb: 1 }}>
        {/* TODO(P7): wire magic-link sign-in. */}
        <InputBase placeholder="name@company.com" disabled sx={{ width: "100%", fontSize: 13, color: NAVY }} inputProps={{ "aria-label": "Work email" }} />
      </Box>
      <Stack direction="row" spacing={1}>
        <CommonSubmitButton fullWidth isUppercase={false} sx={{ fontSize: 13 }}>
          → send magic link
        </CommonSubmitButton>
        <ButtonBase
          disableRipple
          aria-label="Sign in with SSO"
          sx={{ px: 1.5, borderRadius: BORDER_RADIUS_PILL, border: `1px solid ${INPUT_BORDER}`, fontSize: 12, fontWeight: 700, color: NAVY }}
        >
          SSO
        </ButtonBase>
      </Stack>
      <Typography sx={{ fontSize: 11, color: MUTED_ON_LIGHT, textAlign: "center", my: 1 }}>or, not ready?</Typography>
      <BookACall onBookCall={onBookCall} />
    </Box>

    <AssistantBubble>
      Or keep exploring — what you&apos;ve done stays free. The chat, the extractions, and the citations from this session
      all live in the browser.
    </AssistantBubble>
  </>
);

export const BookingChat = ({ onBackToGate }: { onBackToGate?: () => void }) => (
  <>
    <EarlierTurns label="earlier turns (reading · meters · gate offered)" />
    <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 4 }}>
      <ButtonBase
        onClick={onBackToGate}
        disableRipple
        sx={{ fontSize: 12, fontWeight: 600, color: NAVY, "&:hover": { textDecoration: "underline" } }}
      >
        ← back to sign-in
      </ButtonBase>
      <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>step 1 of 2</Typography>
    </Stack>
    <AssistantBubble>
      <Box component="span" sx={{ fontWeight: 700 }}>
        Book a 15-min engineer call.
      </Box>{" "}
      Pick a time on the right. We&apos;ll walk your docs and where GroundX fits — no slides, no pitch.
    </AssistantBubble>
    <Typography sx={{ pl: 4, fontSize: 12, color: MUTED_ON_LIGHT }}>
      Booking a call doesn&apos;t sign you in — you can still send a magic link after.
    </Typography>
  </>
);
