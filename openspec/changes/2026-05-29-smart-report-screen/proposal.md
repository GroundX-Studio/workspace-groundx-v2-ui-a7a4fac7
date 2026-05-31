# Smart Report screen (S3 render + S3a builder) — the last unbuilt Analyze chapter

## Why

Report is the only **Analyze** capability with no surface. Extract (F3/F3a) and Interact (F5) are
built; the **Report** step-strip pill is hard-disabled (`reportActive = false`), `f4` exists in
`FFrame` but mis-routes to the extract workbench, the `{ kind: "report" }` ViewerStep is declared
but never rendered, and the `show-report → f4` intent dead-ends.

The screen is **fully designed but never built** — its plan was scattered across
`project_dev_contracts.md` (the **W8** render-via-template contract), `project_phased_plan.md`
(Phase 5), and `openspec/specs/agent-tools/spec.md` (the report tool requirements). There is **no
durable OpenSpec capability** for it. This change creates that home, consolidates the scattered
scope, and re-anchors the plan on the **use case we actually have today**.

## v1 target: the Utility single-document report (generalizing to many)

The original wireframe scoped Report to **Solar** ("Utility & Loan don't reach Report") as a
guided-demo choice. We are **deliberately extending** Report to the **current real use case: the
Utility bill, a single document**, and building the capability **doc-count-agnostic** from day one.

The report MUST support **1 or more documents, 1 or more projects, 1 or more workspaces** via
filtering and grouping. We already have the right abstraction — the existing **`ContentScope`**:

Scope is a `ContentScope` where **`filter` is composable on every shape** (bucket · bucket+filter ·
documents[] · documents[]+filter · group · group+filter); the **context** selects the shape — we
never hardcode a mandatory filter or forbid a shape:

| User concept | GroundX construct | `ContentScope` |
|---|---|---|
| 1+ documents | document ids | `{ type: "documents", documentIds: [...] }` |
| 1+ projects (portfolio / fund / folder) | **doc filter-field values** within a workspace | `{ type: "bucket", bucketId, filter }` |
| 1+ workspaces | a `bucket`, or a `group` (cross-bucket) | `{ type: "bucket" }` · `{ type: "group", groupId }` |

In this scaffold every demo sample lives in **one shared workspace bucket** and is a **project**
(a filter-field value), so the **current demos open on `bucket + project filter`** — that's the
opening display context, NOT a rule that forbids other shapes (document-id lists, bare bucket, group
are all valid scopes the widget supports). **Utility v1 opens on `{ bucket, filter:{project:"utility"} }`**;
Solar later renders a `group`/`bucket+filter` scope across 142 docs — **same surface, same contract,
no rework.** Report is reachable for **all** scenarios over the active scope (not chapter-gated).

## Mental model (from the wireframes)

**Reports = schemas for questions.** A template = an ordered list of **sections**, each a pinned Q&A
(`name` + `renderAs` + `question` + `variables[]` + `instructions`). The template is scope-independent;
scope is a render-time input (recorded on the result), not a template/section field.
Rendering = running each section's question against its scope and streaming cited bodies — the exact
mirror of W7 Extract (template durable, render is the act). The **builder (S3a)** reuses the F3a
schema-editor chrome verbatim. **Pin to report** is the in-chat verb on every assistant turn.

## Conformance to core architectural decisions

1. **Chat drives every control (widget contract).** Every report UX element has a co-located
   `*.tools.ts` so the LLM can drive it: render, add/edit/remove/reorder section, change a section's
   scope, pin a turn, open the builder, edit §N. No control is mouse-only.
2. **Chat ⇄ viewer.** Chat → viewer via the existing `CanvasOrchestrator` intents
   (`show_smart_report_render`/`_edit`, and a `CiteChip` click → `highlightCitation` → the viewer
   jumps to the cited doc/page/region — the same clickable-citation path Extract/Interact use).
   Viewer → chat: a section's **✎ edit §N** opens the builder; **📌 pin** lands a section; report
   render + section-view emit `ViewerEvent`s into the chat's three-axis context.
3. **Reuse Extract, consistent design.** The builder = the schema editor (pinned-samples row,
   sub-tabs, row list, proposal cards, `export ▾ 🔒 · ↻ render · 💾 Save 🔒` topbar, `⋮` menu,
   field-detail card pattern). The render surface reuses `CiteChip` + WF-06b tiers + lit-region
   highlight. Same locked patterns: one production widget family carrying `role: WidgetRole` + a
   required `scope: WidgetScope` (per `widget-role-access`, replacing the old `mode` prop; no
   onboarding duplicate), README + sibling test + design-token-only styling.
4. **Transitions in.** From **Extract** (structured fields → report sections) or **Interact** (pin
   answers → sections) the user reaches Report via the now-reachable step-strip pill **and** a
   chat-driven path ("make me a report" / pinning lands a section into an existing-or-new template —
   the existing-or-new UX, NO silent auto-create). The transition **carries the
   current `ContentScope` over** — whatever doc/project/workspace you were analyzing becomes the
   report's default scope. **Interact → pin → Report** is the primary bridge.

## Plan revision vs. the old Phase 5

- **Re-anchor on Utility single-doc**, not Solar. Solar becomes the **scale/generality test**
  (multi-doc, multi-project, multi-workspace) once WF-10 lands its docs.
- **Decouple from WF-10.** The screen builds against a **Utility report fixture** (MOCK_MODE); only
  live multi-doc render depends on WF-10.
- **Scope is first-class** via `ContentScope` — built general so Solar needs no surface rework.
- **Reuse over rebuild**, **chat-driven everything**, **explicit transitions** — per the conformance
  section above.
- **Honor locked parking decisions:** auto-variable inference parked (#12), version-history parked
  (#13), `preview_only` sample render (#9), BYO → gate (#10).

## Tickets moved under this change / closed where they previously existed

- `agent-tools` spec: `pin_to_report` + `propose_report_section` **MODIFIED** to delegate their
  surface to `smart-report`; two net-new canvas tools **ADDED**.
- `project_dev_contracts.md` (W8), `project_phased_plan.md` (Phase 5), `project_build_status.md`
  ("Not started"): memory re-pointed at this change in the closeout task (post-archive).

## Dependencies

- **WF-10** (`2026-05-29-wf10-loan-solar-content-seed`) — real Solar docs. **Live multi-doc render
  only.** Utility v1 + fixtures do not block on it.
- **AgentToolBus Zod→JSON-Schema bridge** (`agent-tools`, placeholder) — required before the report
  tools dispatch live; surfaces work via direct ChatStore actions until then (Extract's interim pattern).

## Out of scope

- Authoring real Solar content (WF-10). Automatic variable inference (#12) and version-history UI
  (#13). Member-role-specific polish beyond the shared `role`/`scope`-prop widget.

## Affected

- **App:** `FFrame` (+`f4a`); `OnboardingShell` canvas routing + `reportActive`; Report nav/strip
  pill; new `ReportRenderView` + `ReportBuilderView`; new `SmartReport*` widgets (viewer + chat,
  widget-contract compliant) + `*.tools.ts`; report types (`ReportTemplate`/`ReportSection`/
  `RenderedReport` carrying the render-time `scope: ContentScope`); ChatStore report-step + pin actions; Utility
  report fixture; Extract→Report / Interact→Report transition wiring (scope hand-off).
- **Middleware:** `POST /api/widgets/smart-report/reports/render` (scope = `ContentScope`); chatRouter
  pin-to-report handling.
- **Specs:** new `smart-report`; `agent-tools`; `app-architecture`; `scenarios` (Utility report live
  + Solar generalization).
