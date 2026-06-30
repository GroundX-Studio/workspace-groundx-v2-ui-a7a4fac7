/**
 * Tiny throwing assert used by intent fixtures.
 *
 * Fixtures must stay free of `vitest` so the dev intent harness can import the
 * fixture data without pulling a test framework into the app bundle. The replay
 * engine (test-only) wraps these throwing asserts in `waitFor`.
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`intent fixture assertion failed: ${message}`);
  }
}
