# Tasks — Live multi-doc report render (Phase 7 / WF-10)

> **Per-task adversarial-review gate (Discipline §10).** A task is NOT done until an adversarial
> review of its output passes — against this plan AND the real code, not the seam — run BEFORE
> marking it done and BEFORE starting the next task. Default gate: falsify every claim against the
> code; confirm no no-op / dormant plumbing (the live branch must actually search + generate +
> verify, not return a stubbed body; the persisted template must actually be the source the live
> path reads); `openspec validate 2026-06-01-live-report-render --strict` with no delta vs the
> shipped/archived `smart-report` spec; open the named test file and confirm it is real + green +
> not retargeted-away (the live test runs WITHOUT `mockMode`); cross-plan collision check on
> `reportRenderer.ts` + `app.ts` against any in-flight change touching the render path (esp.
> `2026-06-01-retire-mock-mode`); `npm run build` + drift guards green. Failed gate → back to
> `in-progress`, never advance. TDD is mandatory: write the failing test first.

## 1. No-template state is the graceful new-customer starting point (NO sample template seeded)

There is NO sample report template, and that is the CORRECT new-customer starting state. Per the
Template + Scope + Results model (`Pin→template = NO auto`; existing-or-new UX), a brand-new
authenticated customer legitimately has ZERO templates. This change does NOT seed any sample
template. When the render route's `repository.getTemplate(request.templateId)` returns `null`,
`renderReport` MUST return the graceful no-template state — never an error, never a fixture, never a
fabricated render. The no-template state reuses the EXISTING widget empty state (the render surface
already ships loading/ready/empty/error+retry). A sample template MAY be added later; its ABSENCE
must never break anything. (No `rt-utility-ic-brief` server constant, no `saveTemplate` seeding, no
section-question mapping table — the live path's questions come from a REAL user-created template
when one exists, §5.)

- [x] Write FAILING test (`reportRenderer.test.ts`): with `mockMode: false`, INJECTED clients that
      THROW if called, and a `getTemplate` that returns `null` for `request.templateId`, `renderReport`
      returns the no-template state (empty render shape: `sections: []`, `status: "complete"`,
      `preview_only: true`) WITHOUT calling search/LLM — never an error, never a fixture. This is the
      new-customer norm (`getTemplate` returns `null`), not an error path.
- [x] Implement the no-template branch in `renderReport`: when the resolved template is `null`, return
      the graceful no-template state (the existing empty-render shape) before any live fan-out. Do NOT
      seed a sample template anywhere (no `seed-bucket.ts` / boot `saveTemplate` for a report template).
      Keep the MOCK_MODE `UTILITY_SECTIONS` fixture bodies UNCHANGED — the fixture path is unaffected.
- [x] **Adversarial review:** confirm NO sample report template is written anywhere (grep
      `seed-bucket.ts`, the boot / `createSchema` path, and `reportRenderer.ts` — no
      `saveTemplate(...report...)` seeding); confirm a `null` template degrades to the no-template state
      (the existing widget empty state), never an error or a fabricated/fixture render; confirm the
      injected clients are NOT touched when there is no template; confirm NO section `question` is read
      from the client request anywhere (one-source-of-truth).

## 2. Load the template in the render route + thread it into deps

- [x] Write FAILING test (`app.test.ts` render route): the render route loads the template by
      `template_id` from the repository (server source), NOT from the request body; a render request
      whose `template_id` has no persisted template (the new-customer norm) returns the graceful
      no-template state (§1: empty render shape), never an error or crash, and the request body NEVER
      supplies section questions.
- [x] In the render route (~1232), after ownership checks, load the template via
      `repository.getTemplate(templateId)` → `parseTemplate` into a `ReportTemplate`, and pass it (or a
      `getTemplate` callback) into `RenderReportDeps`. Use the request BODY scope
      (`contentScopeSchema.safeParse(body.scope)`, already parsed at ~1202) — do NOT introduce
      `deriveRagContentScope` here (that is the extract/chat route's path; Report's scope is the
      request body per Template + Scope + Results).
- [x] **Adversarial review:** confirm the route reads the template from the repo (grep the route for
      `getTemplate` / `parseTemplate`), the scope still comes from `body.scope` (no
      `deriveRagContentScope` in the render route), and the live path's section questions trace back to
      the user-created template — not the request. Confirm a missing template degrades gracefully to
      the no-template state (§1), never a crash and never a fabricated render.

## 3. Extract the shared `groundedAnswerOverScope` seam + migrate `runRagPipeline` onto it

This is the composable-over-forked crux. Pre-launch, no real users yet → take the PREFERRED (most
extensible) path; there is NO fallback in this plan. The real ≥2-caller axis is **`runRagPipeline` +
the report render** (both: prose body + verified `Citation[]` over `(question, scope)`).
`extractField` is NOT a caller — it returns a scalar value + single citation and never verifies; DO
NOT touch it.

