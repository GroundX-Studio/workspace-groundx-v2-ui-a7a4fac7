import { QueryClient } from "@tanstack/react-query";

/**
 * The app's single server-state layer (adopt-tanstack-query, wave step 1).
 *
 * Why this exists: every remote read used to be a hand-rolled Context +
 * `useEffect` with no cache, no dedup, no invalidation — the direct cause of
 * the Interact↔Extract toggle churn (each sub-pill remount re-hit GroundX and
 * could flash COULD-NOT-LOAD). TanStack Query owns caching/loading/error; the
 * `SdkActionResult` factory stays at the SDK boundary and a `queryFn` adapts it.
 *
 * Retry is a PREDICATE, not a blanket count. The viewer's X-Ray read
 * (`DocumentsProvider.getDocumentXray`) deliberately retried only the network
 * fetch and let a malformed payload fail fast — a parse/validation error is a
 * CONSISTENT error, re-fetching wastes time. So: retry transient network/5xx up
 * to twice; NEVER retry a 4xx or a parse/validation error (tag those below).
 */

/** Tag a thrown error as non-retryable (parse/validation). `queryFn`s that parse
 *  a payload should throw an error carrying this so retry skips it. */
export const NON_RETRYABLE = "__nonRetryable" as const;

export function markNonRetryable<E extends object>(err: E): E {
  try {
    (err as Record<string, unknown>)[NON_RETRYABLE] = true;
  } catch {
    /* frozen error — fall through; the status/name checks below still apply */
  }
  return err;
}

/** Extract an HTTP status from common shapes (ApiError, axios-like, fetch Response). */
function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const raw =
    (typeof e.status === "number" && e.status) ||
    (typeof e.statusCode === "number" && e.statusCode) ||
    (typeof (e.response as Record<string, unknown> | undefined)?.status === "number" &&
      ((e.response as Record<string, unknown>).status as number));
  return typeof raw === "number" ? raw : undefined;
}

/** The retry decision — exported so it can be unit-tested in isolation. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false; // at most 2 retries (3 attempts)
  if (error && typeof error === "object" && (error as Record<string, unknown>)[NON_RETRYABLE]) {
    return false; // parse/validation — consistent error, fail fast
  }
  const status = statusOf(error);
  if (status !== undefined && status >= 400 && status < 500) return false; // client error — don't retry
  return true; // transient network / 5xx
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stable demo documents shouldn't refetch within a session; a remount
        // (Interact↔Extract toggle) reads the cache instead of re-hitting GroundX.
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(250 * 2 ** attempt, 2000),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

/** Production singleton. Tests build their own via `makeQueryClient()`. */
export const queryClient = makeQueryClient();
