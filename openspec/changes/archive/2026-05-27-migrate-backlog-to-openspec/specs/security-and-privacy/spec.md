# Spec Delta — security-and-privacy

Migrated from `backlog.md` Epic SC (active rows only). SC-01 / SC-04
closed during the 2026-05-27 sweep.

## ADDED Requirements

### Requirement: Consent UI SHALL gate analytics + tracking scripts and CSP allowlist

The product SHALL render a consent banner on cold-load. Until consent
is given, NO third-party analytics (GA, Hotjar, PostHog) SHALL load.
On consent, the named services load AND their host names join the CSP
`connect-src` allowlist for that session. The implementation MUST
satisfy EU-touched deploys' baseline privacy obligations.

#### Scenario: Cold-load shows the banner; no analytics load

- **GIVEN** a fresh visitor with no consent cookie
- **WHEN** the app loads
- **THEN** the consent banner renders
- **AND** no GA / Hotjar / PostHog requests appear in the network tab

#### Scenario: After consent the trackers load

- **GIVEN** the consent banner is open
- **WHEN** the user accepts
- **THEN** GA / Hotjar / PostHog scripts load
- **AND** their hosts are present in the CSP `connect-src` for the session

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
