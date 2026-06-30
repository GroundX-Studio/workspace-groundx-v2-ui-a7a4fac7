/**
 * PasswordField — text field with a built-in show/hide visibility toggle.
 *
 * Extracts the show/hide password endAdornment that was copy-pasted across
 * `LoginForm` / `RegisterForm` / `ConfirmChangePasswordForm` (§4f). Each site
 * managed its own `showPassword` boolean + an identical
 * `<InputAdornment><IconButton aria-label="toggle password visibility">…`
 * block; this primitive owns that state + markup once.
 *
 * Follows MUI per the locked rule (`memory/feedback_follow_mui.md`): it wraps
 * the raw MUI `TextField` and forwards ALL `TextFieldProps` so callers keep
 * MUI's prop names + behavior (label, error, helperText, value/onChange, sx,
 * InputProps). It deliberately does NOT build on the brand `TextField`
 * primitive — the three auth forms pass their own `sx` (white input bg) and
 * the raw MUI field is what they render today; wrapping the brand primitive
 * would change their visual styling (border radius / focus ring), which would
 * break the behavior-preserving guarantee.
 *
 * The caller's `InputProps` are MERGED with the toggle endAdornment so a site
 * that also passes `InputProps.onAnimationStart` (LoginForm's label-shrink
 * handler) keeps it.
 *
 * widget-llm-integration Phase 5b: an interactive primitive requires exactly
 * one of `tool` / `noTool`. The auth forms are pre-app (not agent-driven), so
 * call sites pass `noTool="pre-app auth (not agent-driven)"`.
 */

import Visibility from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MuiTextField, { type TextFieldProps as MuiTextFieldProps } from "@mui/material/TextField";
import { type FC, useState } from "react";

import { DARK_GREY, GRAY } from "@/constants";

import { resolveToolAttribute, type ToolBindingProps } from "../_tool-binding";

// Omit `type` — this primitive owns it (toggles password ↔ text).
type PasswordFieldBaseProps = Omit<MuiTextFieldProps, "type">;

export type PasswordFieldProps = PasswordFieldBaseProps & ToolBindingProps;

export const PasswordField: FC<PasswordFieldProps> = (props) => {
  const { tool, noTool, InputProps, ...rest } = props as PasswordFieldBaseProps & {
    tool?: string;
    noTool?: string;
  };
  const [showPassword, setShowPassword] = useState(false);
  const toolAttrs = resolveToolAttribute(
    tool !== undefined
      ? ({ tool } as const)
      : ({ noTool: noTool ?? "unknown" } as const),
  );

  return (
    <MuiTextField
      {...rest}
      {...toolAttrs}
      type={showPassword ? "text" : "password"}
      InputProps={{
        ...InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              sx={{ backgroundColor: "inherit", "&:hover": { backgroundColor: GRAY } }}
              aria-label="toggle password visibility"
              disableRipple
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? (
                <Visibility sx={{ color: DARK_GREY }} fontSize="small" />
              ) : (
                <VisibilityOffIcon sx={{ color: DARK_GREY }} fontSize="small" />
              )}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

export default PasswordField;
