# Design — Smart Report screen

Source of truth for the cross-cutting decisions. Implementation reads this to avoid drift.

## D1 · Frame model: `f4` = render, new `f4a` = builder

Reconcile the spec's S-series with the F-series implementation by mirroring Extract's `f3`/`f3a`:

| Spec | Frame | Surface | Mirrors |
|---|---|---|---|
| S3 | `f4` | Report **render** (read-only, sections stream in) | F3 results |
| S3a | `f4a` *(new)* | Report **builder** (template/section editor) | F3a design |

`FFrame` gains `"f4a"`. `f4` stops mis-routing to the extract workbench. The shell's
`effectiveStepKind` switch gains `report-render` (f4) + `report-builder` (f4a). `f4 → f4a` (edit
affordance / `show_smart_report_edit`) and `f4a → f4` (`← back`, builder-only) mirror Extract.

## D2 · One widget family, `role` + `scope` props (no onboarding duplicate)

Production widgets carrying `role: WidgetRole` + a required `scope: WidgetScope` (per
`widget-role-access`, which replaces the old `mode: "onboarding" | "steady"` prop); onboarding views
are thin wrappers:

- `ReportRenderView` (f4) → `SmartReportRender` (viewer-widget), `templateId` + `scope` (a real
  `ContentScope`) + `role`.
- `ReportBuilderView` (f4a) → `SmartReportBuilder` (viewer-widget), `templateId` + `scope` + `role`.
- `PinToReportAction` (chat-widget) on assistant turns.

Each ships `README.md` + sibling `*.test.tsx` + `role` + `scope`, design tokens only (drift guard
walks them).

## D3 · Data model (app-owned)

The report template is **scope-independent** (locked `Template + Scope + Results` rule): scope is NOT
stored on the template or its sections — it is a **render-time input** (`Result = Template + Scope`),
supplied by the surface you transition from and recorded on the rendered **result**.

```ts
type ReportSectionRenderAs = "PARAGRAPH" | "BULLETS" | "TABLE";
interface ReportSection {
  id: string;
  name: string;                 // snake_case e.g. "charge_breakdown"
  renderAs: ReportSectionRenderAs;
  question: string;             // prompt run at render time
  variables: string[];          // literal-only in v1 (#12)
  instructions?: string;        // one rule per line
  pinnedFromTurnId?: string;
  // NO per-section scope. Sections share the report's render-time scope.
  // Per-section sourcing (different doc set per section) is DEFERRED + tracked — it would be a
  // render-request concern, NOT a template field (keeps the template scope-independent).
}
interface ReportTemplate {
  id: string; name: string; format: string;
  sections: ReportSection[];
  // NO `version` (shipped `templates` table has none — versioning deferred, #13).
  // NO scope of any kind — the template is scope-independent.
}
interface RenderedSection { name: string; renderAs: ReportSectionRenderAs; body: string; cites: Citation[]; confidence?: number; warnings?: string[]; }
// The RESULT carries the scope it was rendered over (Result = Template + Scope + answers).
interface RenderedReport { reportId: string; templateId: string; scope: ContentScope; status: "idle"|"streaming"|"complete"|"error"; sections: RenderedSection[]; resolvedVariables: Record<string,string>; exportFormats: ("pdf"|"md"|"link")[]; previewOnly: boolean; }
```

`ContentScope` (shipped in `@groundx/shared`, `shared/src/index.ts`) is the scope abstraction —
**reused as-is, including its already-landed composable `filter`** (see D4). Scope is a shared
ScopedViewerWidget concern, not report-specific.

## D4 · Scope model — `filter` composable on every shape (the generality requirement)

`scope` IS the shipped `ContentScope`, on which **`filter` is already an orthogonal, composable
modifier on every shape** (landed in `@groundx/shared` — Report consumes it, does not re-extend) —
never mandatory, never forbidden; **context selects**:

| Shape | Meaning | Used by |
|---|---|---|
| `bucket` | whole workspace | a true workspace-wide report (not the per-sample demos) |
| `bucket + filter` | **a project** (filter-field value) within the workspace | **all 3 demos open here** |
| `documents[]` (`+ filter?`) | specific files | hand-picked subsets |
| `group` (`+ filter?`) | cross-bucket / multi-workspace | Solar scale-out |

