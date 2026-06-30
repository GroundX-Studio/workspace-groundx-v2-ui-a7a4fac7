# chat-routing Specification (delta)

## ADDED Requirements

### Requirement: The composed RAG search filter SHALL be key-valid (one constraint per key)

The RAG search SHALL compose the server-side RBAC filter (the caller's authorized
project set, `{projectId:{$in:[…]}}`) with the request's scope filter
(`compileScopeFilter`) such that the resulting GroundX `filter` constrains each
field key AT MOST ONCE. For any key both sources constrain, the composition SHALL
INTERSECT their allowed value sets into a single clause — never emit two clauses
on the same key (GroundX rejects more than one data type per key with a 400). A
single resulting value SHALL be `{key: v}`, multiple SHALL be `{key:{$in:[…]}}`,
and a disjoint intersection SHALL be deny-all (`{key:{$in:[]}}`). Distinct keys
MAY still be combined with `$and`.

#### Scenario: RBAC + scope on the same project key intersect into one clause

- **GIVEN** an RBAC filter `{projectId:{$in:["p1","p2"]}}` and a scope filter `{projectId:"p1"}`
- **WHEN** the RAG search composes them
- **THEN** the GroundX `filter` constrains `projectId` exactly once (the intersection `{projectId:"p1"}`)
- **AND** GroundX accepts the filter (no "cannot query more than 1 data type per key" 400)
- **AND** the Interact chat returns a grounded, cited answer instead of a 502

#### Scenario: Disjoint RBAC vs scope denies all

- **GIVEN** an RBAC filter `{projectId:{$in:["p1"]}}` and a scope filter `{projectId:"p2"}` (no overlap)
- **WHEN** the RAG search composes them
- **THEN** the composed filter is deny-all (`{projectId:{$in:[]}}`), returning no results — never an invalid two-data-type filter
