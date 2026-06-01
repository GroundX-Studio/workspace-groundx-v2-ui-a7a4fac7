# Add a compile-time drift guard for the shared generated-result type and single-source the Report wire section onto it

## Why

This is item #2 ("Shared 'generated result'") of the umbrella
`2026-05-29-core-data-model-hardening` — the one item flagged for spin-out. Grounding against the
code shows the **type unification is already shipped**, but the **drift guards that make it
load-bearing are not** — so the abstraction is not yet protected, and one of the two consumers still
forks the shape. This change closes only that remaining gap; it does NOT re-do shipped work.

**What already exists today** (`shared/src/index.ts:347-429`, landed 2026-05-30):
- `generatedResultSchema` / `GeneratedResult` — `{ body, citations[], confidence?, warnings? }`,
  the Result half of Template + Scope + Results.
- A `generatedResultBaseShape` spread into both specializations so the
  citation/confidence/warning contract is single-sourced.
- `extractedFieldValueSchema` / `ExtractedFieldValue` = `{ fieldId, value(=body), …base }` (the
  `value` key is the persisted body alias → legacy `{fieldId,value,citations}` fixtures round-trip).
- `renderedSectionSchema` / `RenderedSection` = `{ sectionId, body(string), …base }`.
- `parseGeneratedResult` boundary sanitizer (parallels `parseCitations`/`parseTemplate`).
- A green 11-test runtime parse suite (`middleware/src/services/generatedResult.test.ts`).
- The Extract side is **fully single-sourced**: both `ExtractedFieldValue` declarations re-export
  the shared type (app `types/scenarios.ts:78`, middleware `scenarios/types.ts:66`).

**The real, still-open gap** (the part the umbrella never closed):
1. **No compile-time drift guard.** The runtime test asserts the shapes parse, but nothing fails the
   `tsc` build if a consumer re-forks `ExtractedFieldValue` or `RenderedSection` away from the shared
   type. The live precedent for the missing guard is `app/src/api/chatSessions.test.ts:40-43`
   (`type Eq<A,B> … Assert<Eq<…>>`), which is load-bearing under `npm run build`. The generated-result
   types have no such `Eq<>` assert on either side.
2. **The Report wire section forks the shape — twice.** The render wire section is declared as a
   local `RenderedSectionWire` interface in BOTH `middleware/src/services/reportRenderer.ts:196` and
   `app/src/api/smartReport.ts:56` (snake_case `{ name, render_as, body, cites, confidence?,
   warnings? }`). Neither derives from the shared `RenderedSection`; the
   body/citations/confidence/warnings contract on the Report wire can drift from the shared
   generated-result core with nothing to catch it. (App `smartReport.ts:94` already maps that wire
   onto a `RenderedSection` at the boundary — so the shared type IS the consumer-facing target; only
   the wire twin is unanchored.)

**Earn-every-axis assessment — the unification IS justified.** The shared type replaces real
duplication across two real consumers: Extract field values (app Extract widget + live extract path +
both scenario fixtures) and Report sections (render endpoint + app render client). They genuinely
share the body + citations[] + confidence? + warnings? core; what stays view-specific is correctly
layered on top and NOT forced into the base (`fieldId`/scalar `value` for Extract; `sectionId`/markdown
`body` + the snake_case display metadata `name`/`render_as` for Report). The merge is real, not
cosmetic. The narrow remaining work is to (a) make the abstraction enforced (the `Eq<>` guard) and
(b) finish the second consumer (anchor the Report wire twin onto the shared core).

## What Changes

- **template-lifecycle (durable):** ADD a requirement that Extract field values and report sections
  SHALL derive from one shared generated-result type guarded by a compile-time `Eq<>` drift assert —
  re-forking either specialization fails the build, not just a test. (The Extract side already
  re-exports the shared type; this change adds the missing compile-time assert that pins it.)
- **smart-report (durable):** ADD a requirement that the Report render wire section SHALL be a
  `RenderedSection` specialization (single-sourced shared core), so the report body/citations/
  confidence/warnings contract cannot drift from Extract's. Both `RenderedSectionWire` twins
  (app + middleware) derive their generated-result fields from the shared core via a compile-time
  `Eq<>` (or structural) assert; behavior-preserving (identical rendered Report + Extract output).
- **No new shared type is invented.** `GeneratedResult` and its two specializations already exist;
  this change reconciles the remaining consumer + adds the guards. Behavior-preserving on both sides
  (same rendered Extract field values, same rendered Report sections).
- Mark umbrella item #2 closed only once the guards are green (the umbrella `tasks.md` line already
  claims the type landed; this change adds the drift protection that makes the claim durable).
