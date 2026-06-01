# Live multi-doc report render (Phase 7 / WF-10)

## Why

`renderReport` (`middleware/src/services/reportRenderer.ts`) only renders in MOCK_MODE. Its
live branch is a hard stop — at line ~478:

```
if (!deps.mockMode) {
  throw new Error("live report render is not yet wired (Phase 7 / WF-10)");
}
```

So report rendering works *only* with the Utility fixture. Everything around the live path is
already in place: `resolveScopeDocSet(scope, index)` (~120) + `UTILITY_REPORT_DOC_INDEX` (~94)
resolve the scope → doc set, the BYO gate (~464) and empty-scope idle render (~484) are wired, and
`renderSection` (~399) already applies variable substitution + the no-source / unresolved-variable
degradations. What is missing is the one step the throw stands in for: fanning each template
section's question over that resolved doc set and producing a real cited body.

That live precedent already exists twice in the same service layer:
- `fieldExtractor.ts` `extractField` (~219) — the closest analogue: search a `ContentScope` via
  `searchGroundX`, prompt the LLM over the snippets, parse a cited result. Mock vs live split at
  the top; requires `groundxClient` + `groundxApiKey` + `llmModelId` outside MOCK_MODE.
- `ragPipeline.ts` `runRagPipeline` (~57) — live GroundX search → grounded LLM generation →
  WF-06b verification (`verifyQuote` / `assignTier` / `confidenceFor` from `attribution.ts`, ~43).

This change wires the live render by composing those precedents per section. It is the
**prerequisite** for `2026-06-01-retire-mock-mode`: MOCK_MODE cannot be removed while the only
working render path is the fixture.

## What Changes

- **Live render deps on `RenderReportDeps`.** Add the live-render dependencies
  (`groundxClient`, `groundxApiKey`, `llmClient`, `llmModelId`) to `RenderReportDeps` (~251),
  mirroring `ExtractFieldDeps` (`fieldExtractor.ts` ~56) and the chat router deps. Outside
  MOCK_MODE these are required (throw with a clear message when absent, as `extractField` /
  `runRagPipeline` do). The app.ts render route (~1232) supplies them the same way the extract
  route (~1160) already does: `llmClient` / `groundxClient` from the app deps, `groundxApiKey`
  from `sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY`, `llmModelId` from
  `env.LLM_MODEL_ID`.
- **Per-section live render.** Replace the throw with a real implementation: for each template
  section in order, search its `question` over the resolved `ContentScope` doc set via
  `searchGroundX`, run grounded LLM generation over the returned snippets, verify the answer's
  citations against their source chunks (WF-06b: `verifyQuote` → `assignTier` → `confidenceFor`),
  and emit a cited `RenderedSectionWire`. This mirrors `extractField`'s search→generate→parse loop
  and `runRagPipeline`'s verify→tier step, reusing the existing `searchGroundX` and `attribution.ts`
  helpers rather than re-implementing them.
- **`renderReport` becomes async.** The live path awaits search + LLM, so `renderReport` returns
  `Promise<RenderReportResponse | RenderGateResponse>`. The MOCK_MODE branch keeps returning the
  fixture result (now awaited). The app.ts call site (~1232) already lives in an `async` handler;
  it gains an `await`. The `↻ re-render` / Save paths through the same endpoint are unchanged.
- **Same response shape — widget unchanged.** The live path returns the identical
  `RenderReportResponse` (~229): ordered `sections[]` (template order), each
  `RenderedSectionWire` (`name`, `render_as`, `body`, `cites`, `confidence?`, `warnings?`),
  `resolved_variables`, `export_formats`, `preview_only`. The render surface and `CiteChip`
  consume the response identically whether it came from the fixture or the live fan-out.
- **Gate + idle behavior unchanged.** BYO scope still returns the gate envelope (#10) before any
  render (~464); an empty/unresolvable doc set still returns the idle empty render (~484). Live
  vs mock only differs in *how a non-empty sample scope's sections get their bodies*.
- **Not in this change:** removing MOCK_MODE. After this lands, `renderReport` works **both**
  with the fixture (MOCK_MODE) and live. Removing the fixture / `mockMode` flag is the dependent
  change `2026-06-01-retire-mock-mode`.
