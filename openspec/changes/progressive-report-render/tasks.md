## 1. Parallel + per-section resilience (JSON path — fixes the 504 alone)

- [x] 1.1 SEQUENTIAL — Failing test first: `reportRenderer.test.ts` — a template where one section's grounded call times out (even after retry) still returns a report; the failed section carries a warning/low-confidence body, the others render normally, no thrown 504. (principle 2)
- [x] 1.2 SEQUENTIAL — Failing test: sections render concurrently — assert via a DETERMINISTIC call-overlap probe (a fake grounded call that records concurrent in-flight count and blocks until N are entered), NOT wall-clock timing. Assert the in-flight count exceeds 1 (up to the cap). (N2 — no flaky timing)
- [x] 1.3 SEQUENTIAL — Replace the sequential `for/await` in `renderReport` with bounded-concurrency fan-out (`mapWithConcurrency`, cap 4). (D2)
- [x] 1.4 SEQUENTIAL — Wrap each section (`renderOneSection`): retry-once on failure, catch-and-flag in-slot on final failure (never throw out of the fan-out). (D3)
- [x] 1.5 GATE — Adversarial review PASSED: one section's timeout degrades in-slot (no 504, test-confirmed); concurrency capped at 4 via a synchronous index cursor; JSON envelope shape unchanged (28 existing tests green); full middleware suite 693 green; tsc clean.

## 2. Progressive SSE delivery (endpoint)

- [ ] 2.1 SEQUENTIAL — Failing apiRouteContract test: `POST /reports/render` with `Accept: text/event-stream` emits `meta` → per-section `section` frames (as each completes) → terminal `done`; WITHOUT the header returns the existing JSON envelope byte-compatible. (D1, principle 7)
- [ ] 2.2 SEQUENTIAL — Add SSE content-negotiation to the `/reports/render` handler (`app.ts`), reusing the chat SSE framing/transport; emit frames from the SAME `renderReport` per-section results (one compute path, two deliveries).
- [ ] 2.3 GATE — Adversarial review: JSON default path untouched (existing tests green), SSE frames ordered + carry status, no compute-path duplication.

## 3. Fill-as-you-go render surface

- [ ] 3.1 SEQUENTIAL — Failing widget test (`*.test.tsx`): the render surface lays out ordered slots from `meta`, fills each slot as its `section` frame arrives (out-of-order completion → in-order slots), and a `failed` section shows a retry affordance.
- [ ] 3.2 SEQUENTIAL — Implement the SSE consumer + ordered-slot fill-in in the SmartReport render widget; per-section "couldn't generate — retry §N" affordance re-renders that section only via the `section_ids` subset path. (D4)
- [ ] 3.3 SEQUENTIAL — Failing test + implement: while any section is `failed`, Save and Export are DISABLED and a "N sections failed — retry" recovery affordance shows; retrying re-renders all failed sections in one `section_ids` subset render; when all succeed, Save/Export re-enable. Viewing is never blocked. This completeness gate is separate from the scope-based anon/BYO gate. (D6, Q2 decision)
- [ ] 3.4 SEQUENTIAL — Keep `↻ re-render` and initial-paint on the shared render path; the non-streaming callers/tests keep the JSON path (D5).
- [ ] 3.5 GATE — Adversarial review vs the widget contract + the smart-report scoped-viewer contract; Save/Export completeness gate correct (blocks only Save/Export, not viewing); no-hardcoded-styles guard green.

## 4. Docs + closeout

- [ ] 4.1 SEQUENTIAL — Update `docs/agents/template-scope-results.md` (render is progressive, parallel, per-section resilient).
- [ ] 4.2 SEQUENTIAL — Live browser re-test: "put together a report" fills in section-by-section; a slow/failed section shows an in-slot retry, never a whole-report error; measure wall-clock vs the old ~75s. Attach evidence.
- [ ] 4.3 GATE — Final adversarial review vs the spec delta + real code; `npm run build`; `openspec validate --strict`; then archive.
