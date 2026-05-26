# Heading (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 2)

Typography primitive for headings. Wraps MUI `<Typography>` with
brand-locked weight, tracking, line-height, and color defaults per
level.

## Levels

| `level` | Default element | Used for |
|---|---|---|
| `display-lg` | `<h1>` | Hero copy (display weight 800) |
| `display-md` | `<h1>` | Sub-hero copy (display weight 800) |
| `h1` | `<h1>` | Page title |
| `h2` (default) | `<h2>` | Section title |
| `h3` | `<h3>` | Subsection |
| `h4` | `<h4>` | Card title |
| `h5` | `<h5>` | Inline heading |
| `h6` | `<h6>` | Eyebrow-adjacent heading (rarely used) |

## Usage

```tsx
import { Heading } from "@/components/primitives/Heading/Heading";

<Heading level="display-lg">Hero copy</Heading>
<Heading level="h2">Section title</Heading>
<Heading level="h4" component="div">Card title rendered as div</Heading>
```

## Props

```ts
interface HeadingProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  level?: "display-lg" | "display-md" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  component?: ElementType;
  children: ReactNode;
}
```

## Brand contract

- `color: NAVY` by default.
- `fontWeight: FONT_WEIGHT_HEADLINE` (700) for h1-h6;
  `FONT_WEIGHT_DISPLAY` (800) for display-*.
- `lineHeight` + `letterSpacing` per level from theme tokens.
- No hex literals, no raw numeric font weights.

## Tests

`Heading.test.tsx`. Covers default level, explicit level, component
override, data-typography introspection attributes, display-lg
semantic h1 default, sx pass-through preserving brand defaults.
