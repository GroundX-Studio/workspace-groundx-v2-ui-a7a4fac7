# Tasks — agentic-tool-loop

ORDERING (user decision 2026-06-11): implement AFTER the in-flight
`2026-06-11-turn-router-extraction-appstate` change lands — rebase T3's seam
edits on its settled extraction/plan gates.

Every task: SEQUENTIAL unless marked WORKFLOW. Gate = adversarial review
against plan + real code (falsify claims, open the test file, run
`npm run build` + middleware vitest) before advancing.

- [x] **T1 — Failing user-visible test first.** Add the multi-round corpus
  test to `middleware/src/services/` (new `toolLoopCorpus.test.ts`, precedent
  `intentToolCorpus.test.ts`): scripted LLM emits `lookup_groundx_docs` in
  round 1, prose in round 2; assert the second request carries the assistant
  `tool_calls` + `role:"tool"` result messages, `reply.answer` is the round-2
  prose, and no intent/chip carries the lookup call. RED. SEQUENTIAL.
  Gate: test fails for the right reason (loop absent, tool absent).

- [x] **T2 — `ServerTool.serverExecute` + invariants.** Optional
  `serverExecute(args, ctx)` + `activityLabel` fields; `intentBuilder`
  optional; `ServerExecuteContext` carries `skillsRetrieve` (built by the
  loop from the seam's deps — executors never close over module-level live
  deps); catalog invariant test: exactly one of `serverExecute` /
  `intentBuilder`, `serverExecute ⇒ read`, `serverExecute ⇒ activityLabel`.
  SEQUENTIAL. Gate: invariant test red→green; no existing tool changed.

- [x] **T3 — Loop in `groundedAnswerOverScope` / `callGroundedLlm`.** AS BUILT:
  `toolLoop?: {maxRounds}` option; the loop lives INSIDE `callGroundedLlm` via
  an injected `ServerToolLoop` controller (NOT a `priorMessages` param — see
  design §C "AS BUILT": it had to compose with the pre-existing
  `callToolOnlyProseRepair` pass). Partition/execute/append per design §C;
  routed calls accumulate WITHOUT id-keyed dedup (review finding; regression
  test added: same-id calls in two rounds → both route); server-tool errors →
  `serverToolFailures` (merged into `reply.toolFailures`) + terse `tool`
  message, never a thrown turn. Wire chat (`runRagPipeline`) with
  `{maxRounds: 4}`; report + hybrid untouched. Gate: ✅ T1 green; design-§H
  tests 3,4,5,6 + no-dedup added and green (7 tests); report/hybrid loop-off
  single-`forward` pin green; full middleware suite 879 green.

- [x] **T4 — `lookup_groundx_docs` tool.** Catalog entry per design §D
  (executor calls `ctx.skillsRetrieve(query, { bypassEntryBar: true })` — the
  context the loop builds from the seam's deps, NOT a module-level closure;
  "No matching documentation sections." fallback; `activityLabel: "Checked
  GroundX docs"`; description carries a `Use when` clause + clears the 40-char
  floor; `query.describe()`); `promptGuidance` steering off the tool when the
  knowledge block is injected. Add `lookup_groundx_docs` to `EXPECTED_NAMES`
  in `middleware/src/services/toolCatalog.test.ts` (authoritative-name-set
  guard goes red otherwise — live re-audit 2026-06-12). Do NOT touch the
  app-side `check-tool-quality` verb allowlist — that scanner walks only app
  `*.tools.ts`, never server-only tools (earlier plan rounds wrongly listed
  it). SEQUENTIAL (depends T2). Gate: missing-pack test green; server
  catalog guards (name set, `Use when`, field-`.describe()`) green.

- [x] **T5 — Guard extensions.** `catalog-parity.test.ts`: add
  `lookup_groundx_docs` to the existing server-only allowlist (the
  `suggest_intent` mechanism — no new exclusion machinery); corpus coverage:
  server-executed tools asserted via loop transcript, not intentBuilder
  fixtures. Mixed-emission test (design §H-3). SEQUENTIAL (depends T3, T4).
  Gate: app + middleware suites green; parity guard still fails on a
  genuinely unmirrored intent tool (prove with a temp mutation).

- [x] **T5b — Tool-activity hint.** Add OPTIONAL `toolActivity?:
  z.array({name,label}).optional()` to `chatReplySchema` (`shared/src/index.ts`),
  positioned after `toolFailures` — OPTIONAL by design (live re-audit
  2026-06-12), mirroring `_debug?`: the 17 structured/hybrid return sites in
  `structuredHandler.ts` are NOT touched (a required field would fail `tsc`
  at all 17 for an always-empty value). `ChatReply`/`ChatRouterResponse` are
  direct aliases of the shared type → `Eq<>` drift guards
  (`chatSessions.test.ts`, `chatRouter.split.test.ts`) self-maintain, no
  manual per-side edit. `runRagPipeline` sets `toolActivity` from the loop's
  successfully-executed calls (label from each tool's `activityLabel`); a
  non-looped rag turn sets `[]`. App plumbing: `LiveTurn` interface
  (`useConversation.ts`) gains `toolActivity?`; `useConversation` threads
  `reply.toolActivity` onto the minted assistant turn alongside
  `citations`/`suggestedActions`; `chatPrimitives.tsx` `LiveTurnList` renders
  the muted annotation reading `turn.toolActivity ?? []`. SEQUENTIAL (depends
  T3). Gate: design-§H test 7 green; `chatReplySchema.safeParse` still passes
  for structured/hybrid replies that omit the field; envelope round-trips
  through `/api/chat/messages` + `sendChatMessage`; RTL render test green;
  build green (alias guards hold).

- [x] **T6 — Durable spec + docs.** Update `docs/agents/data-model.md`
  (ServerTool shape) in the same change; verify
  `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all
  --strict` green; both vitest suites green; `npm run build` green.
  SEQUENTIAL. Gate: full adversarial pass over the change — no dormant
  plumbing, every persisted/returned byte has a consumer, honest statuses.

Deferred (tracked, not built): streaming composition incl. the LIVE
"checking docs…" indicator (`toolActivity` becomes stream events on the
existing streaming requirement); additional server-executed tools (refined re-search, secondary
extraction fetch) — each is a future change adding a `serverExecute` value,
no framework work expected.
