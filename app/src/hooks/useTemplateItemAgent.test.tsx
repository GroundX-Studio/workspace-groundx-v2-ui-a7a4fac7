import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RewriteItemResult } from "@groundx/shared";

import { ApiProvider } from "@/contexts/ApiContext";
import { makeFakeApi } from "@/test/makeFakeApi";
import { useTemplateItemAgent } from "./useTemplateItemAgent";

const proposal: RewriteItemResult = {
  kind: "extract-field",
  proposedItem: { id: "f1", name: "addressee", type: "STRING", description: "improved", instructions: ["r"] },
  reasoning: "tightened",
};

function wrapperWith(rewrite: (input: unknown) => Promise<unknown>) {
  const api = makeFakeApi({ templateItem: { rewrite } } as never);
  return ({ children }: { children: ReactNode }) => <ApiProvider value={api}>{children}</ApiProvider>;
}

describe("useTemplateItemAgent", () => {
  const field = { id: "f1", name: "addressee", type: "STRING" as const, description: "the recipient name" };

  it("requestRewrite stores the proposal on success", async () => {
    const rewrite = vi.fn(async () => proposal);
    const { result } = renderHook(() => useTemplateItemAgent("extract-field"), { wrapper: wrapperWith(rewrite) });
    await act(async () => {
      await result.current.requestRewrite({ chatSessionId: "chat-1", item: field });
    });
    expect(rewrite).toHaveBeenCalledWith(expect.objectContaining({ chatSessionId: "chat-1", kind: "extract-field", item: field }));
    const p = result.current.proposal;
    expect(p?.kind).toBe("extract-field");
    if (p?.kind === "extract-field") expect(p.proposedItem.description).toBe("improved");
    expect(result.current.rewriting).toBe(false);
    expect(result.current.rewriteError).toBeNull();
  });

  it("captures an error and clears rewriting", async () => {
    const rewrite = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useTemplateItemAgent("extract-field"), { wrapper: wrapperWith(rewrite) });
    await act(async () => {
      await result.current.requestRewrite({ chatSessionId: "chat-1", item: field });
    });
    await waitFor(() => expect(result.current.rewriteError).toBe("boom"));
    expect(result.current.proposal).toBeNull();
    expect(result.current.rewriting).toBe(false);
  });

  it("discardProposal clears the proposal", async () => {
    const rewrite = vi.fn(async () => proposal);
    const { result } = renderHook(() => useTemplateItemAgent("extract-field"), { wrapper: wrapperWith(rewrite) });
    await act(async () => {
      await result.current.requestRewrite({ chatSessionId: "chat-1", item: field });
    });
    expect(result.current.proposal).not.toBeNull();
    act(() => result.current.discardProposal());
    expect(result.current.proposal).toBeNull();
  });
});
