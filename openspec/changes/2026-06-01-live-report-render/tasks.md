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

## 1. Persist the sample report template server-side (the live path's source of questions)

The live path needs the template's section **questions** from a SERVER source — the MOCK_MODE
fixture only carries pre-rendered bodies, and `rt-utility-ic-brief` is not seeded anywhere
(`app/src/widgets/reportFixtures.ts:30` + the `REPORT_FIXTURES` mock constant are the only
definitions). Persist it as a real `report`-kind `TemplateRecord` via the existing
`reportTemplateToSaveInput` → `saveTemplate` path (the same persistence Extract schemas use).

Section → `question` mapping for the `rt-utility-ic-brief` Utility IC-brief template (the question
that produces each existing `UTILITY_SECTIONS` fixture body — same ids/names/`renderAs`):

| id / name | renderAs | question |
| --- | --- | --- |
| `billing_summary` | PARAGRAPH | "Summarize this statement: total amount due, number of meters, number of line-item charges, billing period, and account number." |
| `charge_breakdown` | TABLE | "Break down the total charges by category (demand charges, energy charges, taxes & fees) as a table of category and amount." |
| `anomalies` | BULLETS | "List any billing anomalies — charges or usage materially above the trailing baseline, per-meter spikes — with the magnitude of each." |
| `recommendation` | PARAGRAPH | "Given the charges and any anomalies, recommend what to review before approving payment and the estimated recoverable savings." |

- [ ] Write FAILING test (`reportRenderer.test.ts` or `app.test.ts`): after seeding/boot,
      `repository.getTemplate("rt-utility-ic-brief")` returns a non-null `report`-kind
      `TemplateRecord` whose parsed `ReportTemplate` has the four ordered sections above, each with a
      non-empty `question`, matching `name`, and `renderAs`. (Today it returns `null` unless the
      Save endpoint was hit — `app.test.ts:1243` only sees it because that test calls Save first.)
- [ ] Define the `rt-utility-ic-brief` `ReportTemplate` (the four sections WITH the `question`
      strings above) as a server-side constant and PERSIST it via `reportTemplateToSaveInput(template)`
      → `saveTemplate(...)` with a SERVER-assigned owner (not from any wire). Seed it where the other
      sample/boot content is established (check `middleware/scripts/seed-bucket.ts` and the app boot /
      `createSchema` path; if seeding belongs in the boot sequence, add it there so `memoryRepository`
      and `mysqlRepository` both have it for a fresh start). Keep the MOCK_MODE `UTILITY_SECTIONS`
      fixture bodies UNCHANGED — they remain the offline render bodies; this task only adds the
      persisted *questions* the live path fans.
- [ ] **Adversarial review:** confirm `getTemplate("rt-utility-ic-brief")` returns the template on a
      FRESH start (no Save call required) for BOTH repository implementations the test exercises;
      confirm the persisted sections' `question` strings are present and non-empty (the live path
      depends on them — a blank question is a no-op fan-out); confirm the template id/name/section
      ids/`renderAs` match the client fixture (`reportFixtures.ts`) so render results line up; confirm
      NO section `question` is read from the client request anywhere (one-source-of-truth).

## 2. Load the template in the render route + thread it into deps

- [ ] Write FAILING test (`app.test.ts` render route): the render route loads the template by
      `template_id` from the repository (server source), NOT from the request body; a render request
      whose `template_id` has no persisted template returns the idle empty render (or a clear
      `template_not_found`), and the request body NEVER supplies section questions.
- [ ] In the render route (~1232), after ownership checks, load the template via
      `repository.getTemplate(templateId)` → `parseTemplate` into a `ReportTemplate`, and pass it (or a
      `getTemplate` callback) into `RenderReportDeps`. Use the request BODY scope
      (`contentScopeSchema.safeParse(body.scope)`, already parsed at ~1202) — do NOT introduce
      `deriveRagContentScope` here (that is the extract/chat route's path; Report's scope is the
      request body per Template + Scope + Results).
- [ ] **Adversarial review:** confirm the route reads the template from the repo (grep the route for
      `getTemplate` / `parseTemplate`), the scope still comes from `body.scope` (no
      `deriveRagContentScope` in the render route), and the live path's section questions trace back to
      the persisted template — not the request. Confirm a missing template degrades gracefully (idle
      empty render or explicit not-found), never a crash.

## 3. Earn the shared `groundedAnswerOverScope` seam (or compose inline + ticket the dup)

This is the composable-over-forked crux. The real ≥2-caller axis is **`runRagPipeline` + the report
render** (both: prose body + verified `Citation[]` over `(question, scope)`). `extractField` is NOT a
caller — it returns a scalar value + single citation and never verifies; DO NOT touch it.

