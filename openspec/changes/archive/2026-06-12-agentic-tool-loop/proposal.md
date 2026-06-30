# Agentic tool-result loop + `lookup_groundx_docs`

## Execution status — CLOSED OUT (code-complete, 2026-06-12)

All 7 tasks (T1–T6 + T5b) implemented and green ON THIS CHANGE'S SURFACE:
middleware `toolLoopCorpus` (7) + `toolCatalog` (23) + `intentToolCorpus` +
`chatRouter` + `ragPipeline` (non-concurrent) green; app `catalog-parity` +
`chatPrimitives` RTL + `chatSessions` wire-drift + full app suite (1666) green;
`tsc` build clean (shared + app + middleware); `validate --strict` valid.

The loop lives inside `callGroundedLlm` via an injected `ServerToolLoop`
controller (AS-BUILT — composes with the pre-existing `callToolOnlyProseRepair`;
see design §C); `lookup_groundx_docs` is the first server-executed tool; the
reply gains an OPTIONAL `toolActivity[]` (muted "Checked GroundX docs"
annotation). Two adversarial-review rounds were run against the live code:
fixes landed were (a) the full §H test matrix (7 tests, was 2), (b) plan↔code
reconciliation (controller, not the originally-planned `priorMessages`),
(c) assistant `content: null` on tool-only turns (provider conformance),
(d) deduped activity labels in the render. All other review findings were
falsified as false-positives or already-guarded (the no-`intentBuilder`
routing guard at ragPipeline.ts is load-bearing for the build).

### NOT archived — intentionally. Two gates remain, both EXTERNAL to this change:
1. **Rebase + combined green pass.** Concurrent in-flight `harden-citation-emission`
   and a citations-contract change are co-editing the SAME files
   (`ragPipeline.ts`, `groundedAnswer.ts`, `shared/src`) and currently carry
   RED TDD tests there. The global middleware suite is therefore not green —
   none of those failures are attributable to this change (verified: every
   failure is tagged `harden-citation-emission` / `citationsContract`). Archive
   only after those land: rebase, rebuild `@groundx/shared`, one combined
   `tsc` + vitest.
2. **Live-model validation (the one real quality gap).** Everything is tested
   LLM-free. Unverified against a live model: does the model call
   `lookup_groundx_docs` when it should and not over-call it (the
   `promptGuidance` steering); is `maxRounds: 4` the right budget; skill-pack
   retrieval quality for arbitrary queries. Run a manual session vs. the live
   LLM + GroundX before production trust.

### Deferred (tracked, not built)
- Streaming: the LIVE "checking docs…" indicator (`toolActivity` → SSE events).
- Additional server-executed tools (refined re-search, secondary extraction fetch).

### Known limitation (consistent with precedent, not a defect)
- `toolActivity` is live-only — it vanishes on reload, like `suggestedActions`
  / `proposedSchemaField` (only `citations` is persisted/rehydrated). Durable
  annotation would need a `chat_messages` column.


## What

