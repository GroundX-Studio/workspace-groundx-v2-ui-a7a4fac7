/**
 * 2026-05-31-onboarding-experiences — the Project `ChatExperience`.
 *
 * The STEADY variant of `makeOnboardingExperience`, closing over a
 * `ContentScope` whose `bucket` arm is the workspace bucket AND whose `filter`
 * carries the project field/value (a product project == a doc-filter value
 * within a workspace bucket, per the WF-07 vocabulary lock — NOT a GroundX
 * group). Mechanism is shared with the Workspace experience via
 * `makeScopedChatExperience`; this module supplies the id, label, and the
 * `scope` `configSchema`.
 *
 * Glob-discovered by `chatExperienceRegistry` (its `experience` export).
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { ChatExperienceEntry } from "@/conversation/chatExperienceRegistry";
import type { ChatExperience } from "@/conversation/ChatExperience";
import {
  makeScopedChatExperience,
  type ScopedExperienceConfig,
} from "@/conversation/experiences/scopedChatExperience";

export function makeProjectExperience(config: ScopedExperienceConfig): ChatExperience {
  return makeScopedChatExperience("project", config);
}

/** Validates `create()`'s config arg — a `{ scope: ContentScope }`. */
const projectConfigSchema = z.object({ scope: contentScopeSchema });

export const experience: ChatExperienceEntry = {
  id: "project",
  label: "Project",
  configSchema: projectConfigSchema,
  create: (config) => makeProjectExperience(projectConfigSchema.parse(config)),
};
