/**
 * Observability bootstrap.
 *
 * Single entry point deployments configure via env vars:
 *   - `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry collector endpoint
 *     (e.g. AWS ADOT → X-Ray cloud, Tempo / Jaeger on-prem).
 *   - `OTEL_SERVICE_NAME`           — service identifier.
 *   - `POSTHOG_API_KEY`             — server-side capture (off when absent).
 *   - `POSTHOG_HOST`                — defaults to PostHog cloud.
 *   - `SENTRY_DSN`                  — server error pipeline (off when absent).
 *
 * Each SDK is lazily imported only when its env var is set, so the
 * import cost stays out of the cold path on dev / local-preview where
 * none of these are configured.
 */

import { logger } from "./logger.js";
import { scrubValue } from "./pii.js";

interface PosthogClient {
  capture: (event: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  shutdown: () => Promise<void>;
}

interface OtelSdkLike {
  start: () => void;
  shutdown: () => Promise<void>;
}

interface SentryLike {
  close: (timeout?: number) => Promise<boolean>;
}

let posthog: PosthogClient | null = null;
let otelSdk: OtelSdkLike | null = null;
let sentry: SentryLike | null = null;

export interface TelemetryEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  SENTRY_DSN?: string;
  NODE_ENV?: string;
}

export async function initTelemetry(env: TelemetryEnv): Promise<void> {
  await initOtel(env);
  await initPosthog(env);
  await initSentry(env);
}

async function initOtel(env: TelemetryEnv): Promise<void> {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    // Dynamic imports keep these out of the cold path when OTel is off.
    // Each is a separate import so a partial failure surfaces clearly.
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { resourceFromAttributes } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? "groundx-v2-ui-middleware",
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces`,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    otelSdk = sdk;
    logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT, service: env.OTEL_SERVICE_NAME }, "OTel SDK started");
  } catch (error) {
    logger.warn({ err: error }, "OTel SDK init failed — continuing without tracing");
  }
}

async function initPosthog(env: TelemetryEnv): Promise<void> {
  if (!env.POSTHOG_API_KEY) return;
  try {
    const mod = (await import("posthog-node")) as { PostHog: new (key: string, opts?: { host?: string }) => PosthogClient };
    posthog = new mod.PostHog(env.POSTHOG_API_KEY, env.POSTHOG_HOST ? { host: env.POSTHOG_HOST } : undefined);
    logger.info({ host: env.POSTHOG_HOST ?? "default" }, "PostHog server client initialized");
  } catch (error) {
    logger.warn({ err: error }, "PostHog init failed");
  }
}

async function initSentry(env: TelemetryEnv): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV ?? "development",
      // Conservative default; matches the spec note "100% of errors + 5%
      // of successes" — successes are captured via the OTel sampler, so
      // Sentry's tracesSampleRate stays modest to avoid double-charging.
      tracesSampleRate: 0.05,
      // PII scrubbing happens here in beforeSend in addition to the
      // shared pii.ts scrubber used by pino + PostHog.
      beforeSend: (event) => {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }
        return event;
      },
    });
    sentry = { close: (timeout?: number) => Sentry.close(timeout) };
    logger.info({ environment: env.NODE_ENV ?? "development" }, "Sentry SDK initialized");
  } catch (error) {
    logger.warn({ err: error }, "Sentry init failed");
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
  if (otelSdk) {
    try {
      await otelSdk.shutdown();
    } catch (error) {
      logger.warn({ err: error }, "OTel shutdown error");
    }
    otelSdk = null;
  }
  if (sentry) {
    try {
      await sentry.close(2000);
    } catch (error) {
      logger.warn({ err: error }, "Sentry shutdown error");
    }
    sentry = null;
  }
}
