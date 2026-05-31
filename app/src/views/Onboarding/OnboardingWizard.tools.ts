/**
 * OnboardingWizard — LLM tool declarations.
 *
 * 2026-05-31-tool-system-completion (wf04 §2). The OnboardingWizard is a VIEW,
 * not a chat/viewer widget, so this file lives in the view glob-home
 * (`views/**`) opened by this change. Four read-style navigation tools:
 *
 *   • `wizard_next`   — advance to the next step
 *   • `wizard_back`   — go to the previous step
 *   • `wizard_finish` — finish + record completion
 *   • `dismiss_wizard`— skip / close without completing
 *
 * Read-category (navigation only) → auto-dispatch. Each handler returns the
 * matching CanvasIntent; the OnboardingWizard view registers adapters that call
 * the OnboardingContext `next` / `back` / `finish` / `closeWithoutCompleting`
 * — the SAME action the wizard's nav Buttons invoke. No dormant plumbing.
 *
 * Role (access matrix): all roles. The wizard is an onboarding walkthrough;
 * availability is enforced by `APP_CONFIG.onboarding.enabled` + the mount site,
 * not by the tools. Mirrored on the server `SERVER_TOOL_CATALOG`.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const wizardNext: WidgetTool = {
  name: "wizard_next",
  description:
    "Advance the onboarding wizard to the next step. Use when the active surface is the " +
    "onboarding wizard and the user asks to continue, go on, or move to the next step.",
  category: "read",
  input: z.object({}),
  handler: () => ({ kind: "wizardNext" }),
};

const wizardBack: WidgetTool = {
  name: "wizard_back",
  description:
    "Move the onboarding wizard back to the previous step. Use when the user asks to go " +
    "back or review the previous onboarding step.",
  category: "read",
  input: z.object({}),
  handler: () => ({ kind: "wizardBack" }),
};

const wizardFinish: WidgetTool = {
  name: "wizard_finish",
  description:
    "Finish the onboarding wizard, recording completion. Use when the user is on the last " +
    "onboarding step and asks to finish, complete, or close the walkthrough as done.",
  category: "read",
  input: z.object({}),
  handler: () => ({ kind: "wizardFinish" }),
};

const dismissWizard: WidgetTool = {
  name: "dismiss_wizard",
  description:
    "Dismiss the onboarding wizard without completing it. Use when the user asks to skip, " +
    "close, or come back later to the onboarding walkthrough.",
  category: "read",
  input: z.object({}),
  handler: () => ({ kind: "dismissWizard" }),
};

export const tools: WidgetTool[] = [wizardNext, wizardBack, wizardFinish, dismissWizard];
