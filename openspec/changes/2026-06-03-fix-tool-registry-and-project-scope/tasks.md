# Tool Registry And Project Scope Drift Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close GitHub `#16` and `#17` by removing the orphan app runtime tool
registry and normalizing scoped project filters to `projectId`.

**Architecture:** Middleware remains the only production LLM tool execution
surface. App `*.tools.ts` files remain declarative metadata for widget
descriptors, quality checks, and parity tests. Project scope uses shared
`ContentScope.filter.projectId`, with the app consuming the scenario
`projectId` resolved by middleware.

**Tech Stack:** React, Vite/Vitest, TypeScript, Express middleware, Zod,
`@groundx/shared`, OpenSpec.

---

## Execution Plan

1. Task 1: Baseline and red tests for `#17`.
2. Adversarial review 1.
3. Task 2: Add `ScenarioConfig.projectId` through the shared scenario boundary.
4. Adversarial review 2.
5. Task 3: Normalize `/projects` and Project experience scopes to `projectId`.
6. Adversarial review 3.
7. Task 4: Baseline and red tests for `#16`.
8. Adversarial review 4.
9. Task 5: Remove app runtime registry and handlers while preserving metadata
   parity.
10. Adversarial review 5.
11. Task 6: Update docs/specs and run full validation.
12. Final adversarial review, commit, GitHub cleanup, and OpenSpec archive.

Every task must be followed by a passed adversarial review before the next task
starts.

Each adversarial review must record:

- the exact evidence checked for the just-completed task
- whether the evidence is pass/fail
- any remaining risk that is intentionally deferred
- the decision to continue or stop

If a review fails, stop the chain and patch the failing task before continuing.

## Task 1 — SEQUENTIAL: Baseline And Red Tests For `#17`

**Files:**

- Modify: `app/src/views/Scoped/ScopedConversationShell.test.tsx`
- Modify: `app/src/conversation/experiences/project/experience.test.tsx`
- Modify: `app/src/conversation/experiences/scopedChatExperience.tsx` tests if
  a dedicated test file exists; otherwise cover through project experience tests.

- [ ] **Step 1: Add a failing ProjectsView scope test**

Add a test that proves ready scenarios use the resolved `projectId` key/value:

```ts
it("builds the project scope with filter.projectId from the ready scenario", async () => {
  let api: ReturnType<typeof useChatStore> | null = null;
  function Probe() {
    api = useChatStore();
    return null;
  }
  render(
    <Harness>
      <Probe />
      <ProjectsView />
    </Harness>,
  );
  await waitFor(() => expect(api!.state.activeSessionId).toBeTruthy());
  const active = api!.state.sessions.get(api!.state.activeSessionId!);
  expect(active?.scopeKey).toContain("\"projectId\":\"proj_utility\"");
  expect(active?.scopeKey).not.toContain("\"project\":\"utility\"");
});
```

If the current harness scenario fixture uses only `{id:"utility"}`, update only
the test fixture to include `projectId: "proj_utility"`; do not update runtime
code yet.

- [ ] **Step 2: Add a failing no-slug-fallback test**

Add a test that proves the project route does not create a chat session using a
scenario slug while the scenario registry is still loading. The exact harness
can be local to `ScopedConversationShell.test.tsx`; the assertion must prove no
active project session is created with `filter.projectId:"utility"` or
`filter.project:"utility"` before a ready scenario provides a real project id.
Also assert the loading state is visible/non-empty and that, once the registry
becomes ready, the normal `ConversationFlow` route renders from the same
`ScopedConversationShell` path with exactly one project-scoped session keyed by
the resolved `projectId`.

- [ ] **Step 3: Add a failing Project experience grounding test**

Update `PROJECT_SCOPE` in
`app/src/conversation/experiences/project/experience.test.tsx` to:

```ts
const PROJECT_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { projectId: "proj_utility" },
};
```

Assert the grounding hint carries `projectId`:

```ts
expect(exp.scopeHint?.scenarioTitle).toContain('"projectId":"proj_utility"');
expect(exp.scopeHint?.scenarioTitle).not.toContain('"project":"utility"');
```

