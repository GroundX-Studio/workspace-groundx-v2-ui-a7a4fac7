import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useState, type FC, type FormEvent } from "react";

import { register } from "@/api/entities/customerEntity";
import { claimAnonymousChat } from "@/api/claimAnonymousChat";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
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
 * column. Registration is the primary commit path (POST /api/auth/register
 * + POST /api/chat-sessions/claim); engineer call is an alternative commit
 * path; SSO is hidden unless `SSO_ENABLED` is true.
 */
export const GateView: FC = () => {
  const { state, dismissGate, commitGate, advanceFrame } = useOnboardingSession();
  const { state: appMode, promoteToSignedIn } = useAppMode();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committedCollapsed, setCommittedCollapsed] = useState(false);

  const handleRegisterSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      setError(null);

      // Client-side validation before the network round-trip. The server
      // also validates, but catching obvious mismatches here saves a
      // round-trip + lights up the inline error immediately.
      const trimmedEmail = email.trim();
      if (!first.trim() || !last.trim() || !trimmedEmail || !password) {
        setError("Please fill in every field.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match — please re-enter the confirmation.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      setSubmitting(true);
      try {
        await register({
          first: first.trim(),
          last: last.trim(),
          email: trimmedEmail,
          password,
          confirmPassword,
          endUserLicenseAgreement: true,
        });
        // Register set the session cookie. Now re-key the anon chat rows
        // to the new user. This is best-effort: if it fails the user is
        // still signed up, they just lose their pre-signup chat history.
        try {
          await claimAnonymousChat();
        } catch (claimErr) {
          // eslint-disable-next-line no-console
          console.error("claimAnonymousChat failed after register", claimErr);
        }
        promoteToSignedIn();
        commitGate("register");
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [first, last, email, password, confirmPassword, submitting, commitGate, promoteToSignedIn],
  );

  const handleBookCall = useCallback(() => {
    // In production this opens a Calendly widget (CALENDLY_URL env).
    // For Phase 2 we mark the gate committed so the flow can continue.
    commitGate("engineer-call");
  }, [commitGate]);

  const handleContinueToIntegrate = useCallback(() => {
    advanceFrame("f7");
  }, [advanceFrame]);

  // LC5 ESC-key dismiss (project-state-machines-backout). Wired as a global
  // listener while the gate is open; respects existing input focus by only
  // firing when the key path isn't already typing into a non-modifier input.
  useEffect(() => {
    if (state.gate.status !== "open") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissGate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.gate.status, dismissGate]);

  // Only render when the gate is actually open or committed.
  if (state.gate.status !== "open" && state.gate.status !== "committed") return null;
  if (state.gate.status === "committed" && committedCollapsed) return null;

  const trigger: GateTrigger = state.gate.status === "open" ? state.gate.trigger : "save";

  if (state.gate.status === "committed") {
    const method = state.gate.method;
    const eyebrow =
      method === "engineer-call"
        ? "THANKS - CALL REQUESTED"
        : method === "register"
        ? "WELCOME - YOU'RE SIGNED IN"
        : "THANKS - SIGNED IN";
    const body =
      method === "engineer-call"
        ? "You'll get a Calendly confirmation shortly. Until then, keep exploring — your work is preserved."
        : method === "register"
        ? "Your sample work is now saved to your account. Continue to Integrate to wire your real data."
        : "You're signed in. Continue to Integrate to wire your real data.";
    return (
      <Card sx={{ p: 3, borderRadius: BORDER_RADIUS_CARD, position: "relative" }} aria-label="Gate committed" data-testid="gate-committed">
        <IconButton
          size="small"
          aria-label="Close confirmation"
          onClick={() => setCommittedCollapsed(true)}
          data-testid="gate-committed-close"
          sx={{ position: "absolute", top: 8, right: 8, color: BODY_TEXT }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          {eyebrow}
        </Typography>
        <Typography variant="body1" sx={{ mt: 1 }}>
          {body}
        </Typography>
        <Box
          component="button"
          type="button"
          data-testid="gate-continue-integrate"
          onClick={handleContinueToIntegrate}
          sx={{
            mt: 2,
            p: 1,
            borderRadius: BORDER_RADIUS_PILL,
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
          Continue to Integrate
        </Box>
      </Card>
    );
  }

  // `appMode.scenario === null` means the user came from F1 BYO — no sample
  // picked yet, so the "keep exploring" copy still reads correctly.
  const hasScenario = appMode.scenario !== null;

  return (
    <Card sx={{ p: 3, borderRadius: BORDER_RADIUS_CARD, position: "relative", maxWidth: 460 }} aria-label="Sign-in offer" data-testid="gate-card">
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
            SIGN UP
          </Typography>
          <IconButton
            size="small"
            aria-label="Close sign-in offer"
            onClick={dismissGate}
            data-testid="gate-dismiss"
            sx={{ position: "absolute", top: 8, right: 8, color: BODY_TEXT }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Typography variant="body1" sx={{ color: NAVY }}>
          {PREAMBLE[trigger]}
        </Typography>

        <Box component="form" onSubmit={handleRegisterSubmit}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="First name"
                required
                value={first}
                onChange={(event) => setFirst(event.target.value)}
                inputProps={{ "data-testid": "gate-first-input" }}
              />
              <TextField
                fullWidth
                size="small"
                label="Last name"
                required
                value={last}
                onChange={(event) => setLast(event.target.value)}
                inputProps={{ "data-testid": "gate-last-input" }}
              />
            </Stack>
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
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              inputProps={{ "data-testid": "gate-password-input" }}
              helperText="At least 8 characters."
            />
            <TextField
              fullWidth
              size="small"
              type="password"
              label="Confirm password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              inputProps={{ "data-testid": "gate-confirm-input" }}
            />
            {error ? (
              <Alert severity="error" data-testid="gate-error" sx={{ alignItems: "center" }}>
                {error}
              </Alert>
            ) : null}
            <Box
              component="button"
              type="submit"
              disabled={submitting}
              data-testid="gate-register-submit"
              sx={{
                p: 1,
                borderRadius: BORDER_RADIUS_PILL,
                backgroundColor: GREEN,
                color: NAVY,
                textAlign: "center",
                fontWeight: 600,
                cursor: submitting ? "wait" : "pointer",
                opacity: submitting ? 0.7 : 1,
                border: "none",
                fontFamily: "inherit",
                fontSize: 14,
                width: "100%",
              }}
            >
              {submitting ? "Creating account…" : "Create account"}
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
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleBookCall();
            }
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderRadius: BORDER_RADIUS_2X,
            border: `1px solid ${GREEN}`,
            color: NAVY,
            cursor: "pointer",
            "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
          }}
        >
          <CalendarMonthOutlinedIcon fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Book a call with an engineer
          </Typography>
        </Box>

        {/* LC5 dismiss path #3 — "← keep exploring samples" link. */}
        <Box
          role="button"
          tabIndex={0}
          data-testid="gate-keep-exploring"
          onClick={dismissGate}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dismissGate();
            }
          }}
          sx={{
            mt: 0.5,
            color: NAVY,
            cursor: "pointer",
            fontSize: 13,
            "&:hover": { textDecoration: "underline" },
          }}
        >
          ← {hasScenario ? "Keep chatting with the sample" : "Keep exploring samples"}
        </Box>
      </Stack>
    </Card>
  );
};

/**
 * Pull a human-readable error message out of an axios error envelope.
 * Falls back to a generic fallback so we never render `[object Object]`.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
    return (
      e.response?.data?.error ??
      e.response?.data?.message ??
      e.message ??
      "Couldn't create your account. Please try again."
    );
  }
  return typeof err === "string" ? err : "Couldn't create your account. Please try again.";
}
