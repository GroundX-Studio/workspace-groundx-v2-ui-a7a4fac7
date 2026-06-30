import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { useHealthContext } from "@/contexts/HealthContext";
import { HealthProvider } from "@/contexts/HealthContext/HealthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";
import { makeFakeApi } from "@/test/makeFakeApi";

/**
 * TS-02 — HealthProvider coverage. Wraps injected `api.groundxHealth.*` calls.
 * Unlike the other providers there's no success message — just a
 * single error string ("Could not load service health."). Three
 * contracts: listHealth populates state, getServiceHealth populates
 * selectedService, error path surfaces the failure copy.
 */
let api: ReturnType<typeof makeFakeApi>;

beforeEach(() => {
  api = makeFakeApi();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ApiProvider value={api}>
    <LoadingProvider>
      <MessageBarProvider>
        <HealthProvider>{children}</HealthProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

describe("HealthProvider (TS-02)", () => {
  it("listHealth populates `services` state on success", async () => {
    const fake = [
      { name: "groundx-api", status: "ok" },
      { name: "ingest", status: "degraded" },
    ];
    vi.mocked(api.groundxHealth.listGroundXHealth).mockResolvedValue({ health: fake });

    const { result } = renderHook(() => useHealthContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listHealth();
    });

    expect(api.groundxHealth.listGroundXHealth).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.services).toEqual(fake);
  });

  it("getServiceHealth populates `selectedService` state on success", async () => {
    const fake = { name: "ingest", status: "ok" };
    vi.mocked(api.groundxHealth.getGroundXServiceHealth).mockResolvedValue({ health: fake });

    const { result } = renderHook(() => useHealthContext(), { wrapper });
    await act(async () => {
      await result.current.getServiceHealth("ingest");
    });

    expect(api.groundxHealth.getGroundXServiceHealth).toHaveBeenCalledWith("ingest", undefined);
    expect(result.current.selectedService).toEqual(fake);
  });

  it("a thrown API error surfaces 'Could not load service health.' and isSuccess=false", async () => {
    vi.mocked(api.groundxHealth.listGroundXHealth).mockRejectedValue(new Error("net down"));

    const { result } = renderHook(
      () => ({ health: useHealthContext(), msg: useMessageContext() }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; response?: unknown; error?: unknown } | undefined;
    await act(async () => {
      actionResult = await result.current.health.listHealth();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(result.current.msg.errorMessage).toBe("Could not load service health.");
    });
    expect(result.current.health.services).toEqual([]);
  });
});