- [ ] **Step 4: Run red tests**

Run:

```bash
npm --workspace app test -- --run \
  src/views/Scoped/ScopedConversationShell.test.tsx \
  src/conversation/experiences/project/experience.test.tsx
```

Expected: fails because runtime still builds `filter.project` and the shared
scenario type does not yet require `projectId`.

- [ ] **Step 5: Record adversarial review 1**

Review whether the failing tests are user-visible enough. They must prove the
actual scoped conversation session/grounding value changes, not only a local
helper return value. They must also prove the route does not create a fallback
project session before the scenario registry is ready.

## Task 2 — SEQUENTIAL: Add `ScenarioConfig.projectId`

**Files:**

- Modify: `shared/src/index.ts`
- Modify: `middleware/src/scenarios/registry.ts`
- Modify: `middleware/src/scenarios/registry.test.ts`
- Modify: `app/src/types/scenarios.drift.test.ts`
- Modify: `middleware/src/scenarios/typesDriftGuard.ts`
- Modify: app fixtures that construct `ScenarioConfig`

- [ ] **Step 1: Extend the shared schema**

In `shared/src/index.ts`, update `scenarioConfigSchema`:

```ts
export const scenarioConfigSchema = z.object({
  id: z.string(),
  order: z.number(),
  projectId: z.string(),
  manifest: scenarioManifestSchema,
  documents: z.array(scenarioDocumentSchema),
  supportsJsonRender: z.boolean().optional(),
});
```

- [ ] **Step 2: Populate `projectId` in middleware registry**

In `middleware/src/scenarios/registry.ts`, compute once per scenario:

```ts
const projectId = projectIdForScenario(config.id);
const matched = byProjectId.get(projectId) ?? [];
```

Then include it in the returned config:

```ts
scenarios.push({
  id: config.id,
  order: config.order,
  projectId,
  manifest: config.manifest,
  documents,
  supportsJsonRender: config.manifest.supportsJsonRender ?? false,
});
```

- [ ] **Step 3: Update scenario registry tests**

Add an assertion for mapped utility:

```ts
import { SAMPLE_PROJECT_ID } from "../db/seedSampleProject.js";

it("returns the resolved projectId on each ScenarioConfig", async () => {
  mockDocumentsList([flatDoc("utility", SAMPLE_PROJECT_ID)]);
  const scenarios = await new ScenarioRegistry(env, [config("utility", true)]).list();
  expect(scenarios[0]!.projectId).toBe(SAMPLE_PROJECT_ID);
});
```

- [ ] **Step 4: Update shared/app/middleware drift fixtures**

Every representative `ScenarioConfig` fixture must include `projectId`.
Use `"proj_utility"` for app-only fixtures unless the test is specifically
about the canonical Utility sample id.

Run this sweep and update every owned fixture it identifies:

```bash
rg -n "ScenarioConfig|initialScenarios|scenarioConfigSchema" app/src middleware/src shared/src
```

Remove masking casts that let missing `projectId` fixtures compile, especially
`as any` or `as never` casts adjacent to `ScenarioConfig`, `initialScenarios`,
or scenario registry fixtures. If a cast is still necessary for a test harness,
the fixture must still include `projectId`.

- [ ] **Step 5: Run focused boundary tests**

Run:

```bash
npm --workspace @groundx/shared run build
npm --workspace middleware test -- --run src/scenarios/registry.test.ts
npm --workspace app test -- --run src/types/scenarios.drift.test.ts
```

Expected: all pass.

- [ ] **Step 6: Record adversarial review 2**

Review for duplicated project-id mappings. The app must not introduce its own
copy of `SAMPLE_PROJECT_ID_BY_SCENARIO`.

## Task 3 — SEQUENTIAL: Normalize `/projects` Scope To `projectId`

**Files:**

