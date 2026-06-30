# Stack (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 2)

Thin wrapper around MUI `Stack` with a brand-default `gap`. Use for
vertical or horizontal stacks of small content (form fields,
typography, button groups). Not for top-level page layout — that's
`components/layout/`.

## Usage

```tsx
import { Stack } from "@/components/primitives/Stack/Stack";

// Vertical stack with default 16px gap
<Stack>
  <Label>Email</Label>
  <TextField id="email" />
</Stack>

// Horizontal stack
<Stack direction="row" alignItems="center">
  <Button variant="secondary">Cancel</Button>
  <Button variant="primary">Save</Button>
</Stack>

// Tight spacing
<Stack gap={1}>
  <Caption>Step 1</Caption>
  <Caption>Step 2</Caption>
</Stack>
```

## Props

Same as MUI `Stack`. Brand override: `gap` defaults to `2` (16px).

```ts
interface StackProps extends MuiStackProps {
  children?: ReactNode;
}
```

## Brand contract

Pure layout primitive. No color / typography / radius defaults of its
own — composes anything inside it.

## Tests

`Stack.test.tsx`. Covers children render, brand-default data-stack
attribute, direction override, gap override.
