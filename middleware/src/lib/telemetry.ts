/**
 * Observability bootstrap stub.
 *
 * Production wiring lands in Phase 7. This file is the single entry point
 * deployments configure via env vars:
 *   - `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry collector
 *   - `OTEL_SERVICE_NAME`           — service identifier
 *   - `POSTHOG_API_KEY`             — server-side capture (off when absent)
 *   - `POSTHOG_HOST`                — defaults to PostHog cloud
 *   - `SENTRY_DSN`                  — server error pipeline (off when absent)
 *
 * We do NOT import the OpenTelemetry SDK eagerly — it would bloat startup
 * even when no exporter is configured. The init function is a no-op when env
 * vars are absent; we'll plug in the real SDK in Phase 6/7 when telemetry
 * goes live. PostHog is wired conditionally so logs are still useful in dev.
 */

import { logger } from "./logger.js";
import { scrubValue } from "./pii.js";

interface PosthogClient {
  capture: (event: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  shutdown: () => Promise<void>;
}

let posthog: PosthogClient | null = null;

export interface TelemetryEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  SENTRY_DSN?: string;
}

export async function initTelemetry(env: TelemetryEnv): Promise<void> {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Wired in Phase 7 alongside @opentelemetry/sdk-node.
    logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }, "OTel exporter configured (stub)");
  }
  if (env.POSTHOG_API_KEY) {
    try {
      const mod = (await import("posthog-node")) as { PostHog: new (key: string, opts?: { host?: string }) => PosthogClient };
      posthog = new mod.PostHog(env.POSTHOG_API_KEY, env.POSTHOG_HOST ? { host: env.POSTHOG_HOST } : undefined);
      logger.info({ host: env.POSTHOG_HOST ?? "default" }, "PostHog server client initialized");
    } catch (error) {
      logger.warn({ err: error }, "PostHog init failed");
    }
  }
  if (env.SENTRY_DSN) {
    // Wired in Phase 7 alongside @sentry/node.
    logger.info("Sentry DSN configured (stub)");
  }
}

export function captureEvent(distinctId: string, event: string, properties?: Record<string, unknown>): void {
  if (!posthog) return;
  const scrubbed = properties ? scrubValue(properties) : undefined;
  posthog.capture({ distinctId, event, properties: scrubbed });
}

export async function shutdownTelemetry(): Promise<void> {
  if (posthog) {
    await posthog.shutdown();
    posthog = null;
  }
}
