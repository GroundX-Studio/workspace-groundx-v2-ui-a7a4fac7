## 1. Parallel + per-section resilience (JSON path — fixes the 504 alone)

- [x] 1.1 SEQUENTIAL — Failing test first: `reportRenderer.test.ts` — a template where one section's grounded call times out (even after retry) still returns a report; the failed section carries a warning/low-confidence body, the others render normally, no thrown 504. (principle 2)
- [x] 1.2 SEQUENTIAL — Failing test: sections render concurrently — assert via a DETERMINISTIC call-overlap probe (a fake grounded call that records concurrent in-flight count and blocks until N are entered), NOT wall-clock timing. Assert the in-flight count exceeds 1 (up to the cap). (N2 — no flaky timing)
- [x] 1.3 SEQUENTIAL — Replace the sequential `for/await` in `renderReport` with bounded-concurrency fan-out (`mapWithConcurrency`, cap 4). (D2)
- [x] 1.4 SEQUENTIAL — Wrap each section (`renderOneSection`): retry-once on failure, catch-and-flag in-slot on final failure (never throw out of the fan-out). (D3)
- [x] 1.5 GATE — Adversarial review PASSED: one section's timeout degrades in-slot (no 504, test-confirmed); concurrency capped at 4 via a synchronous index cursor; JSON envelope shape unchanged (28 existing tests green); full middleware suite 693 green; tsc clean.

## 2. Progressive SSE delivery (endpoint)

- [x] 2.1 SEQUENTIAL — Route tests (`app.test.ts`): `Accept: text/event-stream` emits `meta` → 4 `section` frames → terminal `done` (with `status`/`preview_only`); WITHOUT the header returns the existing JSON envelope (back-compat). Streaming sink unit tests in `reportRenderer.test.ts` (onMeta once + ordered ids; onSection per section; aggregate still returned). (D1, principle 7)
- [x] 2.2 SEQUENTIAL — SSE content-negotiation on the `/reports/render` handler (`app.ts`): own `meta`/`section`/`done` frame writer + heartbeat (Option A — NOT `TurnEventBuffer`; see design D1); frames emitted from the SAME `renderReport` via the `onMeta`/`onSection` sink (one compute path, two deliveries).
- [x] 2.3 GATE — Adversarial review PASSED: JSON default path is the untouched original call (back-compat + happy-path tests green); SSE frames ordered + `done` carries the authoritative envelope; one compute path; post-writeHead errors → `error` frame (not `next()`); heartbeat unref'd + cleared; SSE inside the same auth/ownership guards. Full middleware suite 1070 green (twice); tsc clean.

## 3. Fill-as-you-go render surface

- [x] 3.1 SEQUENTIAL — Widget tests: ordered slots from `meta`, per-slot loading placeholder → section fills in (held-4th-section test), and a `failed` section shows a retry affordance (shown to anon too — Q1). Plus a direct `smartReport.test.ts` SSE-parsing test (meta→section+failed→done; onError on non-2xx).
- [x] 3.2 SEQUENTIAL — SSE consumer (`renderReportStream`) + ordered-slot fill-in in the widget; per-section "↻ retry §N" re-renders that section via the `section_ids` subset over the stream. (D4)
- [x] 3.3 SEQUENTIAL — Completeness gate: while any section is `failed`, Save/Export DISABLED + a "N sections failed — retry" reload (`handleRetryAllFailed`) re-renders all failed sections; when all succeed, Save/Export re-enable. Viewing never blocked; separate from the scope-based gate. Member-non-preview test confirms. (D6, Q2)
- [x] 3.4 SEQUENTIAL — First paint AND ↻ re-render share ONE streaming path (Q2 — re-render streams too); the JSON `renderReport` stays for non-streaming callers/tests. Backend concurrency (cap 4) unchanged, so both are concurrent.
- [x] 3.5 GATE — Adversarial review PASSED: widget-contract intact (role prop, README, sibling test); completeness gate blocks only Save/Export, not viewing; no type duplication (RenderedReportSection reused — recurrence-drift §5(b) green); fake mirrors the chat-stream precedent; app suite 1960 green, mw report 121 green, tsc clean.

## 4. Docs + closeout

- [x] 4.1 SEQUENTIAL — Updated `docs/agents/template-scope-results.md` (render is progressive, bounded-parallel, per-section resilient; SSE content-negotiation; completeness gate).
- [x] 4.2 SEQUENTIAL — Live browser re-test PASSED (dev, real GroundX): `/reports/render` returns 200 (was 504) with `content-type: text/event-stream`; the report filled in section-by-section (timeline: 3 loading slots → 1 → 2 → 3 sections over ~29s); a section that failed live ("Charges By Service") degraded IN ITS SLOT with a "↻ retry §2" affordance (shown to the anon previewer — Q1) and did NOT 504 the report; "Service Accounts" showed the no-support degrade. Screenshot + SSE frame capture attached in-session.
- [x] 4.3 GATE — Final review PASSED: `npm run build` clean (shared+app+middleware, exit 0); `openspec validate --strict` valid; app suite 1960 + middleware 1070 green; tsc clean both packages.
