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

> Renders a labeled card with a steady-mode-only Edit affordance.
> Mounted under each assistant bubble (chat slot) or as the active
> viewer step (viewer slot).

Reviewers read this first. Make it ≤ 3 sentences, no jargon.

## Props

```ts
interface TemplateProps {
  /** Locked-affordance gate. Defaults to "onboarding". */
  mode?: "onboarding" | "steady";
  /** Display label. */
  label?: string;
  /** Fired when the Edit affordance activates (steady mode only). */
  onEdit?: () => void;
}
```

Mirror this shape. Always document `mode`; props that don't surface
to the LLM are still props the host must pass.

## Locked affordances under `mode="onboarding"`

Under `mode="onboarding"`, the Edit affordance is HIDDEN. Read-only
viewing remains functional. The locked list for the real widget goes
here — one bullet per surface:

- Edit button: hidden
- (any other onboarding-locked control): hidden / disabled

This pairs with the tool catalog's `availableIn` mode lock — a tool
whose UI affordance is locked under `onboarding` SHALL also carry
`availableIn: ["steady"]` in `<Name>.tools.ts` so the LLM doesn't
attempt the action either.

## Events

- `onEdit()` — fires when the user activates the Edit affordance
  (mouse click or keyboard Enter / Space).

Document every callback. The "Tests" section below pins which events
the widget's `.test.tsx` must cover.

## How to mount

```tsx
import { Template } from "@/components/_template/Template";

<Template
  mode={isOnboarding ? "onboarding" : "steady"}
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

`Template.test.tsx` covers the three canonical assertions:

1. Mounts in both `onboarding` and `steady` modes without crashing.
2. Locked Edit affordance ABSENT under `mode="onboarding"`.
3. `data-mode` attribute reflects the `mode` prop verbatim.

Plus one event test (Edit click fires `onEdit`). Add scenario-specific
tests after these; don't delete them.
