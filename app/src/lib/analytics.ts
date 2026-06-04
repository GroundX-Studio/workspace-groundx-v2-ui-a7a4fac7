/**
 * OB-02 — thin PostHog wrapper. Same pattern as `sentry.ts`:
 *
 *   - `initAnalytics(apiKey, host?)` is idempotent. When `apiKey` is
 *     unset/empty, the wrapper records "not configured" and every
 *     subsequent `track` / `identify` call is a silent no-op. Dev,
 *     CI, and local-preview deploys don't need to wire a real key.
 *   - `track(event, props?)` and `identify(distinctId, props?)` are
 *     thin pass-throughs. They never throw — failed captures are
 *     dropped silently rather than spamming Sentry; we don't want a
 *     PostHog outage to fill our error budget.
 *
 * Wire-up: `AnalyticsConsentProvider` calls
 * `initAnalytics(import.meta.env.VITE_POSTHOG_API_KEY,
 * import.meta.env.VITE_POSTHOG_HOST)` after consent.
 *
 * Catch-side: every funnel boundary calls `track("event.name", { extras })`.
 * Named-event durable contract: `openspec/specs/observability/spec.md`.
 * Adding a new event = adding the right `track(...)` call; no new
 * wrapper code needed.
 *
 * NOT in scope for this helper:
 *   - GA4 dimensions (handled by `./ga`)
 *   - Hotjar (see `openspec/specs/observability/spec.md` — Hotjar requirement)
 *   - Custom session-recording / autocapture defaults — kept minimal.
 */

import posthog from "posthog-js";

import { gaTrack } from "./ga";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

let initialized = false;

/**
 * One-shot init. Returns `true` when PostHog was configured; `false`
 * when the apiKey is unset/empty (no-op mode). Idempotent so hot
 * reloads + double-mounts don't double-fire `posthog.init`.
 */
export function initAnalytics(apiKey: string | undefined | null, host?: string): boolean {
  if (initialized) return true;
  if (!apiKey) return false;
  posthog.init(apiKey, {
    api_host: host && host.length > 0 ? host : DEFAULT_POSTHOG_HOST,
    // Defer to PostHog defaults for capture/autocapture; we'll opt
    // into session_recording explicitly via OB-04 when Hotjar is wired.
    // capture_pageview defaults to true — keep it for the basic funnel.
    persistence: "localStorage+cookie",
  });
  initialized = true;
  return true;
}

/**
 * Fire a named event. Silent no-op until `initAnalytics` was called
 * with a real key. Use the canonical event names from
 * `openspec/specs/observability/spec.md`:
 * session.started / sample.picked / understand.started /
 * understand.completed / extract.field_hovered / cite.peeked /
 * gate.shown / signup.completed / session.mode_flipped_to_steady /
 * report.pinned / report.section_added / report.rendered.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  // OB-03 — fan out to GA4 first so a PostHog failure doesn't skip
  // the GA push. `gaTrack` is a no-op when GA wasn't initialized, so
  // single-provider deployments stay clean.
  gaTrack(event, props);
  if (!initialized) return;
  try {
    posthog.capture(event, props);
  } catch {
    // Swallow — analytics should never break the app.
  }
}

/**
 * Tie subsequent events to a stable distinct_id. Typical call sites:
 *
 *   - Onboarding bootstrap: identify(anonId)
 *   - Sign-up commit: identify(groundxUsername, { upgradedFromAnonId: anonId })
 */
export function identify(distinctId: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.identify(distinctId, props);
  } catch {
    // see track()
  }
}

/**
 * Forget the current identified user (e.g. on logout). Subsequent
 * events get a fresh distinct_id.
 */
export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // see track()
  }
}