- [ ] Write FAILING test for the chosen path:
      - **Preferred (extract + migrate rag):** a unit test for `groundedAnswerOverScope(question,
        scope, deps)` that, with injected fake `groundxClient` + `llmClient` returning canned snippets
        + a grounded answer with a verbatim quote, returns a shared `GeneratedResult` (`body` +
        verified `citations[]` each with a WF-06b `tier` + `confidence`). PLUS a `ragPipeline.test.ts`
        assertion that `runRagPipeline`'s per-answer body now routes through the helper (rag still
        produces identical citations/tiers for the existing chat fixtures — behavior-parity).
      - **Fallback (compose inline):** assert `callGroundedLlm` is now exported and callable, and that
        the report path composes `searchGroundX` + `buildSnippetBlock` + `callGroundedLlm` +
        `parseGroundedAnswer` + `verifyQuote`/`assignTier`/`confidenceFor` to produce a verified
        `GeneratedResult` — with the duplication ticketed (see below).
- [ ] Implement the chosen path:
      - **Preferred:** extract ONE `groundedAnswerOverScope(question, scope, deps): Promise<GeneratedResult>`
        helper (new module or in `ragPipeline.ts`) that composes `searchGroundX` (search),
        `buildSnippetBlock` (`ragPipeline` ~636), an **exported** `callGroundedLlm` (`ragPipeline` ~438 —
        add `export`), `parseGroundedAnswer` (`ragPipeline` ~349), then the WF-06b verify loop
        `verifyQuote` → `assignTier` → `confidenceFor` (`attribution.ts`). MIGRATE `runRagPipeline`'s
        per-answer body (the ~140 inline lines, `ragPipeline.ts` ~235-298) to call the helper, so the
        inline loop becomes the shared helper and rag is the real second caller. The helper returns the
        shared `GeneratedResult` core (`body`/`citations`/`confidence?`/`warnings?`).
      - **Fallback (only if migrating the tangled `runRagPipeline` is out of scope for this change):**
        add `export` to `callGroundedLlm`, compose the pieces inline in the report path, and FILE a
        tracked follow-up ticket (OpenSpec `tasks.md` entry or `spawn_task`) to dedupe `runRagPipeline`
        onto the same helper. Do NOT claim the loop is deduped if it is not.
      - State which path you took and WHY in the commit message.
- [ ] **Adversarial review:** **Composable check (mandatory):** grep that NO new private copy of the
      snippet-block build, the grounding prompt, or the answer-parse exists in the report path — it
      reuses `buildSnippetBlock` / `parseGroundedAnswer` / `callGroundedLlm` / `searchGroundX` /
      attribution. If `groundedAnswerOverScope` was extracted, confirm `runRagPipeline` ALSO calls it
      (≥2 real callers — not a dormant 1-caller abstraction) and that `extractField` was NOT migrated
      onto it. If inline was chosen, confirm `callGroundedLlm` is exported, the duplication is ticketed,
      and the plan does not pretend it is deduped. **One-source-of-truth check:** the helper's result is
      the shared `GeneratedResult` (`@groundx/shared`), NOT a new local result shape.

## 4. Unify the section degradation path (fixture + live share `renderSection`)

`renderSection` (~399) consumes a `FixtureSection` (`.noSource`, `.body` with `{var}` tokens,
`.cites`). A live result is `{ body from LLM, verified citations[] }` with NO `noSource` flag —
"no support" is DERIVED from zero verified citations.

