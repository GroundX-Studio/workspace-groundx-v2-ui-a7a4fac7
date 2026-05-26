# Label (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 2)

Typography primitive for labels + eyebrows. Two variants.

| `variant` | Default element | Used for |
|---|---|---|
| `form` (default) | `<label>` | Form input labels. Mixed-case. Use with `htmlFor`. |
| `eyebrow` | `<span>` | UPPERCASE eyebrow tag above a heading. |

## Usage

```tsx
import { Label } from "@/components/primitives/Label/Label";

// Form label
<Label htmlFor="email">Email</Label>

// Eyebrow
<Label variant="eyebrow">CAPABILITIES</Label>
```

## Props

```ts
interface LabelProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  variant?: "form" | "eyebrow";   // default "form"
  component?: ElementType;
  htmlFor?: string;               // form variant only
  children: ReactNode;
}
```

## Brand contract

- `fontWeight: FONT_WEIGHT_LABEL` (600)
- `letterSpacing: LETTER_SPACING_LABEL` ("0.12em")
- `color: NAVY` for `form` | `EYEBROW_ON_LIGHT` for `eyebrow`
- `textTransform: uppercase` for `eyebrow` only

## Tests

`Label.test.tsx`. Covers default form variant + htmlFor, eyebrow
uppercase, component override, data-typography introspection.
