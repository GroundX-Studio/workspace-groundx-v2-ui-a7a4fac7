import { describe, expect, it } from "vitest";

import { sourceSchema, type Source } from "@groundx/shared";

import {
  intentLogSourceSchema,
  viewerEventSourceSchema,
  type IntentLogSource,
  type ViewerEventSource,
} from "./types.js";

/**
 * 2026-05-31-chat-wire-types-shared (middleware half) — the viewer-event +
 * intent-log source enums were byte-twins of the shared four-value source
 * vocabulary `["user","agent","tour","system"]`. They are now re-exports of the
 * ONE `@groundx/shared` `sourceSchema`.
 *
 * The `Eq<>` asserts are load-bearing under middleware `tsc`: if either local
 * type re-forks the source vocabulary, `Assert<false>` fails the type-check.
 * The runtime `toBe(sourceSchema)` identity checks prove the schema bindings
 * are the SAME object (not a copy), so the coercion fallback + route allow-sets
 * can never silently diverge from the shared union. Mirrors the app-side guard
 * in `app/src/contexts/Source.contract.test.ts`.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertViewerEventSource = Assert<Eq<ViewerEventSource, Source>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertIntentLogSource = Assert<Eq<IntentLogSource, Source>>;

describe("Source — single source (middleware half, @groundx/shared)", () => {
  it("the viewer-event + intent-log source schemas ARE the shared sourceSchema", () => {
    expect(viewerEventSourceSchema).toBe(sourceSchema);
    expect(intentLogSourceSchema).toBe(sourceSchema);
  });

  it("the shared sourceSchema carries the canonical four-value vocabulary", () => {
    expect(sourceSchema.options).toEqual(["user", "agent", "tour", "system"]);
  });
});
