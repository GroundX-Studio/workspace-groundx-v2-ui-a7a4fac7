# Tasks — 2026-06-01-rag-retrieval-correctness

> **Per-task adversarial-review gate (Discipline §10, principle 3).** A task is
> NOT done until an adversarial review of its output passes — against THIS plan
> AND the real code, run BEFORE marking the task done and BEFORE starting the
> next. Default gate for every task below:
> - Falsify every claim against the real code + the RECORDED GroundX fixture
>   (not the seam, not the happy-path mock).
> - No-op / dormant-plumbing check: the retry / fallback / instrumentation
>   actually FIRES on the recorded input — prove it with an assertion, not a
>   comment.
> - Open the test file: real, green, and NOT retargeted to a trivial stub that
>   dodges the defect.
> - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate
>   2026-06-01-rag-retrieval-correctness --strict` clean; no delta vs the
>   shipped/archived chat-routing spec beyond byte-matched MODIFIED headers.
> - Cross-plan collision check on `groundxSearch.ts` / `groundedAnswer.ts` /
>   `ragPipeline.ts` / `chatRouterTypes.ts` (shared with the live-report-render +
>   core-data-followups changes).
> - `npm run build` + middleware vitest green (file-serial config; see
>   `project_middleware_vitest_serial`).
> - Failed gate → back to in-progress, never advance.
>
> Tags: **SEQUENTIAL** unless marked WORKFLOW. Tasks 1→5 are SEQUENTIAL (each
> depends on the prior's recorded evidence / fix).

## 1. Reproduce + instrument the live failure — SEQUENTIAL

- [ ] **1.1 Capture the real GroundX response as a fixture.** Using the GroundX
      MCP `search_content` (bucket 28454, query "What is the total amount due on
      this bill?", + the `utility` project filter) AND `search_documents`
      ([c3bfff49]) tools, record the RAW JSON responses. Save under
      `middleware/src/services/fixtures/rag-utility-amount-due.search.json`
      (initial-floor pass) and a second capture at the low relevance floor.
      Also capture `document_getextract(c3bfff49)` →
      `fixtures/rag-utility.extract.json` and the relevant
      `document_getxray(c3bfff49)` chunks → `fixtures/rag-utility.xray.json` as
      the candidate snippet sources for later tasks. NO secrets in the fixture
      (strip any `*username`/key fields per `feedback_never_commit_secrets`).
- [ ] **1.2 Failing reproduction test (TDD red).** Add
      `ragRetrieval.reproduction.test.ts`: inject a fake `GroundXClient` that
      replays the recorded initial-floor fixture (and the recorded low-floor
      fixture on the retry call), drive `runRagPipeline` over the utility
      bucket+`utility`-filter scope, and ASSERT it currently yields 0 usable
      snippets / a "no snippets" answer / 0 citations. This test documents the
      defect and MUST be red against current behavior (or green-confirming-the-
      bug, then inverted by the fix task).
- [ ] **1.3 Per-stage instrumentation.** Extend the existing `searchGroundX`
      dev logging so the search request (path, filter, n, relevance) AND the raw
      result count are recorded at BOTH stages (initial search + low-floor
      retry), and surface the per-stage counts on the dev-only `_debug.groundx`
      accumulator (e.g. `initialResultCount`, `retryFired`,
      `retryResultCount`, `usableSnippetCount`). Production behavior unchanged
      (gated on `NODE_ENV !== "production"`). Assert the accumulator shape in a
      test driven by the recorded fixture.
- [ ] **Adversarial review:** Confirm the fixture is the REAL recorded GroundX
      response for c3bfff49 over bucket 28454/`utility` (filename/sourceUrl/
      documentId match the requested doc — guard against the known tool-result
      file-save artifact); confirm the reproduction test is red against current
      `runRagPipeline` (not stubbed past the search); confirm the new `_debug`
      counters are populated from the actual mapped results, not hard-coded; no
      secrets committed.

## 2. Root-cause the failing stage — SEQUENTIAL

- [ ] **2.1 Falsify each hypothesis against the recorded response.** Record, in
      this task's review note + the change's evidence, which stage fails:
      - (a) **scope→filter mismatch** — does the recorded request's compiled
        `filter` (`compileScopeFilter({projectId:["utility"]})` `$and`-composed
        with rbac) match the doc's stored `filter`? Falsify by comparing the
        fixture's returned documentIds with/without the filter.
      - (b) **scored out** — did the initial search return results that the
        pipeline discarded? Check `initialResultCount` vs `usableSnippetCount`.
      - (c) **retry not firing / floor too high** — does the EXACTLY-zero retry
        condition hold on the recorded initial pass? If the initial pass returns
        ≥1 weak chunk, the retry never fires (the suspected defect). Confirm
        from `retryFired`.
      - (d) **snippet text unusable** — is the returned `text` extract-JSON the
        prompt/parse can't ground on, or empty?
      - (e) **genuinely prose-empty** — does NO floor surface usable prose, so
        RAG must read extract/X-Ray instead?
- [ ] **2.2 Name the single load-bearing cause** (or the minimal set) and the
      fix shape it implies, written into the change as the design decision.
      Reconcile with the geometry-memory Correction (doc may no longer be
      extract-indexed) — state whether the `RAG_FALLBACK_RELEVANCE` "scores
      ~-30" comment is stale and correct it if so.
- [ ] **Adversarial review:** Each hypothesis verdict is backed by an assertion
      or an explicit value read off the RECORDED fixture, not asserted from the
      code comment. The named cause actually explains 0 citations on the
      recorded input — re-run the reproduction test mentally against the claim.

## 3. Fix the retrieval algorithm — SEQUENTIAL

- [ ] **3.1 Failing test for the fixed behavior (TDD red→green).** Before the
      fix, write the assertion the fix must satisfy: over the recorded fixture,
      `runRagPipeline` returns a grounded answer with ≥1 citation + a non-empty
      snippet set + a non-ambient tier for the "amount due" value. Red now.
- [ ] **3.2 Implement the most-correct fix** the root-cause points to. Likely
      shape (final per task 2): in `searchGroundX`, fire the low-floor pass
      whenever the USABLE-snippet set is empty (not only on exactly-zero raw
      results); AND/OR correct the scope filter compilation; AND/OR add an
      extract/X-Ray snippet fallback (read the doc's extraction/X-Ray chunks as
      snippets) ONLY when prose search is genuinely empty. Keep it on the
      existing single pipeline seam — any fallback is a value on the
      snippet-source axis consumed identically by both `groundedAnswerOverScope`
      callers (composable, not forked). WF-06b verify→tier preserved.
- [ ] **3.3 Make the reproduction test (1.2) GREEN** via the fix — flip it from
      "asserts the bug" to "asserts the grounded, cited answer," or keep 1.2 as
      the documented historical red and let 3.1 be the green guard.
- [ ] **3.4 Guard the non-regressing-doc path.** Add a test with a recorded
      PROSE-doc search response proving the fix does NOT make ordinary
      well-scored docs pay an extra round-trip or change their snippet set
      (the common path stays first-pass).
- [ ] **Adversarial review:** Confirm the fix fires on the recorded utility
      fixture (instrument shows `retryFired`/fallback engaged) AND that a
      prose-doc fixture is unaffected; confirm no new forked code path
      (`grep` for a second search/ground function); confirm citations are real
      verified chunks (tier ≠ fabricated); `compileScopeFilter` change (if any)
      keeps the shared-package single source of truth.

## 4. RAG-correctness regression suite — SEQUENTIAL (the user's explicit ask)

- [ ] **4.1 Capture ground-truth fixtures.** Via the GroundX MCP tools, record
      real search responses for a set of ground-truth Q&A pairs over the seeded
      sample, e.g.:
      - "What is the total amount due?" → the real `balance_payable` value
        (`7613.2`).
      - "Who is the bill addressed to?" → `addressee` (`"KWIK TRIP (1147)"`).
      - "How many meters are on this bill?" → the real meter count.
      Save each as a fixture under `fixtures/rag-groundtruth/`. Each pair
      records: query, expected-answer substring, min citations (≥1), expected
      tier floor. NO secrets.
- [ ] **4.2 Regression harness test.** Add `ragCorrectness.regression.test.ts`:
      a data-driven loop over the ground-truth pairs that, against the recorded
      fixtures (offline, deterministic, NO live network — fake `GroundXClient` +
      fake `LlmClient`), asserts each query yields (i) an answer containing the
      expected value, (ii) `citations.length >= 1`, (iii) a non-empty snippet
      set, (iv) tier ≥ the recorded floor.
- [ ] **4.3 "Never silently no-snippets" guard.** Add an assertion that a
      KNOWN-answerable query (the amount-due pair) NEVER returns 0 citations /
      the "no snippets" refusal — a hard regression tripwire distinct from the
      per-pair checks.
- [ ] **Adversarial review:** Confirm the suite runs with ZERO live network
      (no real MCP/HTTP in CI — fakes replay fixtures); the expected values
      match the RECORDED `getextract`/search content (not invented); the suite
      FAILS if the task-3 fix is reverted (prove it locks the regression);
      fixtures carry no secrets.

## Closeout

- [ ] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate
      2026-06-01-rag-retrieval-correctness --strict` passes.
- [ ] Middleware + app vitest suites green (`npm run build` clean, drift guards
      green; middleware vitest is file-serial per `project_middleware_vitest_serial`).
- [ ] **Live re-verification (done = user-visible).** In the running app's
      onboarding chat over the Utility sample, ask "What is the total amount due
      on this bill?" and confirm it now returns a grounded answer WITH at least
      one citation (no "no snippets" refusal). Capture the `_debug.groundx`
      counters showing the surfaced snippet path.
- [ ] **Final adversarial review:** the live answer cites a real chunk; the
      regression suite is green AND would fail on revert; no dormant plumbing;
      the durable chat-routing spec is updated with the new requirement.
- [ ] Archive: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive
      2026-06-01-rag-retrieval-correctness --yes`.
