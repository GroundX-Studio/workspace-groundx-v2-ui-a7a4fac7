# IconButton (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 1)

Icon-only button sibling to `Button`. Mirrors MUI's own
`Button` / `IconButton` split — the two have semantically different
labeling models (visible text vs aria-label + glyph) so they're
separate primitives in this codebase too.

## Usage

```tsx
import { IconButton } from "@/components/primitives/IconButton/IconButton";

// Close affordance (defaults: CloseIcon glyph + aria-label="close")
<IconButton onClick={onClose} />

// Custom icon
<IconButton
  icon={<EditIcon />}
  aria-label="edit field"
  onClick={onEdit}
/>

// Large variant for footer dismiss
<IconButton size="large" aria-label="dismiss" onClick={onDismiss} />
```

## Props

```ts
interface IconButtonProps extends Omit<MuiIconButtonProps, "children"> {
  icon?: ReactNode;        // defaults to <CloseIcon />
  children?: ReactNode;    // typically a badge overlay
  // ...all MUI IconButton props
}
```

## Defaults

- `icon = <CloseIcon />` — dismiss is the dominant use case in the
  codebase. Override for any other icon.
- `aria-label = "close"` — override for semantic accuracy. The
  drift-guard does NOT block missing-aria — author responsibility.
- `size = "small"`.
- `disableRipple` so the button respects the brand's "calm + crisp"
  motion contract.

## Theme integration

Inherits the `MuiIconButton` override defined in `src/theme.ts` (CYAN
background + GREEN hover). No per-instance styling needed.

## Tests

`IconButton.test.tsx`. Covers default Close glyph + aria-label, custom
icon pass-through, custom aria-label, size variants, click handling,
disabled state.

## Replaces (ARCH-16 migration)

`shared/components/CommonCloseIcon.tsx` →
`components/primitives/IconButton/IconButton.tsx`.

Call-site migration mapping:

```diff
- import CommonCloseIcon from "@/shared/components/CommonCloseIcon";
- <CommonCloseIcon onClick={onClose} />
+ import { IconButton } from "@/components/primitives/IconButton/IconButton";
+ <IconButton onClick={onClose} />
```

## Why split from Button?

Per user direction 2026-05-26: "in general follow MUI. split."

MUI's `Button` accepts `children` for the label (semantic content
in DOM). MUI's `IconButton` accepts an icon child but is labeled
via `aria-label` (no semantic text content). The two have different
contracts; collapsing them into one component meant a slightly
awkward `variant="icon" + icon={...}` API. Splitting matches the
MUI mental model + keeps each primitive's API focused.
