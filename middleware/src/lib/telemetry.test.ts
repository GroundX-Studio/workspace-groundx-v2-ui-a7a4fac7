import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist module mocks so the dynamic imports inside telemetry.ts pick
// them up. Each mock records what got called so we can assert init
// fires only when env vars are set.
const otelMocks = vi.hoisted(() => {
  const start = vi.fn();
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const NodeSDK = vi.fn().mockImplementation(() => ({ start, shutdown }));
  const getNodeAutoInstrumentations = vi.fn().mockReturnValue([]);
  const OTLPTraceExporter = vi.fn();
  const resourceFromAttributes = vi.fn();
  const ATTR_SERVICE_NAME = "service.name";
  return { start, shutdown, NodeSDK, getNodeAutoInstrumentations, OTLPTraceExporter, resourceFromAttributes, ATTR_SERVICE_NAME };
});

vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: otelMocks.NodeSDK }));
vi.mock("@opentelemetry/auto-instrumentations-node", () => ({ getNodeAutoInstrumentations: otelMocks.getNodeAutoInstrumentations }));
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({ OTLPTraceExporter: otelMocks.OTLPTraceExporter }));
vi.mock("@opentelemetry/resources", () => ({ resourceFromAttributes: otelMocks.resourceFromAttributes }));
vi.mock("@opentelemetry/semantic-conventions", () => ({ ATTR_SERVICE_NAME: otelMocks.ATTR_SERVICE_NAME }));

const sentryMocks = vi.hoisted(() => {
  const init = vi.fn();
  const close = vi.fn().mockResolvedValue(true);
  return { init, close };
});

vi.mock("@sentry/node", () => ({ init: sentryMocks.init, close: sentryMocks.close }));

const posthogMocks = vi.hoisted(() => {
  const capture = vi.fn();
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const PostHog = vi.fn().mockImplementation(() => ({ capture, shutdown }));
  return { PostHog, capture, shutdown };
});

vi.mock("posthog-node", () => ({ PostHog: posthogMocks.PostHog }));

import { initTelemetry, shutdownTelemetry, captureEvent } from "./telemetry.js";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await shutdownTelemetry();
});

describe("initTelemetry", () => {
  it("is a no-op when no env vars are set (cold-path import cost stays zero)", async () => {
    await initTelemetry({});
    expect(otelMocks.NodeSDK).not.toHaveBeenCalled();
    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(posthogMocks.PostHog).not.toHaveBeenCalled();
  });

  it("starts the OTel SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set", async () => {
    await initTelemetry({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com",
      OTEL_SERVICE_NAME: "groundx-test",
    });
    expect(otelMocks.NodeSDK).toHaveBeenCalledTimes(1);
    expect(otelMocks.start).toHaveBeenCalledTimes(1);
    // Trace exporter is built with the /v1/traces suffix appended.
    expect(otelMocks.OTLPTraceExporter).toHaveBeenCalledWith({ url: "https://otel.example.com/v1/traces" });
    // Resource carries the service name.
    expect(otelMocks.resourceFromAttributes).toHaveBeenCalledWith({
      [otelMocks.ATTR_SERVICE_NAME]: "groundx-test",
    });
  });

  it("does NOT start the OTel SDK when no endpoint is set, even with a service name", async () => {
    await initTelemetry({ OTEL_SERVICE_NAME: "groundx-test" });
    expect(otelMocks.NodeSDK).not.toHaveBeenCalled();
  });

  it("initializes Sentry with the DSN + environment + a beforeSend scrubber", async () => {
    await initTelemetry({ SENTRY_DSN: "https://k@sentry.example.com/1", NODE_ENV: "production" });
    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
    const initArgs = sentryMocks.init.mock.calls[0][0];
    expect(initArgs.dsn).toBe("https://k@sentry.example.com/1");
    expect(initArgs.environment).toBe("production");
    expect(typeof initArgs.beforeSend).toBe("function");
    // beforeSend drops authorization + cookie headers if present.
    const cleaned = initArgs.beforeSend({
      request: { headers: { authorization: "Bearer x", cookie: "session=y", "x-other": "ok" } },
    });
    expect(cleaned.request.headers.authorization).toBeUndefined();
    expect(cleaned.request.headers.cookie).toBeUndefined();
    expect(cleaned.request.headers["x-other"]).toBe("ok");
  });

  it("does NOT initialize Sentry when SENTRY_DSN is absent", async () => {
    await initTelemetry({ NODE_ENV: "production" });
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it("initializes PostHog when POSTHOG_API_KEY is set; captureEvent then routes through", async () => {
    await initTelemetry({ POSTHOG_API_KEY: "phc_test", POSTHOG_HOST: "https://posthog.example.com" });
    expect(posthogMocks.PostHog).toHaveBeenCalledWith("phc_test", { host: "https://posthog.example.com" });
    captureEvent("anon-123", "session.started", { sample: "utility" });
    expect(posthogMocks.capture).toHaveBeenCalledWith({
      distinctId: "anon-123",
      event: "session.started",
      properties: { sample: "utility" },
    });
  });
});

describe("shutdownTelemetry", () => {
  it("shuts down PostHog + OTel + Sentry cleanly when all are initialized", async () => {
    await initTelemetry({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com",
      POSTHOG_API_KEY: "phc_test",
      SENTRY_DSN: "https://k@sentry.example.com/1",
    });
    await shutdownTelemetry();
    expect(otelMocks.shutdown).toHaveBeenCalled();
    expect(posthogMocks.shutdown).toHaveBeenCalled();
    expect(sentryMocks.close).toHaveBeenCalledWith(2000);
  });
});