- [x] Write FAILING test: a unit test for `groundedAnswerOverScope(question, scope, deps)` that, with
      injected fake `groundxClient` + `llmClient` returning canned snippets + a grounded answer with a
      verbatim quote, returns a shared `GeneratedResult` (`body` + verified `citations[]` each with a
      WF-06b `tier` + `confidence`). PLUS a `ragPipeline.test.ts` behavior-parity assertion that
      `runRagPipeline`'s per-answer body now routes through the helper and STILL produces identical
      citations/tiers for the existing chat fixtures.
- [x] Implement: extract ONE `groundedAnswerOverScope(question, scope, deps): Promise<GeneratedResult>`
      helper (new module or in `ragPipeline.ts`) that composes `searchGroundX` (search),
      `buildSnippetBlock` (`ragPipeline` ~636), an **exported** `callGroundedLlm` (`ragPipeline` ~438 —
      add `export`), `parseGroundedAnswer` (`ragPipeline` ~349), then the WF-06b verify loop
      `verifyQuote` → `assignTier` → `confidenceFor` (`attribution.ts`). MIGRATE `runRagPipeline`'s
      per-answer body (the ~140 inline lines, `ragPipeline.ts` ~235-298) to call the helper, so the
      inline loop becomes the shared helper and rag is the real second caller. The helper returns the
      shared `GeneratedResult` core (`body`/`citations`/`confidence?`/`warnings?`).
- [x] **Adversarial review:** **Composable check (mandatory):** grep that NO new private copy of the
      snippet-block build, the grounding prompt, or the answer-parse exists in the report path — it
      reuses `buildSnippetBlock` / `parseGroundedAnswer` / `callGroundedLlm` / `searchGroundX` /
      attribution. Confirm `runRagPipeline` ALSO calls `groundedAnswerOverScope` (≥2 real callers — not
      a dormant 1-caller abstraction), the behavior-parity test is real + green (identical
      citations/tiers for the existing chat fixtures), and `extractField` was NOT migrated onto it.
      **One-source-of-truth check:** the helper's result is the shared `GeneratedResult`
      (`@groundx/shared`), NOT a new local result shape.

## 4. Unify the section degradation path (fixture + live share `renderSection`)

`renderSection` (~399) consumes a `FixtureSection` (`.noSource`, `.body` with `{var}` tokens,
`.cites`). A live result is `{ body from LLM, verified citations[] }` with NO `noSource` flag —
"no support" is DERIVED from zero verified citations.

