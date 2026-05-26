import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { useBucketsContext } from "@/contexts/BucketsContext";
import { BucketsProvider } from "@/contexts/BucketsContext/BucketsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";

/**
 * TS-02 — BucketsProvider coverage.
 *
 * The provider wraps `api.groundxBuckets.*` and `api.partnerBuckets.*`
 * calls in a shared `run()` helper that funnels into LoadingContext
 * + MessageBarContext. We mock the API surface and assert three
 * contracts: list populates state, create updates state + emits a
 * success message, and a thrown error surfaces the failure message
 * (no crash, isSuccess=false).
 */
vi.mock("@/api", () => ({
  api: {
    groundxBuckets: {
      listGroundXBuckets: vi.fn(),
      getGroundXBucket: vi.fn(),
      createGroundXBucket: vi.fn(),
      updateGroundXBucket: vi.fn(),
      deleteGroundXBucket: vi.fn(),
    },
    partnerBuckets: {
      listPartnerBuckets: vi.fn(),
      getPartnerBucket: vi.fn(),
      createPartnerBucket: vi.fn(),
      updatePartnerBucket: vi.fn(),
      deletePartnerBucket: vi.fn(),
    },
  },
}));

beforeEach(() => {
  // Reset only the methods we touch — vi.mocked is enough since the
  // module is mocked above.
  for (const fn of Object.values(api.groundxBuckets)) (fn as Mock).mockReset();
  for (const fn of Object.values(api.partnerBuckets)) (fn as Mock).mockReset();
  // Formik-style state churn isn't relevant here, but the global
  // throw-on-console.error spy still fires if a provider warns.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LoadingProvider>
    <MessageBarProvider>
      <BucketsProvider>{children}</BucketsProvider>
    </MessageBarProvider>
  </LoadingProvider>
);

describe("BucketsProvider (TS-02)", () => {
  it("listGroundXBuckets populates `groundxBuckets` state on success", async () => {
    const fakeBuckets = [
      { bucketId: 1, name: "alpha" },
      { bucketId: 2, name: "beta" },
    ];
    (api.groundxBuckets.listGroundXBuckets as Mock).mockResolvedValue({ buckets: fakeBuckets });

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
    (api.groundxBuckets.createGroundXBucket as Mock).mockResolvedValue({ bucket: newBucket });

    // Seed initial state with one bucket so we can assert the prepend.
    (api.groundxBuckets.listGroundXBuckets as Mock).mockResolvedValue({
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
    (api.groundxBuckets.listGroundXBuckets as Mock).mockRejectedValue(new Error("network down"));

    const combined = renderHook(
      () => ({
        buckets: useBucketsContext(),
        msg: useMessageContext(),
      }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; error: unknown } | undefined;
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
