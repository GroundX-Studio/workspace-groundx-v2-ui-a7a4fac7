# Caption (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 2)

Smallest typography in the brand system. Microcopy, field-help,
metadata.

## Usage

```tsx
import { Caption } from "@/components/primitives/Caption/Caption";

<Caption>We won't email you about anything else.</Caption>
<Caption component="figcaption">Figure 1.2 — utility bill structure</Caption>
```

## Props

```ts
interface CaptionProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  component?: ElementType;   // default "span"
  children: ReactNode;
}
```

## Brand contract

- `color: MUTED_ON_LIGHT`
- `fontWeight: FONT_WEIGHT_BODY` (400)
- `lineHeight: LINE_HEIGHT_TIGHT_BODY` (1.5)
- MUI variant `caption` (0.75rem under default theme)

## Tests

`Caption.test.tsx`. Covers default element, component override, MUI
variant, data-typography introspection.