- [ ] Write FAILING test (`reportRenderer.test.ts`): a LIVE generated result with ZERO verified
      citations degrades to `body: "—"` + `confidence: 0.1` + `warnings: ["⚠ no support in docs"]`
      (the same shape the fixture's `noSource` section produces); and a live result whose body still
      contains an unbound `{variable}` keeps the `{var}` placeholder and adds the "bind it" warning —
      the same degradation the fixture path applies.
- [ ] Refactor `renderSection` (or add a sibling that both paths call) to operate on the shared
      generated-result shape (`body` + `citations` + `confidence?` + `warnings?`) so the FIXTURE and
      LIVE paths share ONE degradation path: variable substitution (the `VAR_TOKEN` pass), the
      unresolved-`{var}` "bind it" warning, and the no-support degradation triggered by zero
      verified citations (replacing the fixture's `.noSource` boolean as the trigger). The fixture
      path keeps producing identical output (the fixture sections with cites do not degrade; the
      `rt-utility-no-source` fixture, which has empty `cites`, still degrades).
- [ ] **Adversarial review:** confirm BOTH paths call the same degradation function (grep — one
      implementation, two callers), the no-support trigger is "zero verified citations" (not a fixture
      boolean) on the live side, the fixture path's existing tests still pass byte-for-byte, and the
      new live no-support test is real + green + runs WITHOUT MOCK_MODE.

## 5. Per-section live render wired into `renderReport` (search → ground → verify → cited section)

- [ ] Write FAILING test (`reportRenderer.test.ts`): with `mockMode: false`, INJECTED fake
      `groundxClient` + `llmClient` (NOT MOCK_MODE), a resolved/persisted template, and a sample
      scope, `renderReport` returns `sections[]` whose bodies are the LLM output and whose `cites` are
      verified citations with a WF-06b `tier` (`exact`/`normalized`/`ambient`) and a `confidence` —
      proving search + generation + verify ran per section, in template order, honoring `sectionIds`.
      Also assert the OLD `throw new Error("live report render is not yet wired …")` is gone.
- [ ] Replace the throw (~478) with the live branch: for each section to render (template order,
      honoring the `sectionIds` subset), call `groundedAnswerOverScope(section.question, scope, deps)`
      (preferred) OR the inline composition (fallback) to produce a `GeneratedResult`, then pass it
      through the unified degradation path from §4 to emit a `RenderedSectionWire`. The section
      `question` comes from the deps template (§2), NEVER the request.
- [ ] **Adversarial review:** confirm the live branch genuinely calls the injected `searchGroundX` +
      `llmClient` + `verifyQuote`/`assignTier`/`confidenceFor` per section (not a hardcoded body);
      ordering matches template order + the `sectionIds` subset; the §4 degradations fire on the live
      result (a section with no snippet support → `—` + `⚠ no support in docs`). **One-source-of-truth
      check:** the emitted `RenderedSectionWire` derives from the shared `RenderedSection` /
      `GeneratedResult` core (`@groundx/shared`), NOT a new local result shape (the `Eq<>` guard at
      reportRenderer.ts ~219 still holds).

## 6. `renderReport` async + convert EVERY call-site

- [ ] Write FAILING test (`reportRenderer.test.ts`): assert `renderReport(...)` returns a Promise and
      that BOTH the MOCK_MODE result and the live result satisfy the SAME `RenderReportResponse` shape
      — ordered `sections[]` of `RenderedSectionWire` (`name`, `render_as`, `body`, `cites`,
      `confidence?`, `warnings?`), plus `report_id`, `template_id`, `status`, `resolved_variables`,
      `export_formats`, `preview_only`. Behavior-parity: the wire keys are identical mock vs live.
- [ ] Change `renderReport`'s signature to `Promise<RenderReportResponse | RenderGateResponse>`;
      `await` the live search/LLM work; keep the MOCK_MODE branch returning the fixture (now awaited).
- [ ] Convert EVERY existing synchronous `renderReport(...)` call-site to `await` + make the enclosing
      test fns `async`: ALL ~12 calls in `reportRenderer.test.ts` (`:133`, `:155`, `:164`, `:174`,
      `:183`, `:190`, `:198`, `:210`, `:222`, … — each followed by `if ("gated" in result)` /
      `result.status` / `result.sections`), and the `app.ts` render route call (~1232). The gate and
      idle branches remain synchronous-shaped (awaited, no behavior change).
- [ ] **Adversarial review:** grep for any remaining un-awaited `renderReport(` (no
      `[object Promise]` JSON, no unhandled-promise); confirm every test that calls it is `async` and
      `await`s; the response JSON shape is byte-identical to today's for MOCK_MODE; the render-surface
      widget + `CiteChip` + the client `renderReport` (already Promise-based) need NO change. `npm run
      build` + middleware vitest green.

## 7. Gate + idle parity (unchanged behavior, regression-pinned)

- [ ] Write FAILING test (or extend) in `reportRenderer.test.ts`: with `mockMode: false`, a BYO scope
      still returns the gate envelope (`gated: true`, `gate: "byo"`) BEFORE any search/LLM call (inject
      clients that THROW if called — they must NOT be touched on a BYO scope); and a sample scope that
      resolves to an empty doc set still returns the idle empty render (`sections: []`, `status:
      "complete"`, `preview_only: true`) without calling the LLM.
- [ ] Confirm the BYO gate (~464) and empty-scope idle render (~484) run before / instead of the live
      fan-out — no code change expected beyond ordering; the test pins the invariant (#10 gate, idle
      render) against the new live path so it can't regress.
- [ ] **Adversarial review:** prove the injected throwing clients are NOT invoked on the BYO and
      empty-scope paths (the gate/idle branches short-circuit before the live fan-out). Confirm this
      matches Extract's anon/gate parity requirement in the durable spec.

## Closeout

- [ ] `openspec validate 2026-06-01-live-report-render --strict` passes.
- [ ] Full middleware vitest + `npm run build` + drift guards green; the live-render test runs
      WITHOUT MOCK_MODE and is not retargeted to the fixture.
- [ ] Delete any inline `TODO(2026-06-01-live-report-render)` and confirm the "not yet wired (Phase 7
      / WF-10)" throw is fully removed from `reportRenderer.ts`.
- [ ] Confirm the §3 fallback dedupe ticket exists (if the inline path was taken) OR that
      `runRagPipeline` calls `groundedAnswerOverScope` (if extracted). No orphaned partial-dedup claim.
- [ ] Confirm scope boundary: MOCK_MODE is **still present** — `renderReport` works both with the
      fixture and live. Removing MOCK_MODE is the dependent change `2026-06-01-retire-mock-mode`; do
      NOT touch it here.
- [ ] Cross-plan check: no collision with in-flight changes on `reportRenderer.ts` / `app.ts` /
      `ragPipeline.ts` (esp. `2026-06-01-retire-mock-mode`); hand off the "MOCK_MODE removable"
      precondition to `2026-06-01-retire-mock-mode`.
