/**
 * `useWidgetRole()` — single source for the `WidgetRole` every widget mount
 * site passes. Derives the role from `AppModeContext.authState` (the only
 * signal the app has today): `"signed-in"` → `"member"`, otherwise
 * `"anonymous"`.
 *
 * **Why this exists.** The widget-role-access contract requires a
 * `role: WidgetRole` prop on every widget. Without a shared selector, mount
 * sites either hardcode literals (`role="member"`) or re-derive the rule
 * inline — both drift, and a hardcoded literal mis-roles real users
 * (e.g. an anonymous user reaching the steady shell). One selector keeps
 * the mapping in one place; if a future role (`viewer` / `editor`) is
 * added, every mount site gets it for free.
 */
import { useAppMode } from "@/contexts/AppModeContext";
import type { WidgetRole } from "@groundx/shared";

export function useWidgetRole(): WidgetRole {
  const { state } = useAppMode();
  return state.authState === "signed-in" ? "member" : "anonymous";
}
