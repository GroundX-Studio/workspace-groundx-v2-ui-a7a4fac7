# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: A light-LLM turn router SHALL plan each turn's retrieval with a deterministic fallback

The chat pipeline SHALL classify each user turn BEFORE retrieval using the light LLM (CF-16
`lightLlmClient`); the planner SHALL run ONLY when a light client is configured — it SHALL NOT
borrow the main chat client. The LLM SHALL emit an extensible decision record —
`{ documentSearch: boolean, productKnowledge: boolean, extractionContext: boolean,
appState: boolean }` (Zod-validated; `extractionContext` and `appState` schema-optional with an
omitted flag normalizing to its fallback value; unknown future flags tolerated). The CONSUMED
plan values are: `productKnowledge: boolean | "retriever-decides"` and
`appState: boolean | "classifier-decides"` — both sentinels internal-only (never emitted by the
model); `documentSearch` and `extractionContext` are plain booleans.

The plan SHALL gate the GroundX search, the skill-pack retrieval, AND the extraction-context
fetch, and SHALL drive mode routing: `routeChat` SHALL derive the chat mode from the plan —
`appState` true with `documentSearch` false → structured; `appState` true with `documentSearch`
true → hybrid; `appState` false → rag; the `"classifier-decides"` sentinel → the deterministic
keyword classifier (`classifyChatMode`), byte-for-byte the pre-flag routing. An explicit
UI intent hint SHALL decide the mode deterministically WITHOUT a planner call (intent hints are
authoritative; the planner never re-derives them). The keyword classifier SHALL NOT run when the
planner has answered (no parallel live classifiers) — it survives solely as the intent-hint fast
path plus the deterministic fallback. The planner SHALL run AT MOST ONCE per turn: a rag-routed
planned turn threads the router-computed plan into the grounded seam (`options.turnPlan`); the
seam SHALL NOT plan again. The seam-consumed plan SHALL NOT carry `appState` (the router strips
it before threading; fixed seam plan literals cannot include it; when the seam plans for
itself on an intent-hinted turn it likewise consumes only the seam-plan fields, never
`appState`) and the router-consumed plan type SHALL require it — no optional flags on either
consumed type. When a planner-routed turn
resolves to structured or hybrid but the session dependencies (`repository`/`chatSessionId`)
are absent, the turn SHALL degrade to the rag pipeline running the deterministic seam fallback
plan (search on) — NOT the planner's routed plan, whose `documentSearch: false` would ground
the answer in nothing — rather than throw; keyword/intent-routed turns keep the existing
throwing behavior. On planner-routed structured and hybrid turns the planner's
`productKnowledge` and `extractionContext` outputs are discarded — the fixed plans are
normative for those paths.

On a missing light client, timeout, or invalid output the router SHALL fall back
DETERMINISTICALLY to `{ documentSearch: true, productKnowledge: "retriever-decides",
extractionContext: true, appState: "classifier-decides" }` — every gate behaves byte-for-byte as
before the flags existed (search runs, the skill retriever's internal scoring gate decides,
extraction fetches when a primary document exists, the keyword classifier routes) — and the turn
MUST succeed. The seam's report caller (smart-report section generation) SHALL pass the fixed
plan `{ documentSearch: true, productKnowledge: false, extractionContext: true }` — report
sections never inject product knowledge and always carry extraction context; `appState` is a
routing-only flag and is NOT part of fixed seam plans. Adding a RETRIEVAL-PLANNING scenario
SHALL be a new flag on the record consumed at its gate — never a parallel retrieval classifier;
the keyword `classifyChat` mode router's former exemption is closed by the `appState` flag: it
remains ONLY as the intent-hint fast path and the deterministic fallback. The classifier prompt
SHALL live in the prompts module and SHALL state each flag's unsure-bias (`extractionContext`
true when unsure; `appState` false when unsure — mis-routing toward rag is the conservative
direction).

#### Scenario: Product question skips the document search

- **GIVEN** the planner returns `{ documentSearch: false, productKnowledge: true }`
- **AND** a question whose terms score at least one pack section but fail the minDistinct/score
  entry bar
- **WHEN** the turn runs
- **THEN** no GroundX search request is made, skill retrieval runs with its entry bar bypassed,
  the top-scoring skill block is injected, and the reply carries zero citations.

#### Scenario: Document question skips the skill pack

- **GIVEN** the planner returns `{ documentSearch: true, productKnowledge: false }`
- **WHEN** the user asks "what is the meter number?"
- **THEN** the LLM request contains no skill-pack content.

#### Scenario: Small talk skips the extraction fetch

- **GIVEN** the planner returns `extractionContext: false`
- **AND** a scope with an explicit primary document
- **WHEN** the user sends a greeting
- **THEN** no `/ingest/document/extract/*` request is made
- **AND** the grounded prompt carries no EXTRACTED FIELDS block
- **AND** the turn succeeds.

#### Scenario: Paraphrased app-state question routes structured without keywords

- **GIVEN** no UI intent hint and the planner returns `{ documentSearch: false, appState: true }`
- **WHEN** the user asks "how many pages do I have left on my plan?" (matching no keyword hint)
- **THEN** the turn routes to the structured handler
- **AND** the keyword classifier's heuristics are never consulted.