- Modify: `app/src/views/Scoped/ScopedConversationShell.tsx`
- Modify: `app/src/views/Scoped/ScopedConversationShell.test.tsx`
- Modify: `app/src/conversation/experiences/scopedChatExperience.tsx`
- Modify: `app/src/conversation/experiences/project/experience.tsx`
- Modify: `app/src/conversation/experiences/project/experience.test.tsx`
- Optional create: `app/src/views/Scoped/projectScopeVocabulary.test.ts`
- Optional create: `app/src/views/Scoped/projectScope.ts`

- [ ] **Step 1: Rename project prop vocabulary**

In `ScopedConversationShellProps`, replace `projectValue?: string` with:

```ts
/** The GroundX document filter.projectId value for the project experience. */
projectId?: string;
```

- [ ] **Step 2: Build project scope with `filter.projectId` and no slug fallback**

In `ScopedConversationShell`, derive:

```ts
const resolvedProjectId =
  projectId ??
  (registryState.status === "ready" ? registryState.scenarios[0]?.projectId : undefined);
```

And build a nullable scope:

```ts
const scope: ContentScope | null = useMemo(() => {
  if (experienceId === "project") {
    return resolvedProjectId
      ? { type: "bucket", bucketId, filter: { projectId: resolvedProjectId } }
      : null;
  }
  return { type: "bucket", bucketId };
}, [experienceId, bucketId, resolvedProjectId]);
```

Guard every scope consumer accordingly. Do not call `resolveSessionForScope`,
create a `ChatExperience`, or render a project `ConversationFlow` until the
project scope is non-null. The loading/empty state can be minimal, but it must
not create a chat session keyed to `"utility"`, and tests must prove the route
transitions from loading to the ordinary `ConversationFlow` once a ready
scenario supplies `projectId`.

If useful, create a tiny scoped-route helper such as
`buildProjectContentScope({ bucketId, projectId })` so all `/projects`
construction uses one local vocabulary point.

- [ ] **Step 3: Update scoped experience filtering**

In `makeScopedIntro`, replace `scope.filter?.project` reads with
`scope.filter?.projectId`, and compare against `scenario.projectId`:

```ts
const projectIds =
  scope.type === "bucket" && scope.filter?.projectId
    ? (Array.isArray(scope.filter.projectId)
        ? scope.filter.projectId
        : [scope.filter.projectId])
    : null;
const scenarios = projectIds
  ? registryState.scenarios.filter((s) => projectIds.includes(s.projectId))
  : registryState.scenarios;
```

- [ ] **Step 4: Add a targeted source guard**

Create `app/src/views/Scoped/projectScopeVocabulary.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const guarded = [
  "views/Scoped/ScopedConversationShell.tsx",
  "views/Scoped/ScopedConversationShell.test.tsx",
  "conversation/experiences/scopedChatExperience.tsx",
  "conversation/experiences/project/experience.test.tsx",
];

describe("project scoped route vocabulary", () => {
  it("uses filter.projectId, not filter.project, in scoped project surfaces", () => {
    const offenders = guarded.filter((rel) => {
      const source = readFileSync(resolve(ROOT, rel), "utf8");
      return /filter\s*:\s*\{\s*project\s*:|filter\?\.project\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
```

If `__dirname` is unavailable under the test runner, switch to:

```ts
const ROOT = resolve(process.cwd(), "src");
```

This guard is scoped to the `/projects` route/experience vocabulary. Do not add
a global ban on `filter.project`; SmartReport `#11` owns its remaining drift.

- [ ] **Step 5: Run focused app tests**

Run:

```bash
npm --workspace app test -- --run \
  src/views/Scoped/ScopedConversationShell.test.tsx \
  src/views/Scoped/projectScopeVocabulary.test.ts \
  src/conversation/experiences/project/experience.test.tsx \
  src/conversation/experiences/workspace/experience.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Required Chrome verification when available**

If Chrome DevTools MCP is available during execution, start the dev stack in
memory mode and verify `/projects` chat summary includes `filter
{"projectId":"..."}` and no longer includes `filter {"project":"utility"}`. If
the Chrome DevTools MCP is unavailable, record the unavailable tool state in the
task notes and keep the focused app tests as the fallback evidence.
For this workspace, Chrome DevTools MCP is expected to be available; do not use
the fallback unless tool discovery fails during execution.

- [ ] **Step 7: Record adversarial review 3**

Review that the change did not touch SmartReport `filter.project` fixtures from
`#11`, and did not fold BYO upload stamping from `#3` into this issue.

