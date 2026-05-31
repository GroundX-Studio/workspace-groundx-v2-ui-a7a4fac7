import { describe, expect, it } from "vitest";

import type { CanvasIntent as FromChatStore } from "@/contexts/ChatStoreContext";
import type { CanvasIntent as FromOrchestrator } from "@/contexts/CanvasOrchestratorContext";

/**
 * B1 "One CanvasIntent" — there must be exactly ONE `CanvasIntent` type.
 * ChatStore historically shipped a `Record<string,unknown> | null` placeholder
 * (a deferred-foundation marker) under the same exported name as the real
 * discriminated union in `CanvasOrchestratorContext`. That's both a duplicate
 * exported name AND a loose-typing hole.
 *
 * This is a COMPILE-TIME contract: the body only typechecks if the two names
 * resolve to the same discriminated union. With the placeholder in place, the
 * `FromOrchestrator = a` assignment fails (a `Record<string,unknown>` is not
 * assignable to the union — no exhaustive `kind`), so the file won't compile.
 * Re-introducing any divergent placeholder breaks this test loudly.
 */
describe("CanvasIntent — single source (B1)", () => {
  it("ChatStore re-exports the orchestrator union (no Record placeholder)", () => {
    const a: FromChatStore = { kind: "openDocument", documentId: "d-1", page: 2 };
    // Bidirectional assignability == structural identity of the two names.
    const b: FromOrchestrator = a;
    const c: FromChatStore = b;
    // `kind` narrows only on the real union; with the placeholder it'd be `unknown`.
    expect(c.kind).toBe("openDocument");
  });
});
