/**
 * X-Ray type drift guard — 2026-06-01-data-model-tail item 4.
 *
 * The X-Ray response type family (`XrayBoundingBox` / `XrayChunk` /
 * `XrayDocumentPage` / `DocumentXrayResponse`) used to be declared independently
 * on the app side (`groundxDocumentsEntity.ts`) and had no relationship to the
 * middleware's own loose `XrayDoc` / `XrayChunk` (`citationGeometry.ts`), even
 * though both describe the SAME `/v1/ingest/document/xray/{id}` payload.
 *
 * They are now single-sourced on `@groundx/shared` (the canonical strict wire
 * shape, schema-first). This file is the enforced guard:
 *
 *  - the app entity re-exports the shared types → the `Eq<>` asserts below pin
 *    each app re-export to the canonical `@groundx/shared` type, so a re-fork
 *    that replaces a re-export with a free-standing local interface flips `Eq`
 *    to `false` and fails the app build;
 *  - the middleware reads a strict SUBSET and tolerates a loose runtime payload,
 *    so its `XrayDoc` / `XrayChunk` are DERIVED from the shared canonical types
 *    (relaxed to all-optional) rather than `Eq<>`-equal; the canonical strict
 *    shape must stay ASSIGNABLE to the middleware loose shape (canonical ⊆ loose
 *    on the fields the middleware reads). That assignability assert is the
 *    middleware-side tie and lives in production
 *    `middleware/src/services/citationGeometry.ts` (the middleware tsconfig
 *    excludes `*.test.ts`, so a test-file assert there would be dormant).
 *
 * The runtime test pins the shared Zod schema to a representative fixture.
 * The `Eq<>` precedent is `app/src/types/scenarios.drift.test.ts:52`.
 */
import { describe, expect, it } from "vitest";
import {
  documentXrayResponseSchema,
  type DocumentXrayResponse as SharedDocumentXrayResponse,
  type XrayBoundingBox as SharedXrayBoundingBox,
  type XrayChunk as SharedXrayChunk,
  type XrayDocumentPage as SharedXrayDocumentPage,
} from "@groundx/shared";

import type {
  DocumentXrayResponse as AppDocumentXrayResponse,
  XrayBoundingBox as AppXrayBoundingBox,
  XrayChunk as AppXrayChunk,
  XrayDocumentPage as AppXrayDocumentPage,
} from "./groundxDocumentsEntity";

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// Each LOCAL (app) X-Ray type must be byte-identical to the canonical
// `@groundx/shared` type. A drifted re-fork flips the `Eq` to `false` → build error.
type _assertXrayBoundingBox = Assert<Eq<AppXrayBoundingBox, SharedXrayBoundingBox>>;
type _assertXrayChunk = Assert<Eq<AppXrayChunk, SharedXrayChunk>>;
type _assertXrayDocumentPage = Assert<Eq<AppXrayDocumentPage, SharedXrayDocumentPage>>;
type _assertDocumentXrayResponse = Assert<Eq<AppDocumentXrayResponse, SharedDocumentXrayResponse>>;

describe("X-Ray type family — single-sourced on @groundx/shared", () => {
  it("the shared documentXrayResponse schema validates a representative fixture", () => {
    const fixture: SharedDocumentXrayResponse = {
      fileName: "bill.pdf",
      fileType: "pdf",
      sourceUrl: "https://example.test/bill.pdf",
      documentPages: [
        {
          pageNumber: 1,
          pageUrl: "https://example.test/page-1.png",
          width: 1700,
          height: 2200,
          chunks: [
            {
              chunk: "c1",
              contentType: ["paragraph"],
              pageNumbers: [1],
              text: "Total due $42.00",
              suggestedText: "Total due 42.00",
              boundingBoxes: [
                {
                  pageNumber: 1,
                  topLeftX: 10,
                  topLeftY: 20,
                  bottomRightX: 110,
                  bottomRightY: 60,
                  corrected: false,
                },
              ],
            },
          ],
        },
      ],
      chunks: [
        {
          chunk: "c1",
          contentType: ["paragraph"],
          pageNumbers: [1],
          text: "Total due $42.00",
          suggestedText: "Total due 42.00",
          boundingBoxes: [
            {
              pageNumber: 1,
              topLeftX: 10,
              topLeftY: 20,
              bottomRightX: 110,
              bottomRightY: 60,
              corrected: false,
            },
          ],
        },
      ],
    };
    const parsed = documentXrayResponseSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
  });

  it("rejects a chunk whose boundingBox is missing a required corner", () => {
    const parsed = documentXrayResponseSchema.safeParse({
      fileName: "bill.pdf",
      fileType: "pdf",
      sourceUrl: "https://example.test/bill.pdf",
      documentPages: [],
      chunks: [
        {
          chunk: "c1",
          contentType: ["paragraph"],
          pageNumbers: [1],
          text: "x",
          suggestedText: "x",
          boundingBoxes: [{ pageNumber: 1, topLeftX: 10, topLeftY: 20, bottomRightX: 110 }],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
