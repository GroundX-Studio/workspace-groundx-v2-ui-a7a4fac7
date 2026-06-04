# Fix Tool Registry And Project Scope Drift

## Why

The scaffold philosophy conformance audit found two small but important
source-of-truth drifts that are safe to plan together and execute separately:

- GitHub `#16`: the app-side `toolRegistry` singleton and `WidgetTool.handler`
  fields are not on the production LLM path. The live catalog is middleware
  `SERVER_TOOL_CATALOG`, so the app registry can mislead contributors into
  thinking app-side handlers execute in production.
- GitHub `#17`: the scoped `/projects` route and Project `ChatExperience` use
  `filter.project`, while the current document filter/search/RBAC contract uses
  `filter.projectId`.

## What Changes

- Make the middleware `SERVER_TOOL_CATALOG` the only production LLM tool catalog
  in the durable `agent-tools` contract.
- Keep app `*.tools.ts` files only as declarative tool metadata used by
  widget descriptors, quality checks, and app/server parity tests.
- Remove the app-side runtime tool registry singleton, registry tests, and dead
  app-side tool handlers.
- Extend the shared scenario contract so each returned `ScenarioConfig` carries
  the resolved `projectId` used by GroundX document filters.
- Normalize scoped `/projects` and Project `ChatExperience` tests/runtime to
  `ContentScope.filter.projectId`.
- Add focused drift guards so app scoped-project surfaces cannot silently
  reintroduce `filter.project`, and app tool declarations cannot regain dead
  `handler` fields.

## Conformance To Core Architectural Decisions

- **Composable, not forked:** `/projects` remains the same
  `ScopedConversationShell` + `ConversationFlow` + `ChatExperience` path. Only
  the `ContentScope` value changes from `{filter:{project}}` to
  `{filter:{projectId}}`.
- **Done-able and user-visible:** the plan starts with failing behavior/guard
  tests and ends with focused app, middleware, shared, OpenSpec, and GitHub
  validation. The browser-visible project intro should announce
  `filter {"projectId":"proj_..."}` rather than `filter {"project":"utility"}`.
- **One source of truth:** scenario types remain single-sourced in
  `@groundx/shared`; the project id is resolved by the middleware scenario
  registry that already owns `SAMPLE_PROJECT_ID_BY_SCENARIO`; the LLM catalog's
  production execution stays server-side.

## Issues

- <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/16>
- <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/17>

