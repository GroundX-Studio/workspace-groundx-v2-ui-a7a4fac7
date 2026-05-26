# Button (primitive)

**Tier:** `primitives` · **Status:** shipped (ARCH-18 batch 1)

Text-bearing button primitive. Two variants. For icon-only actions,
use the sibling [`IconButton`](../IconButton/) primitive — split per
MUI's own pattern (different labeling models = different primitives).

| Variant | Use for | Replaces |
|---|---|---|
| `primary` | Submit / "do the thing" CTAs. Green pill, navy text, uppercase by default. | `CommonSubmitButton` |
| `secondary` | Cancel / dismiss text actions. Text-style, body-text color, mixed-case by default. | `CommonCancelButton` |

## Usage

```tsx
import { Button } from "@/components/primitives/Button/Button";

// Primary CTA
<Button variant="primary" onClick={onSave}>Save</Button>

// Submit form
<Button variant="primary" type="submit" submitting={isSaving}>Send</Button>

// Cancel
<Button variant="secondary" onClick={onCancel}>Cancel</Button>

// Inverted primary (when you don't want the green CTA to fight a sibling)
<Button variant="primary" invert>Confirm</Button>
```

## Props

```ts
interface ButtonProps extends Omit<MuiButtonProps, "variant"> {
  variant?: "primary" | "secondary";  // default "primary"
  children: ReactNode;
  submitting?: boolean;                // primary-only — disables + spinner
  invert?: boolean;                    // primary-only — start in navy/green
  isUppercase?: boolean;               // primary defaults true; secondary false
}
```

## Brand contract

- All visible styling resolves to theme tokens (`GREEN`, `NAVY`,
  `BODY_TEXT`, `BORDER_RADIUS_PILL`, `FONT_WEIGHT_LABEL`,
  `LETTER_SPACING_CHIP`). No hex literals, no raw px radii.
- Enforced by `no-hardcoded-styles.test.ts` drift guard once ARCH-17
  expands coverage to `components/primitives/`.

## Defaults

- `type="button"` so dropping a `<Button variant="primary">` inside a
  `<form>` doesn't accidentally submit. Pass `type="submit"`
  explicitly.
- `disableRipple` so the button respects the brand's "calm + crisp"
  motion language (per reduced-motion contract).
- Primary defaults uppercase; secondary defaults mixed-case. Override
  either with `isUppercase`.

## Tests

`Button.test.tsx`. Covers: variant semantics + class flags, default
variant, default + override uppercase, submit type semantics,
submitting state spinner + aria-busy, onClick across both variants,
disabled state, invert flag, isUppercase override both directions.

## Replaces (ARCH-16 migration)

Two files coalesce into this one (CloseIcon split into `IconButton`):

- `shared/components/CommonSubmitButton.tsx` → `variant="primary"`
- `shared/components/CommonCancelButton.tsx` → `variant="secondary"`

Call-site migration mapping:

```diff
- import CommonSubmitButton from "@/shared/components/CommonSubmitButton";
- <CommonSubmitButton submitting={isSaving}>Save</CommonSubmitButton>
+ import { Button } from "@/components/primitives/Button/Button";
+ <Button variant="primary" submitting={isSaving}>Save</Button>

- import CommonCancelButton from "@/shared/components/CommonCancelButton";
- <CommonCancelButton onClick={onCancel}>Cancel</CommonCancelButton>
+ <Button variant="secondary" onClick={onCancel}>Cancel</Button>
```

For CloseIcon, see [`IconButton`](../IconButton/).

ARCH-16 batch-migrates the known call sites. After that batch, the
three `Common*` button files get deleted.
