import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { useBucketsContext } from "@/contexts/BucketsContext";
import { BucketsProvider } from "@/contexts/BucketsContext/BucketsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";
import { makeFakeApi } from "@/test/makeFakeApi";

/**
 * TS-02 — BucketsProvider coverage.
 *
 * The provider wraps injected `api.groundxBuckets.*` and `api.partnerBuckets.*`
 * calls in a shared `run()` helper that funnels into LoadingContext
 * + MessageBarContext. We inject one fake API surface and assert three
 * contracts: list populates state, create updates state + emits a
 * success message, and a thrown error surfaces the failure message
 * (no crash, isSuccess=false).
 */
let api: ReturnType<typeof makeFakeApi>;

beforeEach(() => {
  api = makeFakeApi();
  // Formik-style state churn isn't relevant here, but the global
  // throw-on-console.error spy still fires if a provider warns.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ApiProvider value={api}>
    <LoadingProvider>
      <MessageBarProvider>
        <BucketsProvider>{children}</BucketsProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

describe("BucketsProvider (TS-02)", () => {
  it("listGroundXBuckets populates `groundxBuckets` state on success", async () => {
    const fakeBuckets = [
      { bucketId: 1, name: "alpha" },
      { bucketId: 2, name: "beta" },
    ];
    vi.mocked(api.groundxBuckets.listGroundXBuckets).mockResolvedValue({ buckets: fakeBuckets });

    const { result } = renderHook(() => useBucketsContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listGroundXBuckets();
    });

    expect(api.groundxBuckets.listGroundXBuckets).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.groundxBuckets).toEqual(fakeBuckets);
  });

  it("createGroundXBucket prepends the new bucket and emits the success message", async () => {
    const newBucket = { bucketId: 9, name: "fresh" };
    vi.mocked(api.groundxBuckets.createGroundXBucket).mockResolvedValue({ bucket: newBucket });

    // Seed initial state with one bucket so we can assert the prepend.
    vi.mocked(api.groundxBuckets.listGroundXBuckets).mockResolvedValue({
      buckets: [{ bucketId: 1, name: "alpha" }],
    });

    // We need to read MessageBarContext alongside the bucket hook;
    // wrap a combined hook.
    const combined = renderHook(
      () => ({
        buckets: useBucketsContext(),
        msg: useMessageContext(),
      }),
      { wrapper },
    );

    await act(async () => {
      await combined.result.current.buckets.listGroundXBuckets();
    });
    await act(async () => {
      await combined.result.current.buckets.createGroundXBucket("fresh");
    });

    expect(combined.result.current.buckets.groundxBuckets[0]).toEqual(newBucket);
    expect(combined.result.current.buckets.groundxBuckets).toHaveLength(2);
    expect(combined.result.current.msg.successMessage).toBe("Bucket created.");
  });

  it("a thrown API error surfaces the failure message and isSuccess=false", async () => {
    vi.mocked(api.groundxBuckets.listGroundXBuckets).mockRejectedValue(new Error("network down"));

    const combined = renderHook(
      () => ({
        buckets: useBucketsContext(),
        msg: useMessageContext(),
      }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; response?: unknown; error?: unknown } | undefined;
    await act(async () => {
      actionResult = await combined.result.current.buckets.listGroundXBuckets();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(combined.result.current.msg.errorMessage).toBe("Bucket operation failed.");
    });
    // State remains empty — no partial update on failure.
    expect(combined.result.current.buckets.groundxBuckets).toEqual([]);
  });
});
