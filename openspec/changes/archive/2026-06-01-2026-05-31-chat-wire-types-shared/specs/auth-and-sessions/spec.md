## ADDED Requirements

### Requirement: AppUserMetadata SHALL be single-sourced from @groundx/shared

The `AppUserMetadata` shape SHALL be defined once as a `@groundx/shared`
schema and consumed by both sides via re-export — replacing the twin declared
on the middleware (`middleware/src/types.ts`, the persisted session-metadata
record) and on the app (`app/src/api/entities/customerEntity.ts`, where the
app currently declares a documented SUBSET). The shared schema SHALL make
every session-metadata field OPTIONAL except `groundxUsername`, so each side
narrows from one source rather than maintaining two divergent shapes. The
twin SHALL be pinned with an `Eq<>` compile-time guard and validated at the
app-metadata response parse boundary. The two customer-auth client modules
(`customerEntity.ts`, `partnerCustomerEntity.ts`) SHALL likewise single-source
their shared auth request/response wire shapes onto `@groundx/shared` where a
middleware mirror exists.

#### Scenario: App and middleware AppUserMetadata derive from one shared schema

- **GIVEN** `appUserMetadataSchema` lives once on `@groundx/shared` with all fields optional except `groundxUsername`
- **WHEN** the middleware persists metadata and the app reads it from the `getUserData` / `updateAppMetadata` responses
- **THEN** both sides consume the shared type via re-export
- **AND** an `Eq<AppUserMetadata, SharedAppUserMetadata>` guard pins the shape under the build
- **AND** the app-metadata response validates against `appUserMetadataSchema` at the parse boundary.

#### Scenario: The customer-auth client wire shapes single-source where a middleware mirror exists

- **GIVEN** the customer-auth client modules declare login/register/auth-response (and partner credentials/profile) wire shapes
- **WHEN** a shape has a middleware mirror on the same wire
- **THEN** the shape is single-sourced on `@groundx/shared` and both sides re-export it under an `Eq<>` guard
- **AND** the auth response validates against the shared schema at its parse boundary.
