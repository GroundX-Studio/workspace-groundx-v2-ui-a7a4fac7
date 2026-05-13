export interface SdkActionResult<T = unknown> {
  isSuccess: boolean;
  response: T | null;
  error: unknown;
}

export const createSdkResult = <T>(): SdkActionResult<T> => ({
  isSuccess: false,
  response: null,
  error: null,
});