## Task 4 — SEQUENTIAL: Baseline And Red Tests For `#16`

**Files:**

- Create: `app/src/tools/appToolMetadata.test.ts`
- Modify: `app/src/tools/catalog-parity.test.ts`
- Modify: `app/scripts/check-tool-quality.test.mjs`
- Modify: `app/scripts/check-tool-references.test.mjs`

- [ ] **Step 1: Add a failing handler drift guard**

Create `app/src/tools/appToolMetadata.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
function* walkToolFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) yield* walkToolFiles(abs);
    if (stat.isFile() && entry.endsWith(".tools.ts")) yield abs;
  }
}

describe("app tool declarations", () => {
  it("do not carry dead app-side runtime handlers", () => {
    const offenders: string[] = [];
    for (const file of walkToolFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      if (/\bhandler\s*:/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("does not expose a production toolRegistry singleton", () => {
    expect(() => readFileSync(resolve(SRC, "tools", "registry.ts"), "utf8")).toThrow();
  });
});
```

- [ ] **Step 2: Run red #16 guard**

Run:

```bash
npm --workspace app test -- --run src/tools/appToolMetadata.test.ts
```

Expected: fails because app tool files still contain `handler` and
`app/src/tools/registry.ts` still exists. This guard intentionally includes
scaffold template tool files so future copies do not inherit dead execution
metadata.

- [ ] **Step 3: Record adversarial review 4**

Review that the guard targets the actual issue: dead app execution metadata and
registry singleton, not the useful declarative app tool metadata.

## Task 5 — SEQUENTIAL: Remove App Runtime Registry And Handlers

**Files:**

- Modify: `app/src/tools/types.ts`
- Delete: `app/src/tools/registry.ts`
- Delete: `app/src/tools/registry.test.ts`
- Modify: `app/src/tools/catalog-parity.test.ts`
- Create if needed: `app/src/tools/appToolSpecs.ts`
- Modify: all app `*.tools.ts` files with `handler`, including scaffold templates
- Modify: `app/scripts/check-tool-quality.test.mjs`
- Modify: `app/scripts/check-tool-references.test.mjs`
- Modify: TypeScript test fixtures that construct `WidgetTool` literals,
  including `app/src/widgets/scopedViewerWidget.test.ts` and
  `app/src/widgets/scopedViewerWidgetRegistry.test.ts`
- Modify: `app/src/widgets/scopedViewerWidget.ts` comments if they claim the
  descriptor tools are surfaced through the app runtime registry

- [ ] **Step 1: Remove execution fields from `WidgetTool`**

In `app/src/tools/types.ts`, remove the `handler` property and the
`CanvasIntent` import. Delete the `ToolRegistry` interface. Keep:

```ts
export interface WidgetTool<TSchema extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  category: ToolCategory;
  input: TSchema;
  availableIn?: ToolMode[];
  availableSteps?: ViewerStep["kind"][];
  rendersWidget?: string;
}
```

Rewrite the file header to state that app `WidgetTool` is declarative metadata
only; middleware `ServerTool.intentBuilder` is the executable production side.

- [ ] **Step 2: Remove `handler` from app tool declarations**

For every app `*.tools.ts` file, including scaffold templates, delete
`handler: ...`. Keep `name`,
`description`, `category`, `input`, `availableSteps`, `availableIn`, and
`rendersWidget`.

Do not remove `tools` arrays from viewer widget descriptors.

Template declarations under underscore directories are included in the
handler-removal guard so copied scaffolds do not inherit dead execution
metadata. They remain excluded from live parity/quality/reference collection
unless a separate task intentionally promotes templates into production app
tool metadata.

- [ ] **Step 3: Replace registry usage in parity tests**

