# Live multi-doc report render (Phase 7 / WF-10)

## Why

`renderReport` (`middleware/src/services/reportRenderer.ts`) only renders in MOCK_MODE. Its
live branch is a hard stop — at line ~478:

```
if (!deps.mockMode) {
  throw new Error("live report render is not yet wired (Phase 7 / WF-10)");
}
```

So report rendering works *only* with the Utility fixture. Some of the surrounding plumbing is
already in place: `resolveScopeDocSet(scope, index)` (~120) + `UTILITY_REPORT_DOC_INDEX` (~94)
resolve the scope → doc set, the BYO gate (~464) and empty-scope idle render (~484) are wired, and
`renderSection` (~399) already applies variable substitution + the no-source / unresolved-variable
degradations. But two pieces the throw stands in for are genuinely missing, and a third (the
generation orchestration) does not yet exist as a reusable seam.

### The live path has no server-side source of section questions, and the sample template is not persisted

The fixture path does NOT use a template's questions at all. It reads pre-rendered bodies from a
hardcoded constant: `REPORT_FIXTURES["rt-utility-ic-brief"] = { sections: UTILITY_SECTIONS }`
(reportRenderer.ts ~355), where each `UTILITY_SECTIONS` entry is a `FixtureSection` carrying a
finished `body` string and `cites` — **NOT** a `question`. (The durable `ReportSection` type at
~55 *does* carry a `question`, but the MOCK_MODE fixture constants do not.)

`RenderReportRequest` (reportRenderer.ts ~184) carries only `templateId` + `scope` + `variables` +
`sectionIds` — it does NOT carry the section questions. And `rt-utility-ic-brief` exists ONLY as a
client fixture (`app/src/widgets/reportFixtures.ts:30`) plus the mock `REPORT_FIXTURES` constant —
it is **not seeded** anywhere in the repo. So a live `getTemplate("rt-utility-ic-brief")` returns
`null` → the live path would have no questions to fan and would render empty.

Templates are first-class **server-persisted** objects per the locked Template + Scope + Results
meta-pattern — Report shares Extract's lifecycle. The persistence machinery already exists:
`repository.saveTemplate` / `getTemplate` over the `templates` table (`types.ts` ~234, both
`mysqlRepository` and `memoryRepository`), the `report`-kind `TemplateSaveInput` bridge
`reportTemplateToSaveInput(template)` (reportRenderer.ts ~150), and the durable `ReportSection`
shape WITH its `question`. What is missing is that the sample report template is never *written*.

→ This change PERSISTS the sample report template server-side (so `getTemplate("rt-utility-ic-brief")`
returns a real `report`-kind `TemplateRecord` whose sections carry their questions) and loads it by
`templateId` in the render route, so the live branch fans each section's REAL `question` over the
scope. The questions are NOT carried in the client request (that would make the client the source
of truth — violating one-source-of-truth). **The scope of this change therefore GREW: persisting
the sample report template is part of it.**

### The reusable generation orchestration does not exist yet

The live render needs, per section: search a `question` over a `ContentScope` → ground an LLM over
the snippets → verify each citation → assign a tier + confidence → emit a cited result. That is
exactly what `runRagPipeline` (`ragPipeline.ts` ~57) does for a chat turn — its
search→ground→verify→tier→cite assembly is **~140 inline lines** (ragPipeline.ts ~235-298) tangled
with chat-only concerns (suggested actions, tool calls, `mode: "rag"`). `callGroundedLlm`
(ragPipeline.ts ~438) is **not exported**; `buildSnippetBlock` (~636) and `parseGroundedAnswer`
(~349) are exported. So the verified-prose-over-scope seam does NOT exist as a callable helper today.

The OTHER candidate, `extractField` (`fieldExtractor.ts` ~219), is **NOT** the second caller of this
seam. It uses its OWN `buildPrompt` / `parseLlmOutput`, returns a scalar `ExtractFieldResult`
(value + a SINGLE optional citation), and **never calls verify / tier / confidence** — a deliberately
different contract (single scalar field, no graduated attribution). Migrating `extractField` onto a
prose+verified-array helper would be a forced fit, not a real shared axis.

The genuine ≥2-caller pair is **`runRagPipeline` and the new report render** — both produce a prose
body + a verified `Citation[]` over `(question, scope)`. That is the axis this change earns.

This change is the **prerequisite** for `2026-06-01-retire-mock-mode`: MOCK_MODE cannot be removed
while the only working render path is the fixture.

## What Changes

- **Persist the sample report template server-side (NEW scope).** Add the `rt-utility-ic-brief`
  Utility IC-brief `ReportTemplate` — its four ordered sections WITH their `question` strings — as a
  real persisted `report`-kind `TemplateRecord`, via the same `saveTemplate` path the Save endpoint
  uses (`reportTemplateToSaveInput` → `saveTemplate`, with a server-assigned owner). This makes
  `getTemplate("rt-utility-ic-brief")` return the template the live path fans. The section →
  `question` mapping is spelled out in tasks.md §1 (each fixture section's body has a clear question
  that produces it). The fixture's pre-rendered bodies stay where they are (MOCK_MODE), but they are
  no longer the source of section *questions* for the live path.

- **Load the template in the render route + add `getTemplate` to deps.** The render route (~1232)
  loads the template by `request.templateId` (via `repository.getTemplate` → `parseTemplate` into a
  `ReportTemplate`) and passes the resolved template (or a `getTemplate` callback) into
  `RenderReportDeps`. The live branch reads each section's `question` from THAT template — the
  server-side source of truth — never from the client request.

