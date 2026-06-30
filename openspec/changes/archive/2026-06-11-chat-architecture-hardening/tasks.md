# Tasks — chat-architecture-hardening

**Execution model.** Tasks run **sequentially**. Each task is immediately
followed by its own **Adversarial Review** — a hostile pass falsifying the
task's output against the plan AND the real code. A task is NOT done, and the
next does NOT start, until its review passes (principle 3, discipline §10).

---

## Task 1 — Spec reconciliation (SEQUENTIAL, spec-only)

- [x] **PREREQ:** archive the completed `groundx-knowledge-prompt` change
      (9/9 numbered tasks done) so its skill-knowledge requirement merges into
      the durable spec — this delta then RENAMEs + MODIFIEs it (same
      capability, superseding keyword-routing with turn-plan gating).
      First convert its two literal `- [ ]` Deferred checkboxes (D.1/D.2) to
      prose — they are already tracked as named evolution in this plan's spec
      — or the archive completeness check counts 9/11. Cross-plan collision
      resolved BEFORE any delta lands.
- [x] MODIFY `chat-routing` "RAG citations SHALL be claim-level…": remove the
      "all-snippets fallback" from the ambient definition; add scenario
      "an answer with no emitted citation block carries ZERO citations".
- [x] ADD `chat-routing` requirements: extraction-context block (full workflow
      output, 6KB cap, soft-fail, primary-doc = scope doc else top snippet);
      skill-knowledge retrieval (vendored pack @ pinned commit, section
      retrieval + caps, **one-shot constraint recorded**, lookup-tool named as
      the evolution); voice rules (internal-vocabulary ban, single-sourced).
- [x] ADD the turn-router + hybrid-merge requirements (end-state, implemented
      by Tasks 3–4).
- [x] ADD/MODIFY `agent-tools`: tool guidance single-sourced; full-shape
      catalog parity, NO manifest (implemented by Tasks 6–7).

### Adversarial Review 1
- Diff every delta against SHIPPED code: does any requirement still describe
  deleted behavior? Does any shipped behavior remain unspec'd (re-run the
  review's spec-coverage sweep)?
- `openspec validate --all --strict` green; MODIFIED heading matches the
  durable spec byte-for-byte (archive merge depends on it).
- **Gate:** zero contradictions; validate green.

---

## Task 2 — Prompt module (SEQUENTIAL)

- [x] **RED:** new guard test — no model-facing prompt literal (`VOICE:`,
      `You are the user's analyst`, `You are a field extractor`, summarizer
      headers) exists outside `middleware/src/services/prompts/`. Fails now.
      EXCLUDE `HYBRID_SYSTEM_PROMPT` from the guard's scan: it is deleted in
      Task 3, not moved (no throwaway builder).
- [x] Create `prompts/` (fragments, grounded builder, extractor, summarizers,
      README inventory). Move existing text VERBATIM (no wording changes in
      this task — diff-able move). The VOICE fragment is extracted from the
      GROUNDED copy only; the second copy lives inside `HYBRID_SYSTEM_PROMPT`
      and dies with it in Task 3 (where the fragment absorbs the union of
      both ban-lists).
- [x] Re-point `ragPipeline`, `fieldExtractor`, `conversationCompressor` to
      the builders (`structuredHandler`'s hybrid prompt is Task 3's job).
- [x] Move prompt-shape tests beside the builders; README lists every prompt +
      its pinning test.

### Adversarial Review 2
- Grep proves zero prompt literals outside prompts/ excluding the
  Task-3-doomed `HYBRID_SYSTEM_PROMPT` (the guard bites — mutate one to
  check).
- Assembled grounded prompt text is byte-identical pre/post move (diff the
  logged `groundedLlmCall` prompt in dev). Zero wording changes in this task.
- **Gate:** guard green + bites; middleware suite green; no behavior change.

---

## Task 3 — Hybrid full-merge (SEQUENTIAL)

- [x] **RED:** hybrid-mode router test asserting the LLM request is built by
      the grounded builder (one system prompt) with a `WORKSPACE STATE` block,
      and the reply carries verified-citation machinery. Fails now.
- [x] `GroundedAnswerOptions.structuredContext?: string`; grounded builder
      renders it as a private-context block (voice-framed).
- [x] `runHybridQuery` composes the block from its existing readers → calls
      `groundedAnswerOverScope`; DELETE `HYBRID_SYSTEM_PROMPT`; reply keeps
      `mode: "hybrid"`. The VOICE fragment absorbs the hybrid copy's extra
      ban terms (union of both ban-lists) — this is where the two drifted
      copies become one.
- [x] DELETE the router-level hybrid `searchGroundX` call in `chatRouter` —
      the grounded seam's internal search is the only one (no double search).
- [x] Degraded paths split per TODAY's behavior: no-groundx-client /
      search-failure → grounded seam with EMPTY snippets (LLM prose
      preserved); no LLM client or model id / grounded-seam LLM failure
      (wrap the call) → deterministic structured fallback, now SNIPPET-LESS
      (accepted change). Test all four paths.
- [x] Reply envelope: hybrid passes `tools: undefined` (no toolCalls
      routing); reply keeps `suggestedActions` (`show-extract`, `try-chat`)
      + the citations-gated show-source chip; hybrid's turn plan FIXED at
      `{documentSearch: true, productKnowledge: false}`. All in the RED test.

### Adversarial Review 3
- Is hybrid genuinely the third caller (no residual fork — grep for the old
  prompt)? Does the citations contract now apply to hybrid (uncited hybrid
  answer ⇒ zero citations — test it)?
- **Gate:** hybrid tests green; old prompt deleted; suite green.

---

