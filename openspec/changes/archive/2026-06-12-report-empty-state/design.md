# Design — report empty-state (remove the fake fixture)

## A. The seam that's wrong

`reportFixtures.ts` exports two functions both consumers call:
- `getReportFixture(scope)` → `SmartReportBuilder.baseRowsForScope` SEEDS the
  builder rows from the fake `UTILITY_REPORT`.
- `reportTemplateIdForScope(scope)` → `SmartReportRender` routes the live
  `renderReport` call to the fake template id `rt-utility-ic-brief`.

Both deleted. Replacements use REAL state that already exists.

**Importer inventory (re-verified against the repo — NOT just the two widgets):**
deleting `reportFixtures.ts` touches FIVE references, not three:
- `SmartReportBuilder.tsx` (`getReportFixture`) — production widget.
- `SmartReportRender.tsx` (`reportTemplateIdForScope`, 3 call sites: runRender,
  re-render, the empty-state "Open builder" `editTemplate` dispatch) — production
  widget.
- **`app/src/test/makeFakeApi.ts:120-123`** — the TEST fake API: its
  `renderReport` handler returns `getReportFixture(scope)`. THIS is the seam that
  feeds report CONTENT to every integration/OnboardingShell test (it is NOT a
  "test-local stub" — see §E). Deleting the fixture forces this file to change:
  its `renderReport` fake returns the no-template/empty result, which is what
  flips the OnboardingShell utility-render tests to the empty state.
- **`app/src/widgets/reportScopeVocabulary.test.ts`** — a source-scan test that
  `readFileSync`s `widgets/reportFixtures.ts` + `widgets/reportFixtures.test.ts`
  by path (its scanned-file array, ~lines 16-17). Deleting those files makes it
  throw; T2 must prune those two paths from its array.
- `reportFixtures.test.ts` — the module's own test (deleted with it).

## B. Render template-id source

`SmartReportRender.runRender`: `templateId = reportTemplateIdForScope(scope)` →
`activeSession?.reportOverlay.templateId ?? null`. `null` → the existing
`smart-report-empty` state (no network call). The `editTemplate` dispatch
(render empty-state "Open builder") and the re-render path
(`report?.templateId ?? templateId`) read the same source.

AS-BUILT CORRECTION: the planning note that `PendingReportOverlay` "already
carries `templateId?:string` (types.ts:327)" was WRONG — that line was on
`PinToReportInput`, not the overlay. The field was ADDED to the
`PendingReportOverlay` alias (report-specific intersection, NOT the generic
`PendingTemplateOverlay` shell — Extract has no analogous render), and a WRITER
was added (the `pinToReport` reducer now persists `input.templateId`, which it
previously dropped) so the read↔write round-trip is closed in THIS change rather
than left dormant.

**Re-trigger:** `useScopeAdapter` fires first paint on mount + scope-change. A
`templateId` that arrives LATER (a pin, or the `report-default-template`
onboarding bootstrap) would otherwise be missed, so a templateId-change
re-render effect was ADDED (a ref skips the mount value so the two triggers
don't double-fire). This closes the `report-default-template` re-trigger concern
in advance; a null id still simply shows the empty state.

## C. Builder rows

`baseRowsForScope` → `[]` (delete the `getReportFixture` call); rows = overlay
(pinned/added) only, empty when nothing pinned. `templateIdentityForScope` mints
"Untitled report" (no fixture). NOTE: loading a REAL template's sections into
the builder (so a saved/default template is editable) is the
`report-default-template` change's concern (it adds the `getReportTemplate`
read); here the builder is pinned-drafts-only.

## D. Template-aware Report routing

`handleSubstepClick` "report" routes by template existence:
`reportOverlay.templateId ? "f4" (render) : "f4a" (empty builder)` (thread the
chatStore overlay into the handler + deps). With no template (this change's
end state for onboarding) → empty builder. The Bug-A progress gate (already
shipped) still holds.

## E. Test re-basing (~31)

- `reportFixtures.test.ts` → DELETED.
- `SmartReportRender.test.tsx` (~12): inject `reportOverlay.templateId` + stub
  `renderReport` with a test-local `RenderedReport`; the no-template path asserts
  the empty state.
- `SmartReportBuilder.test.tsx` (~8): pin a section (real draft) to get a row,
  instead of relying on the seed.
- `OnboardingShell.test.tsx`: the Report-routing cold-start (no template →
  empty builder) is ADDED (T5). FOUR EXISTING tests assert the OLD fake-fixture
  utility-render CONTENT and BREAK once utility → empty; they are handled in
  T6b, and `report-default-template` re-creates the utility-render ones against
  the REAL template (NEW section names — see that change, NOT the dropped
  `charge breakdown`/`anomalies`/`recommendation`):
  AS-BUILT NOTE: execution showed that with NO template a Report click routes to
  the BUILDER (f4a) — NOT the empty render (f4) — so the four content tests could
  not be "rebased to the empty render"; their dispositions are:
  - "Phase 0: …renders the report surface" (asserts billing summary/charge
    breakdown/anomalies/recommendation + cite-chip) → **DELETED** here. The
    routing-to-builder behavior it would have shown is covered by the new
    template-aware routing test (T1c); the content version is re-created against
    the REAL template in `report-default-template` (T6b).
  - "Phase 1: anon previews … (export/Save locked)" (asserts the export 🔒) →
    **DELETED** here (an anon Report click lands on the empty builder — no
    rendered report to lock); the export-lock-over-content version is re-created
    in `report-default-template` (T6b).
  - "Phase 1: Report pill reachable on the Loan scenario" → **REBASED** here:
    clicking Report (no template) lands on the empty BUILDER (reachable, not the
    extract workbench) — it formerly asserted the empty render.
  - "Restoration: clicking ✎ edit §N …" and "Phase 1: Extract → Report carries
    the ContentScope" (asserts billing summary) both NEED rendered content →
    **DELETED** here, re-created in `report-default-template` (the edit hand-off
    in its T5, the scope-carry in its T6b) against the real template.
  - Untouched (already match the empty/transition behavior): pill-reachable
    (not-disabled) and the f4↔f4a transition (asserts the container + builder
    swap, no section content).
  - ADDED (T1/T5): two template-aware routing tests — Report click with NO
    template → f4a builder; Report click WITH a template (pin-path writer) → f4
    render — so both arms of the routing conditional are covered.
- NEW guard test: fails if a hardcoded client `RenderedReport` / scope→template
  map is reintroduced under `app/src`.

## F. Spec deltas (smart-report)

- REMOVE "The Report chapter SHALL ship on the Utility single-doc case via a
  fixture" (built on the removed `MOCK_MODE`; contradicts no-seed).
- MODIFY "missing template = legitimate new-customer start" → extend to the
  CLIENT: render reads the template id from real report state, never invents a
  fixture id; Report routing is template-aware; no client-side fake report
  fixture exists.
- MODIFY "Report rendering SHALL have a live multi-doc path, not only a fixture"
  → drop the fixture/MOCK_MODE coexistence (no fixture path after this change).

## G. Adversarial-review findings (folded in)

1. **(verified) anon renders real content** later (in the default-template
   change): `authorizedProjectIds(repo, null)` returns public-grant projects;
   the sample project is seeded public. Not this change's concern (no render
   content here — empty until the default-template change).
2. **Member-render behavior change** is honest, not a regression (the fixture
   masked a never-wired member path) — see proposal scope.
3. **Guard test** is the durable root-cause fix (the no-seed principle was never
   enforced) — task T2b.
