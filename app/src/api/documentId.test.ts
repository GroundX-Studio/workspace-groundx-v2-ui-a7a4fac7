import { describe, expect, it } from "vitest";

import { isResolvedDocumentId } from "./documentId";

describe("isResolvedDocumentId (WF-15)", () => {
  it("accepts a real GroundX UUID", () => {
    expect(isResolvedDocumentId("c3bfff49-6640-4213-822b-e81c3a771e45")).toBe(true);
  });

  it("rejects the scenario:* placeholder shape", () => {
    expect(isResolvedDocumentId("scenario:utility")).toBe(false);
    expect(isResolvedDocumentId("scenario:loan")).toBe(false);
  });

  it("rejects any kind:value placeholder", () => {
    expect(isResolvedDocumentId("doc:pending")).toBe(false);
  });

  it("rejects empty / nullish ids", () => {
    expect(isResolvedDocumentId("")).toBe(false);
    expect(isResolvedDocumentId(null)).toBe(false);
    expect(isResolvedDocumentId(undefined)).toBe(false);
  });

  it("accepts colon-free stub ids (test fixtures)", () => {
    expect(isResolvedDocumentId("doc-1")).toBe(true);
  });
});
