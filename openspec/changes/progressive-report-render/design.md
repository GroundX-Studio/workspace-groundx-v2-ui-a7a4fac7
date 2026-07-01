## Context

`renderReport` (reportRenderer.ts) resolves a template, then at line ~551 runs
`for (const section of liveSections) { await groundedAnswerOverScope(section.question, scope, …) }`
— sequential, each bounded by the 30s upstream timeout (`http.ts` `fetchWithTimeout`).
The handler (`app.ts:~1463`) returns one JSON `{ sections:[…] }` after all sections.
The chat surface already solved the streaming problem: `POST /api/chat/messages` does
content-negotiated SSE (a `meta`/`token`/`envelope` frame protocol, a per-turn runner
decoupled from the connection, backpressure). This change applies that same pattern to
report render, plus parallelism and per-section fault isolation.

## Goals / Non-Goals

**Goals:**
- The report fills in section-by-section; wall-clock ≈ slowest section, not the sum.
- A single slow/failing section degrades in its own slot; the report never 504s wholesale.
- Non-streaming callers keep the exact JSON response they get today.

**Non-Goals:**
- Not changing the report template/scope model or the section wire shape (`{name,
  render_as, body, cites, confidence, warnings}`) — only how/when sections are delivered.
- Not touching chat routing (separate change) or citation verification.
- Not adding a queue/worker; parallelism is in-request bounded concurrency.

## Decisions

**D1 — Reuse the SSE SUBSTRATE, not the chat `TurnRunner`.** The render endpoint
negotiates on `Accept: text/event-stream` and emits its OWN protocol: `meta` (report_id,
template_id, ordered section ids) → one `section` frame per completed section (the
existing per-section wire shape + its ordinal + `status: "ok" | "failed"`) → terminal
`done` (resolved_variables, export_formats, preview_only) or `error`. A non-streaming
request returns the unchanged single JSON envelope.
The reusable pieces are the lower substrate: `TurnEventBuffer` + `streamPump.ts`
(`pumpFramesToResponse` + heartbeat/backpressure — valuable for a multi-second stream)
on the server, and `app/src/api/sseFrames.ts` (`readSseFrames`) on the client.
*Explicitly NOT reused:* the chat `TurnRunner`/`TurnRegistry` — that is chat-turn
machinery (keyed `(sessionId, turnKey)`, idempotent reconnect-attach, `Last-Event-ID`
from-DB resume, per-turn persistence). Report render has no `turnKey`, no per-turn
persistence, and multiplexes N section results, so the runner does not map; force-fitting
it would import turnKey/resume semantics that are meaningless here.
*Alternative:* per-section polling endpoints. Rejected — more round-trips + new endpoints
when the SSE substrate already exists (principle 1).

**D2 — Bounded parallel section rendering.** Replace the sequential `for/await` with a
bounded-concurrency fan-out (a small pool, not unbounded `Promise.all` over N sections —
protect the upstream). Each section's grounded call is independent.
*Alternative:* unbounded `Promise.all`. Rejected — a wide template would burst the LLM
provider; a concurrency cap is the safe default.

**D3 — Per-section isolation + retry.** Each section is wrapped so its failure/timeout is
caught locally: retry once on a transient timeout, then emit a `section` frame with
`status: "failed"` + a warning, never throwing out of the fan-out. The endpoint's overall
status is success as long as the *report* was produced; failed sections are visible in
their slots. This realizes the existing "Section render edge cases SHALL degrade visibly"
requirement at the section level.

**D4 — Surface fills ordered slots.** The render widget lays out one slot per section id
(from the `meta` frame) showing per-slot loading, then replaces each slot as its `section`
frame arrives; a `failed` section renders a "couldn't generate — retry §N" affordance that
re-renders that section only (reusing the existing `section_ids` subset re-render path).

**D6 — Save/Export require a COMPLETE report; a reload affordance recovers (Q2 decision).**
Viewing degrades gracefully (progressive, partial, no 504 — the whole point), but the
DELIVERABLE must be whole: while ANY section is in a `failed` state, Save and Export SHALL
be disabled. To keep that from being a dead-end, the surface SHALL show a visible recovery
affordance — a "N sections failed — retry" control that re-renders all failed sections
(a `section_ids` subset render over the failed set); when the last failed section succeeds,
Save/Export re-enable. This is separate from the scope-based anon/BYO gate (which still
mirrors Extract) — it's a completeness gate on top.
*Trade-off:* a persistently-failing section blocks the deliverable — a milder, recoverable
version of all-or-nothing, but scoped to Save/Export only (viewing is never blocked), and
the user drives recovery rather than eating a silent 504.

**D5 — Correctness via the response, not the connection.** Like chat, a client disconnect
must not corrupt the result; the simplest correct scope here is: the JSON path remains the
source of truth for `↻ re-render`/tests, and the SSE path is a progressive view of the same
computation. (Full runner-style resume is a non-goal; sections are idempotent to recompute.)

## Risks / Trade-offs

- **[Bounded parallelism still bursts the LLM for wide templates]** → cap concurrency
  (e.g. 3-4) and document it; a `log()`-style note if sections were queued. Measure.
- **[SSE path and JSON path drift]** → both call the SAME `renderReport` core; the SSE
  handler is a thin adapter that emits frames from the same per-section results. One
  compute path, two deliveries.
- **[A section that always times out]** → retry-once then `failed` slot with a manual
  retry; never an infinite retry, never a whole-report 504.
- **[Existing tests assume the single JSON response]** → they keep working (JSON is the
  default without the SSE Accept header); add new tests for the SSE path (principle 7:
  no existing behavior silently changed).

## Migration Plan

1. Parallelize + per-section isolate/retry inside `renderReport` (JSON path only) — this
   ALONE fixes the 504 and the 75s sum, shippable independently. Verify.
2. Add the SSE content-negotiated delivery on the handler + the surface's ordered-slot
   fill-in + per-section retry affordance. Verify progressive paint live.
3. Update `docs/agents/template-scope-results.md`.

Rollback: step 1 is a pure internal change to the JSON path (safe alone); step 2's SSE
mode is additive (JSON remains default).

## Open Questions

- Concurrency cap value — start at 3-4, tune against observed provider limits.
- Should a `failed` section count against `preview_only`/gating? No — gating is scope-based
  (mirrors Extract), independent of per-section success.
