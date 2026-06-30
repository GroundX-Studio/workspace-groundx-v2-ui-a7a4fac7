# Design — agentic tool-result loop

## A. Where the loop lives

Inside `groundedAnswerOverScope` (`services/groundedAnswer.ts`), wrapped
around the existing `callGroundedLlm` call. NOT in `runRagPipeline` (that
would fork chat away from the shared seam) and NOT a new service.

`GroundedAnswerOptions` gains:

```ts
/** Bounded server-side tool-result loop. Absent/undefined → single-shot
 * (today's behavior, byte-identical). Chat passes { maxRounds: 4 }
 * (user decision 2026-06-11); report + hybrid pass nothing. */
toolLoop?: { maxRounds: number };
```

Explicitness rule: chat passes the option; report and hybrid simply don't
take it (their `tools` are already absent/undefined, so no tool call can
occur — the option would be dead weight; the absence IS the explicit "none"
because the seam's tool surface is already opt-in via `options.tools`).

## B. Loop-eligibility — the `serverExecute` discriminator

`ServerTool` gains one optional field:

```ts
/** Present ⇒ the middleware executes this tool in the grounded loop and
 * feeds the string result back to the model. Mutually exclusive with
 * intent routing: a server-executed tool never produces a CanvasIntent,
 * never reaches the app, and MUST be category "read". */
serverExecute?: (args: z.infer<TSchema>, ctx: ServerExecuteContext) => Promise<string> | string;
```

`ServerExecuteContext` carries the injectable deps executors need. Day one
it has exactly one member: `skillsRetrieve` (the same function type as
`GroundedAnswerDeps.skillsRetrieve`). The loop builds the context from the
seam's deps (`deps.skillsRetrieve ?? retrieveGroundxKnowledge`) — the
executor does NOT close over the module-level retriever, otherwise the
existing test-injection seam couldn't reach it (adversarial-review finding:
the earlier "closes over the retriever" wording contradicted the
injectability claim). Future executor deps are added as context members.

A server-executed tool also declares `activityLabel: string` — the
user-facing annotation text for the reply's `toolActivity[]` (§I). The
invariant test extends: `serverExecute ⇒ activityLabel` present.

Routing rule (one predicate, used by the loop AND the post-loop router):

