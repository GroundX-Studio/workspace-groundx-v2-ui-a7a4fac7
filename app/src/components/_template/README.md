# Widget Template

**Slot:** `_template` (canonical starting point — NOT a mounted widget)
· **Status:** scaffolding (Phase 3a, 2026-05-27)

**COPY THIS DIR** to `chat-widgets/<Name>/` (chat-column children) or
`viewer-widgets/<Name>/` (viewer-pane children), rename `Template` →
`<Name>` everywhere, fill in the TODO markers, delete this paragraph,
and update the slot line above. The drift-guard test
(`app/src/test/widget-contract.test.ts`) skips directories whose name
starts with `_`, so this template doesn't pollute the catalog.

## What it does

The placeholder describes the surface the new widget exposes to the
user. Lead with the **what** and the **slot**:

> Renders a labeled card with an Edit affordance. Mounted under each
> assistant bubble (chat slot) or as the active viewer step (viewer
> slot).

Reviewers read this first. Make it ≤ 3 sentences, no jargon.

## Props

```ts
interface TemplateProps {
  /** Authorization role of the viewer (`anonymous` | `member`). REQUIRED. */
  role: WidgetRole;
  /** Scope the widget targets. REQUIRED. This template is not document-scoped → `{ type: "none" }`. */
  scope: WidgetScope;
  /** Display label. */
  label?: string;
  /** Fired when the Edit affordance activates. */
  onEdit?: () => void;
}
```

Mirror this shape. Always declare `role: WidgetRole` AND
`scope: WidgetScope` (both REQUIRED by the widget contract); props
that don't surface to the LLM are still props the host must pass.

## Scope

`scope: WidgetScope` (`= ContentScope | { type: "none" }`, from
`@groundx/shared`) is REQUIRED on every widget. This reference template
is **not document-scoped**, so it declares `{ type: "none" }` and does
not read the prop.

The four ScopedViewerWidgets (PdfViewer / Extract / SmartReport /
Integrate) pass a real `ContentScope` here instead — e.g. a single doc
is `{ type: "documents", documentIds: [id] }`. No widget takes a raw
`documentId` / `bucketId` / `projectId` prop; those collapse into
`scope`.

## Locked affordances (read-only roles)

**None today.** No widget locks an affordance by role (see
`docs/agents/widget-access-matrix.md` §2). The Edit affordance renders
for EVERY role; whether the edit *persists* is enforced at the tool /
save boundary, not by hiding the control. Concretely, `edit_template`
is scoped to `availableIn: ["member"]` (per the matrix) in
`<Name>.tools.ts` so the LLM does
not attempt the mutation for an anonymous viewer, and the server gates
the actual write.

When a future read-only role (e.g. `viewer`) lands, gate the affordance
on `widgetRoleCanEdit(role)` and add a row to the access matrix +
this widget's sibling test. Until then the locked list is empty:

- (no role-locked controls today)

## Events

- `onEdit()` — fires when the user activates the Edit affordance
  (mouse click or keyboard Enter / Space).

Document every callback. The "Tests" section below pins which events
the widget's `.test.tsx` must cover.

## How to mount

```tsx
import { Template } from "@/components/_template/Template";
import { useWidgetRole } from "@/hooks/useWidgetRole"; // role from auth/session/gate state

const role = useWidgetRole();

<Template
  role={role}
  scope={{ type: "none" }} // a ScopedViewerWidget would pass a real ContentScope
  label="Hello, widget."
  onEdit={() => console.log("edit fired")}
/>
```

Replace the import path with the real `<Name>` widget's path after
copy + rename.

## LLM tools

`Template.tools.ts` exposes two tools:

- `open_template` (`read`) — navigation / focus. Auto-executes on
  LLM invocation.
- `edit_template` (`mutate`) — schema / state mutation. Surfaces as
  a Suggested-Action chip; user clicks to confirm.

Both follow the four floor rules from design.md §F: snake_case names
with allowlisted verb prefix, `Use when …` clause in the description,
per-parameter `.describe()` on the Zod input, explicit `category`.

To opt this widget OUT of the LLM tool surface, delete
`Template.tools.ts` and create a sibling `no-llm.md` with a `## Why`
section. The drift guard fails widgets that ship neither.

## Tests

`Template.test.tsx` covers the canonical assertions under the role +
scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`) without crashing, and
   `data-role` reflects the `role` prop verbatim.
2. Asserts the access-matrix row — Edit affordance present for every
   role (no role lock today).
3. Event test: Edit activation fires `onEdit`.

Mount each widget under both `"anonymous"` and `"member"` and assert
its matrix row; pass the widget's declared `scope`. Add scenario-
specific tests after these; don't delete them.
