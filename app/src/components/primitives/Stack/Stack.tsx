/**
 * Stack — primitive flex-stack layout helper.
 *
 * Thin wrapper around MUI Stack with brand-default `gap` so most
 * callers can write `<Stack>...</Stack>` and get the right spacing
 * without remembering tokens. Override `gap` for explicit different
 * spacing.
 *
 * Defaults:
 *   - `direction="column"` (MUI default; restated for clarity)
 *   - `gap={2}` (16px under MUI's 8px spacing unit) — the brand's
 *     "comfortable but not roomy" baseline. Override per usage:
 *       gap={1}  → tight (8px)
 *       gap={3}  → roomy (24px)
 *
 * Use for vertical / horizontal stacks of typography, fields, etc.
 * Don't use for the AppShell's top-level layout (that's `layout/`).
 */

import MuiStack, { type StackProps as MuiStackProps } from "@mui/material/Stack";
import { type FC, type ReactNode } from "react";

export interface StackProps extends MuiStackProps {
  children?: ReactNode;
}

export const Stack: FC<StackProps> = ({ gap = 2, children, ...rest }) => (
  <MuiStack {...rest} gap={gap} data-stack="brand-default">
    {children}
  </MuiStack>
);

export default Stack;
