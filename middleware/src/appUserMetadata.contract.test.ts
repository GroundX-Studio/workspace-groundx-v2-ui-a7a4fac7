import { describe, expect, it } from "vitest";

import { appUserMetadataSchema, type AppUserMetadata as SharedAppUserMetadata } from "@groundx/shared";

import type { AppUserMetadata } from "./types.js";

/**
 * 2026-05-31-chat-wire-types-shared (middleware half) — `AppUserMetadata` was a
 * byte-twin declared on both the middleware (persisted-record shape) and the
 * app (documented subset). It is now a re-export of the ONE `@groundx/shared`
 * `appUserMetadataSchema`.
 *
 * This `Eq<>` assert is load-bearing under middleware `tsc`: if the middleware
 * re-forks the metadata shape, `Assert<false>` fails the type-check. The
 * runtime check exercises the schema with the middleware's superset fields
 * (including a `Date` `acceptedTermsAt`, the record-side representation).
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
 
type _assertAppUserMetadata = Assert<Eq<AppUserMetadata, SharedAppUserMetadata>>;

describe("AppUserMetadata — single source (middleware half, @groundx/shared)", () => {
  it("accepts the middleware superset record (including a Date acceptedTermsAt)", () => {
    const record: AppUserMetadata = {
      groundxUsername: "acct-1",
      onboardingState: null,
      uiPreferencesJson: null,
      featureFlagsJson: null,
      lastActiveProjectId: null,
      acceptedTermsAt: new Date(),
      appRole: null,
    };
    expect(appUserMetadataSchema.safeParse(record).success).toBe(true);
  });

  it("requires groundxUsername (the one non-optional field)", () => {
    expect(appUserMetadataSchema.safeParse({ onboardingState: "x" }).success).toBe(false);
  });
});
