/**
 * P6a · Book a call — a placeholder for the Calendly embed shown in the canvas
 * after the user chooses "book a call" from the gate. Static date/time picker;
 * the real flow would embed Calendly via iframe. The form step (name / email /
 * notes) reuses this canvas frame and is a follow-up.
 */

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  CORAL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GRAY,
  LETTER_SPACING_LABEL,
  MAIN_BACKGROUND,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const SLOTS = ["9:00am", "9:30am", "10:00am", "10:30am", "11:00am", "11:30am", "1:00pm", "1:30pm", "2:00pm"];
const SELECTED_DATE = 18;
const TODAY = 11;
const SELECTED_SLOT = "1:30pm";

export const CalendlyCanvas = ({ onClose }: { onClose?: () => void }) => (
  <Box sx={{ flex: 1, minHeight: 0, p: 2.5, backgroundColor: MAIN_BACKGROUND, overflow: "auto" }}>
    <Box sx={{ backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: BORDER_RADIUS, overflow: "hidden" }}>
      {/* Window chrome */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, backgroundColor: NAVY, color: WHITE }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Calendly</Typography>
        <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: alpha(WHITE, 0.7) }}>· embedded in groundx.ai</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: alpha(WHITE, 0.7) }}>cookies · privacy</Typography>
        <IconButton
          aria-label="Close booking"
          onClick={onClose}
          disableRipple
          sx={{ width: 24, height: 24, backgroundColor: "transparent", color: WHITE, "&:hover": { backgroundColor: alpha(WHITE, 0.15) } }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      <Box sx={{ display: "flex", flexWrap: "wrap" }}>
        {/* Host / meeting */}
        <Box sx={{ width: { xs: "100%", md: 220 }, p: 2.5, borderRight: { md: `1px solid ${BORDER}` } }}>
          <Typography sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: MUTED_ON_LIGHT }}>
            GROUNDX
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Box
              sx={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: CORAL, color: WHITE, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              SE
            </Box>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>Solutions Engineer · round-robin</Typography>
          </Stack>
          <Typography sx={{ mt: 1.5, fontSize: 16, fontWeight: 700, color: NAVY }}>GroundX intro · 15 min</Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>⏱ 15 min</Typography>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>📹 Web conf. link on confirm</Typography>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>🌐 Your timezone</Typography>
          </Stack>
          <Typography sx={{ mt: 1.5, fontSize: 12, color: MUTED_ON_LIGHT, lineHeight: 1.5 }}>
            A 15-minute working session with a GroundX engineer to walk through your documents and where GroundX fits.
          </Typography>
        </Box>

        {/* Calendar */}
        <Box sx={{ flex: 1, minWidth: 240, p: 2.5, borderRight: { md: `1px solid ${BORDER}` } }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: NAVY, mb: 1.5 }}>Select a Date & Time</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: NAVY, mb: 1 }}>November 2026</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
            {DAYS.map((d, i) => (
              <Typography key={i} sx={{ fontSize: 10, color: MUTED_ON_LIGHT, textAlign: "center" }}>
                {d}
              </Typography>
            ))}
            {Array.from({ length: 30 }, (_, idx) => idx + 1).map((day) => {
              const selected = day === SELECTED_DATE;
              return (
                <Box
                  key={day}
                  aria-label={`November ${day}`}
                  sx={{
                    aspectRatio: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: selected ? 700 : 400,
                    borderRadius: "50%",
                    color: selected ? WHITE : NAVY,
                    backgroundColor: selected ? NAVY : alpha(NAVY, 0.04),
                    position: "relative",
                  }}
                >
                  {day}
                  {day === TODAY ? (
                    <Box sx={{ position: "absolute", bottom: 3, width: 3, height: 3, borderRadius: "50%", backgroundColor: CORAL }} />
                  ) : null}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Time slots */}
        <Box sx={{ width: { xs: "100%", md: 180 }, p: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Wednesday, November 18</Typography>
          <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, mb: 1 }}>13 slots available</Typography>
          <Stack spacing={0.75}>
            {SLOTS.map((slot) =>
              slot === SELECTED_SLOT ? (
                <Stack key={slot} direction="row" spacing={0.75}>
                  <Box
                    sx={{ flex: 1, py: 0.75, textAlign: "center", fontSize: 13, fontWeight: 600, color: NAVY, border: `1px solid ${NAVY}`, borderRadius: BORDER_RADIUS }}
                  >
                    {slot}
                  </Box>
                  <CommonSubmitButton isUppercase={false} sx={{ fontSize: 12, px: 2 }}>
                    Next →
                  </CommonSubmitButton>
                </Stack>
              ) : (
                <Box
                  key={slot}
                  sx={{ py: 0.75, textAlign: "center", fontSize: 13, fontWeight: 600, color: NAVY, border: `1px solid ${GRAY}`, borderRadius: BORDER_RADIUS }}
                >
                  {slot}
                </Box>
              ),
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  </Box>
);

export default CalendlyCanvas;
