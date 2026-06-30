# security-and-privacy Specification

## Purpose

Define the durable contract for CSP / headers, CSRF, PII handling,
consent gating of analytics, and SOC2-shaped audit trails. Includes the
hard rule that Partner-API keys and customer secrets never reach the
browser and the credential-isolation pattern the middleware uses to
enforce it.
## Requirements
### Requirement: Consent UI SHALL gate analytics + tracking scripts and CSP allowlist

The product SHALL render a consent banner on cold load when at least one
frontend analytics provider is configured and no accepted consent record exists.
Until consent is given, no frontend third-party analytics or tracking
integration, including GA, Hotjar, or PostHog, SHALL initialize, load a script,
or send a browser request.

On consent, configured services MAY initialize and load. The app SHALL persist
the consent decision locally so subsequent page loads may initialize configured
trackers without showing the banner again. Revocation is outside this change's
scope.

The deployment CSP MAY pre-allow configured analytics hosts as a static deploy
policy. CSP allowlisting alone SHALL NOT be treated as tracker loading or
consent. The browser-visible gate is whether the application initializes,
loads, or sends requests to analytics providers before consent.

#### Scenario: Cold load shows the banner and no analytics load

- **GIVEN** a fresh visitor with no accepted consent record
- **WHEN** the app loads with PostHog or GA env vars configured
- **THEN** the consent banner renders
- **AND** no GA, Hotjar, or PostHog scripts or browser requests load.

#### Scenario: Accepting consent initializes configured trackers

- **GIVEN** the consent banner is open and tracker env vars are configured
- **WHEN** the user accepts
- **THEN** the app persists accepted consent
- **AND** configured trackers initialize once.

#### Scenario: Unconfigured trackers remain no-op after consent

- **GIVEN** the user accepts consent
- **WHEN** PostHog or GA env vars are unset
- **THEN** the corresponding wrapper remains a no-op and no script is loaded.

### Requirement: PII scrubbers SHALL cover the documented pattern set

The `pii.ts` scrubbers (`scrubString` + `scrubValue`) SHALL cover the
full pattern list documented in `memory/project_security.md` — email,
phone, SSN, credit-card (Luhn), account number, and any future
additions. Both pino + PostHog scrubbers MUST share the same pattern
list; any patterns missing today MUST gain matching test fixtures.

#### Scenario: Each documented PII shape redacts

- **GIVEN** a test fixture for each PII shape (email, phone, SSN, credit card, account number)
- **WHEN** the value is passed through `scrubValue`
- **THEN** the returned shape redacts the sensitive substring
- **AND** the same scrub applies on both pino and PostHog code paths

### Requirement: CSP SHALL allow only the Calendly origins needed by the scheduler embed

The middleware CSP SHALL allow the Calendly scheduler viewer to load the
advanced embed script and stylesheet from
`https://assets.calendly.com`, and SHALL continue to restrict frames to
Calendly's scheduling origins. The allowlist SHALL be explicit in CSP tests so
a future embed change cannot silently ship with a blocked script/style source.

#### Scenario: CSP permits Calendly advanced embed assets

- **WHEN** the middleware serves any response with security headers
- **THEN** `script-src` includes `https://assets.calendly.com`
- **AND** `style-src` includes `https://assets.calendly.com`
- **AND** `frame-src` includes Calendly scheduling origins.

