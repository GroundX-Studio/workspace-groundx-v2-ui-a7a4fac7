# Proposal — viewer-nav-redesign

## What

Make the viewer nav bar (`ViewerWidgetFrame` header) **consistent across every
viewer widget** and **context-aware**, and redesign its layout to be compact,
modern, and clean. Three threads:

1. **Mechanism (locked: B + C).** Replace the static per-widget `viewerFrame`
   descriptor spread with a typed, **experience-first** nav context + one **pure
   resolver**, fed by a **shared journey-step catalog** (single source of the
   journey vocabulary, consumed by both the StepStrip and the nav).
2. **Content normalization.** Fix the inconsistencies the static model caused —
   missing eyebrow/sub-step on the doc viewer, the same nav for two different
   steps (Understand vs Interact), the duplicated "Integrate / Integrate", mixed
   eyebrow semantics, and the journey words leaking into the authenticated
   steady experience (there is no Understand/Analyze/Integrate in steady).
3. **Layout redesign.** The eyebrow/title/subtitle stack three left-aligned
   lines (wastes vertical space) and the back button is cramped beside them.
   Redesign the header to be space-efficient horizontally and vertically, with
   the back button visually separated.

The agreed per-surface content is in [`viewer-nav-audit.md`](./viewer-nav-audit.md)
(the TARGET tables). That file is the content source of truth for this change.

## Why

- The nav is *structurally* universal (every widget routes through
  `ViewerWidgetFrame` via `ScopedCanvas` / `OnboardingShell`), but its *content*
  is inconsistent: `doc-viewer` shows a bare "Document viewer" with no step name
  for **both** the Understand and Interact steps; `Integrate`'s eyebrow equals
  its title; Report's eyebrow is the sub-bracket ("Report") while Extract's is
  the journey step ("Analyze").
- The journey vocabulary is hand-retyped in each widget descriptor, so it drifts
  from the StepStrip — the root cause of the mixed semantics.
- The header layout wastes screen real estate and the back button reads as
  cramped — raised directly by the product owner.

## Scope

**In scope**

- Shared journey-step catalog: single source for StepStrip + nav vocabulary AND
  the viewer-step→journey-step mapping (consolidating the copy that lives in
  `OnboardingShell` today), enforced by a single-source guard test.
- `ViewerNavContext` discriminated union + `resolveViewerNav()` pure resolver.
  The resolver **replaces** the existing-but-unused `framePropsFromDescriptor`
  merge helper (deleted — no second merge path).
- A minimal `experience: "onboarding" | "steady"` prop on `ScopedCanvas` (the
  nav's journey-words toggle — a different concern from the `chatExperienceRegistry`,
  which composes chat experiences). Wired by **all three** shells that mount
  `<ScopedCanvas>` — `OnboardingShell`, `SteadyShell` (bare `/c/`), and
  `ScopedConversationShell` (`/workspaces`, `/projects`).
- Document-name resolution that **reuses existing state** — the scenario
  (`scenario.documents[].fileName`) in onboarding, `DocumentsContext`
  `selectedDocument`/`documents[]` in steady — no new fetch path.
- The Understand "processing" line **reuses the frame's existing `loading` slot**
  (spinner + label), not a new subtitle path.
- A "map existing infrastructure first" step (Task 2) that enumerates the shells,
  the dead merge helper, the loading slot, the doc-name sources, and the eyebrow
  CSS behavior so the design reuses them rather than reinventing.
- Content per the TARGET tables: step-aware doc-viewer (Understand vs Interact),
  `Analyze` eyebrow for Report, `Connect` title for Integrate, the Understand
  processing line, `UNLOCK THE FULL WORKSPACE` sign-up eyebrow, and **no eyebrow
  in steady** (the now-unused journey-word eyebrows on canvas widget descriptors
  are removed). Eyebrow values are stored mixed-case and display uppercase via the
  `Label` eyebrow variant.
- `ViewerWidgetFrame` header **layout redesign** (compact arrangement +
  back-button separation), validated with Chrome DevTools MCP.
- **Removal of `GateValueProp`** (unused legacy widget; delete its 4 files and
  clean its 2 guard-test references).

**Out of scope (tracked)**

- **citation-peek render** — the overlay is defined but never mounted. Filed as
  a separate ticket (background task `task_023d7546`, "Build or drop the
  citation-peek pop-up") to be resolved during the upcoming **citation review**.
  This change only records what its nav *should* be; it does not build the
  pop-up.
- **Steady eyebrow = real workspace/project name.** Left EMPTY for now (decision
  2026-06-16). The FE has no human-name source for it (technical `describeScope`
  only; partner-vs-app project-id mismatch). Filed as `task_3c2aace6` to add a
  name source later. The nav has the seam (steady arm returns no eyebrow today).
- New primary/secondary action buttons (the slot stays unused; no widget wires
  one today).

## Conformance to core architectural decisions

(`scaffold/docs/agents/principles.md`)

- **Principle 1 — composable, not forked.** The variation is expressed as a
  *value on an axis* (the `ViewerNavContext` discriminant), not a forked frame
  per surface. One mechanism (`resolveViewerNav`) is parameterized by context;
  hosts compose by building the context. **Second real caller named (axis
  earned, not speculative):** the *experience* axis has two real callers today —
  `OnboardingShell` (journey words) and `SteadyShell` (no journey words); the
  *step* axis has two — `doc-viewer` reused across Understand **and** Interact,
  and `report` across render **and** builder. The shared catalog's two consumers
  are the StepStrip **and** the nav resolver. No abstraction is added without a
  named second caller. The frame stays a dumb presentational component; new
  surfaces add a union arm (compiler-enforced exhaustiveness), not a new
  component.
- **Principle 5 — done = user-visible + round-trip.** Every task closes against
  a user-visible test (the cornerstone in Task 1) and the post-implementation
  Chrome DevTools pass (Task 8). Deferred work (citation-peek) is a tracked
  ticket, not dormant code; `GateValueProp` is removed outright, not left as a
  stub.
- **Principle 6 — one source of truth.** The journey vocabulary lives in one
  catalog module that both the StepStrip and the nav read; the canonical step
  IDs reuse the existing `StepId` / `AnalyzeSubstep` types. No twin label tables.
  `ContentScope` / `CanvasKind` types are reused from `@groundx/shared`.
- **Principle 2 — TDD; Principle 3 — adversarial review.** `tasks.md` starts
  with a failing user-visible test and tags each task SEQUENTIAL/WORKFLOW with an
  adversarial review gate; a single final whole-plan adversarial review closes
  the change.
