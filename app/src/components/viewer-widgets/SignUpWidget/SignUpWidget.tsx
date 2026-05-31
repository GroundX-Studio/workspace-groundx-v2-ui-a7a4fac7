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
 *   - Accepts a `role: WidgetRole` prop AND a `scope: WidgetScope` prop.
 *
 * Role + scope (2026-05-30, widget-role-access Phase 2b):
 *   - `role` ("anonymous" | "member") satisfies the widget contract and
 *     is forward-looking. It does NOT gate any affordance here today —
 *     the matrix records "no role-locked affordance" for this widget.
 *     Availability (this widget is anonymous-only — a signed-in member
 *     never sees sign-up) is enforced at the MOUNT SITE, not by this
 *     prop.
 *   - `scope` is `{ type: "none" }` — sign-up is not a document-scoped
 *     widget. Declared for the contract; unused by the form.
 *
 * Gate behavior is RE-SOURCED from gate-state, NOT from role/mode:
 *   - On a successful register, the session-level gate is committed via
 *     `commitGate("register")` ONLY when a gate is actively awaiting
 *     commit (`status === "open" | "dismissed"`). That flips the chat
 *     rail to its "WELCOME — YOU'RE SIGNED IN" success state.
 *   - When no gate is awaiting commit (`status === "idle"`) the form
 *     still registers + promotes auth, but does NOT touch the gate
 *     (mirrors the retired "steady" reuse case).
 *   - The committed-state celebration renders whenever the gate is
 *     already `committed`.
 *
 * Side effects on submit, in this order:
 *   1. POST /api/auth/register (sets the session cookie)
 *   2. POST /api/chat-sessions/claim (best-effort; re-keys anon rows)
 *   3. promoteToSignedIn() (in-app auth state)
 *   4. commitGate("register") (only when a gate is awaiting commit)
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
import { useCallback, useEffect, useState, type FC, type FormEvent } from "react";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { register } from "@/api/entities/customerEntity";
import { claimAnonymousChat } from "@/api/claimAnonymousChat";
import { useCanvasOrchestratorOptional } from "@/contexts/CanvasOrchestratorContext";
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

export interface SignUpWidgetProps {
  /**
   * Widget access role (widget contract). Forward-looking — does NOT
   * gate any affordance in this widget today (see the access matrix:
   * "no role-locked affordance"). Availability (anonymous-only) is
   * enforced at the mount site, not here.
   */
  role: WidgetRole;
  /**
   * Required by the widget contract. Sign-up is not document-scoped, so
   * this is always `{ type: "none" }`. Declared, never read by the form.
   */
  scope: WidgetScope;
}

// `role` and `scope` are intentionally not destructured for use — they
// satisfy the widget contract. Role is forward-looking (no affordance is
// role-locked here); scope is always `{ type: "none" }`. Gate behavior is
// sourced from gate-state below.
export const SignUpWidget: FC<SignUpWidgetProps> = () => {
  const { promoteToSignedIn } = useAppMode();
  const { state: session, commitGate } = useOnboardingSession();
  // RE-SOURCED gate behavior: a gate is "awaiting commit" when it is open
  // or was dismissed (re-openable). We commit it on a successful register
  // so the chat rail flips to its success state. When idle, registering
  // does not touch the gate.
  const gateAwaitingCommit =
    session.gate.status === "open" || session.gate.status === "dismissed";
  const gateCommitted = session.gate.status === "committed";
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The REAL submit sequence, parameterized by explicit field values. Both the
  // on-screen form submit and the `submit_signup` LLM tool (via the registered
  // adapter below) drive this SAME action — there is no separate code path.
  const submitForm = useCallback(
    async (values: {
      first: string;
      last: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) => {
      if (submitting) return;
      setError(null);

      const trimmedEmail = values.email.trim();
      if (!values.first.trim() || !values.last.trim() || !trimmedEmail || !values.password) {
        setError("Please fill in every field.");
        return;
      }
      if (values.password !== values.confirmPassword) {
        setError("Passwords don't match — please re-enter the confirmation.");
        return;
      }
      if (values.password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      setSubmitting(true);
      try {
        await register({
          first: values.first.trim(),
          last: values.last.trim(),
          email: trimmedEmail,
          password: values.password,
          confirmPassword: values.confirmPassword,
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
        if (gateAwaitingCommit) {
          commitGate("register");
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, gateAwaitingCommit, commitGate, promoteToSignedIn],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitForm({ first, last, email, password, confirmPassword });
    },
    [submitForm, first, last, email, password, confirmPassword],
  );

  // 2026-05-31-tool-system-completion (wf04 §1) — register the orchestrator
  // adapter for the `submitSignup` CanvasIntent so the `submit_signup` LLM
  // tool routes to the SAME submit sequence as the form's submit Button. The
  // tool carries the field values as arguments (the 5 inputs are `noTool`).
  // No-op when no CanvasOrchestratorProvider is mounted (standalone tests).
  const orchestrator = useCanvasOrchestratorOptional();
  useEffect(() => {
    if (!orchestrator) return;
    return orchestrator.registerAdapter({
      kind: "submitSignup",
      apply: (intent) =>
        submitForm({
          first: intent.first,
          last: intent.last,
          email: intent.email,
          password: intent.password,
          confirmPassword: intent.confirmPassword,
        }),
    });
  }, [orchestrator, submitForm]);

  // Committed-state celebration. The chat-side `GateChatRail` shows
  // the canonical "Continue to Integrate" CTA; the canvas mirrors the
  // success so the user isn't left staring at the form they just
  // submitted while the chat says "Welcome." Kept deliberately quiet
  // — the chat rail is the call-to-action.
  if (gateCommitted) {
    return (
      <Box
        data-widget="sign-up"
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
                <TextField noTool="value collected by submit_signup"
                  dense
                  fullWidth
                  size="small"
                  label="First name"
                  required
                  value={first}
                  onChange={(event) => setFirst(event.target.value)}
                  inputProps={{ "data-testid": "signup-first-input" }}
                />
                <TextField noTool="value collected by submit_signup"
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
              <TextField noTool="value collected by submit_signup"
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
              <TextField noTool="value collected by submit_signup"
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
              <TextField noTool="value collected by submit_signup"
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
              <Button tool="submit_signup"
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
