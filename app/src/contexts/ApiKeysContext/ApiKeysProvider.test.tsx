import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { useApiKeysContext } from "@/contexts/ApiKeysContext";
import { ApiKeysProvider } from "@/contexts/ApiKeysContext/ApiKeysProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";

/**
 * TS-02 — ApiKeysProvider coverage. Wraps `api.groundxApiKeys.*` +
 * `api.partnerApiKeys.*` calls. Critical: real key values must never
 * appear in test fixtures — the API key field is the bearer secret.
 * Use stub values that obviously aren't real keys ("test-key-stub").
 *
 * Three contracts: list populates state, create emits success,
 * error path surfaces "API key operation failed."
 */
vi.mock("@/api", () => ({
  api: {
    groundxApiKeys: {
      listGroundXApiKeys: vi.fn(),
      createGroundXApiKey: vi.fn(),
      renameGroundXApiKey: vi.fn(),
      deleteGroundXApiKey: vi.fn(),
    },
    partnerApiKeys: {
      listPartnerApiKeys: vi.fn(),
      createPartnerApiKey: vi.fn(),
      renamePartnerApiKey: vi.fn(),
      deletePartnerApiKey: vi.fn(),
    },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(api.groundxApiKeys)) (fn as Mock).mockReset();
  for (const fn of Object.values(api.partnerApiKeys)) (fn as Mock).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LoadingProvider>
    <MessageBarProvider>
      <ApiKeysProvider>{children}</ApiKeysProvider>
    </MessageBarProvider>
  </LoadingProvider>
);

describe("ApiKeysProvider (TS-02)", () => {
  it("listGroundXApiKeys populates `groundxApiKeys` state on success", async () => {
    const fake = [
      { apiKey: "test-key-stub-1", name: "alpha" },
      { apiKey: "test-key-stub-2", name: "beta" },
    ];
    (api.groundxApiKeys.listGroundXApiKeys as Mock).mockResolvedValue({ apiKeys: fake });

    const { result } = renderHook(() => useApiKeysContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listGroundXApiKeys();
    });

    expect(api.groundxApiKeys.listGroundXApiKeys).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.groundxApiKeys).toEqual(fake);
  });

  it("createGroundXApiKey replaces state with the response list + emits 'API key created.'", async () => {
    // The provider sets the full list from the response (server is
    // authoritative on the key list, unlike Buckets which prepends).
    const after = [
      { apiKey: "test-key-stub-old", name: "old" },
      { apiKey: "test-key-stub-new", name: "fresh" },
    ];
    (api.groundxApiKeys.createGroundXApiKey as Mock).mockResolvedValue({ apiKeys: after });

    const { result } = renderHook(
      () => ({ keys: useApiKeysContext(), msg: useMessageContext() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.keys.createGroundXApiKey("fresh");
    });

    expect(api.groundxApiKeys.createGroundXApiKey).toHaveBeenCalledWith("fresh", undefined);
    expect(result.current.keys.groundxApiKeys).toEqual(after);
    expect(result.current.msg.successMessage).toBe("API key created.");
  });

  it("a thrown API error surfaces 'API key operation failed.' and isSuccess=false", async () => {
    (api.groundxApiKeys.listGroundXApiKeys as Mock).mockRejectedValue(new Error("forbidden"));

    const { result } = renderHook(
      () => ({ keys: useApiKeysContext(), msg: useMessageContext() }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; error: unknown } | undefined;
    await act(async () => {
      actionResult = await result.current.keys.listGroundXApiKeys();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(result.current.msg.errorMessage).toBe("API key operation failed.");
    });
    expect(result.current.keys.groundxApiKeys).toEqual([]);
  });
});