Give the grounded chat pipeline a bounded agentic loop: when the LLM emits a
**server-executed read tool**, the middleware executes it, feeds the result
back as a `tool` message, and lets the model continue its answer — instead of
today's one-shot completion where every tool call terminates the turn as an
intent or chip. Ship the first server-executed tool, `lookup_groundx_docs`,
which retrieves sections from the vendored GroundX skill pack on demand. This
is the **named evolution** recorded in the durable `chat-routing` spec
("A `lookup_groundx_docs` read tool is the named evolution if/when an agentic
tool-result loop exists").

## Why

- **Mid-answer knowledge needs can't be planned up front.** The turn router
  classifies the question *before* retrieval; a document turn that drifts into
  a product question ("what's the meter number — and how did GroundX find
  it?"), or a follow-up whose product need only becomes visible while the
  model is composing, gets no skill knowledge today. The model has no way to
  ask.
- **Injection over-pays or under-pays.** Per-turn injection is all-or-nothing
  (~4.5KB or zero) on a keyword/planner guess. A pull tool lets the model
  fetch exactly the sections it needs, exactly when it needs them.
- **One-shot is a structural ceiling.** Any future server-side read tool
  (re-search with a refined query, fetch a second document's extraction) is
  blocked on the same missing loop. Building the loop once, as an axis on the
  shared seam, unblocks the family.

## Scope

**In:**
1. A bounded tool-result loop inside `groundedAnswerOverScope` (the shared
   seam — chat, report, hybrid all route through it), gated by an explicit
   option so report + hybrid behavior is byte-identical (loop off). Chat's
   cap: `maxRounds: 4` (user decision 2026-06-11).
2. A `serverExecute` discriminator on `ServerTool`: a tool carrying a server
   executor is loop-eligible; every other tool keeps today's intent/chip
   routing, including when emitted mid-loop (accumulated across rounds).
3. The `lookup_groundx_docs` read tool — server-executed, backed by the
   existing `retrieveGroundxKnowledge` retriever (entry bar bypassed; ranking
   + caps intact).
4. Injection stays the fast path; the tool is the escalation. The turn
   router's `productKnowledge` gate is unchanged.
5. LLM-free scripted multi-round fixtures (precedent:
   `intentToolCorpus.test.ts`).
6. A post-hoc tool-activity hint (user decision 2026-06-11): the reply
   envelope gains a shared-schema `toolActivity[]` field and the app renders
   a muted "Checked GroundX docs" annotation on the assistant message
   (design §I).

**Out:**
- Streaming, including the LIVE in-progress "checking docs…" indicator —
  that needs the SSE channel; `toolActivity` becomes stream events when the
  existing streaming requirement lands (composition constraint recorded in
  `design.md` §F/§I).
- Any mutate-tool execution server-side (mutations remain user-confirmed
  chips, always).
- Additional server-executed tools (re-search etc.) — tracked as named
  follow-ups, not built.

## Cross-plan coordination

The in-flight `2026-06-11-turn-router-extraction-appstate` change also edits
`groundedAnswerOverScope` (extraction gate, plan hoist) and the hybrid path.
No requirement overlap (it modifies the turn-router / extraction / hybrid
requirements; this change modifies the skill-knowledge requirement and adds
the loop requirement), but the two changes WILL merge-collide on
`groundedAnswer.ts` — execute sequentially: **turn-router-extraction-appstate
FIRST** (user decision 2026-06-11); this change rebases its seam edits on the
settled extraction/plan gates. The loop does NOT re-plan per round (the turn
plan is computed once per turn on either plan's shape), so the designs
compose. Note: that sibling change currently fails `validate --strict` on
its own delta (a MODIFIED requirement missing SHALL) — pre-existing, owned
by that change.

## Conformance to core architectural decisions

- **Composable, not forked (principle 1).** The loop is an *option on the
  existing shared seam* (`groundedAnswerOverScope` gains `toolLoop`), not a
  parallel pipeline. Loop-eligibility is a *value on the tool descriptor*
  (`serverExecute` present/absent), not a second catalog or a name-list in the
  loop. **Earn-the-axis:** the discriminator is required by construction (the
  loop must know what it may execute); `lookup_groundx_docs` is caller #1 and
  plausible next members are named in this plan's deferred list (refined
  re-search, secondary extraction fetch) — but we add *no* registry/framework
  beyond the optional field. The loop itself has exactly one caller (chat) and is therefore an
  **option defaulting to off**, not an abstraction: report + hybrid pass
  nothing and run the existing single-shot path unchanged.
- **Done = user-visible (principle 5).** Done is a chat turn where the model
  calls `lookup_groundx_docs`, the reply answers from the fetched sections,
  and the corpus test proves the multi-round transcript. No dormant plumbing:
  the tool ships *with* the loop in one change.
- **One source of truth (principle 6).** The one envelope addition
  (`toolActivity[]`) is declared once as a `@groundx/shared` Zod schema with
  `Eq<>` guards on both sides, per the chat-wire-types requirement. The
  tool's knowledge source is the same vendored
  pack + same retriever (no parallel capsule). The catalog stays the one
  `SERVER_TOOL_CATALOG`; parity/coverage guards are *extended*, not bypassed
  (see design.md §Guards for the server-only-tool exemption mechanics).
- **TDD (principle 2) / adversarial review (principle 3):** tasks.md leads
  with the failing user-visible corpus test; every task carries its gate.
