# BodyText (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 2)

Typography primitive for body copy. Two sizes (`md` + `sm`).

## Usage

```tsx
import { BodyText } from "@/components/primitives/BodyText/BodyText";

<BodyText>Standard body copy.</BodyText>
<BodyText size="sm">Smaller supporting text.</BodyText>
<BodyText component="span">Inline body fragment.</BodyText>
```

## Props

```ts
interface BodyTextProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  size?: "md" | "sm";        // default "md"
  component?: ElementType;   // default "p"
  children: ReactNode;
}
```

## Brand contract

- `color: BODY_TEXT`
- `fontWeight: FONT_WEIGHT_BODY` (400)
- `lineHeight: LINE_HEIGHT_BODY` (1.6)
- `size="md"` ⇒ MUI body1 (1rem); `size="sm"` ⇒ MUI body2 (0.875rem).

## Tests

`BodyText.test.tsx`. Covers default element, size variants, component
override, data-typography introspection.
