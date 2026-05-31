/**
 * The result of an SDK-backed entity action (a context CRUD call).
 *
 * Modeled as a DISCRIMINATED UNION on `isSuccess` so the old limbo state
 * (`{ isSuccess: false; response: null; error: null }` — claims failure but
 * carries no error) is unrepresentable. Narrowing on `isSuccess` exposes:
 *   - success: a real `response: T` (never null),
 *   - failure: a non-null `error`, and `response: null` (kept so the many
 *     callers that read `result.response` without narrowing keep compiling).
 */
export type SdkActionResult<T = unknown> =
  | { isSuccess: true; response: T; error?: undefined }
  | { isSuccess: false; response: null; error: NonNullable<unknown> };

/** Build the success arm of an `SdkActionResult<T>`. */
export const sdkSuccess = <T>(response: T): SdkActionResult<T> => ({
  isSuccess: true,
  response,
});

/** Build the failure arm of an `SdkActionResult<T>` from a caught value. */
export const sdkFailure = <T = unknown>(error: unknown): SdkActionResult<T> => ({
  isSuccess: false,
  response: null,
  // A thrown value is conceptually non-null; coerce a stray null/undefined to a
  // real Error so the union's `NonNullable` contract is never violated.
  error: error ?? new Error("Unknown error"),
});
