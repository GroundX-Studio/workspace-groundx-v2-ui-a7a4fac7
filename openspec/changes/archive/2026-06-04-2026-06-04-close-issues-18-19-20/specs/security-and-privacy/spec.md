# security-and-privacy Specification Delta

## MODIFIED Requirements

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
