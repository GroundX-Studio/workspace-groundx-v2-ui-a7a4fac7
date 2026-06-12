# Design — turn-router `extractionContext` + `appState`

**User-confirmed decisions (2026-06-11):** (1) accept the ~1s planner latency
on un-hinted app-state questions; (2) planner-routed structured/hybrid turns
degrade to rag when session deps are missing (no throw); (3) hybrid + report
fixed plans keep `extractionContext: true`.

## Context

`planTurn` (middleware/src/services/turnRouter.ts) emits a Zod
`.passthrough()` record `{documentSearch, productKnowledge}` consumed in
`groundedAnswerOverScope` (groundedAnswer.ts). The durable chat-routing spec
locks the extension mechanism: a new scenario = a new flag consumed at its
gate, never a parallel classifier, and names `classifyChatMode` as the
`appState` subsumption target.

## Decision 1 — `extractionContext` is a plain boolean, no sentinel

`productKnowledge` needed the `RETRIEVER_DECIDES` sentinel because the skill
retriever has an INTERNAL scoring gate the fallback delegates to — three
consumed states (skip / bypass-bar / run-gate-intact). The extraction path has
no internal gate: today's behavior is the deterministic rule "fetch when a
primary doc exists". So:

- Emitted + consumed type: `boolean`.
- `FALLBACK_TURN_PLAN.extractionContext = true` → fallback is byte-for-byte
  today's behavior (the "retriever-decides" PATTERN — fallback preserves
  pre-flag behavior — without the sentinel mechanics it doesn't need).
- Gate in `groundedAnswerOverScope`: extraction fetch runs only when
  `plan.extractionContext !== false` AND the existing primary-doc/client
  conditions hold. `false` short-circuits before any HTTP call.
- Schema: `z.boolean().optional()`; an omitted flag normalizes to the fallback
  value `true` at the consumption boundary (tolerant of partial model output;
  the prompt still demands all four keys).

Rejected: tying extraction to `documentSearch`. They diverge on the motivating
case — greetings keep `documentSearch: true` (starter questions ground in the
docs) but need no 6KB extract block. Distinct axis, distinct flag.

## Decision 2 — `appState` subsumption is PARTIAL: keywords replaced, intent
hints and the fallback stay deterministic

What "subsumption" means here, from three candidate readings:

1. **Full replacement** (planner owns mode; delete `classifyChatMode`) —
   rejected. The planner falls back; SOMETHING deterministic must still pick a
   mode on the fallback path, so the keyword classifier cannot be deleted.
   Deleting it and re-deriving a fallback mode inside the router would just
   rebuild it.
2. **Hybrid/structured detection only, keywords kept on the live path** —
   rejected. Keeps two live classifiers racing on the same turn; exactly the
   parallel-classifier shape the spec bans.
3. **Planner replaces the keyword heuristics (steps 2–4) on the live path;
   the explicit intent-hint step (step 1) and the full keyword classifier as
   FALLBACK stay deterministic** — chosen. UI-emitted intents are
   authoritative signals, free, and deterministic; spending a planner call to
   re-derive them is waste and a regression risk. The keyword classifier
   survives whole as the fallback implementation — it stops being a parallel
   classifier because it never runs when the planner has answered.

Mechanics:

- Record gains `appState: boolean` (`z.boolean().optional()`, omitted →
  fallback value). Consumed type: `boolean | typeof CLASSIFIER_DECIDES`, a new
  internal-only sentinel exported beside `RETRIEVER_DECIDES`.
  `FALLBACK_TURN_PLAN.appState = CLASSIFIER_DECIDES`.
