import { renderHook, act } from "@testing-library/react";
import { ReactNode, createContext } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setIsLoading: vi.fn(),
  setErrorMessage: vi.fn(),
  setSuccessMessage: vi.fn(),
}));

vi.mock("@/contexts/LoadingContext", () => ({ useIsLoading: () => ({ setIsLoading: mocks.setIsLoading }) }));
vi.mock("@/contexts/MessageBarContext", () => ({
  useMessageContext: () => ({ setErrorMessage: mocks.setErrorMessage, setSuccessMessage: mocks.setSuccessMessage }),
}));

import { useSdkRunner, createContextHook } from "@/contexts/createEntityContext";

describe("useSdkRunner", () => {
  it("wraps a successful unit of work into an SdkActionResult success", async () => {
    const { result } = renderHook(() => useSdkRunner("Op failed."));
    let out: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      out = await result.current(async () => 7, "Done.");
    });
    expect(out).toMatchObject({ isSuccess: true, response: 7 });
    expect(mocks.setIsLoading).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(mocks.setSuccessMessage).toHaveBeenCalledWith("Done.");
  });

  it("wraps a thrown unit of work into an SdkActionResult failure with the default message", async () => {
    const { result } = renderHook(() => useSdkRunner("Op failed."));
    const boom = new Error("nope");
    let out: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      out = await result.current(async () => {
        throw boom;
      });
    });
    expect(out).toMatchObject({ isSuccess: false, response: null });
    expect(out && out.isSuccess === false && out.error).toBe(boom);
    expect(mocks.setErrorMessage).toHaveBeenCalledWith("Op failed.");
    expect(mocks.setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it("honors a per-call error message override", async () => {
    const { result } = renderHook(() => useSdkRunner("Default."));
    await act(async () => {
      await result.current(
        async () => {
          throw new Error("x");
        },
        undefined,
        "Specific failure."
      );
    });
    expect(mocks.setErrorMessage).toHaveBeenCalledWith("Specific failure.");
  });
});

describe("createContextHook", () => {
  interface Thing {
    value: number;
  }
  const ThingContext = createContext<Thing | undefined>(undefined);
  const useThing = createContextHook(ThingContext, "useThing must be used inside a ThingProvider");

  it("returns the context value when inside a provider", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ThingContext.Provider value={{ value: 9 }}>{children}</ThingContext.Provider>
    );
    const { result } = renderHook(() => useThing(), { wrapper });
    expect(result.current.value).toBe(9);
  });

  it("throws the supplied message when used outside a provider", () => {
    // React logs the thrown render error via console.error; the global test
    // setup turns any console.error into a hard failure, so silence it here
    // (mirrors the same pattern in sdkContexts.test.tsx).
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useThing()).result.current).toThrow(/ThingProvider/);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
