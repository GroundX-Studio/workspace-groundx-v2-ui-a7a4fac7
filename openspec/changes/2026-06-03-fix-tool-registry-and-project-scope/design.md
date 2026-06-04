# Design: Tool Registry And Project Scope Drift Fixes

## Current State

`#16` exists because `app/src/tools/registry.ts` builds a Vite-powered
`toolRegistry` singleton and `WidgetTool` includes a `handler`, but production
chat uses `middleware/src/services/toolCatalog.ts` (`SERVER_TOOL_CATALOG`) to
validate tool calls and build intents. App-side `*.tools.ts` files are still
useful as declarative widget-local metadata: they feed viewer widget
descriptors, quality scripts, reference scripts, and app/server parity tests.
The runtime registry and handlers are the misleading part.

`#17` exists because `app/src/views/Scoped/ScopedConversationShell.tsx` creates
the project scope as `filter: { project: "utility" }`, and
`app/src/conversation/experiences/scopedChatExperience.tsx` reads
`scope.filter.project`. The durable contract says project scoping is the
GroundX document filter key `projectId`, with real seeded sample ids such as
`proj_c7701da7-0e08-482a-a496-df9dfe991613`.

## Approach

### #17 First: Normalize Project Scope To `projectId`

The middleware scenario registry already resolves scenario slug to real
`projectId` through `SAMPLE_PROJECT_ID_BY_SCENARIO`. The app should not duplicate
that mapping. Instead, extend `@groundx/shared` `scenarioConfigSchema` with a
required `projectId: string`, populate it in
`middleware/src/scenarios/registry.ts`, and let the app consume that value from
`ScenarioRegistryProvider`.

`ScopedConversationShell` should derive its project scope from the ready
scenario and MUST NOT create a project chat session with a slug fallback while
the scenario registry is still loading:

```ts
const resolvedProjectId =
  projectId ??
  (registryState.status === "ready" ? registryState.scenarios[0]?.projectId : undefined);

if (experienceId === "project" && !resolvedProjectId) {
  return null;
}

return { type: "bucket", bucketId, filter: { projectId: resolvedProjectId } };
```

The old `"utility"` value is a scenario slug, not a project id. It is valid test
bootstrap data only when a fixture explicitly sets `projectId: "proj_utility"`;
production `/projects` scope creation waits for a real project id from the ready
scenario registry. Tests should assert both the ready state uses `projectId`, not
`project`, and the loading state does not create a fallback project-scoped
session.

`makeScopedChatExperience` should derive document summaries from
`scope.filter.projectId` and compare to `ScenarioConfig.projectId`, so the
Project intro and grounding hint stay aligned with the actual scope.

### #16 Second: Retire The Runtime App Tool Registry

Keep `WidgetTool` as declarative app metadata, but remove its `handler` field
and remove the `ToolRegistry` runtime shape. Delete
`app/src/tools/registry.ts` and `app/src/tools/registry.test.ts`.

Add a small pure collector for test/parity use if needed:

```ts
export function collectAppToolSpecs(
  modules: Record<string, unknown>,
): readonly WidgetTool[] {
  const located = collect modules with `tools: WidgetTool[]`;
  assertUniqueIds(located, (entry) => entry.tool.name, (entry) => entry.path);
  return located.map((entry) => entry.tool);
}
```

This collector is not a production singleton, has no `forStep`, and has no
handlers. It exists only to let `catalog-parity.test.ts` keep comparing
declarative app tool metadata to `SERVER_TOOL_CATALOG`. The app scripts already
parse tool names from source text and should keep running.

All app `*.tools.ts` files should remove `handler`, including scaffold template
tool declarations under underscore directories. Viewer widget descriptors
continue to carry `tools`, but those tools are metadata only. Middleware
`intentBuilder` remains the executable side.

Template declarations are handler-guarded because they are copied into future
scaffolds, but they are not promoted into the live app parity/quality/reference
collection by this change. They remain template-only metadata unless a later
task explicitly makes them production app declarations.

## Files

Likely modified for `#17`:

- `shared/src/index.ts`
- `app/src/types/scenarios.drift.test.ts`
- `middleware/src/scenarios/typesDriftGuard.ts`
- `middleware/src/scenarios/registry.ts`
- `middleware/src/scenarios/registry.test.ts`
- `app/src/api/entities/scenarioRegistryEntity.ts`
- `app/src/contexts/ScenarioRegistryContext/ScenarioRegistryContext.test.tsx`
- `app/src/views/Scoped/ScopedConversationShell.tsx`
- `app/src/views/Scoped/ScopedConversationShell.test.tsx`
- `app/src/conversation/experiences/scopedChatExperience.tsx`
- `app/src/conversation/experiences/project/experience.test.tsx`
- app test fixtures that construct `ScenarioConfig`
- `docs/agents/data-model.md`

Likely modified for `#16`:

- `app/src/tools/types.ts`
- `app/src/tools/registry.ts` (delete)
- `app/src/tools/registry.test.ts` (delete)
- `app/src/tools/catalog-parity.test.ts`
- optional new `app/src/tools/appToolSpecs.ts`
- every app `*.tools.ts` file with a `handler`, including scaffold templates
- app script self-test fixtures under `app/scripts/*.test.mjs`
- app TypeScript test fixtures that construct `WidgetTool` literals
- `docs/agents/data-model.md`

Spec deltas:

- `agent-tools`
- `data-tier`
- `ui-views`
- `testing-suite`

## Out Of Scope

- Do not change tool names, descriptions, schemas, role gating, or middleware
  intent semantics except where tests force removal of app-only handler drift.
- Do not fix SmartReport `filter.project` drift from `#11` in this change.
- Do not implement BYO upload project stamping from `#3`.
- Do not implement page-budget usage counts from `#13`.
- Do not implement or retire the CF-19 multi-bucket group resolver from `#14`.
- Do not replace or retire the global signed-in `OnboardingWizard` from `#15`.
  This change may remove dead `handler` metadata from `OnboardingWizard.tools.ts`,
  but that does not close `#15`.
- Do not create a second frontend execution path for LLM tools.
