# Observability + Security

What's wired, how to extend it, what gotchas to know.

## What's in the middleware today

| Layer | Library | Lives in | Notes |
|---|---|---|---|
| Structured logs | `pino` + `pino-http` | `middleware/src/lib/logger.ts` | JSON, one event per line. AsyncLocalStorage propagation for request-scope context |
| Tracing | `@opentelemetry/sdk-node` + auto-instrumentations | `middleware/src/lib/telemetry.ts` | Dynamic-import on `OTEL_EXPORTER_OTLP_ENDPOINT`. OTLP HTTP exporter to AWS ADOT (X-Ray) cloud or Tempo / Jaeger on-prem |
| Metrics | `prom-client` | `middleware/src/lib/metrics.ts` | `/api/metrics` endpoint. Standard HTTP histogram + custom `gxn_*` counters |
| Product analytics | `posthog-node` | `middleware/src/lib/telemetry.ts` (server-side capture only) | Distinct ID = anon UUID. **No emails to PostHog.** |
| Error tracking | `@sentry/node` | `middleware/src/lib/telemetry.ts` | Dynamic-import on `SENTRY_DSN`. `beforeSend` scrubber drops authorization + cookie headers |
| Security headers | `helmet` | `middleware/src/app.ts` | CSP + COOP + COEP + HSTS + nosniff + frame-ancestors |
| Rate limit | `express-rate-limit` | `middleware/src/app.ts` | Auth endpoints + general API + LLM proxy each get their own bucket |
| PII scrubber | hand-written | `middleware/src/lib/pii.ts` | Shared by pino redact, PostHog, Sentry |

The OTel + Sentry SDKs only initialize when their env var is set
(`OTEL_EXPORTER_OTLP_ENDPOINT` / `SENTRY_DSN`). Cold-path import
cost stays zero in dev / tests.

## Standard log fields

pino-http emits every request with:

```
level, time, pid, hostname, req { id, method, url, query, params, headers, remoteAddress, remotePort },
res { statusCode, headers }, responseTime, msg
```

The `headers` block carries the full CSP / HSTS / etc. set — which
is the bulk of the line. Acceptable noise in dev; in prod we'd
likely add a serializer to omit `res.headers` from auto-logging
and surface it only on error responses.

Request-scope context fields (sessionId, anonymousUserId,
groundxUsername, appMode, route, latencyMs, traceId) — see
`project_telemetry_logging.md` in agent memory for the canonical
list. Add via the central context-extractor when a new ID surface
appears; don't sprinkle `log.info({...})` calls per site.

## Suppressed traffic

The pino-http config drops two endpoints from per-request
logging:

- `/api/healthz` (and query variants) — K8s liveness + readiness
  probes hit this every ~3s.
- `/api/metrics` (and query variants) — Prometheus scrape.

The skip lives in `shouldSkipRequestLog(url)` in `app.ts`
(exported + unit-tested). Failures still surface because the
actual handlers can log explicitly on error paths; we only suppress
the pino-http auto-logged success line.

To verify env vars actually reached the pod, the boot logs a
second line right after "GroundX middleware scaffold listening":

```json
{
  "recognizedEnv": {
    "NODE_ENV": "production",
    "PORT": 3001,
    "APP_REPOSITORY_MODE": "memory",
    "MOCK_MODE": "false",
    "GROUNDX_PARTNER_API_KEY": "present",
    "LLM_API_KEY": "present",
    "MYSQL_HOST": "absent",
    ...
  }
}
```

Secret-bearing keys (`/KEY|TOKEN|SECRET|PASSWORD/i`) show only
`present`/`absent` so the log doesn't leak values.

## Custom metrics

The agreed `gxn_*` set lives in `middleware/src/lib/metrics.ts`
(or stubbed there to add). Per spec:

```
gxn_intent_dispatch_total{source}              # user/agent/tour/system
gxn_agent_turn_duration_seconds{provider,model,mode}
gxn_groundx_search_duration_seconds{type}      # bucket/group/documents
gxn_free_tier_pages_consumed_total
gxn_gate_event_total{trigger,outcome}          # the conversion funnel
gxn_session_active{app_mode}
```