| Tool shape                  | Emitted in any round → |
|-----------------------------|------------------------|
| `serverExecute` present     | executed server-side; result appended as a `tool` message; never on `intents[]`/chips |
| read, no `serverExecute`    | accumulated; routed to `reply.intents[]` after the loop (today's path) |
| mutate                      | accumulated; routed to `suggestedActions[]` chips after the loop (today's path) |

`intentBuilder` becomes optional on the type; invariant (test-enforced):
exactly one of `serverExecute` / `intentBuilder` is present, and
`serverExecute ⇒ category === "read"`.

## C. The loop protocol

**AS BUILT (2026-06-12).** A complication surfaced during implementation that
the pre-implementation design missed: `callGroundedLlm` had already gained a
`callToolOnlyProseRepair` second-call path (when the model emits a tool call
with no prose, it re-asks for prose). Wrapping the loop AROUND `callGroundedLlm`
(the original "loop in `groundedAnswerOverScope`" idea) would let that repair
fire on the server-tool round and short-circuit the loop. So the loop lives
**inside `callGroundedLlm`**, and the server-vs-routed decision + execution
arrive via an INJECTED controller so the primitive stays catalog-agnostic:

```ts
// ragPipeline.ts — passed as the 12th (optional) arg to callGroundedLlm.
interface ServerToolLoop {
  maxRounds: number;
  isServerTool: (name: string) => boolean;            // cheap partition, no side effects
  execute: (call: RawToolCall) => Promise<ServerToolOutcome>; // runs ONE server tool
}
interface ServerToolOutcome { result: string; activity?: ToolActivity; failure?: ToolFailure; }
```

`groundedAnswerOverScope` BUILDS the controller (only when `options.toolLoop &&
options.tools`): `isServerTool` = `getServerTool(name)?.serverExecute` present;
`execute` = `getServerTool` → JSON-parse + Zod-validate args → `serverExecute(args,
{ skillsRetrieve })`, returning the result string + an `activity` (on success) or
a `failure` (on parse/validation/throw). The controller is the catalog bridge;
`callGroundedLlm` imports no catalog.

`callGroundedLlm` keeps a single internal `convo: GroundedMessage[]` transcript
(round 1 = `[system, user]`, byte-identical to today). NO `priorMessages`
parameter — the original design's idea; superseded by the in-function loop,
which owns the transcript end-to-end. It returns
`{ answer, toolCalls (ROUTED only), toolActivity, serverToolFailures }`.

**Transport verified (live re-audit 2026-06-12):** the LLM client
(`FetchLlmClient`) forwards the request body VERBATIM to OpenAI-shaped
`/chat/completions`, so an assistant `tool_calls` message + `role:"tool"`
result message reach the provider unchanged. The loop's multi-message
re-call is transport-compatible — this was the change's riskiest unstated
assumption; it holds.

**Blast radius (as built):** `callGroundedLlm` has exactly ONE caller
(`groundedAnswerOverScope`) and ZERO direct test callers — the CF-06 tests
assert the constructed HTTP body shape, not the signature. The controller was
added as the 12th optional positional arg (the planned options-object fold was
NOT done — a single optional trailing arg with one caller is lower-risk churn;
the full middleware suite (879) confirms no regression).

Per round:

1. Call the LLM with the full running transcript + the same `tools` catalog.
2. Partition emitted tool calls: server-executed vs. routed.
3. Routed calls accumulate for post-loop intent/chip routing. NO dedup by
   call `id`: `callGroundedLlm` synthesizes `call_${idx}` when the provider
   omits ids, so ids COLLIDE across rounds — id-keyed dedup would silently
   drop legitimate calls from later rounds (adversarial-review finding). Every
   routed call is kept; if the model re-emits an identical call in two rounds,
   both route (same outcome as the model emitting it twice in one round
   today).
4. If no server-executed calls, or the server-execution round count has
   reached `maxRounds` → loop ends; the last round's prose is the answer.
   Definition: `maxRounds` counts SERVER-EXECUTION rounds, so a turn makes at
   most `maxRounds + 1` LLM completions (4 → ≤5).
5. Else: validate each server-executed call's args with the tool's Zod
   schema; execute; append the assistant message (with its `tool_calls`) and
   one `role: "tool"` message per call (`tool_call_id` ↔ `id`). Validation
   or executor failure appends a `tool` message carrying a terse error string
   (`lookup failed: <reason>`) — the model continues; the failure is ALSO
   recorded on `toolFailures[]`. Never throw out of the loop for a tool
   error; LLM transport errors still throw (unchanged).

Round budget: `maxRounds: 4` server rounds (≤5 grounded completions per turn;
plus the pre-existing tool-only prose-repair MAY add one more when the capped
round emitted a tool call but no prose → ≤6 worst case — verified against the
live `callToolOnlyProseRepair` pass during implementation, 2026-06-12). Result
budget: each `serverExecute` result is capped by the executor (lookup: same
~4.5KB cap as injection).
Wall-clock: the loop adds at most 4× the grounded-LLM latency on turns that
use it; turns that don't pay zero. No new timeout machinery — the existing
per-call error handling covers each round; the worst case is why the
tool-activity hint (§I) ships in the same change.

Final-round prose flows through `parseGroundedAnswer` + `verifiedCitations`
exactly as today (the citation trust boundary is unchanged — quotes verify
against the SNIPPET set; skill-pack text is private background per the VOICE
fragment and is never citable).

## D. `lookup_groundx_docs`

```ts
{
  name: "lookup_groundx_docs",
  description:
    "Look up GroundX product documentation (architecture, ingestion, search, " +
    "X-Ray, buckets, workflows). Use when the user asks how GroundX works or " +
    "about a product capability and the GROUNDX KNOWLEDGE section is absent " +
    "or doesn't cover it.",   // satisfies the server description guard:
                              // contains "Use when", clears the 40-char floor
  category: "read",
  inputSchema: z.object({ query: z.string().min(3).describe("What to look up, e.g. 'how does X-Ray chunking work'") }),
  activityLabel: "Checked GroundX docs",
  serverExecute: ({ query }, ctx) => ctx.skillsRetrieve(query, { bypassEntryBar: true }) ?? "No matching documentation sections.",
}
```

- Entry bar bypassed (the model's decision to call IS the gate — same
  rationale as the planner bypass); ranking + `maxChars`/`maxSections` caps
  intact. Missing pack → the "no match" string (turn succeeds).
- Available in every step, every role (it leaks nothing tenant-scoped — the
  pack is public MIT docs).
- `promptGuidance`: "Call only when the GROUNDX KNOWLEDGE section is absent
  or doesn't cover the question. Never cite the result; speak from it."
- **Tool-result message = private background (live re-audit 2026-06-12).**
  The `role:"tool"` result is a NEW private-background channel alongside the
  injected GROUNDX KNOWLEDGE block. The existing VOICE fragment
  (`prompts/fragments.ts`) already bans the words "tools" / "skill pack" /
  "sections" from answers, so the mechanic can't leak; the tool's
  `promptGuidance` ("speak from it, never cite") gives the model the same
  "private background, speak FROM not ABOUT" treatment the knowledge block
  gets. No VOICE-fragment edit needed — the ban already covers it. The
  lookup result is skill-pack text, so it is NOT citable (citations verify
  against the SNIPPET set only — §C).

## E. Injection remains the fast path

Unchanged: the turn router plans `productKnowledge`; affirmed turns get the
injected block (zero extra round-trips — strictly faster than a tool round).
The tool covers what planning can't: mid-answer escalation, follow-ups, and
planner false-negatives. No double-pay in the common case (guidance steers
the model off the tool when the block is present); worst case is one wasted
~4.5KB round — bounded by `maxRounds`.

## F. Streaming (constraint recorded, not built)

When the streaming requirement lands: rounds 1..n-1 are non-streaming
internal calls (tool_calls aren't user-renderable anyway); only the final
prose round streams to the client. The loop introduces no envelope change,
so the streaming change composes without touching this one.

## G. Guards — parity + coverage exemptions

Two existing guards assume every server tool mirrors an app tool and builds
an intent. Both are extended in this change (same change as the tool — no
dormant exemption):

- `catalog-parity.test.ts` (app): the guard ALREADY carries an explicit
  server-only allowlist (`suggest_intent` precedent — durable agent-tools
  requirement "Server-only tool remains explicit"). `lookup_groundx_docs`
  joins that allowlist; no new mechanism. It carries no `rendersWidget`, so
  the reachability guard is untouched.
- `intentToolCorpus.test.ts` / the "every intentBuilder covered" requirement:
  scope stays "every tool WITH an intentBuilder"; server-executed tools get
  their own corpus section asserting the LOOP transcript instead (scripted
  tool_call round → scripted prose round → reply answers from the result,
  `intents[]` does NOT carry the call).
- `toolCatalog.test.ts` (SERVER, live re-audit 2026-06-12): adding the tool
  to `SERVER_TOOL_CATALOG` turns the authoritative-name-set guard red unless
  `EXPECTED_NAMES` gains `lookup_groundx_docs` (the list already carries the
  server-only `suggest_intent`, so a server-only name is precedented). The
  whole-catalog description guard (must contain `Use when`/`Triggers when`,
  ≥40 chars) and field-`.describe()` guard run against it too — §D's
  description + `query.describe()` satisfy both.
- The app-side `check-tool-quality` verb allowlist is NOT touched. Live
  re-audit: that scanner (`app/scripts/check-tool-quality.mjs`) walks ONLY
  app `*.tools.ts` files, so a server-only tool never reaches its verb check
  — adding `lookup_` there would be dead plumbing. (Earlier plan rounds
  wrongly listed this; corrected on the live-code re-audit.)

## H. Test strategy (LLM-free)

Scripted `LlmClient.forward` fixtures, per the `intentToolCorpus` precedent —
a `vi.fn` returning round-scripted bodies:

1. **Happy loop:** round 1 emits `lookup_groundx_docs`; assert request 2
   carries the assistant tool_calls message + `tool` result message; round 2
   prose becomes `reply.answer`; no intent/chip for the call.
2. **Round cap:** model emits the tool every round → loop stops after
   `maxRounds`; last prose wins; turn succeeds.
3. **Mixed emission:** round 1 emits `lookup_groundx_docs` + `open_document`
   → lookup executes, `open_document` lands on `intents[]` once.
4. **Executor/validation failure:** bad args → `tool` error message + entry
   on `toolFailures[]`; turn succeeds.
5. **Loop off (report/hybrid):** no `toolLoop` → single LLM call. With no
   `tools` advertised the model can't emit a tool call anyway; the seam-level
   test asserts exactly ONE `forward` call on the report path's LLM-CLIENT
   stub (the GroundX client's `forward` is a separate stub — don't conflate
   the two seams), pinning byte-identical behavior.
6. **Citations unchanged:** a looped turn's citations still verify against
   snippets only.
7. **Tool activity:** a looped turn's reply carries the
   `toolActivity` entry; a non-looped turn carries an empty array; the app
   renders the annotation (RTL test).

## I. Tool-activity visibility (user decision 2026-06-11: show a hint)

The user SHOULD see that the agent consulted documentation. Two tiers:

1. **This change (post-hoc, fits the request/response transport):** the reply
   envelope gains `toolActivity?: { name: string; label: string }[]` — one
   entry per successfully server-executed call (e.g.
   `{ name: "lookup_groundx_docs", label: "Checked GroundX docs" }`, the
   label from the tool's `activityLabel` field, §B).

   **OPTIONAL, mirroring `_debug` (live re-audit 2026-06-12 finding).** The
   field is `z.array(...).optional()`, NOT a required array. Reason: there
   are **17** reply-envelope return sites in `structuredHandler.ts` (every
   structured + hybrid producer), each typed as `ChatRouterResponse =
   SharedChatReply`. A REQUIRED field fails `tsc` at all 17 (missing
   property) — yet structured/hybrid turns can NEVER run a server tool, so
   `toolActivity: []` there is ceremony, not safety. Optional matches the
   existing `_debug?` precedent (a rag-path-only annotation other producers
   omit). Blast radius is then `runRagPipeline` (sets it on the rag path) +
   the app render plumbing — NOT the 17 structured/hybrid sites.

   **Drift guards self-maintain.** `app ChatReply` and middleware
   `ChatRouterResponse` are DIRECT aliases (`export type ChatReply =
   SharedChatReply`), so adding the field to the shared schema flows through
   the `Eq<>` guards automatically — no manual app/middleware type edit.

   **App render plumbing (the real touch points, was undercounted):**
   - `useConversation.ts` `LiveTurn` interface gains `toolActivity?`;
   - `useConversation` threads `reply.toolActivity` onto the minted
     assistant turn (where it already threads `citations`/`suggestedActions`);
   - `chatPrimitives.tsx` `LiveTurnList` renders the muted annotation
     (reading `turn.toolActivity ?? []`), after the answer/citations row.

   Failed executions do NOT appear (they're on `toolFailures`). A non-looped
   rag turn carries `[]`; structured/hybrid omit the field (app reads
   `?? []`).
2. **Deferred to the streaming change:** the LIVE "checking GroundX docs…"
   indicator while the loop runs needs a mid-turn channel (SSE); the
   `toolActivity` entries become stream events there. Tracked as an explicit
   line item on the existing streaming requirement, not dormant code here.
