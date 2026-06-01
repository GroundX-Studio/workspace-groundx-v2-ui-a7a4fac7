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
degradations. But the throw stands in for two genuinely missing pieces — a graceful no-template
state for the new-customer starting point, and the per-section generation orchestration, which does
not yet exist as a reusable seam.

### The live path's section questions come from a real user-created template — and "no template" is the legitimate new-customer state

The fixture path does NOT use a template's questions at all. It reads pre-rendered bodies from a
hardcoded constant: `REPORT_FIXTURES["rt-utility-ic-brief"] = { sections: UTILITY_SECTIONS }`
(reportRenderer.ts ~355), where each `UTILITY_SECTIONS` entry is a `FixtureSection` carrying a
finished `body` string and `cites` — **NOT** a `question`. (The durable `ReportSection` type at
~55 *does* carry a `question`, but the MOCK_MODE fixture constants do not.)

`RenderReportRequest` (reportRenderer.ts ~184) carries only `templateId` + `scope` + `variables` +
`sectionIds` — it does NOT carry the section questions.

**There is NO sample report template, and that is the CORRECT new-customer starting state.** Per the
locked Template + Scope + Results model (`Pin→template = NO auto`; the existing-or-new UX), a
brand-new authenticated customer legitimately has **zero** templates. The smart-report experience
MUST treat "no template" as the **legitimate starting state** — render the no-template / empty
"create or pick a template" state GRACEFULLY, never an error and never a faked/seeded render. A
sample template MAY be added later, but its ABSENCE must never break anything.

Templates are first-class **server-persisted** objects per that meta-pattern — Report shares
Extract's lifecycle. The persistence + read machinery already exists: `repository.saveTemplate` /
`getTemplate` over the `templates` table (`types.ts` ~234, both `mysqlRepository` and
`memoryRepository`), the `report`-kind `TemplateSaveInput` bridge `reportTemplateToSaveInput(template)`
(reportRenderer.ts ~150), and the durable `ReportSection` shape WITH its `question`. The live render
route loads the template by `request.templateId` via `repository.getTemplate(...)` → `parseTemplate`.

→ When `getTemplate` returns `null` (no template — the new-customer norm), the render returns the
graceful **no-template state**, NOT an error and NOT a fixture. The live render machinery (per-section
search → ground → verify → cite) runs ONLY when a REAL user-created template exists, and each
section's `question` then comes from THAT persisted template — never from the client request (one
source of truth). This change does NOT seed any sample template.

Consequence: the onboarding report surface no longer shows a pre-rendered demo report — it shows the
no-template starting state until the user creates/pins a template. That is the intended new-customer
experience, consistent with `feedback_no_onboarding_duplicates` (same production widget) + the
existing-or-new UX.

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

- **No sample template is seeded; "no template" renders the graceful no-template state.** This change
  does NOT persist any sample report template. A brand-new authenticated customer legitimately has
  zero templates (`Pin→template = NO auto`; existing-or-new UX). The render route loads the template
  by `request.templateId` via `repository.getTemplate(...)` → `parseTemplate`; when `getTemplate`
  returns `null` (the new-customer norm), `renderReport` returns the graceful **no-template state**
  — NOT an error, NOT a fixture, NOT a fabricated render. The no-template state reuses the existing
  widget empty state (the render surface already ships loading/ready/empty/error+retry). The B1/B2
  "no question source" concern is resolved by: no template → no render (graceful); template exists →
  questions come from it.

- **Load the template in the render route + add `getTemplate` to deps.** The render route (~1232)
  loads the template by `request.templateId` (via `repository.getTemplate` → `parseTemplate` into a
  `ReportTemplate`) and passes the resolved template (or a `getTemplate` callback) into
  `RenderReportDeps`. When a REAL user-created template exists, the live branch reads each section's
  `question` from THAT template — the server-side source of truth — never from the client request.
  When none exists, it returns the no-template state before any live fan-out.

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

- **Extract the shared `groundedAnswerOverScope` seam + migrate `runRagPipeline` onto it (composable,
  one source of truth).** Pre-launch, no real users yet → take the PREFERRED (most extensible) path;
  there is no fallback. The genuine ≥2-caller axis is `runRagPipeline` + the report render — both
  produce a prose body + a verified `Citation[]` over `(question, scope)`. EXTRACT one shared
  `groundedAnswerOverScope(question, scope, deps): Promise<GeneratedResult>` helper that composes
  `searchGroundX` + `buildSnippetBlock` + an **exported** `callGroundedLlm` + `parseGroundedAnswer` +
  the WF-06b `verifyQuote` / `assignTier` / `confidenceFor` verify loop, AND MIGRATE
  `runRagPipeline`'s ~140-line inline per-answer loop (`ragPipeline.ts` ~235-298) to call it — so rag
  is the genuine second caller and the loop has ONE home. A behavior-parity test pins that
  `runRagPipeline` produces identical citations/tiers after the migration. **Do NOT touch
  `extractField`** — it is a different contract (scalar value + single citation, no verify) and is
  NOT a caller of this seam. The helper returns the shared `GeneratedResult` core (`body` +
  `citations` + `confidence?` + `warnings?`, `@groundx/shared`, single-sourced in
  `2026-05-31-generated-result-shared`); report wraps it into a `RenderedSectionWire`.

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

- **Gate + no-template/idle behavior unchanged, ordered before any live fan-out.** BYO scope still
  returns the gate envelope (#10) before any render (~464); a missing template returns the
  no-template state and an empty/unresolvable doc set still returns the idle empty render (~484) —
  all before any search/LLM call. Live vs mock only differs in *how a non-empty sample scope's
  sections get their bodies when a real template exists*.

- **No new widgets or tools.** This is a middleware-only change. The report surface
  (`SmartReportRender` ScopedViewerWidget + `SmartReportBuilder`), its `show_*` canvas-dispatch +
  template-mutation tools, and `CiteChip` ALL already exist and are unchanged — including the widget's
  loading/ready/empty/error+retry states and the Promise-based client `renderReport`. The wire
  response shape is identical, so the async/fallible live path lights up the existing widget with no
  UI/tool/contract change.

- **Not in this change:** removing MOCK_MODE. After this lands, `renderReport` works **both** with the
  fixture (MOCK_MODE) and live. Removing the fixture / `mockMode` flag is the dependent change
  `2026-06-01-retire-mock-mode`.
