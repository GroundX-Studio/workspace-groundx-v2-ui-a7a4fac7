# PasswordField (primitive)

**Tier:** `primitives` · **Status:** shipped (2026-05-31-core-data-followups §4f)

Text field with a built-in show/hide visibility toggle. Owns the
`showPassword` state + the `aria-label="toggle password visibility"`
endAdornment that was copy-pasted across the three auth forms
(`LoginForm`, `RegisterForm`, `ConfirmChangePasswordForm`).

## Usage

```tsx
import { PasswordField } from "@/components/primitives/PasswordField/PasswordField";

<PasswordField
  fullWidth
  id="password"
  name="password"
  label="Password"
  value={formik.values.password}
  onChange={formik.handleChange}
  onBlur={formik.handleBlur}
  error={formik.touched.password && Boolean(formik.errors.password)}
  helperText={formik.touched.password && formik.errors.password}
  noTool="pre-app auth (not agent-driven)"
  sx={{ mt: 2, input: { background: WHITE } }}
/>
```

## Props

```ts
// Wraps MUI TextField. `type` is owned by the primitive (toggles
// password ↔ text); every other TextFieldProp is forwarded.
type PasswordFieldProps = Omit<MuiTextFieldProps, "type"> & ToolBindingProps;
```

- Caller `InputProps` are **merged** with the toggle endAdornment, so a
  site that passes `InputProps.onAnimationStart` (LoginForm's
  label-shrink handler) keeps it.
- Requires exactly one of `tool` / `noTool` (the Phase 5b interactive
  primitive contract). The auth forms are pre-app, so they pass
  `noTool="pre-app auth (not agent-driven)"`.

## Brand contract

- Toggle icon colors resolve to theme tokens (`DARK_GREY`, `GRAY`); no
  hex literals. Enforced by `no-hardcoded-styles.test.ts`.

## Follow-MUI

- Wraps the **raw** MUI `TextField`, not the brand `TextField`
  primitive. The three auth forms render the raw MUI field with their
  own `sx`; wrapping the brand primitive would change their visual
  styling (border radius / focus ring) and break the behavior-preserving
  guarantee. When the auth forms migrate to the brand input styling,
  re-home this on the `TextField` primitive.

## Tests

`PasswordField.test.tsx`. Covers: default masking (type=password),
reveal/hide on toggle, arbitrary TextField prop forwarding
(value/onChange/error/helperText), InputProps merge with the toggle
adornment, and the tool-binding landing on the rendered field.

## Replaces

The identical `showPassword` state + `<InputAdornment><IconButton
aria-label="toggle password visibility">…` block in:

- `views/Auth/Form/LoginForm.tsx`
- `views/Auth/Form/RegisterForm.tsx` (two password fields)
- `views/Auth/Form/ConfirmChangePasswordForm.tsx`
