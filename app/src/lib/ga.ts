/**
 * OB-03 — GA4 gtag wrapper. Same pattern as `sentry.ts` and
 * `analytics.ts`:
 *
 *   - `initGa(measurementId)` is idempotent + no-op when unset.
 *   - `gaTrack(event, props?)` silent until init.
 *   - `gaSetDefaults(partial)` makes the four OB-03 dimensions
 *     (sessionId / appMode / currentSample / llmProvider) sticky on
 *     subsequent events via gtag's `set` call.
 *
 * The loader script is injected once; subsequent `initGa` calls are
 * idempotent no-ops. Catch sites never throw — failed pushes drop
 * silently rather than spamming Sentry.
 *
 * Wire-up: `AnalyticsConsentProvider` calls
 * `initGa(import.meta.env.VITE_GA_MEASUREMENT_ID)` after consent. The 4
 * dimensions get set by individual contexts at the right boundary
 * (session bootstrap → sessionId; pickScenario → currentSample;
 * AppModeContext init → appMode; LLM-provider env → llmProvider).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
let pendingDefaults: GaDefaults = {};
let hasPendingDefaults = false;

function ensureGtagShim(): void {
  if (typeof window === "undefined") return;
  if (!window.dataLayer) window.dataLayer = [];
  if (typeof window.gtag !== "function") {
    // Standard gtag shim: pushes args to dataLayer. We capture every
    // call to dataLayer so even pre-loader-script invocations land.
    window.gtag = function gtag(...args: unknown[]): void {
      window.dataLayer!.push(args);
    };
  }
}

/**
 * One-shot init. Returns `true` when GA was configured; `false` when
 * the measurementId was unset/empty. Idempotent so hot reloads + double
 * mounts don't double-inject the loader script.
 */
export function initGa(measurementId: string | undefined | null): boolean {
  if (initialized) return true;
  if (!measurementId) return false;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  ensureGtagShim();
  // Inject the gtag.js loader. The shim above already exists so any
  // gtag() calls before the loader resolves still queue into
  // dataLayer; gtag.js picks them up on load.
  const existing = document.querySelector("script[data-ga-loader]");
  if (!existing) {
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-ga-loader", "true");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
  // Standard gtag init sequence.
  window.gtag!("js", new Date());
  window.gtag!("config", measurementId, {
    // Defer to GA's default page-view tracking; OB-02 PostHog handles
    // the named-event funnel separately. GA gets the dimension-level
    // visibility plus auto-collected page views.
    send_page_view: true,
  });
  initialized = true;
  if (hasPendingDefaults) emitDefaults(pendingDefaults);
  return true;
}

/**
 * Push a named event. Silent no-op until `initGa` was called with a
 * real measurement id. Props become GA event parameters; the four
 * OB-03 dimensions are inherited from `gaSetDefaults` via gtag's
 * sticky `set` semantics.
 */
export function gaTrack(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", event, props ?? {});
  } catch {
    // Swallow — analytics never breaks the app.
  }
}

/**
 * Update the OB-03 custom dimensions. `partial` may contain any
 * subset of `{ sessionId, appMode, currentSample, llmProvider }`;
 * gtag's `set` semantics make these properties sticky on subsequent
 * events. Callers don't have to remember which fields they already
 * set — every update merges into the gtag scope.
 */
export interface GaDefaults {
  sessionId?: string;
  appMode?: string;
  currentSample?: string;
  llmProvider?: string;
}

function emitDefaults(partial: GaDefaults): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("set", partial);
  } catch {
    // see gaTrack()
  }
}

export function gaSetDefaults(partial: GaDefaults): void {
  pendingDefaults = { ...pendingDefaults, ...partial };
  hasPendingDefaults = true;
  if (!initialized) return;
  emitDefaults(partial);
}