- [x] Write FAILING test (`reportRenderer.test.ts`): a LIVE generated result with ZERO verified
      citations degrades to `body: "—"` + `confidence: 0.1` + `warnings: ["⚠ no support in docs"]`
      (the same shape the fixture's `noSource` section produces); and a live result whose body still
      contains an unbound `{variable}` keeps the `{var}` placeholder and adds the "bind it" warning —
      the same degradation the fixture path applies.
- [x] Refactor `renderSection` (or add a sibling that both paths call) to operate on the shared
      generated-result shape (`body` + `citations` + `confidence?` + `warnings?`) so the FIXTURE and
      LIVE paths share ONE degradation path: variable substitution (the `VAR_TOKEN` pass), the
      unresolved-`{var}` "bind it" warning, and the no-support degradation triggered by zero
      verified citations (replacing the fixture's `.noSource` boolean as the trigger). The fixture
      path keeps producing identical output (the fixture sections with cites do not degrade; the
      `rt-utility-no-source` fixture, which has empty `cites`, still degrades).
- [x] **Adversarial review:** confirm BOTH paths call the same degradation function (grep — one
      implementation, two callers), the no-support trigger is "zero verified citations" (not a fixture
      boolean) on the live side, the fixture path's existing tests still pass byte-for-byte, and the
      new live no-support test is real + green + runs WITHOUT MOCK_MODE.

## 5. Per-section live render wired into `renderReport` (search → ground → verify → cited section)

- [x] Write FAILING test (`reportRenderer.test.ts`): with `mockMode: false`, INJECTED fake
      `groundxClient` + `llmClient` (NOT MOCK_MODE), a REAL user-created template (resolved via deps),
      and a sample scope, `renderReport` returns `sections[]` whose bodies are the LLM output and whose
      `cites` are verified citations with a WF-06b `tier` (`exact`/`normalized`/`ambient`) and a
      `confidence` — proving search + generation + verify ran per section, in template order, honoring
      `sectionIds`. Also assert the OLD `throw new Error("live report render is not yet wired …")` is
      gone. (The `null`-template no-render case is pinned in §1.)
- [x] Replace the throw (~478) with the live branch (reached only when a real template exists): for
      each section to render (template order, honoring the `sectionIds` subset), call
      `groundedAnswerOverScope(section.question, scope, deps)` (§3) to produce a `GeneratedResult`, then
      pass it through the unified degradation path from §4 to emit a `RenderedSectionWire`. The section
      `question` comes from the deps template (§2), NEVER the request.
- [x] **Adversarial review:** confirm the live branch genuinely calls the injected `searchGroundX` +
      `llmClient` + `verifyQuote`/`assignTier`/`confidenceFor` per section via
      `groundedAnswerOverScope` (not a hardcoded body); ordering matches template order + the
      `sectionIds` subset; the §4 degradations fire on the live result (a section with no snippet
      support → `—` + `⚠ no support in docs`). **One-source-of-truth check:** the emitted
      `RenderedSectionWire` derives from the shared `RenderedSection` / `GeneratedResult` core
      (`@groundx/shared`), NOT a new local result shape (the `Eq<>` guard at reportRenderer.ts ~219
      still holds).

## 6. `renderReport` async + convert EVERY call-site

- [x] Write FAILING test (`reportRenderer.test.ts`): assert `renderReport(...)` returns a Promise and
      that BOTH the MOCK_MODE result and the live result satisfy the SAME `RenderReportResponse` shape
      — ordered `sections[]` of `RenderedSectionWire` (`name`, `render_as`, `body`, `cites`,
      `confidence?`, `warnings?`), plus `report_id`, `template_id`, `status`, `resolved_variables`,
      `export_formats`, `preview_only`. Behavior-parity: the wire keys are identical mock vs live.
- [x] Change `renderReport`'s signature to `Promise<RenderReportResponse | RenderGateResponse>`;
      `await` the live search/LLM work; keep the MOCK_MODE branch returning the fixture (now awaited).
- [x] Convert EVERY existing synchronous `renderReport(...)` call-site to `await` + make the enclosing
      test fns `async`: ALL ~12 calls in `reportRenderer.test.ts` (`:133`, `:155`, `:164`, `:174`,
      `:183`, `:190`, `:198`, `:210`, `:222`, … — each followed by `if ("gated" in result)` /
      `result.status` / `result.sections`), and the `app.ts` render route call (~1232). The gate and
      idle branches remain synchronous-shaped (awaited, no behavior change).
- [x] **Adversarial review:** grep for any remaining un-awaited `renderReport(` (no
      `[object Promise]` JSON, no unhandled-promise); confirm every test that calls it is `async` and
      `await`s; the response JSON shape is byte-identical to today's for MOCK_MODE; the render-surface
      widget + `CiteChip` + the client `renderReport` (already Promise-based) need NO change. `npm run
      build` + middleware vitest green.

## 7. Gate + idle parity (unchanged behavior, regression-pinned)

- [x] Write FAILING test (or extend) in `reportRenderer.test.ts`: with `mockMode: false`, a BYO scope
      still returns the gate envelope (`gated: true`, `gate: "byo"`) BEFORE any search/LLM call (inject
      clients that THROW if called — they must NOT be touched on a BYO scope); and a sample scope that
      resolves to an empty doc set still returns the idle empty render (`sections: []`, `status:
      "complete"`, `preview_only: true`) without calling the LLM.
- [x] Confirm the BYO gate (~464), the no-template state (§1), and the empty-scope idle render (~484)
      all run before / instead of the live fan-out — no code change expected beyond ordering (gate →
      no-template → idle → live); the test pins the invariant (#10 gate, no-template state, idle
      render) against the new live path so it can't regress.
- [x] **Adversarial review:** prove the injected throwing clients are NOT invoked on the BYO and
      empty-scope paths (the gate/idle branches short-circuit before the live fan-out). Confirm this
      matches Extract's anon/gate parity requirement in the durable spec.

## Closeout

- [x] `openspec validate 2026-06-01-live-report-render --strict` passes.
- [x] Full middleware vitest + `npm run build` + drift guards green; the live-render test runs
      WITHOUT MOCK_MODE and is not retargeted to the fixture.
- [x] Delete any inline `TODO(2026-06-01-live-report-render)` and confirm the "not yet wired (Phase 7
      / WF-10)" throw is fully removed from `reportRenderer.ts`.
- [x] Confirm `runRagPipeline` calls `groundedAnswerOverScope` (the seam was extracted + migrated, §3)
      with the behavior-parity test green. No orphaned partial-dedup claim, no dormant 1-caller helper.
- [x] Confirm NO sample report template is seeded anywhere (no report-kind `saveTemplate` in
      `seed-bucket.ts` / boot / `reportRenderer.ts`); a `null` template renders the graceful
      no-template state (§1), never an error or fabricated render.
- [x] Confirm scope boundary: MOCK_MODE is **still present** — `renderReport` works both with the
      fixture and live. Removing MOCK_MODE is the dependent change `2026-06-01-retire-mock-mode`; do
      NOT touch it here.
- [x] Cross-plan check: no collision with in-flight changes on `reportRenderer.ts` / `app.ts` /
      `ragPipeline.ts` (esp. `2026-06-01-retire-mock-mode`); hand off the "MOCK_MODE removable"
      precondition to `2026-06-01-retire-mock-mode`.
