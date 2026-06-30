# Spec Delta — observability

Migrated from `backlog.md` Epic OB (active rows only). OB-01..03, OB-08
closed.

## ADDED Requirements

### Requirement: Hotjar session recording SHALL run with PII suppression

The product SHALL ship a Hotjar integration gated by `HOTJAR_SITE_ID`
env. Sensitive inputs (email, password, account-id) SHALL carry
`data-hj-suppress` so Hotjar's session-recording masks them in
playback.

#### Scenario: Email field is redacted in Hotjar replay

- **GIVEN** a deployment with `HOTJAR_SITE_ID` set
- **WHEN** a user types into the email field on F6
- **THEN** the Hotjar replay shows the field masked, not the literal text

### Requirement: Source-map upload SHALL complete the Sentry wire-up (seam-only today)

The Sentry source-map wire-up SHALL be completed end-to-end so
production events surface readable TS stack traces. Today's seam (the
build emits `sourcemap: "hidden"` AND drops `.map` files from the
runtime container) MUST be paired with the four remaining steps:
provision a Sentry project, set `SENTRY_AUTH_TOKEN` as a GHA secret,
add the deploy.yml upload step, and pass `release` to `initSentry`.

#### Scenario: Production error surfaces a TS stack trace in Sentry

- **GIVEN** Sentry is provisioned + the deploy.yml uploads source maps
- **WHEN** a production error fires
- **THEN** the Sentry event shows the TS file + line, not minified js

### Requirement: AWS Managed Prometheus + X-Ray SHALL surface dashboards + traces

The deployment SHALL provision dashboards on AWS Managed Prometheus
AND enable X-Ray on the ALB target. The middleware already emits
metrics (Prometheus) and traces (X-Ray); this requirement closes the
read-side: live request rate + P99 latency MUST be observable AND
traces MUST be queryable.

#### Scenario: Dashboard renders live request data

- **GIVEN** the production deploy
- **WHEN** an operator opens the dashboard URL
- **THEN** request rate + P99 latency render with live data
- **AND** X-Ray traces are queryable by request id

### Requirement: Alert rules SHALL fire on SLO violations + error-budget burn

The deployment SHALL ship alert rules for: SLO violations, error-budget
burn rate, ALB 5xx spikes, unhealthy hosts. Each alert routes to the
on-call channel (Sentry → PagerDuty, etc.).

#### Scenario: Synthetic burn-rate fires an alert

- **GIVEN** the alert rules are deployed
- **WHEN** a synthetic 5xx burst triggers the burn-rate threshold
- **THEN** a real alert lands in Sentry/PagerDuty within the configured window

### Requirement: console.warn calls in middleware SHALL migrate to pino structured logging

Every `console.warn` call in `middleware/src/` SHALL be replaced with
`logger.warn({...}, "msg")` so pino's scrubber applies. The two known
call sites today are the hybrid-RAG fallback and the unknown-scope
warning in `chatRouter.ts`. The `eslint-disable-next-line no-console`
bypasses MUST be removed in the same commit.

#### Scenario: No console.warn calls remain outside tests

- **WHEN** `grep -rn "console.warn" middleware/src/` is run (excluding tests)
- **THEN** zero hits
- **AND** the warns surface via `logger.warn({...}, "msg")` with redact paths applied
