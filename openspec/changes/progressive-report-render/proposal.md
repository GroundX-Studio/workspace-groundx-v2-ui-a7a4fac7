## Why

The report render is a blocking, sequential, all-or-nothing LLM fan-out, and it
fails or crawls in practice. `renderReport` (middleware/src/services/reportRenderer.ts:551)
loops sections and `await`s a full `groundedAnswerOverScope` per section, one after
another. Each grounded call is bounded by the 30s upstream LLM timeout. Two failures
confirmed in the logs (2026-07-01):

- **One slow section 504s the whole report.** Any single section whose grounded call
  exceeds 30s throws `UpstreamTimeoutError` → the entire `/reports/render` returns 504.
  No per-section isolation.
- **Even success is punishingly slow.** A successful render took **75s** (total time is
  the *sum* of sections, since they run sequentially), during which the surface shows
  only a spinner.

This also contradicts the existing smart-report spec, which already says sections
"SHALL stream in render order" and edge cases "SHALL degrade visibly" — the current
implementation does neither (it blocks, and one failure kills all).

## What Changes

- **Progressive delivery.** `POST /api/widgets/smart-report/reports/render` gains an
  SSE mode via content negotiation (mirroring the chat endpoint): `Accept:
  text/event-stream` streams per-section frames as each section completes; any other
  request receives the existing single JSON envelope UNCHANGED (back-compat).
- **Parallel section rendering.** Sections render concurrently (bounded), so wall-clock
  is ~the slowest section, not the sum.
- **Per-section isolation + retry.** Each section renders independently with a retry on
  transient timeout; a section that ultimately fails yields an inline "couldn't generate
  — retry" placeholder in that section's slot. A single section failure NEVER 504s the
  whole report.
- **Fill-as-you-go UI.** The render surface paints each section the moment its frame
  arrives (ordered slots), replacing the all-or-nothing spinner.
- **BREAKING (internal):** the render surface's fetch path adds an SSE consumer; the
  synchronous JSON response remains for non-streaming callers (`↻ re-render`, tests).

## Conformance to core architectural decisions

- **Principle 1 (composable over forked):** no new mechanism — reuses the shared SSE
  *substrate* (`TurnEventBuffer`, `streamPump`, FE `sseFrames`), not a new transport,
  and one compute path (`renderReport`) with two deliveries (JSON + SSE). It does NOT
  reuse the chat `TurnRunner`/`TurnRegistry` (that's chat-turn-specific — see design).
- **Principle 5 (done = user-visible + no orphans):** the JSON path stays for
  non-streaming callers (no dead branch); the fix is verified by a user-visible test
  (report fills in section-by-section; a failed section retries in-slot).
- **Principle 6 (one source of truth):** the SSE and JSON deliveries emit from the
  SAME `renderReport` per-section results — one compute path, no parallel logic.

## Capabilities

### New Capabilities
<!-- none; this hardens existing smart-report behavior -->

### Modified Capabilities
- `smart-report`: the render endpoint gains progressive SSE delivery (JSON back-compat
  retained); sections render in parallel with per-section retry + isolation; the render
  surface fills in section-by-section; per-section failure degrades in-slot instead of
  failing the whole report.

## Impact

- `middleware/src/services/reportRenderer.ts` (parallel + per-section resilience),
  `middleware/src/app.ts` (the `/reports/render` handler gains SSE content-negotiation,
  emitting a `meta`/`section`/`done` protocol via the shared SSE SUBSTRATE —
  `TurnEventBuffer` + `streamPump` — NOT the chat `TurnRunner`),
  the SmartReport render widget (SSE consumer via FE `sseFrames` + ordered-slot fill-in
  + per-section error/retry affordance).
- Tests: `reportRenderer.test.ts` (parallel via a call-overlap probe + per-section
  failure isolation + retry), the render widget's `*.test.tsx` (progressive fill-in,
  per-section error slot), an apiRouteContract test for the SSE mode + JSON back-compat.
- Docs: `docs/agents/template-scope-results.md` (render is progressive + resilient).
- Reuses the shared SSE substrate; no new external dependency. No DB schema change.
- Cross-plan: touches the report caller of `groundedAnswerOverScope`; `chat-unified-tool-loop`
  touches its chat caller. Different callers (low collision) but SERIALIZE per
  `docs/agents/cross-plan-execution-order.md` if implemented concurrently.
