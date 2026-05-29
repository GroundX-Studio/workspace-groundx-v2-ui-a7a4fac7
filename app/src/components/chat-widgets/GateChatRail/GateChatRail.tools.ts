/**
 * GateChatRail — LLM tool declarations.
 *
 * widget-llm-integration follow-up B.2 (2026-05-28). Two mutate-
 * category tools:
 *
 *   • `commit_gate(method)` — commit the active gate via a chosen
 *     identity method. The user-facing CTAs in the rail already
 *     trigger this via `OnboardingSessionContext.commitGate`; the
 *     tool lets the LLM suggest a path the user can confirm.
 *   • `dismiss_gate()` — close the gate without committing. The
 *     rail's "← Keep exploring" link already does this; the tool
 *     lets the LLM offer the same dismiss as a chip.
 *
 * Both surface on `reply.suggestedActions[]` per design.md §C —
 * gate-state changes are user-confirmed, never auto-dispatched.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const commitGate: WidgetTool = {
  name: "commit_gate",
  description:
    "Commit the active sign-up gate via a specific identity method. " +
    "Use when the user has explicitly chosen the path forward " +
    "(\"sign up now\", \"book a call instead\") and you want to " +
    "surface a one-click chip for the chosen method.",
  category: "mutate",
  input: z.object({
    method: z
      .enum(["register", "sso", "engineer-call"])
      .describe(
        "Which gate-commit path: \"register\" for email sign-up, \"sso\" for SAML / Google / Microsoft, \"engineer-call\" for the Calendly booking path.",
      ),
  }),
  handler: (input) => ({ kind: "commitGate", method: input.method }),
};

const dismissGate: WidgetTool = {
  name: "dismiss_gate",
  description:
    "Dismiss the active sign-up gate without committing. Use when the " +
    "user has indicated they want to keep exploring without signing up " +
    "(\"not now\", \"let me see the rest first\").",
  category: "mutate",
  input: z.object({}),
  handler: () => ({ kind: "dismissGate" }),
};

export const tools: WidgetTool[] = [commitGate, dismissGate];
