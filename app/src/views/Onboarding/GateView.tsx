import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useState, type FC, type FormEvent } from "react";

import { BODY_TEXT, BORDER, FONT_WEIGHT_LABEL, GREEN, NAVY, WHITE } from "@/constants";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import type { GateTrigger } from "@/types/onboarding";

const PREAMBLE: Record<GateTrigger, string> = {
  save: "Save your work to come back to it. One quick step.",
  export: "Export uses your account so it's tied to you. One quick step.",
  byo: "Bring your own data. Sign in to start uploading.",
  threshold: "You've reached the free-tier ceiling — pages stay free after sign-in.",
};

/**
 * F6 GateView — three options gate. Never modal. Lives inline in the chat
 * column. Email is the primary commit path (magic link); engineer call is
 * an alternative commit path; SSO is hidden unless `SSO_ENABLED` is true.
 */
export const GateView: FC = () => {
  const { state, dismissGate, commitGate } = useOnboardingSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email.trim()) return;
      setSent(true);
      // In production, the form posts to a magic-link endpoint and shows a
      // "check your inbox" state. The commit transitions to signed-in only
      // after the user clicks the magic link.
      commitGate("magic-link");
    },
    [email, commitGate]
  );

  const handleBookCall = useCallback(() => {
    // In production this opens a Calendly widget (CALENDLY_URL env).
    // For Phase 2 we mark the gate committed so the flow can continue.
    commitGate("engineer-call");
  }, [commitGate]);

  // Only render when the gate is actually open.
  if (state.gate.status !== "open" && state.gate.status !== "committed") return null;

  const trigger: GateTrigger = state.gate.status === "open" ? state.gate.trigger : "save";

  if (state.gate.status === "committed") {
    return (
      <Card sx={{ p: 3, borderRadius: 3 }} aria-label="Gate committed">
        <Typography variant="overline" sx={{ color: GREEN, fontWeight: FONT_WEIGHT_LABEL }}>
          THANKS — CHECK YOUR EMAIL
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          {state.gate.method === "engineer-call"
            ? "You'll get a Calendly confirmation shortly. Until then, keep exploring — your work is preserved."
            : "We sent a magic link. Click it on this device to keep going. Your sample work is preserved."}
        </Typography>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 3, borderRadius: 3, position: "relative", maxWidth: 460 }} aria-label="Sign-in offer" data-testid="gate-card">
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="overline" sx={{ color: GREEN, fontWeight: FONT_WEIGHT_LABEL }}>
            SIGN IN
          </Typography>
          <IconButton
            size="small"
            aria-label="Close sign-in offer"
            onClick={dismissGate}
            data-testid="gate-dismiss"
            sx={{ position: "absolute", top: 8, right: 8, color: BODY_TEXT }}
          >
            ✕
          </IconButton>
        </Stack>

        <Typography variant="body1" sx={{ color: NAVY }}>
          {PREAMBLE[trigger]}
        </Typography>

        <Box component="form" onSubmit={handleEmailSubmit}>
          <Stack spacing={1}>
            <TextField
              fullWidth
              size="small"
              type="email"
              label="Email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputProps={{ "data-testid": "gate-email-input" }}
              InputProps={{
                startAdornment: <EmailOutlinedIcon sx={{ mr: 1, color: NAVY }} fontSize="small" />,
              }}
            />
            <Box
              component="button"
              type="submit"
              data-testid="gate-email-submit"
              sx={{
                p: 1,
                borderRadius: 100,
                backgroundColor: GREEN,
                color: NAVY,
                textAlign: "center",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                fontFamily: "inherit",
                fontSize: 14,
                width: "100%",
              }}
            >
              Send magic link
            </Box>
          </Stack>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, my: 0.5 }}>
          <Box sx={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          <Typography variant="caption" sx={{ color: BODY_TEXT }}>
            OR
          </Typography>
          <Box sx={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        </Box>

        <Box
          role="button"
          tabIndex={0}
          data-testid="gate-book-call"
          onClick={handleBookCall}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleBookCall();
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${GREEN}`,
            color: NAVY,
            cursor: "pointer",
            "&:hover": { backgroundColor: "rgba(161, 236, 131, 0.08)" },
          }}
        >
          <CalendarMonthOutlinedIcon fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Book a call with an engineer
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ color: BODY_TEXT, mt: 0.5 }}>
          You can keep chatting — we'll come back to this when you're ready.
        </Typography>
      </Stack>
    </Card>
  );
};
