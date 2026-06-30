/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the `chatExperienceRegistry`
 * data catalog. Mirrors Vite glob assembly + `ScenarioRegistry`'s
 * `byId` API; implements the shared `Catalog<T>` contract (lookup/enumerate
 * ONLY — no `resolve(context)` dispatcher). Unique-id invariant via the shared
 * `assertUniqueIds`.
 */
import { describe, expect, it } from "vitest";
import type { Catalog } from "@groundx/shared";

import {
  chatExperienceRegistry,
  createChatExperienceRegistry,
  type ChatExperienceEntry,
} from "./chatExperienceRegistry";

describe("chatExperienceRegistry (production singleton)", () => {
  it("byId('onboarding') returns the entry; create() yields a ChatExperience", () => {
    const entry = chatExperienceRegistry.byId("onboarding");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("onboarding");
    const experience = entry!.create({
      scenarioId: "utility",
      thinkingScript: ["a", "b"],
    });
    // A ChatExperience exposes the optional decoration/choreography surface.
    expect(typeof experience.Intro).toBe("function");
    expect(typeof experience.Choreography).toBe("function");
  });

  it("all() enumerates the onboarding entry", () => {
    const ids = chatExperienceRegistry.all().map((e) => e.id);
    expect(ids).toContain("onboarding");
  });

  // ── RCC Phase 4: declare + assert it satisfies the shared Catalog<T> contract ──
  // (the declaration `ChatExperienceRegistry = Catalog<ChatExperienceEntry>` landed
  // with the registry in unified Phase 2; this is the explicit conformance check,
  // mirroring the glob-built catalogs + ScenarioRegistry.)
  it("satisfies the shared Catalog<ChatExperienceEntry> read contract (RCC Phase 4)", () => {
    // Compile-time conformance: the registry IS assignable to Catalog<T>.
    const catalog: Catalog<ChatExperienceEntry> = chatExperienceRegistry;
    expect(typeof catalog.all).toBe("function");
    expect(typeof catalog.byId).toBe("function");
    // Runtime: all() returns a stable array; byId() agrees with it.
    const first = catalog.all()[0];
    expect(first).toBeDefined();
    expect(catalog.byId(first!.id)).toBe(first);
  });

  it("byId() returns undefined for an unknown id (lookup-only, no resolve)", () => {
    expect(chatExperienceRegistry.byId("does-not-exist")).toBeUndefined();
    // The catalog is lookup/enumerate only — there is NO resolve(context).
    expect((chatExperienceRegistry as unknown as Record<string, unknown>).resolve).toBeUndefined();
  });
});

describe("createChatExperienceRegistry (assembly)", () => {
  it("throws at build on a duplicate id", () => {
    const entry = {
      id: "dup",
      configSchema: { parse: (v: unknown) => v } as never,
      create: () => ({}),
    };
    expect(() =>
      createChatExperienceRegistry({
        "experiences/a/experience.ts": { experience: entry },
        "experiences/b/experience.ts": { experience: entry },
      }),
    ).toThrow(/dup/);
  });

  it("tolerates modules with no experience export", () => {
    const reg = createChatExperienceRegistry({
      "experiences/empty/experience.ts": {},
    });
    expect(reg.all()).toHaveLength(0);
  });
});