If a pure helper is needed, create `app/src/tools/appToolSpecs.ts`:

```ts
import { assertUniqueIds } from "@groundx/shared";
import type { WidgetTool, WidgetToolModule } from "./types";

export const TOOL_GLOB_PATTERNS = [
  "../components/chat-widgets/*/*.tools.ts",
  "../components/viewer-widgets/*/*.tools.ts",
  "../views/**/*.tools.ts",
  "../components/primitives/**/*.tools.ts",
] as const;

function isWidgetToolModule(value: unknown): value is WidgetToolModule {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { tools?: unknown }).tools));
}

export function collectAppToolSpecs(modules: Record<string, unknown>): readonly WidgetTool[] {
  const located: { tool: WidgetTool; path: string }[] = [];
  for (const path of Object.keys(modules).sort()) {
    const mod = modules[path];
    if (!isWidgetToolModule(mod)) continue;
    for (const tool of mod.tools) located.push({ tool, path });
  }
  assertUniqueIds(located, (entry) => entry.tool.name, (entry) => entry.path);
  return located.map((entry) => entry.tool);
}
```

In `catalog-parity.test.ts`, replace `toolRegistry.all()` and
`toolRegistry.byName(...)` with:

```ts
import { collectAppToolSpecs, TOOL_GLOB_PATTERNS } from "./appToolSpecs";

const appTools = collectAppToolSpecs(import.meta.glob(TOOL_GLOB_PATTERNS, { eager: true }));
const appByName = new Map(appTools.map((tool) => [tool.name, tool]));
const appNames = appTools.map((tool) => tool.name).sort();
```

- [ ] **Step 4: Delete the runtime registry**

Delete:

```text
app/src/tools/registry.ts
app/src/tools/registry.test.ts
```

- [ ] **Step 5: Update script self-test fixtures**

In `app/scripts/check-tool-quality.test.mjs` and
`app/scripts/check-tool-references.test.mjs`, remove `handler` from temporary
fixture tool literals so the fixture style matches the new declarative app tool
shape.

- [ ] **Step 6: Update TypeScript test fixtures**

Run:

```bash
rg -n "handler:|WidgetTool" app/src -g '*.test.ts' -g '*.test.tsx'
```

Remove dead `handler` fields from test-only `WidgetTool` literals and update
assertions that assumed app-side handler execution. Do not remove widget
descriptor `tools` arrays.

- [ ] **Step 7: Run focused #16 tests**

Run:

```bash
npm --workspace app run test:tool-references
npm --workspace app run test:tool-quality
npm --workspace app test -- --run \
  src/tools/appToolMetadata.test.ts \
  src/tools/catalog-parity.test.ts \
  src/widgets/scopedViewerWidget.test.ts \
  src/widgets/scopedViewerWidgetRegistryProduction.test.ts
```

Expected: all pass.

- [ ] **Step 8: Record adversarial review 5**

Review import graph with:

```bash
rg -n "toolRegistry|createRegistry|ToolRegistry|handler:" app/src
```

Expected: no production app runtime registry or app tool handlers remain.
Acceptable remaining references: the new drift guard source, historical
docs/specs updated by Task 6 only if they intentionally describe prior archived
work, and non-code prose explaining that handlers were removed.

## Task 6 — SEQUENTIAL: Specs, Docs, Full Validation, Cleanup

**Files:**

- Modify: `openspec/specs/agent-tools/spec.md` through archive
- Modify: `openspec/specs/data-tier/spec.md` through archive
- Modify: `openspec/specs/ui-views/spec.md` through archive
- Modify: `openspec/specs/testing-suite/spec.md` through archive
- Modify: `docs/agents/data-model.md`
- Modify: any tool/widget README that still claims app handlers execute
- Verify only GitHub `#16` and `#17` are closed by this change; keep `#13`,
  `#14`, and `#15` open in backlog unless a separate user request changes scope

- [ ] **Step 1: Update data-model docs**

In `docs/agents/data-model.md`, replace the app tool row with the new model:

```md
| Tool (LLM) | App `WidgetTool` metadata (`*.tools.ts`, no handler) + middleware `ServerTool` execution | ... | ... | app declarations are parity/quality metadata; middleware `SERVER_TOOL_CATALOG` is the executable LLM catalog |
```

Also update scenario/project wording so `ScenarioConfig.projectId` is the app
boundary value used to build scoped project `ContentScope.filter.projectId`.

- [ ] **Step 2: Update README/comments that claim app handlers execute**

Search:

```bash
rg -n "handler|toolRegistry|registry\\.forStep|filter\\.project|filter:\\s*\\{\\s*project\\b" app/src docs/agents openspec/specs
```

Update only the #16/#17-owned claims. Leave SmartReport `filter.project` claims
for `#11` unless the text is in a scoped-project route/experience context. Do
not rewrite page-budget `#13`, group-resolver `#14`, or signed-in
`OnboardingWizard` `#15` behavior here; removing dead handler metadata from
`OnboardingWizard.tools.ts` is not enough to close `#15`.

- [ ] **Step 3: Run validation and browser verification**

Run:

```bash
npm --workspace @groundx/shared run build
npm --workspace app test -- --run \
  src/views/Scoped/ScopedConversationShell.test.tsx \
  src/views/Scoped/projectScopeVocabulary.test.ts \
  src/conversation/experiences/project/experience.test.tsx \
  src/conversation/experiences/workspace/experience.test.tsx \
  src/tools/appToolMetadata.test.ts \
  src/tools/catalog-parity.test.ts
npm --workspace middleware test -- --run \
  src/scenarios/registry.test.ts \
  src/services/toolCatalog.test.ts \
  src/services/groundxSearch.compose.test.ts
npm test
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict
git diff --check
```

When Chrome DevTools MCP is available, also run the memory-mode dev stack and
verify `/projects` in the browser:

- the project chat summary includes `filter {"projectId":"proj_..."}`
- the summary does not include `filter {"project":"utility"}` or
  `filter {"projectId":"utility"}`
- the route does not create a fallback project-scoped chat session before the
  scenario registry is ready

If Chrome DevTools MCP is unavailable, record the tool-unavailable evidence in
the issue comments and final summary.

- [ ] **Step 4: Commit and GitHub cleanup**

Commit after validation:

```bash
git add shared app middleware docs openspec
git commit -m "fix: normalize project scope and retire app tool registry"
```

Record validation evidence and close only GitHub `#16` and `#17`:

```bash
gh issue comment 16 --body "Completed by <commit-sha>. Validation: <commands and results>. OpenSpec: 2026-06-03-fix-tool-registry-and-project-scope."
gh issue close 16 --reason completed
gh issue comment 17 --body "Completed by <commit-sha>. Validation: <commands and results>. OpenSpec: 2026-06-03-fix-tool-registry-and-project-scope."
gh issue close 17 --reason completed
gh issue view 13 --json number,state,labels
gh issue view 14 --json number,state,labels
gh issue view 15 --json number,state,labels
```

Close `#16` and `#17` only after the commit exists and validation output is
recorded in the issue comments. Confirm `#13`, `#14`, and `#15` remain open with
their backlog labels.

- [ ] **Step 5: Archive OpenSpec**

Archive when both issues are closed or explicitly narrowed:

```bash
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive 2026-06-03-fix-tool-registry-and-project-scope --yes
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict
OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list
git diff --check
git status --short
```

Commit archive cleanup separately:

```bash
git add openspec
git commit -m "docs: archive tool registry and project scope fix"
```

- [ ] **Step 6: Final adversarial review**

Confirm:

- no app production `toolRegistry` remains
- no app `*.tools.ts` file contains `handler:`
- middleware `SERVER_TOOL_CATALOG` still passes quality/parity tests
- `/projects` ready-state scope uses `filter.projectId`
- SmartReport `#11` and BYO `#3` were not accidentally pulled into this work
- page-budget `#13`, group-resolver `#14`, and signed-in `OnboardingWizard`
  `#15` remain open backlog items
- OpenSpec is archived only after issue cleanup succeeds
