import { describe, expect, it } from "vitest";

import type { CanvasIntent } from "./types";
import { assertNeverIntent } from "./CanvasOrchestratorContext";

// ────────────────────────────────────────────────────────────────────
// §4d #14 — orchestrator `dispatch()` exhaustiveness.
//
// The dispatch body switches on `intent.kind`. Its `default` arm narrows
// `intent` to `never` and calls `assertNeverIntent(intent)`. That makes
// the switch a COMPILE-TIME exhaustiveness check: adding a new
// `CanvasIntent` kind without a matching `case` leaves `intent` as a
// non-`never` value in the default arm, so `assertNeverIntent(intent)`
// fails `tsc` with an error naming the unhandled kind (app-architecture
// spec §"The intent dispatch surface…"). The old if-chain silently
// no-op'd an unhandled kind.
//
// These tests are compile-time guarantees first, runtime second.
// ────────────────────────────────────────────────────────────────────

describe("dispatch() exhaustiveness sentinel", () => {
  it("assertNeverIntent throws when reached at runtime (defensive — unreachable in a sound build)", () => {
    // Cast through `never` so the call type-checks here; at the real call
    // site the compiler guarantees the argument is genuinely `never`.
    expect(() => assertNeverIntent("bogusKind" as never)).toThrow(/unhandled CanvasIntent kind/i);
  });

  it("only accepts a `never` argument — a real intent kind is rejected by the type-checker", () => {
    const realKind: CanvasIntent["kind"] = "openDocument";
    // @ts-expect-error - assertNeverIntent's parameter is `never`; a concrete
    // intent-kind string is NOT assignable. If the switch ever stopped being
    // exhaustive (a kind left unhandled), the default arm would pass a
    // non-`never` value to this same sentinel; the directive here proves the
    // sentinel rejects anything that is not `never`. Load-bearing under tsc.
    expect(() => assertNeverIntent(realKind)).toThrow();
  });
});
