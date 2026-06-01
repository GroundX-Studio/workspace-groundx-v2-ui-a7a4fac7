# Spec Delta — auth-and-sessions (session/auth + rehydration sub-shapes)

Durable contract for the leftover flat-record shapes of the illegal-states work: session/auth and
rehydration shapes are discriminated unions, validated at trust boundaries. Behavior-preserving;
each lands behind a failing-first test with no user-visible regression.

## ADDED Requirements

### Requirement: Session/auth and rehydration shapes SHALL be discriminated unions validated at trust boundaries

Session/auth and rehydration shapes SHALL be modeled as discriminated unions (a `kind`/`status`
discriminant carrying ONLY the fields meaningful to that variant), and untrusted external input at a
trust boundary SHALL be validated (parsed) before use rather than type-cast. No flat-record sentinels
(empty-string, all-false boolean tuples, or success-only fields riding a non-success record) and no
`as <Type>` casts of untrusted input.

This generalizes the already-shipped `AnonSession | AuthedSession` request-session union to the
remaining client-side shapes: the login-result callback, the per-field extraction result, and the
localStorage ChatStore snapshot.

#### Scenario: Login result is a discriminated union, not a boolean tuple

- **GIVEN** the login callback type (`LoginReqCallback`)
- **WHEN** `login()` resolves
- **THEN** the result is a discriminated union narrowed on `kind` (success / error / banned / failed),
  with `error` present only on the error variant
- **AND** the old flat record (e.g. `{ isLoggedIn: true, error: true, banned: false }`) and the
  all-false silent no-op are NOT assignable (illegal combinations unrepresentable).

#### Scenario: Per-field extraction result models its states as variants

- **GIVEN** a `SchemaFieldExtractionResult`
- **WHEN** its `status` is `"pending"` or `"error"`
- **THEN** the success-only fields (`value`, `confidence`, `citation`) are NOT present on the type
- **AND** a `"done"` result carries `value` (plus optional `confidence`/`previousConfidence`/`citation`)
- **AND** a `"pending"` result with a non-null `value`, or an `"error"` result carrying a `confidence`,
  fails type-checking.

#### Scenario: ChatStore snapshot is parsed at the localStorage boundary, not cast

- **GIVEN** a ChatStore snapshot read from localStorage
- **WHEN** `deserialize` rehydrates it
- **THEN** it is validated via `parseChatStoreSnapshot(unknown): SerializedSnapshot | null` (a Zod
  parse mirroring the serialized shape), not `JSON.parse(raw) as SerializedSnapshot`
- **AND** a corrupt or wrong-version snapshot returns `null` and is NOT trusted (rehydration falls back
  to legacy migration / a fresh store)
- **AND** a valid current-version snapshot deserializes to the identical in-memory state as before.
