/**
 * 2026-05-31-onboarding-experiences — the Workspace `ChatExperience`.
 *
 * The STEADY variant of `makeOnboardingExperience`, closing over a
 * `ContentScope` whose `bucket` arm IS the workspace (bucket == workspace, per
 * the WF-07 vocabulary lock). Mechanism is shared with the Project experience
 * via `makeScopedChatExperience` — this module only supplies the id, label,
 * and the `scope` `configSchema`.
 *
 * Glob-discovered by `chatExperienceRegistry` (its `experience` export) at
 * `conversation/experiences/<id>/experience.{ts,tsx}` — OUTSIDE
 * `components/{chat,viewer}-widgets/`, so the widget-contract guard never
 * applies.
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { ChatExperienceEntry } from "@/conversation/chatExperienceRegistry";
import type { ChatExperience } from "@/conversation/ChatExperience";
import {
  makeScopedChatExperience,
  type ScopedExperienceConfig,
} from "@/conversation/experiences/scopedChatExperience";

export function makeWorkspaceExperience(config: ScopedExperienceConfig): ChatExperience {
  return makeScopedChatExperience("workspace", config);
}

/** Validates `create()`'s config arg — a `{ scope: ContentScope }`. */
const workspaceConfigSchema = z.object({ scope: contentScopeSchema });

export const experience: ChatExperienceEntry = {
  id: "workspace",
  label: "Workspace",
  configSchema: workspaceConfigSchema,
  create: (config) => makeWorkspaceExperience(workspaceConfigSchema.parse(config)),
};