#### Scenario: Explicit intent hint routes without a planner call

- **GIVEN** a request carrying an intent hint that maps to a mode (e.g. `smart.report`)
- **WHEN** the turn routes
- **THEN** the mode comes from the hint deterministically
- **AND** zero planner calls are made for routing.

#### Scenario: The planner runs at most once per turn

- **GIVEN** no intent hint and a planner that returns `{ documentSearch: true, appState: false }`
- **WHEN** the rag turn runs end-to-end
- **THEN** exactly one planner call is made: the router's plan is threaded into the grounded
  seam, which does not plan again.

#### Scenario: Planner-routed structured turn degrades to rag when session deps are missing

- **GIVEN** no UI intent hint, a planner returning `{ appState: true, documentSearch: false }`,
  and a request whose deps lack `repository`/`chatSessionId`
- **WHEN** the turn routes
- **THEN** the turn runs the rag pipeline instead of throwing `ChatRouteNotImplementedError`
- **AND** rag runs with the deterministic seam fallback plan (the document search runs)
- **AND** keyword/intent-routed structured turns without those deps keep today's throwing
  behavior.

#### Scenario: Planner failure falls back deterministically

- **GIVEN** no UI intent hint, and the light LLM times out or returns garbage, or no light
  client is configured
- **WHEN** the turn runs
- **THEN** the mode comes from the deterministic keyword classifier, the search runs, the
  retriever's internal gate decides skill injection, the extraction context is fetched when a
  primary document exists, and the turn succeeds.

### Requirement: The grounded prompt SHALL include the primary document's full extraction output

The grounded call SHALL, when the turn plan calls for extraction context (`extractionContext`
not `false`; the fixed report and hybrid plans always do), fetch the primary document's full
workflow-extraction output (the same `/ingest/document/extract/{id}` payload the Extract
workbench renders) and include it in the prompt as an EXTRACTED FIELDS block, capped (~6KB,
truncation-marked). The primary document SHALL be the scope's explicit document, else the top
search snippet's. When the plan says `extractionContext: false`, the fetch SHALL NOT run at all
(no HTTP request) and the prompt is snippets-only on that axis. The fetch SHALL remain
best-effort: any failure or absence degrades to a snippets-only prompt and MUST NOT fail the
turn; the planner's deterministic fallback preserves the fetch-when-primary-doc-exists behavior.
Rationale: search retrieves only the top-K chunks, so structured questions (counts, identifiers)
miss when the matching chunk is not retrieved — but turns that need no document values should
not pay the fetch or the prompt bytes.

#### Scenario: Structured question answered from the extraction block

- **GIVEN** a document whose extraction lists two meters
- **AND** a plan affirming `extractionContext`
- **WHEN** the user asks "how many meters are there?"
- **THEN** the LLM request carries the full extraction values
- **AND** the reply states the count from them.

#### Scenario: Extraction fetch failure degrades gracefully

- **GIVEN** the extraction endpoint errors
- **WHEN** a turn whose plan affirms `extractionContext` runs
- **THEN** the prompt is snippets-only and the turn succeeds.

#### Scenario: Plan-skipped extraction makes no request

- **GIVEN** a plan with `extractionContext: false` and a primary document in scope
- **WHEN** the turn runs
- **THEN** no extraction request is made and the turn succeeds.

### Requirement: Hybrid answers SHALL be produced by the grounded seam with a workspace-state block

Hybrid mode SHALL call the same `groundedAnswerOverScope` seam as chat and report, passing its
structured app-state as a `structuredContext` block rendered into the grounded prompt as private
context — there SHALL NOT be a separate hybrid system prompt, and the router SHALL NOT run its
own hybrid search (the grounded seam's internal search is the only one). Hybrid replies keep
`mode: "hybrid"` and gain the full citation-verification contract. Hybrid SHALL pass a FIXED
turn plan `{ documentSearch: true, productKnowledge: false, extractionContext: true }` (the turn
was already routed — by intent hint, the planner's `appState` derivation, or the deterministic
fallback classifier) and `tools: undefined` (no tool advertising or tool-call routing on the
hybrid path); the merged reply SHALL keep the existing hybrid `suggestedActions` seeding plus
the citations-gated "Show all sources" chip. Degraded paths SHALL mirror today's split: a
missing groundx client or a failed search runs the grounded seam with EMPTY snippets (LLM prose
preserved); a missing LLM client/model id or a grounded-seam LLM failure returns the
deterministic structured fallback, now WITHOUT snippet preview or snippet citations (the
router-side hybrid search that fed those is deleted; accepted behavior change). No prompt is
involved on the deterministic path.

#### Scenario: Hybrid turn uses the grounded prompt

- **GIVEN** a question classified hybrid
- **WHEN** the turn runs
- **THEN** the LLM request uses the grounded system prompt with a WORKSPACE STATE block
- **AND** an uncited hybrid answer carries zero citations.

#### Scenario: Hybrid keeps extraction context

- **GIVEN** a hybrid-routed turn over a scope with a primary document
- **WHEN** the grounded seam runs with the fixed hybrid plan
- **THEN** the extraction fetch runs as before this change
- **AND** the seam itself makes no planner call (any planner call belongs to routing, upstream).
