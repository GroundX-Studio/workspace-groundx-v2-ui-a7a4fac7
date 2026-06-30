/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the `chatExperienceRegistry`
 * data catalog.
 *
 * A DATA CATALOG (consistent with Vite glob assembly +
 * `ScenarioRegistry`'s `byId` API), NOT a dispatcher: you `all()` / `byId(id)`,
 * the CALLER composes (picks the id, supplies config, passes the result to
 * `<ConversationFlow>`). There is deliberately NO `resolve(context)` — that
 * shape is the rejected entry-context dispatcher (design.md §3a + "vs
 * alternatives").
 *
 * Implements the shared `Catalog<T>` contract and routes its unique-id
 * invariant through the shared `assertUniqueIds` (both from `@groundx/shared`,
 * landed by registry-catalog-consistency Phase 1 — NOT reinvented here).
 *
 * Discovery: glob `conversation/experiences/<id>/experience.{ts,tsx}` — OUTSIDE
 * `components/{chat,viewer}-widgets/`, so the widget-contract drift guard never
 * applies to an experience module.
 */
import { assertUniqueIds, type Catalog } from "@groundx/shared";
import type { z } from "zod";

import type { ChatExperience } from "./ChatExperience";

/**
 * A catalog entry. `configSchema` validates `create()`'s arg (mirrors
 * `WidgetTool.input`); `create` is the factory.
 */
export interface ChatExperienceEntry {
  id: string;
  /** Human label — for enumeration (debug menu / nav offering). */
  label?: string;
  /** Validates `create()`'s config arg. */
  configSchema: z.ZodTypeAny;
  /** The factory; `config` is parsed by `configSchema` upstream. */
  create: (config: unknown) => ChatExperience;
}

export type ChatExperienceRegistry = Catalog<ChatExperienceEntry>;

interface ChatExperienceModule {
  experience?: ChatExperienceEntry;
}

function isChatExperienceModule(value: unknown): value is ChatExperienceModule {
  if (!value || typeof value !== "object") return false;
  const maybe = (value as { experience?: unknown }).experience;
  return maybe === undefined || (typeof maybe === "object" && maybe !== null);
}

/**
 * Build a registry from a module-path → module map (the shape
 * `import.meta.glob(..., { eager: true })` returns). Modules with no
 * `experience` export are tolerated (lets an experience land its file before
 * the entry is filled in). The unique-id invariant is enforced via the shared
 * `assertUniqueIds`, which names the colliding module paths.
 */
export function createChatExperienceRegistry(
  modules: Record<string, unknown>,
): ChatExperienceRegistry {
  const entries: ChatExperienceEntry[] = [];
  const sourceByEntry = new Map<ChatExperienceEntry, string>();

  // Stable iteration: lexicographic module-path order.
  const sortedPaths = Object.keys(modules).sort();
  for (const path of sortedPaths) {
    const mod = modules[path];
    if (!isChatExperienceModule(mod) || !mod.experience) continue;
    entries.push(mod.experience);
    sourceByEntry.set(mod.experience, path);
  }

  assertUniqueIds(
    entries,
    (e) => e.id,
    (e) => sourceByEntry.get(e) ?? "<unknown>",
  );

  const byId = new Map<string, ChatExperienceEntry>();
  for (const entry of entries) byId.set(entry.id, entry);

  return {
    all: () => entries,
    byId: (id) => byId.get(id),
  };
}

/**
 * Production singleton. Vite resolves the glob at build time; `eager: true`
 * inlines every match so the catalog is ready at first read.
 */
const eagerModules = import.meta.glob(["./experiences/*/experience.ts", "./experiences/*/experience.tsx"], {
  eager: true,
});

export const chatExperienceRegistry: ChatExperienceRegistry =
  createChatExperienceRegistry(eagerModules);
