# Spec Delta — security-and-privacy

## ADDED Requirements

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
