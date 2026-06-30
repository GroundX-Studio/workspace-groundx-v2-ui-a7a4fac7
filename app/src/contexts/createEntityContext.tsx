import { Context, useCallback, useContext } from "react";

import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { SdkActionResult, sdkFailure, sdkSuccess } from "@/contexts/sdkContextTypes";

/**
 * Context-side factory for the entity CRUD contexts
 * (Buckets / Documents / Groups / Projects / Workflows / ApiKeys / Search / Health).
 *
 * Two genuine duplications across those ~8 contexts are folded here:
 *
 *  1. `useSdkRunner` — the byte-identical `run = useCallback(...)` helper that
 *     lived in 6 providers (Buckets/Documents/Groups/Projects/Workflows/ApiKeys)
 *     and an inlined twin in Search/Health: toggle loading, run the work,
 *     surface success/error messages, and return an `SdkActionResult<T>`.
 *
 *  2. `createContextHook` — the `useContext(C); if (!c) throw; return c;` hook
 *     body duplicated in every context's `index.tsx`.
 *
 * The runner is the single place that BUILDS an `SdkActionResult`, so the
 * success/error limbo cannot be constructed by hand at a call-site.
 */

/** Run a unit of work, returning a discriminated `SdkActionResult<T>`. */
export type SdkRunner = <T>(
  work: () => Promise<T>,
  successMessage?: string,
  errorMessage?: string
) => Promise<SdkActionResult<T>>;

/**
 * Hook returning an {@link SdkRunner} bound to this provider's default error
 * message. Replaces the per-provider `run` helper.
 */
export const useSdkRunner = (defaultErrorMessage: string): SdkRunner => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();

  return useCallback(
    async <T,>(work: () => Promise<T>, successMessage?: string, errorMessage?: string): Promise<SdkActionResult<T>> => {
      setIsLoading(true);
      try {
        const response = await work();
        if (successMessage) setSuccessMessage(successMessage);
        return sdkSuccess(response);
      } catch (error) {
        setErrorMessage(errorMessage ?? defaultErrorMessage);
        return sdkFailure<T>(error);
      } finally {
        setIsLoading(false);
      }
    },
    [defaultErrorMessage, setErrorMessage, setIsLoading, setSuccessMessage]
  );
};

/**
 * Build a `useXContext` hook for a context, throwing `notFoundMessage` when
 * used outside its provider. Replaces the duplicated hook body in every
 * context `index.tsx`.
 */
export const createContextHook = <T,>(context: Context<T | undefined>, notFoundMessage: string): (() => T) => {
  return () => {
    const value = useContext(context);
    if (value === undefined) throw new Error(notFoundMessage);
    return value;
  };
};
