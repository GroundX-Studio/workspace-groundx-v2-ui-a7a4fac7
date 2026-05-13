import { describe, expect, it } from "vitest";

import {
  groundxRequestConfig,
  groundxUrl,
  llmRequestConfig,
  llmUrl,
  middlewareUrl,
  paramsWithPagination,
  partnerRequestConfig,
  partnerUrl,
} from "./common";

describe("SDK API common helpers", () => {
  it("builds API-family URLs from configured base URLs", () => {
    expect(middlewareUrl).toBe("/api");
    expect(groundxUrl("/v1/search/documents")).toBe("/api/v1/search/documents");
    expect(partnerUrl("/bucket")).toBe("/api/bucket");
    expect(llmUrl("/chat/completions")).toBe("/api/llm/chat/completions");
  });

  it("normalizes optional pagination params without leaking undefined values", () => {
    expect(paramsWithPagination()).toEqual({});
    expect(paramsWithPagination({ n: 20 })).toEqual({ n: 20 });
    expect(paramsWithPagination({ nextToken: "next" })).toEqual({ nextToken: "next" });
    expect(paramsWithPagination({ n: 0, nextToken: "" })).toEqual({ n: 0 });
  });

  it("builds GroundX request config without browser-side secrets", () => {
    const controller = new AbortController();

    expect(groundxRequestConfig({ signal: controller.signal })).toEqual({
      signal: controller.signal,
    });

    expect(groundxRequestConfig()).toEqual({ signal: undefined });
  });

  it("builds Partner request config without browser-side customer headers", () => {
    const controller = new AbortController();

    expect(partnerRequestConfig({ signal: controller.signal })).toEqual({
      signal: controller.signal,
    });

    expect(partnerRequestConfig()).toEqual({ signal: undefined });
  });

  it("builds LLM proxy config without exposing provider credentials", () => {
    const controller = new AbortController();

    expect(llmRequestConfig({ signal: controller.signal })).toEqual({
      signal: controller.signal,
    });
  });
});
