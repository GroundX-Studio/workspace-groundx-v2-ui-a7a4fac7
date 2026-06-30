import { describe, expect, it } from "vitest";

import { intentSourceSchema, sourceSchema, type IntentSource, type Source } from "@groundx/shared";

import type { IntentSource as OrchestratorIntentSource } from "./CanvasOrchestratorContext/types";
import type { ViewerEvent } from "./ChatStoreContext/types";

/**
 * 2026-05-31-chat-wire-types-shared — the four-value source enum
 * `["user","agent","tour","system"]` was declared 7× across the app↔middleware
 * boundary. It is now single-sourced as `@groundx/shared` `sourceSchema`, and
 * the canvas-orchestrator `IntentSource` derives from it as
 * `Exclude<Source,"system">`.
 *
 * These asserts are load-bearing under `npm run build` (tsc): if any consumer
 * re-forks the source vocabulary (or the orchestrator re-declares `IntentSource`
 * to a divergent set), `Eq<…>` evaluates `false` and `Assert<false>` fails the
 * build.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertIntentSourceDerivesFromSource = Assert<Eq<IntentSource, Exclude<Source, "system">>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertOrchestratorIntentSource = Assert<Eq<OrchestratorIntentSource, IntentSource>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertViewerEventSource = Assert<Eq<ViewerEvent["source"], Source>>;

describe("Source — single source (@groundx/shared)", () => {
  it("sourceSchema.options deep-equals the canonical four-value enum", () => {
    expect(sourceSchema.options).toEqual(["user", "agent", "tour", "system"]);
  });

  it("intentSourceSchema is Source minus 'system'", () => {
    expect(intentSourceSchema.options).toEqual(["user", "agent", "tour"]);
    expect(intentSourceSchema.safeParse("system").success).toBe(false);
    expect(intentSourceSchema.safeParse("user").success).toBe(true);
  });
});

