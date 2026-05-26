/**
 * SignUpWidget — viewer-slot half of the sign-up surface.
 *
 * The chat-side half is `GateChatRail`. Together they replace the
 * old `GateView` monolith that stuffed form fields + preamble +
 * dismiss + book-a-call into the chat column (which left the viewer
 * displaying a sample doc behind the form — the ARCH-05 bug).
 *
 * Contract per `scaffold/docs/agents/widget-contract.md`:
 *   - Lives at `components/viewer-widgets/SignUpWidget/`.
 *   - Ships README + sibling .test.tsx.
 *   - Accepts a `mode` prop (`onboarding` | `steady`).
 *
 * Mode semantics:
 *   - `onboarding` — happy-path submit commits the session-level gate
 *     via `commitGate("register")` so the chat rail flips to its
 *     "WELCOME — YOU'RE SIGNED IN" success state.
 *   - `steady` — promotes the in-app auth state but does NOT touch
 *     the onboarding gate (it's already committed or never existed
 *     in steady mode). Allows the same form to be reused inside a
 *     steady-mode settings drawer if needed.
 *
 * Side effects on submit, in this order:
 *   1. POST /api/auth/register (sets the session cookie)
 *   2. POST /api/chat-sessions/claim (best-effort; re-keys anon rows)
 *   3. promoteToSignedIn() (in-app auth state)
 *   4. commitGate("register") (onboarding only)
 *
 * The book-a-call CTA and the "← keep exploring" dismiss link
 * intentionally live in the chat-side `GateChatRail`, not here. This
 * widget is the FORM, nothing else.
 */

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import MuiStack from "@mui/material/Stack";
import { useCallback, useState, type FC, type FormEvent } from "react";

import { register } from "@/api/entities/customerEntity";
import { claimAnonymousChat } from "@/api/claimAnonymousChat";
import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Button } from "@/components/primitives/Button/Button";
import { Heading } from "@/components/primitives/Heading/Heading";
import { Label } from "@/components/primitives/Label/Label";
import { TextField } from "@/components/primitives/TextField/TextField";
import {
  BORDER_RADIUS_CARD,
  EYEBROW_ON_LIGHT,
  NAVY,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { captureException } from "@/lib/sentry";

export type SignUpWidgetMode = "onboarding" | "steady";

export interface SignUpWidgetProps {
  /**
   * Locked-affordance gate per the widget contract.
   * - `onboarding` (default): submit fires `commitGate("register")`
   *   so the chat rail flips to its committed-state success card.
   * - `steady`: register + promote run; gate is not touched.
   */
  mode?: SignUpWidgetMode;
}

export const SignUpWidget: FC<SignUpWidgetProps> = ({ mode = "onboarding" }) => {
  const { promoteToSignedIn } = useAppMode();
  const { state: session, commitGate } = useOnboardingSession();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      setError(null);

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
        // Best-effort: re-key anon chat rows to the new user. If this
        // fails the user is still signed up; they just lose their
        // pre-signup chat history. Ship to Sentry so we can size the
        // failure rate in production. See CF-13.
        try {
          await claimAnonymousChat();
        } catch (claimErr) {
          captureException(claimErr, {
            route: "/api/chat-sessions/claim",
            stage: "after-register",
          });
        }
        promoteToSignedIn();
        if (mode === "onboarding") {
          commitGate("register");
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [first, last, email, password, confirmPassword, submitting, mode, commitGate, promoteToSignedIn],
  );

  // Committed-state celebration. The chat-side `GateChatRail` shows
  // the canonical "Continue to Integrate" CTA; the canvas mirrors the
  // success so the user isn't left staring at the form they just
  // submitted while the chat says "Welcome." Kept deliberately quiet
  // — the chat rail is the call-to-action.
  if (mode === "onboarding" && session.gate.status === "committed") {
    return (
      <Box
        data-widget="sign-up"
        data-mode={mode}
        data-state="committed"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          p: 3,
        }}
      >
        <Card
          data-testid="signup-celebration"
          sx={{ p: 4, borderRadius: BORDER_RADIUS_CARD, maxWidth: 460, width: "100%" }}
          aria-label="Account created"
        >
          <MuiStack spacing={1.5}>
            <Label sx={{ color: EYEBROW_ON_LIGHT }}>WELCOME</Label>
            <Heading level="h3" sx={{ color: NAVY }}>
              You&apos;re in.
            </Heading>
            <BodyText>
              Your sample work is saved to your account. Use the
              <Box component="span" sx={{ whiteSpace: "nowrap" }}> Continue </Box>
              button on the right to wire your real data.
            </BodyText>
          </MuiStack>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      data-widget="sign-up"
      data-mode={mode}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        p: 3,
      }}
    >
      <Card
        sx={{ p: 4, borderRadius: BORDER_RADIUS_CARD, maxWidth: 460, width: "100%" }}
        aria-label="Create your account"
      >
        <MuiStack spacing={2.5}>
          <MuiStack spacing={0.5}>
            <Label sx={{ color: EYEBROW_ON_LIGHT }}>CREATE ACCOUNT</Label>
            <Heading level="h3" sx={{ color: NAVY }}>
              Save your work
            </Heading>
            <BodyText>
              One quick step — name, email, password. We&apos;ll keep your sample
              progress and chat history.
            </BodyText>
          </MuiStack>

          <Box component="form" onSubmit={handleSubmit} aria-label="Sign-up form">
            <MuiStack spacing={1}>
              <MuiStack direction="row" spacing={1}>
                <TextField
                  dense
                  fullWidth
                  size="small"
                  label="First name"
                  required
                  value={first}
                  onChange={(event) => setFirst(event.target.value)}
                  inputProps={{ "data-testid": "signup-first-input" }}
                />
                <TextField
                  dense
                  fullWidth
                  size="small"
                  label="Last name"
                  required
                  value={last}
                  onChange={(event) => setLast(event.target.value)}
                  inputProps={{ "data-testid": "signup-last-input" }}
                />
              </MuiStack>
              <TextField
                dense
                fullWidth
                size="small"
                type="email"
                label="Email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                inputProps={{ "data-testid": "signup-email-input" }}
                InputProps={{
                  startAdornment: <EmailOutlinedIcon sx={{ mr: 1, color: NAVY }} fontSize="small" />,
                }}
              />
              <TextField
                dense
                fullWidth
                size="small"
                type="password"
                label="Password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                inputProps={{ "data-testid": "signup-password-input" }}
                helperText="At least 8 characters."
              />
              <TextField
                dense
                fullWidth
                size="small"
                type="password"
                label="Confirm password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                inputProps={{ "data-testid": "signup-confirm-input" }}
              />
              {error ? (
                <Alert severity="error" data-testid="signup-error" sx={{ alignItems: "center" }}>
                  {error}
                </Alert>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                submitting={submitting}
                fullWidth
                data-testid="signup-submit"
              >
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </MuiStack>
          </Box>
        </MuiStack>
      </Card>
    </Box>
  );
};

/**
 * Pull a human-readable error message out of an axios error envelope.
 * Falls back to a generic message so we never render `[object Object]`.
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