When adding a metric, follow the existing pattern in `metrics.ts`
+ test for the registry registration.

## Adding a span

Auto-instrumentation covers HTTP, fetch, mysql2, Express
middleware out of the box. Custom spans go via
`@opentelemetry/api`:

```ts
import { trace, SpanStatusCode } from "@opentelemetry/api";
const tracer = trace.getTracer("groundx-v2-ui-middleware");

const span = tracer.startSpan("chatRouter.classify");
try {
  // work
} catch (err) {
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  throw err;
} finally {
  span.end();
}
```

Or `tracer.startActiveSpan(name, fn)` for the common case.

## Frontend telemetry

- No frontend pino. Unhandled errors flow to Sentry via React
  error boundaries + global handlers.
- Google Analytics 4 + Hotjar are **opt-in via env vars** and
  **disabled in on-prem deploys by default**.
- Consent gating must exist before GA / Hotjar load. PostHog
  server-side doesn't need a consent UI for non-PII events
  (all payloads scrubbed via `scrubPII()`).

### Source-map upload (OB-05)

`vite build` is configured with `sourcemap: "hidden"` — the `.map`
files generate alongside the bundles but the production JS does NOT
carry a `//# sourceMappingURL=` comment, so browsers won't fetch
them automatically. Without source-map upload, every Sentry trace
in prod resolves to minified `index-XXXX.js:1:5234` (unreadable).

**To wire upload** (once a Sentry project exists):

1. Provision a Sentry project; grab an internal auth token with
   `project:releases` + `project:write` scopes.
2. Add the token + org + project to GitHub Actions secrets:
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
3. Add a CI step to `deploy.yml` between `Build and push frontend
   image` and the helm install, gated on the secret being set:

   ```yaml
   - name: Upload source maps to Sentry
     if: env.SENTRY_AUTH_TOKEN != ''
     env:
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
       SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
       SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
     run: |
       npm --workspace app run build
       npx @sentry/cli sourcemaps inject ./app/dist
       npx @sentry/cli sourcemaps upload \
         --release "${{ steps.deploy-vars.outputs.image_tag }}" \
         ./app/dist
       find ./app/dist -name "*.map" -delete
   ```

4. To prevent the runtime nginx image from shipping the maps
   alongside the bundles, update `Dockerfile.frontend` so the
   build stage cleans them: add
   `RUN find /workspace/app/dist -name "*.map" -delete` AFTER
   the `npm --workspace app run build` line. (This makes the
   Docker-only flow safe even when CI upload doesn't run.)

5. In `app/src/lib/sentry.ts` `initSentry()`, set `release` to the
   same image tag the upload step used (read via `VITE_RELEASE`
   env passed at build time) so traces match the uploaded artifacts.

Until those four pieces land, Rule 9 status for OB-05 is
`seam-only` — sourcemaps emit, the upload mechanism is documented,
but production stack traces will resolve to minified js until the
first Sentry-enabled deploy verifies the round trip.

## Security middleware

helmet's defaults are tightened in `app.ts`:

- CSP: explicit allowlist per env. `script-src 'self'` + Fontshare
  + Google Fonts + (when enabled) GA / Hotjar / Calendly origins.
- `frame-src` allows Calendly (the F6 "book a call" embed).
- COOP same-origin, COEP same-origin.
- HSTS 6 months + includeSubDomains.
- Strict referrer-policy.

CSP is built dynamically based on which analytics providers are
enabled — don't hardcode external origins into the static
helmet config.

## PII scrubbing

`middleware/src/lib/pii.ts` exports `scrubValue` which:
- Redacts email addresses to `<email>`.
- Redacts strings matching credential patterns.
- Walks nested objects / arrays.

Used by:
- pino `redact` paths (`req.body.password`, `req.headers.authorization`, `req.headers.cookie`).
- `captureEvent` in `telemetry.ts` before passing properties to
  PostHog.
- Sentry `beforeSend` (in addition, drops auth + cookie headers
  directly).

When you add a code path that touches user-supplied content, run
it through `scrubValue` before logging.