- `routeChat` flow:
  1. If the request carries an explicit intent hint that maps to a mode
     (today's `classifyChatMode` step 1), that mode wins — NO planner call for
     routing. A rag-routed hinted turn plans retrieval inside
     `groundedAnswerOverScope` exactly as today.
  2. Otherwise `routeChat` calls `planTurn` ONCE. Mode derivation:
     `appState === true && documentSearch === false` → structured;
     `appState === true && documentSearch === true` → hybrid;
     `appState === false` → rag;
     `appState === CLASSIFIER_DECIDES` → `classifyChatMode(request)`.
  3. A rag-routed planned turn threads the computed plan into
     `runRagPipeline` → `groundedAnswerOverScope` via the existing
     `options.turnPlan`, so the seam never plans a second time. The planner
     runs AT MOST ONCE per turn — asserted by test.
- `ChatRouterDeps` already carries `lightLlmClient`/`lightLlmModelId`/
  `planTurn` (chatRouterTypes.ts:235-237); no new plumbing.
- Why `appState && documentSearch` → hybrid: hybrid IS the
  app-state-plus-document-content mode (workspace-state block + grounded
  snippets). The two booleans the planner already reasons about compose into
  the three modes with no third question.

## Decision 3 — fixed plans stay fixed, extended coherently

Report (`reportRenderer.ts:553`) and hybrid (`structuredHandler.ts:508`) pass
static plans because their retrieval needs are static. Both literals become
`{ documentSearch: true, productKnowledge: false, extractionContext: true }` —
both paths fetch extraction today, so `true` is behavior-preserving. `appState`
is irrelevant post-routing and is NOT part of the consumed fixed plans (it is a
routing input, consumed in `routeChat` only). The consumed types therefore
split EXPLICITLY (adversarial-review F1, 2026-06-11): `TurnPlan` (the seam
plan: `documentSearch` / `productKnowledge` / `extractionContext`, all
required) stays the type of `options.turnPlan` and the fixed-plan literals;
a new `RoutePlan` (`TurnPlan` + required `appState: boolean |
CLASSIFIER_DECIDES`) is what `planTurn` returns and `routeChat` consumes —
the router strips `appState` before threading. No optional fields: a fixed
seam plan CANNOT carry `appState`, and a route plan CANNOT omit it.

On a planner-routed hybrid or structured turn the planner's
`productKnowledge`/`extractionContext` outputs are DISCARDED by design
(adversarial-review F3): those paths' retrieval needs are static and their
fixed plans are normative; implementers must not thread the routed plan into
the hybrid seam call.

## Prompt (prompts/turnRouter.ts)

Shape becomes
`{"documentSearch": <bool>, "productKnowledge": <bool>, "extractionContext": <bool>, "appState": <bool>}`:

- `extractionContext`: true when answering needs the document's extracted
  field VALUES or structure (counts, identifiers, totals, dates, line items) —
  generally any document-content question; FALSE for pure small talk and pure
  product questions. **True when unsure** (fallback parity bias).
- `appState`: true when the question is about the USER'S ACCOUNT or WORKSPACE
  rather than document content or the product — saved schemas, page budget,
  API keys, subscription, projects, "my workspace". **False when unsure** —
  mis-routing to rag is today's behavior; mis-routing to structured would be a
  regression.

Temperature 0, strict-JSON, fence-strip, and the 3s abort are unchanged.

## Latency budget

- Rag turns: net zero — the one planner call moves from the seam to the
  router.
- Structured/hybrid turns with a UI intent hint: zero (planner skipped).
- Structured/hybrid turns matched only by keywords today: +1 planner call
  (typically ~1s, hard 3s abort, deterministic fallback). Accepted in the
  proposal.

## Error handling

Unchanged contract, now with TWO fallback constants matching the two consumed
types (adversarial-review G1): every planner failure mode (no light client,
timeout, non-2xx, garbage, schema violation) returns `FALLBACK_ROUTE_PLAN =
{ documentSearch: true, productKnowledge: RETRIEVER_DECIDES,
extractionContext: true, appState: CLASSIFIER_DECIDES }` (a `RoutePlan`);
`FALLBACK_TURN_PLAN` (the seam constant, kept for the seam's own
plan-yourself path) is the same minus `appState`. Every gate behaves
byte-for-byte as before this change. The turn MUST succeed on fallback.

The degrade-to-rag path runs rag with `FALLBACK_TURN_PLAN` — NOT the
planner's routed plan (adversarial-review G2): a planner-routed structured
turn carries `documentSearch: false`, and threading that into rag would
produce an answer grounded in nothing. Degrading exists to give a useful
answer; the deterministic seam fallback (search on, extraction on) is the
useful shape.

One edge the implementation must hold: `routeChat` throws
`ChatRouteNotImplementedError` for structured/hybrid when
`repository`/`chatSessionId` are missing. Planner-derived `appState: true`
makes those modes reachable on more turns than the keyword classifier did, so
when those deps are absent a planner-routed structured/hybrid turn SHALL
degrade to rag instead of throwing (the keyword-era throw stays only for
keyword/intent-routed turns — today's behavior). Covered by a Task 2 test.

## Test strategy (per flag)

- **Planner unit (turnRouter.test):** new flags parse; omitted flags normalize
  to fallback values; fallback plan literal; sentinel never parseable from
  model output.
- **Prompt unit:** `buildTurnRouterPrompt` names all four flags and the
  unsure-bias rules.
- **Extraction gate (groundedAnswer.test):** plan `extractionContext: false` →
  the GroundX client receives NO `/ingest/document/extract/*` call and the
  prompt carries no EXTRACTED FIELDS block; `true`/fallback → fetch happens
  exactly as today (existing tests keep passing).
- **Mode derivation (chatRouter.test):** table over the four
  `appState`×`documentSearch` combos; sentinel → `classifyChatMode` parity
  (same fixture set the classifier tests use); intent-hinted turn routes
  WITHOUT a planner call (spy asserts zero calls); planned rag turn threads
  the plan (spy asserts the seam's planner path is not re-entered — at most
  one planner call per turn).
- **Fixed-plan coherence:** report renderer + hybrid handler never invoke the
  planner and still fetch extraction (literal includes
  `extractionContext: true`).