Doc-org (per `groundx-studio-harness`): **bucket == workspace · project/portfolio/fund/folder ==
filter-field values · group == cross-bucket.** In this scaffold every demo sample is a **project in
one shared bucket**, so the per-sample scope is **`bucket + project filter`** — `Utility` v1 =
`{ bucket, filter:{project:"utility"} }`. A bare bucket means "whole workspace" and is valid but not
what the demos use; we do NOT hardcode a mandatory filter or forbid any shape. `filter` is the same
mechanism Extract + `search_groundx` use. Variable substitution (`{project}`) resolves into the
filter at render time. This is the shipped `ContentScope` with its landed `filter` field, not a new
abstraction and not a re-extension.

## D5 · Render contract (net-new middleware)

`POST /api/widgets/smart-report/reports/render`:
`{ template_id, scope: ContentScope, variables, section_ids|null, chat_session_id, parent_message_id }`
→ `RenderedReport`. Sections stream in order; a `section_ids` subset scopes a re-render. MOCK_MODE
returns the Utility fixture; live mode fans each section's `question` through `search_groundx`
(scoped by the section's `ContentScope`) + grounded generation, reusing the chatRouter grounding +
WF-06b verification. `preview_only` on the sample doc; a BYO scope → gate envelope (#10).

## D6 · Chat ⇄ viewer orchestration (every control driven from chat)

- **Tools (chat → state), one per control:** `show_smart_report_render`, `show_smart_report_edit`,
  `pin_to_report`, `propose_report_section`, plus builder mutations (`add`/`edit`/`remove`/`reorder`
  section, `set_section_scope`, `render_report`). Each is a co-located `*.tools.ts`; until the
  AgentToolBus bridge ships they call the same ChatStore actions the UI buttons call (Extract's pattern).
- **Chat → viewer:** render/edit tools move the canvas (`CanvasOrchestrator`). A `CiteChip` click in
  a rendered section dispatches `highlightCitation` → the viewer opens the cited doc at the page +
  region (reuses the shipped clickable-citation path + lit-regions + WF-06b tiers).
- **Viewer → chat / state:** **✎ edit §N** opens the builder with the section selected; **📌 pin**
  on a turn lands a section; report render + section focus emit `ViewerEvent`s into the chat's
  three-axis context so follow-up questions know what's on screen.

## D7 · Transitions into Report (carry the scope)

- **Step strip:** the Report pill (reachable for all scenarios, not chapter-gated) advances to `f4`.
- **Extract → Report:** a structured field / category can seed a section question; the Extract
  `ContentScope` (the doc being analyzed) becomes the report's **render scope** (passed to render,
  recorded on the `RenderedReport` — NOT stored on the template).
- **Interact → Report (primary bridge):** pinning assistant answers lands a section into an
  existing-or-new template (the existing-or-new UX, NO silent auto-create); the Interact thread's
  scope carries over as the render scope. "Make me a report" (chat) → `show_smart_report_render` on
  the chosen template with that scope.
- **Invariant:** the **render scope** is inherited from the surface you transitioned from — the user
  never re-picks what they were already looking at. (The scope rides the transition + lands on the
  result; the template stays scope-independent.)

## D8 · Reuse map from Extract (consistent design)

| Report piece | Reused from |
|---|---|
| Builder chrome (pinned-samples row, sub-tabs, row list, proposal cards, topbar, `⋮` menu) | `SchemaView` / `ExtractView` |
| Section-detail / inline editor | the F4 field-detail (provenance) card pattern |
| Citations in rendered sections | `CiteChip` + WF-06b tiers + `highlightCitation` |
| Source highlight in the doc viewer | `PdfViewerWidget` lit-regions |
| Save / export sign-in gating | `commitGate` (save/export triggers) + topbar lock affordance |
| Scope selection | `ContentScope` + the Extract/`search_groundx` filter mechanism |

New code is limited to: the render layout, the section-render formatters (¶/•/▦), the template/
section data model, the render endpoint, and the pin affordance.

## D9 · Fixture-first; WF-10 only for live multi-doc

Ships against a MOCK_MODE **Utility** report fixture (single-doc IC-brief-style sections, e.g.
billing summary / charge breakdown / anomalies / recommendation). The Report pill is reachable for
all scenarios (not chapter-gated); `chapters.report`, if retained, only flavors guided-demo emphasis.
Solar's multi-doc/multi-project/multi-workspace render is the same
surface, exercised once WF-10 lands real docs — the generality is proven by the `ContentScope`
contract, not by Solar being present.

## D10 · Parked (locked, do NOT build in v1)

- **#12** auto-variable inference — pins literal; manual inline "make variable" only.
- **#13** version-history surface — latest-saved only; the shipped `templates` table has no `version`
  column and no history (a row is updated in place via upsert on its id).