## Task 4 — LLM turn router + corpus cleanup (SEQUENTIAL)

- [x] **RED:** planner unit tests — fake light client returning valid JSON →
      plan honored; garbage/timeout/absent client → deterministic fallback
      `{documentSearch:true, productKnowledge:"retriever-decides"}` — the
      retriever runs with its internal scoring gate INTACT (exactly today's
      behavior; the router never replicates the scoring). Planner runs ONLY
      when `lightLlmClient` is configured; it never borrows the main chat
      client. Fail now.
- [x] A planner-affirmed `productKnowledge: true` BYPASSES the retriever's
      minDistinct/score ENTRY BAR (ranking + caps remain); test: planner-true
      on a question that scores ≥1 section but FAILS the entry bar still
      injects the top-scoring sections (an all-stopword question still
      injects nothing — no section scores).
- [x] Report caller: `reportRenderer` passes the fixed plan
      `{documentSearch: true, productKnowledge: false}` — report sections
      stop injecting product knowledge (intentional change; today's default
      lets them). Test: report-section LLM body carries no skill content.
- [x] `planTurn(question, deps)` with `turnPlanSchema` (extensible
      `.passthrough()` record); prompt in prompts module; abort timeout.
- [x] `groundedAnswerOverScope` consumes the plan: skip search / skills per
      flags; injectable `deps.planTurn`.
- [x] **RED→GREEN regression from the live probe:** "what is the meter
      number?" with planner `{documentSearch:true, productKnowledge:false}` →
      LLM body contains NO skill content; "what do you know about groundx?"
      with `{false,true}` → no GroundX search call, skill block present, zero
      citations.
- [x] Corpus cleanup: sync script excludes `ROUTING.md`/`CHANGELOG.md`
      (loader skips defensively); re-run sync; retriever smoke stays green.

### Adversarial Review 4
- Kill the light client in a live dev run — does chat still answer (fallback)?
- Latency: measure the added planner call on a live turn; confirm the timeout
  abort path.
- Does any code path still call `skillsRetrieve` unconditionally?
- **Gate:** planner + regression tests green; fallback proven; corpus clean
  (`(root)`-skill sections gone).

---

## Task 5 — Toggle helper (SEQUENTIAL, behavior-preserving)

- [x] Extract `togglesOffOnRepeat` (orchestrator-local); refactor BOTH
      citation toggles onto it; add unit tests for the helper.
- [x] The four existing toggle tests pass **unchanged** — that is the contract.

### Adversarial Review 5
- Diff: is the logic truly shared (one comparison implementation), or did a
  third copy appear? Existing tests untouched?
- **Gate:** app suite green with zero edits to the four toggle tests.

---

## Task 6 — Tool-guidance dedup + snippet header (SEQUENTIAL)

- [x] **RED:** prompt test — grounded system contains a TOOL NOTES section
      derived from catalog `description`/`promptGuidance`; the hand-written
      `propose_schema_field`/`suggest_intent` paragraphs are GONE. Fails now.
- [x] `ServerTool.promptGuidance?: string` for tools needing more than their
      description; generator renders the section from the FILTERED catalog
      (per-step — guidance only for tools actually offered this turn).
      Plumbing: `callGroundedLlm` today receives only the converted
      `OpenAiFunctionTool[]` (guidance doesn't survive conversion) — thread
      the filtered `ServerTool[]` (or a pre-rendered TOOL NOTES block) into
      the grounded builder.
- [x] `fieldExtractor` uses `snippetHeader()` from prompts/.

### Adversarial Review 6
- Is guidance now declared exactly once per tool? Does the rendered section
  track the step-filtered catalog (a tool absent from the step has no NOTES)?
- **Gate:** prompt tests green; suite green.

---

## Task 7 — Full-shape catalog parity (SEQUENTIAL)

(Revised by plan review — NO manifest; see design §6 and the gate-answered
decision recorded in `app/src/tools/catalog-parity.test.ts`.)

- [x] **RED:** extend `app/src/tools/catalog-parity.test.ts` with full-shape
      comparisons — `category`, `availableSteps`, input JSON-Schema (both
      sides via the middleware `zodToJsonSchema`, cross-package import). Run
      it: any existing drift surfaces RED; if green, prove it bites by a
      temporary single-field mutation (reverted). Note: `zodToJsonSchema`
      throws on unsupported Zod types and app-side `input` schemas have never
      been run through it — the first RED may be "unsupported type", which
      means extending converter coverage before the comparison is meaningful.
      Also: `zodToJsonSchema.ts` exposes only `toOpenAiTools(ServerTool[])` —
      export the per-schema converter (one-line) so app `WidgetTool` inputs
      can run through it.
- [x] Failure messages name the tool AND the drifted field.
- [x] Replace the stale "past ~10 tools" manifest promise in the
      `toolCatalog.ts` header with the actual mechanism; retire the
      hand-pinned `EXPECTED_NAMES` duplication only if fully subsumed
      (else keep as the middleware-local, Vite-free smoke).

### Adversarial Review 7
- Mutate one tool's description/category/steps/schema on ONE side → guard
  fails naming tool + field; revert → green.
- Does the guard cover ALL tools both directions (app-side extra AND
  server-side extra fail)? Count pinned at 26 + allowlisted server-only.
- **Gate:** guard bites in both directions; app + middleware suites green.

---

## Task 8 — Closure

- [x] Full app + middleware suites; `tsc` ×3; drift guards;
      `openspec validate --all --strict`.
- [x] Live probes (real chat): groundx question (skill answer, no citations,
      no search call), meter question (extraction answer, no skill text),
      joke (no chips), hybrid/app-state question (workspace-state answer).
- [x] Archive the change; update memory notes (citation/prompt/router).