- **Live render deps on `RenderReportDeps`.** Add `groundxClient`, `groundxApiKey`, `llmClient`,
  `llmModelId`, and the resolved `template` (or `getTemplate`) to `RenderReportDeps` (~251),
  mirroring `ExtractFieldDeps` (`fieldExtractor.ts` ~56) and the chat router deps. Outside MOCK_MODE
  the live-generation deps are required (throw with a clear message when absent, as `extractField` /
  `runRagPipeline` do). The render route supplies them the same way the extract route (~1160) does:
  `llmClient` / `groundxClient` from app deps, `groundxApiKey` from
  `sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY`, `llmModelId` from `env.LLM_MODEL_ID`.

- **The render route uses the request BODY scope — NOT `deriveRagContentScope`.** The render route
  already parses scope from `body.scope` via `contentScopeSchema` (app.ts ~1202). That is
  authoritative for Report per Template + Scope + Results (scope is a render-time input on the
  request, recorded on the result). An implementer MUST NOT copy the extract/chat route's
  `deriveRagContentScope(activeEntity, …)` (app.ts ~1157) here — Report's scope comes from the
  request body, not the chat session's active entity.

- **Per-section live render.** Replace the throw with a real implementation: for each section in
  template order (honoring the `sectionIds` subset), search its `question` over the resolved
  `ContentScope` doc set, ground the LLM over the returned snippets, verify the answer's citations
  (WF-06b: `verifyQuote` → `assignTier` → `confidenceFor`), and produce a generated result that
  flows through the SAME degradation path the fixture uses.

- **Earn the shared `groundedAnswerOverScope` seam (composable, one source of truth).** The real
  ≥2-caller axis is `runRagPipeline` + the report render — both produce a prose body + a verified
  `Citation[]` over `(question, scope)`. The plan's PREFERRED path: extract a shared
  `groundedAnswerOverScope(question, scope, deps): Promise<GeneratedResult>` helper that composes
  `searchGroundX` + `buildSnippetBlock` + an **exported** `callGroundedLlm` + `parseGroundedAnswer` +
  the `verifyQuote` / `assignTier` / `confidenceFor` verify loop, AND migrate `runRagPipeline`'s
  per-answer body (the ~140 inline lines) to call it — so the inline loop becomes the shared helper
  and rag is the real second caller. **Do NOT touch `extractField`** — it is a different contract
  (scalar value + single citation, no verify) and is NOT a caller of this seam.
  FALLBACK (if extracting from the tangled `runRagPipeline` proves too risky for this change):
  export `callGroundedLlm` and compose the pieces inline in the report path, and DOCUMENT the
  remaining duplication as a tracked follow-up ticket — do NOT pretend it is fully deduped. The
  plan states which path was taken and why (tasks.md §3). Either way the helper returns the shared
  `GeneratedResult` core (`body` + `citations` + `confidence?` + `warnings?`, `@groundx/shared`,
  single-sourced in `2026-05-31-generated-result-shared`); report wraps it into a
  `RenderedSectionWire`.

- **Unify the section degradation path (fixture + live share it).** `renderSection` (~399) today
  takes a `FixtureSection` (`.noSource`, a `.body` with `{var}` tokens, `.cites`). A live result is
  `{ body from LLM, verified citations[] }` with NO `noSource` flag — "no support" is *derived* from
  zero verified citations. Refactor `renderSection` (or add a sibling) to operate on the shared
  generated-result shape (`body` + `citations` + `confidence?` + `warnings?`) so the fixture AND live
  paths share ONE degradation path: variable substitution, unresolved-`{var}` warning, and the
  no-support degradation (`—` + `⚠ no support in docs`) when there are zero verified citations.

- **`renderReport` becomes async.** The live path awaits search + LLM, so `renderReport` returns
  `Promise<RenderReportResponse | RenderGateResponse>`. The MOCK_MODE branch keeps returning the
  fixture result (now awaited). The app.ts call site (~1232) already lives in an `async` handler; it
  gains an `await`. EVERY existing synchronous `renderReport(...)` call-site in `reportRenderer.test.ts`
  (~12 of them: `:133`, `:155`, `:164`, …) and in `app.ts` is converted to `await` (with the test
  fns made `async`).

- **Same response shape — widget unchanged.** The live path returns the identical
  `RenderReportResponse` (~229): ordered `sections[]` (template order), each `RenderedSectionWire`
  (`name`, `render_as`, `body`, `cites`, `confidence?`, `warnings?`), `resolved_variables`,
  `export_formats`, `preview_only`. The render surface and `CiteChip` consume the response identically
  whether it came from the fixture or the live fan-out.

- **Gate + idle behavior unchanged.** BYO scope still returns the gate envelope (#10) before any
  render (~464); an empty/unresolvable doc set still returns the idle empty render (~484), before any
  search/LLM call. Live vs mock only differs in *how a non-empty sample scope's sections get their
  bodies*.

- **No new widgets or tools.** This is a middleware-only change. The report surface
  (`SmartReportRender` ScopedViewerWidget + `SmartReportBuilder`), its `show_*` canvas-dispatch +
  template-mutation tools, and `CiteChip` ALL already exist and are unchanged — including the widget's
  loading/ready/empty/error+retry states and the Promise-based client `renderReport`. The wire
  response shape is identical, so the async/fallible live path lights up the existing widget with no
  UI/tool/contract change.

- **Not in this change:** removing MOCK_MODE. After this lands, `renderReport` works **both** with the
  fixture (MOCK_MODE) and live. Removing the fixture / `mockMode` flag is the dependent change
  `2026-06-01-retire-mock-mode`.
