# Widget contract — raise the floor

## Why

A fresh-eyes audit (2026-05-27) found the widget contract
documentation + enforcement is **adequate for a diligent agent
reading top-to-bottom**, but **sloppy widgets can ship green**
because the drift guard checks only "file exists," not "covers the
required surface area."

Specific gaps the audit surfaced:

- No worked end-to-end example for a fresh agent to copy
- No README template — existing READMEs are inconsistent
  (`PdfViewer/README.md` is rich, others are sparse)
- `.test.tsx` requirements list 3 things but "required events" is
  undefined for widgets with no events; "locked affordances" is
  prose-only, not a per-widget checklist
- `mode="onboarding"` semantics are prose only — each widget has to
  judgment-call what to lock
- OpenSpec doesn't carry the widget contract as a formal Requirement
  (it lives in `widget-contract.md` + the drift guard); a proposal
  that touches widgets can't anchor to a SHALL statement
- No anti-examples (what's NOT a widget?) → fresh agent over-applies
  contract to brand primitives or under-applies it to chat widgets
- No "promote brand → widget" recipe → likely scenario, no playbook
- "Vertically composable" rule for chat widgets is prose, not tested
- README content isn't drift-guarded — only existence is

Net: the contract has a strong ceiling (great when followed) and a
weak floor (easy to ship a thin widget that passes drift). This
proposal raises the floor.

## What changes

Seven incremental additions. Each is small (15 min – 2 hr); they
compose. Phases land independently.

### P0 — Templates + worked example (highest leverage)

- ADD `scaffold/app/src/components/_template/` containing canonical
  README.md + `<Name>.tsx` + `<Name>.test.tsx`. Fresh agents copy
  the dir, rename, fill in.
- EXTEND `widget-contract.md` § "How to add a new widget" with a
  step-by-step walkthrough building `ChipsBar` from zero to
  green: each step shows the actual file contents, not just the
  procedure.

### P1 — Formalize in OpenSpec + sharper test contract

- ADD a "Widget Contract" Requirement to
  `openspec/specs/app-architecture/spec.md` with SHALL statements
  for each of the 5 rules + Scenarios. The drift guard implements
  the Requirement; OpenSpec carries it for proposals to anchor to.
- ADD a test template in `_template/<Name>.test.tsx` showing the
  canonical 3 tests (mount-both-modes,
  locked-affordances-absent-under-onboarding, mode-prop-data-attr
  present) plus comments for "add your widget's events here."

### P2 — Recipes for edge cases

- ADD a "Promote brand → widget" recipe to `widget-contract.md` for
  when a brand primitive (e.g. `CiteChip`) grows complex enough to
  warrant the widget contract. Migration steps.
- ADD an "Anti-examples" section to `widget-contract.md` listing
  what's NOT a widget (brand molecule, layout singleton, etc.)
  with concrete examples + rule of thumb.

### P3 — Sharper drift guards

- EXTEND `widget-contract.test.ts` to assert that every widget
  README contains required section headers (`## What it does`,
  `## Props`, `## Locked affordances`, `## Events`, `## How to
  mount`). File-exists check stays; content-shape check is added.

## Out of scope

- The view-collapse work (UI-01 / UI-02 / UI-05) — that's its own
  capability spec under `onboarding-schema-editor` + related changes
- New widgets themselves — this change improves the contract for
  future widgets, doesn't add new ones
- Component-tier reorganization — the 5-tier tree is locked

## Affected

- Capability specs: `app-architecture` (new Widget Contract
  Requirement)
- Scaffold:
  - `app/src/components/_template/` (NEW directory)
  - `app/src/test/widget-contract.test.ts` (extended assertions)
  - `docs/agents/widget-contract.md` (worked example + recipes +
    anti-examples)
  - `openspec/specs/app-architecture/spec.md` (Widget Contract
    Requirement added)
