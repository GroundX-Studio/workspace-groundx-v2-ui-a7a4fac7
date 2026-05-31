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

/**
 * 2026-05-31-shared-canvas-affordance-restoration — `save_to_account` is the
 * chat-driven successor to the retired F5 Interact "💾 Save 🔒" button. The
 * shared `PdfViewer` (the live Interact canvas) must NOT grow an onboarding-only
 * Save affordance (`no-onboarding-duplicates`), so saving mid-analysis OPENS the
 * sign-in gate via this tool's `openGate` intent. Distinct from `submit_signup`
 * (which submits the form): this only surfaces the sign-in offer. Mutate-category
 * → it surfaces as a `tool:save_to_account` chip the user confirms (never an
 * auto-open). Exposed on the analysis surfaces a user saves from.
 */
const saveToAccount: WidgetTool = {
  name: "save_to_account",
  description:
    "Open the sign-in offer so the user can save their current analysis to an " +
    "account. Use when the user says \"save\", \"keep this\", or asks to save " +
    "their progress but has NOT yet entered sign-up details (use submit_signup " +
    "once they have). Surfaces the gate; it does not create the account.",
  category: "mutate",
  input: z.object({}),
  handler: () => ({ kind: "openGate", trigger: "save" }),
  availableSteps: ["doc-viewer", "interact-chat"],
  // §5 reachability — surfaces as a `tool:save_to_account` suggested-action chip
  // rendered by SuggestedActionChips (the `reply.suggestedActions[]` renderer).
  rendersWidget: "chat-widgets/SuggestedActionChips",
};

export const tools: WidgetTool[] = [commitGate, dismissGate, saveToAccount];
