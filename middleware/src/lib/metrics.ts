/**
 * Prometheus metrics — process-wide registry.
 *
 * The default registry is reused across the middleware. `/api/metrics` exposes
 * the Prometheus text format. App-specific counters live alongside the route
 * that owns them; this module just owns the registry + a small set of common
 * counters every project benefits from.
 *
 * On-prem deployments that don't run Prometheus can disable the endpoint via
 * `METRICS_ENABLED=false`; the registry is still populated so OpenTelemetry
 * exporters can read from it.
 */

import { collectDefaultMetrics, Counter, Histogram, register, type Registry } from "prom-client";

let initialized = false;

export function ensureMetrics(): Registry {
  if (!initialized) {
    collectDefaultMetrics({ register });
    initialized = true;
  }
  return register;
}

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled by the middleware",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const upstreamRequestsTotal = new Counter({
  name: "upstream_requests_total",
  help: "Calls forwarded to GroundX/Partner/LLM upstreams",
  labelNames: ["upstream", "status"] as const,
  registers: [register],
});

export const byoPagesIngested = new Counter({
  name: "byo_pages_ingested_total",
  help: "Pages of BYO content ingested by free-tier sessions",
  labelNames: ["scenario"] as const,
  registers: [register],
});

export const gateEventsTotal = new Counter({
  name: "gate_events_total",
  help: "F6 gate lifecycle events",
  labelNames: ["trigger", "outcome"] as const,
  registers: [register],
});
