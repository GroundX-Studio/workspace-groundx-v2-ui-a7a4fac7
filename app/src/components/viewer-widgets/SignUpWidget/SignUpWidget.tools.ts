/**
 * SignUpWidget — LLM tool declarations.
 *
 * 2026-05-31-tool-system-completion (wf04 §1). Replaces the widget's former
 * `no-llm.md` opt-out with a single, deliberately-scoped tool:
 *
 *   • `submit_signup(...)` — submit the F6 sign-up form. Mutate-category, so
 *     the LLM surfaces a confirmable chip rather than auto-running an identity
 *     action. The mirrored middleware tool emits a `submitSignup` CanvasIntent
 *     carrying the collected fields; the SignUpWidget registers a matching
 *     adapter that runs its REAL submit sequence (register → claimAnonymousChat →
 *     promoteToSignedIn → commitGate) — the SAME action the on-screen submit
 *     Button invokes. There is no dormant plumbing: tool → intent → adapter →
 *     the widget's existing submit handler.
 *
 * The five form inputs stay `noTool` with the reason
 * "value collected by submit_signup" — the values are arguments of this tool,
 * not separately LLM-drivable controls.
 *
 * Role (access matrix §3): all roles. The sign-up form is anonymous-facing;
 * availability is enforced at the mount site (a member never sees it), not by
 * the tool. Mirrored on the server `SERVER_TOOL_CATALOG` with the same role.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const submitSignup: WidgetTool = {
  name: "submit_signup",
  description:
    "Submit the sign-up form to create the account and save the sample work. " +
    "Use when the user has supplied their name, email, and password and explicitly " +
    "asked to sign up, create an account, or save their work. The user confirms via " +
    "the chip before the account is created — it is not submitted automatically.",
  category: "mutate",
  input: z.object({
    first: z.string().min(1).describe("The first name."),
    last: z.string().min(1).describe("The last name."),
    email: z.string().min(1).email().describe("The email address (the account login)."),
    password: z.string().min(8).describe("The chosen password — at least 8 characters."),
    confirmPassword: z
      .string()
      .min(1)
      .describe("Password confirmation — must match `password` (the widget re-checks)."),
  }),
  // No `availableSteps` — the sign-up surface is a gate modal over any
  // ViewerStep (there is no `sign-up` ViewerStepKind); reachable in every step.
};

export const tools: WidgetTool[] = [submitSignup];
