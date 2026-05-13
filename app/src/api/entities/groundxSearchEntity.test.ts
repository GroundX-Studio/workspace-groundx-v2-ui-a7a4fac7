import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import { searchGroundXContent, searchGroundXDocuments } from "./groundxSearchEntity";

describe("groundxSearchEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.post.mockResolvedValue({ data: {} });
  });

  it("posts content search with encoded source id, body filters, and query params", async () => {
    await searchGroundXContent({
      id: "bucket/one",
      query: "contract",
      relevance: 7,
      filter: { type: "nda" },
      n: 25,
      nextToken: "next",
      verbosity: 1,
    });

    expect(axiosMock.post).toHaveBeenCalledWith(
      "/api/v1/search/bucket%2Fone",
      { query: "contract", relevance: 7, filter: { type: "nda" } },
      expect.objectContaining({ params: { n: 25, nextToken: "next", verbosity: 1 } })
    );
  });

  it("posts document search with document ids in the body", async () => {
    await searchGroundXDocuments({ documentIds: ["doc-1"], query: "hello", nextToken: "next" });

    expect(axiosMock.post).toHaveBeenCalledWith(
      "/api/v1/search/documents",
      { documentIds: ["doc-1"], query: "hello" },
      expect.objectContaining({ params: { nextToken: "next" } })
    );
  });
});
