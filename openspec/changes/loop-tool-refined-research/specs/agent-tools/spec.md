# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: A refined re-search server-executed tool SHALL re-query documents mid-answer

The catalog SHALL include a `read`-category, server-executed tool (declaring
`serverExecute` + `activityLabel`, no `intentBuilder`) that re-runs the turn's scoped
GroundX search with a model-supplied refined query inside the grounded tool-result
loop and feeds the resulting snippets back to the model. It SHALL apply the SAME
content scope and server-derived RBAC filter as the turn's primary search — it SHALL
NOT widen scope.

#### Scenario: Model refines a missed search

- **GIVEN** a turn whose initial search returned no relevant snippet
- **WHEN** the model calls the re-search tool with a refined query
- **THEN** the middleware runs the scoped search and feeds the results back as a tool message
- **AND** the model continues its answer from them.
