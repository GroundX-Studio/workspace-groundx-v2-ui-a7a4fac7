/**
 * CF-13 — thin Sentry wrapper. Two reasons for the wrapper instead of
 * importing `@sentry/browser` directly at call sites:
 *
 *   1. DSN-not-set is the common dev/test/local case. The wrapper makes
 *      every `captureException` a silent no-op when no DSN was wired,
 *      so individual catch sites don't need an `if (env.DSN)` guard.
 *   2. Tests need to assert "captureException was called" without
 *      actually shipping events. Mocking the wrapper module is simpler
 *      than mocking `@sentry/browser`.
 *
 * Wire-up:
 *   - `main.tsx` calls `initSentry(import.meta.env.VITE_SENTRY_DSN)`
 *     once at boot. If the env var is unset, the wrapper records that
 *     "we never init'd" and all subsequent `captureException` calls
 *     return immediately.
 *   - Catch sites that previously called `console.error(err)` now call
 *     `captureException(err, { extras })`. The wrapper passes the extras
 *     through as Sentry scope metadata.
 *
 * NOT in scope for CF-13:
 *   - Breadcrumb / span instrumentation (left for OB-05+).
 *   - User-context tagging (waiting on a session id we trust to be
 *     non-PII).
 */

import * as Sentry from "@sentry/browser";

let initialized = false;

/**
 * One-shot init. Returns true when Sentry was actually configured;
 * false when the DSN was unset/empty (no-op mode). Subsequent calls
 * with the same outcome are no-ops — `initSentry` is idempotent so
 * hot-reload + double-mounts don't double-fire `Sentry.init`.
 */
export function initSentry(dsn: string | undefined | null): boolean {
  if (initialized) return true;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    // Sample rates — keep zero by default so deploys that wire DSN
    // get error coverage without unintentionally enabling perf/traces
    // before we've decided on the contract.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  initialized = true;
  return true;
}

/**
 * Capture an exception. Silent no-op when `initSentry` was never
 * called with a real DSN. The `extras` argument lets the caller add
 * route / user-action context to the event:
 *
 *   captureException(err, { route: "/api/chat/messages", chatSessionId });
 *
 * Sentry's scope API takes `extra` as a sub-object; the wrapper does
 * that mapping so callers don't have to think about it.
 */
export function captureException(
  error: unknown,
  extras?: Record<string, unknown>,
): void {
  if (!initialized) return;
  if (extras && Object.keys(extras).length > 0) {
    Sentry.captureException(error, { extra: extras });
  } else {
    Sentry.captureException(error);
  }
}
